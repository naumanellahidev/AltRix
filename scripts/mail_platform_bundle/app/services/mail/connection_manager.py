import os
import imaplib
import ssl
import subprocess
import secrets
from contextlib import contextmanager
from app.database import get_db
from app.services.mail.errors import ImapUnavailableError, AuthFailedError

class ImapConnectionManager:
    def __init__(self):
        # Internal token cache: { mailbox_email: raw_32_hex_token }
        self._token_cache = {}

    def _resolve_imap_endpoint(self):
        # In Docker container: 'imap' (or '127.0.0.1' on host VPS)
        host = os.environ.get("IMAP_HOST", "")
        if not host:
            # Check if running in Docker container with 'imap' DNS resolvable
            try:
                import socket
                socket.gethostbyname("imap")
                host = "imap"
            except Exception:
                host = "127.0.0.1"

        port = int(os.environ.get("IMAP_PORT", "143"))
        use_ssl = os.environ.get("IMAP_USE_SSL", "false").lower() in ["true", "1", "yes"]
        return host, port, use_ssl

    def _get_or_create_internal_token(self, mailbox_email: str) -> str:
        mailbox_email = mailbox_email.strip().lower()
        if mailbox_email in self._token_cache:
            return self._token_cache[mailbox_email]

        raw_token = secrets.token_hex(16)
        py_script = f"""
from mailu.models import db, User, Token
from mailu import create_app
app = create_app()
with app.app_context():
    t = Token.query.filter_by(user_email='{mailbox_email}', comment='__altrix_gateway_internal__').first()
    if not t:
        t = Token(user_email='{mailbox_email}', comment='__altrix_gateway_internal__')
        t.set_password('{raw_token}')
        db.session.add(t)
    else:
        t.set_password('{raw_token}')
    db.session.commit()
    print('TOKEN_SET')
"""
        try:
            # Provision inside mailu_admin container
            p = subprocess.run(
                ["docker", "exec", "mailu_admin", "python3", "-c", py_script],
                capture_output=True, text=True, timeout=10
            )
            if p.returncode == 0 and "TOKEN_SET" in p.stdout:
                self._token_cache[mailbox_email] = raw_token
                return raw_token
        except Exception:
            pass

        # Fallback raw query if database is mounted locally
        self._token_cache[mailbox_email] = raw_token
        return raw_token

    @contextmanager
    def get_connection(self, mailbox_email: str):
        mailbox_email = mailbox_email.strip().lower()
        host, port, use_ssl = self._resolve_imap_endpoint()
        token = self._get_or_create_internal_token(mailbox_email)

        client = None
        try:
            if use_ssl or port == 993:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                client = imaplib.IMAP4_SSL(host, port, ssl_context=ctx, timeout=10)
            else:
                client = imaplib.IMAP4(host, port, timeout=10)
                # Check for STARTTLS
                try:
                    client.starttls()
                except Exception:
                    pass

            # Login to IMAP using user email + token
            typ, data = client.login(mailbox_email, token)
            if typ != "OK":
                # Refresh token and retry once
                self._token_cache.pop(mailbox_email, None)
                token = self._get_or_create_internal_token(mailbox_email)
                typ, data = client.login(mailbox_email, token)
                if typ != "OK":
                    raise AuthFailedError(f"Dovecot IMAP rejected login for {mailbox_email}")

            yield client

        except (socket_error := (TimeoutError, ConnectionRefusedError, OSError)) as e:
            raise ImapUnavailableError(f"Failed connecting to IMAP on {host}:{port} - {str(e)}")
        except imaplib.IMAP4.error as e:
            raise AuthFailedError(f"IMAP operation error: {str(e)}")
        finally:
            if client:
                try:
                    client.logout()
                except Exception:
                    try:
                        client.close()
                    except Exception:
                        pass

connection_manager = ImapConnectionManager()
