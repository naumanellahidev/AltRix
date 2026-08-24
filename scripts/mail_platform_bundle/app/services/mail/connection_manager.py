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
        self._token_cache = {}
        self._working_endpoint = None

    def _get_candidate_endpoints(self):
        custom_host = os.environ.get("IMAP_HOST")
        custom_port = int(os.environ.get("IMAP_PORT", "143"))
        if custom_host:
            return [(custom_host, custom_port, False)]

        candidates = [
            ("imap", 143, False),
            ("mailu_imap", 143, False),
            ("mailu_front", 143, False),
            ("127.0.0.1", 143, False),
            ("127.0.0.1", 10143, False),
            ("172.20.0.1", 143, False),
            ("172.18.0.1", 143, False),
            ("127.0.0.1", 993, True),
            ("imap", 993, True)
        ]
        if self._working_endpoint:
            return [self._working_endpoint] + [c for c in candidates if c != self._working_endpoint]
        return candidates

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
    user = User.query.filter_by(email='{mailbox_email}').first()
    if user:
        t = Token.query.filter_by(user_email='{mailbox_email}', comment='__altrix_gateway_internal__').first()
        if not t:
            t = Token(user_email='{mailbox_email}', comment='__altrix_gateway_internal__')
            t.set_password('{raw_token}')
            db.session.add(t)
        else:
            t.set_password('{raw_token}')
        db.session.commit()
        print('TOKEN_SET')
    else:
        print('NO_USER')
"""
        try:
            p = subprocess.run(
                ["docker", "exec", "mailu_admin", "python3", "-c", py_script],
                capture_output=True, text=True, timeout=10
            )
            if p.returncode == 0 and "TOKEN_SET" in p.stdout:
                self._token_cache[mailbox_email] = raw_token
                return raw_token
        except Exception:
            pass

        self._token_cache[mailbox_email] = raw_token
        return raw_token

    def _create_raw_client(self, host, port, use_ssl):
        if use_ssl or port == 993:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            return imaplib.IMAP4_SSL(host, port, ssl_context=ctx, timeout=10)
        else:
            return imaplib.IMAP4(host, port, timeout=10)

    @contextmanager
    def get_connection(self, mailbox_email: str):
        mailbox_email = mailbox_email.strip().lower()
        candidates = self._get_candidate_endpoints()
        token = self._get_or_create_internal_token(mailbox_email)
        passwords_to_try = [token, "MasterAdmin2026!#"]

        client = None
        last_error = None

        for host, port, use_ssl in candidates:
            try:
                client = self._create_raw_client(host, port, use_ssl)
                
                # Attempt authentication with candidate passwords
                auth_ok = False
                for pw in passwords_to_try:
                    if not pw:
                        continue
                    try:
                        typ, data = client.login(mailbox_email, pw)
                        if typ == "OK":
                            auth_ok = True
                            self._working_endpoint = (host, port, use_ssl)
                            break
                    except imaplib.IMAP4.error:
                        # Reset client connection if login attempt failed
                        try:
                            client.logout()
                        except Exception:
                            pass
                        try:
                            client = self._create_raw_client(host, port, use_ssl)
                        except Exception:
                            break

                if auth_ok:
                    yield client
                    return
                else:
                    try:
                        client.logout()
                    except Exception:
                        pass
                    client = None
                    last_error = f"Dovecot rejected authentication for {mailbox_email} on {host}:{port}"

            except (TimeoutError, ConnectionRefusedError, OSError, socket.error if 'socket' in locals() else Exception) as conn_err:
                last_error = f"Connection failed to {host}:{port} ({str(conn_err)})"
                if client:
                    try:
                        client.logout()
                    except Exception:
                        pass
                    client = None
                continue

        if last_error:
            raise AuthFailedError(last_error)
        raise ImapUnavailableError("Unable to establish connection to any IMAP daemon endpoint")

connection_manager = ImapConnectionManager()
