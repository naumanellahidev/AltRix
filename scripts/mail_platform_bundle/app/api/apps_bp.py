import secrets
import subprocess
from datetime import datetime
from flask import Blueprint, request, g, jsonify
from app.database import get_db
from app.schemas.validation import is_valid_token_name, is_valid_email
from app.security.rbac import require_auth, require_role
from app.security.audit import log_audit
from app.security.rate_limit import rate_limit
from app.utils.response import api_success, api_error

apps_bp = Blueprint("apps_bp", __name__)

@apps_bp.route("/api/applications", methods=["GET"])
@require_auth
def list_applications():
    try:
        conn = get_db()
        cur = conn.cursor()
        tokens = cur.execute("SELECT id, user_email, comment, created_at, ip FROM token ORDER BY id DESC").fetchall()
        result = [
            {
                "id": str(t["id"]),
                "name": t["comment"] or "Application SMTP Credential",
                "user_email": t["user_email"] or "System Sender",
                "ip_restriction": t["ip"] or "0.0.0.0/0 (Unrestricted)",
                "created_at": str(t["created_at"])[:10] if t["created_at"] else datetime.utcnow().strftime("%Y-%m-%d")
            }
            for t in tokens
        ]
        conn.close()
        return api_success(result)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@apps_bp.route("/api/applications", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
@rate_limit(max_requests=20, window_seconds=60)
def create_application():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        user_email = data.get("user_email", "").strip().lower()
        ip_restriction = data.get("ip_restriction", "").strip() or None
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_token_name(name):
            return api_error("Valid application name required (3-64 chars)", code="VALIDATION_ERROR", status_code=400)
        if not is_valid_email(user_email):
            return api_error("Valid authorized sender mailbox email required", code="VALIDATION_ERROR", status_code=400)

        # Verify sender mailbox exists in database
        conn = get_db()
        cur = conn.cursor()
        user_row = cur.execute("SELECT email, domain_name FROM user WHERE email = ?", (user_email,)).fetchone()
        if not user_row:
            conn.close()
            return api_error(f"Mailbox '{user_email}' does not exist", code="NOT_FOUND", status_code=404)

        # Generate 32-character lowercase hex token with 128 bits of cryptographic entropy
        raw_secret = secrets.token_hex(16)

        py_script = f"""
from mailu.models import db, Token
from mailu import create_app
import sys

app = create_app()
with app.app_context():
    token = Token(user_email='{user_email}', comment='{name}')
    token.set_password('{raw_secret}')
    if '{ip_restriction or ""}':
        token.ip = ['{ip_restriction}']
    db.session.add(token)
    db.session.commit()
    print(token.id)
"""

        p = subprocess.run(
            ["docker", "exec", "mailu_admin", "python3", "-c", py_script],
            capture_output=True, text=True, timeout=15
        )

        if p.returncode != 0 or not p.stdout.strip().isdigit():
            conn.close()
            log_audit(g.current_user["username"], ip, "APP_CREDENTIAL_CREATE", f"{name} ({user_email})", "FAILURE", p.stderr)
            return api_error("Failed provisioning token in Mailu auth engine", code="MAILU_RPC_ERROR", status_code=500)

        token_id = int(p.stdout.strip())
        domain_name = user_row["domain_name"]
        conn.close()

        log_audit(g.current_user["username"], ip, "APPLICATION_CREDENTIAL_CREATED", f"{name} ({user_email})", "SUCCESS", f"TokenID:{token_id}")

        return jsonify({
            "status": "success",
            "success": True,
            "message": "Application SMTP credential generated successfully",
            "data": {
                "id": str(token_id),
                "name": name,
                "token": raw_secret,
                "smtp_host": f"mail.{domain_name}",
                "smtp_port_ssl": 465,
                "smtp_port_starttls": 587,
                "tls_mode": "SSL/TLS (Port 465) or STARTTLS (Port 587)",
                "auth_user": user_email,
                "ip_restriction": ip_restriction or "0.0.0.0/0 (Unrestricted)"
            }
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@apps_bp.route("/api/applications/<token_id>", methods=["DELETE"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def revoke_application(token_id):
    try:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        purge_script = f"""
from mailu.models import db, Token
from mailu import create_app
app = create_app()
with app.app_context():
    t = db.session.get(Token, int('{token_id}'))
    if t:
        db.session.delete(t)
        db.session.commit()
"""
        
        # Purge token from Mailu ORM / SQLite
        subprocess.run(
            ["docker", "exec", "mailu_admin", "python3", "-c", purge_script],
            capture_output=True, text=True, timeout=15
        )

        # Fallback raw database purge
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM token WHERE id = ?", (token_id,))
        conn.commit()
        conn.close()

        log_audit(g.current_user["username"], ip, "APPLICATION_CREDENTIAL_REVOKED", f"ID:{token_id}", "SUCCESS")
        return api_success(message="Application SMTP credential revoked successfully")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)
