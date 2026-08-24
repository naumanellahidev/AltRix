import os
from flask import Blueprint, jsonify, request, Response
from app.security.rbac import require_auth
from app.utils.response import api_success, api_error

client_config_bp = Blueprint("client_config_bp", __name__)

@client_config_bp.route("/api/client-config/profile", methods=["GET"])
@require_auth
def get_client_config_profile():
    try:
        mail_host = os.environ.get("MAIL_HOSTNAME", "").strip()
        public_configured = bool(mail_host and mail_host != "localhost" and not mail_host.endswith(".local"))

        email_param = request.args.get("email", "").strip().lower()
        domain_part = email_param.split("@")[-1] if "@" in email_param else None
        
        server_display = mail_host if public_configured else (f"mail.{domain_part}" if domain_part else "mail.yourdomain.com")

        profile = {
            "hostname_status": {
                "configured": public_configured,
                "hostname": mail_host if public_configured else None,
                "guidance": "Production public hostname is active." if public_configured else "Mail client hostname is not configured yet. Guidance below uses standard parameterized templates."
            },
            "incoming": {
                "protocol": "IMAP4",
                "server": server_display,
                "port": 993,
                "encryption": "SSL/TLS (Implicit)",
                "authentication": "Normal Password (SASL PLAIN)",
                "username_format": "Full email address (e.g. user@yourdomain.com)"
            },
            "outgoing": {
                "protocol": "SMTP Submission (SMTPS)",
                "server": server_display,
                "port_smtps": 465,
                "encryption": "SSL/TLS (Implicit Port 465)",
                "authentication": "Normal Password (SASL PLAIN)",
                "username_format": "Full email address (e.g. user@yourdomain.com)"
            },
            "autoconfig_endpoints": {
                "mozilla_thunderbird": f"https://{server_display}/mail/config-v1.1.xml" if public_configured else None,
                "apple_mobileconfig": f"https://{server_display}/apple.mobileconfig" if public_configured else None,
                "microsoft_autodiscover": f"https://{server_display}/autodiscover/autodiscover.xml" if public_configured else None
            },
            "clients": [
                {
                    "name": "Mozilla Thunderbird",
                    "platforms": ["macOS", "Windows", "Linux"],
                    "support_type": "Native Auto-Configuration",
                    "instructions": "Enter your name, email address, and mailbox password. Thunderbird automatically retrieves IMAP port 993 and SMTPS port 465 settings."
                },
                {
                    "name": "Apple Mail / iOS Mail",
                    "platforms": ["iOS", "iPadOS", "macOS"],
                    "support_type": "MobileConfig Profile & Manual IMAP",
                    "instructions": "Download and install the .mobileconfig profile, or add an IMAP account with port 993 (SSL) and SMTP port 465 (SSL)."
                },
                {
                    "name": "Microsoft Outlook",
                    "platforms": ["Windows", "macOS", "iOS", "Android"],
                    "support_type": "Manual IMAP / Autodiscover",
                    "instructions": "Choose Manual Setup -> IMAP Account. Specify incoming mail server port 993 (SSL/TLS) and outgoing server port 465 (SSL/TLS) with authentication enabled."
                },
                {
                    "name": "Android Mail (K-9 / FairEmail / Gmail App)",
                    "platforms": ["Android"],
                    "support_type": "IMAP4 over SSL",
                    "instructions": "Add account as IMAP. Server: mail.yourdomain.com, Security: SSL/TLS, Port 993. Outgoing SMTP: Port 465 (SSL/TLS), Require Sign-in enabled."
                }
            ],
            "security_rules": [
                "Always use full email address as the username (e.g. alex@domain.com).",
                "Plaintext unencrypted connections on ports 25 and 110 are strictly blocked for client mail submission.",
                "Passwords are encrypted through modern TLS handshakes (Port 993 IMAPS & Port 465 SMTPS).",
                "Outbound messages sent through authenticated mail clients are automatically signed with 2048-bit DKIM."
            ]
        }

        return api_success(profile)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@client_config_bp.route("/api/client-config/export", methods=["GET"])
@require_auth
def export_client_config():
    try:
        email_addr = request.args.get("email", "").strip().lower()
        if not email_addr or "@" not in email_addr:
            return api_error("Valid email address query parameter required", code="VALIDATION_ERROR", status_code=400)

        domain = email_addr.split("@")[-1]
        mail_host = os.environ.get("MAIL_HOSTNAME", f"mail.{domain}").strip()

        config_text = f"""# Mail Client Manual Configuration
Account: {email_addr}
Domain: {domain}

--- Incoming Server (IMAP) ---
Server: {mail_host}
Protocol: IMAP4
Port: 993
Security: SSL/TLS (Implicit)
Username: {email_addr}
Authentication: Password

--- Outgoing Server (SMTP) ---
Server: {mail_host}
Protocol: SMTP Submission (SMTPS)
Port: 465
Security: SSL/TLS (Implicit)
Username: {email_addr}
Authentication: Password (Required)
"""
        return Response(
            config_text,
            mimetype="text/plain",
            headers={"Content-Disposition": f"attachment; filename=mail-config-{email_addr}.txt"}
        )
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)
