import subprocess
import os
import shutil
from flask import Blueprint, request, g
from app.database import get_db
from app.schemas.validation import is_valid_domain, is_valid_email, is_valid_username, is_valid_password
from app.security.rbac import require_auth, require_role
from app.security.audit import log_audit
from app.security.rate_limit import rate_limit
from app.utils.response import api_success, api_error

mailboxes_bp = Blueprint("mailboxes_bp", __name__)

@mailboxes_bp.route("/api/mailboxes", methods=["GET"])
@require_auth
def list_mailboxes():
    try:
        conn = get_db()
        cur = conn.cursor()
        users = cur.execute("SELECT email, domain_name, quota_bytes, enabled, comment, created_at FROM user").fetchall()
        result = []
        for u in users:
            quota_bytes = u["quota_bytes"] if u["quota_bytes"] is not None else 5368709120
            quota_mb = round(quota_bytes / (1024**2), 1)
            result.append({
                "email": u["email"],
                "domain": u["domain_name"],
                "quota_bytes": quota_bytes,
                "quota_mb": quota_mb,
                "enabled": bool(u["enabled"]),
                "comment": u["comment"] or "",
                "created_at": u["created_at"] or ""
            })
        conn.close()
        return api_success(result)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes/<path:email>", methods=["GET"])
@require_auth
def get_mailbox_detail(email):
    try:
        email = email.strip().lower()
        conn = get_db()
        cur = conn.cursor()
        u = cur.execute("SELECT email, domain_name, quota_bytes, enabled, comment, created_at FROM user WHERE email = ?", (email,)).fetchone()
        if not u:
            conn.close()
            return api_error(f"Mailbox {email} not found", code="NOT_FOUND", status_code=404)

        aliases = cur.execute("SELECT email, domain_name, destination, created_at FROM alias WHERE destination = ? OR email = ?", (email, email)).fetchall()
        conn.close()

        quota_bytes = u["quota_bytes"] if u["quota_bytes"] is not None else 5368709120
        quota_mb = round(quota_bytes / (1024**2), 1)
        used_mb = 0.0
        avail_mb = max(0.0, quota_mb - used_mb)
        dom_name = u["domain_name"]
        user_part = u["email"].split("@")[0]

        return api_success({
            "mailbox": {
                "email": u["email"],
                "user": user_part,
                "domain": dom_name,
                "quota_mb": quota_mb,
                "used_mb": used_mb,
                "enabled": bool(u["enabled"]),
                "created_at": u["created_at"] or ""
            },
            "domain": dom_name,
            "aliases": [{
                "email": a["email"],
                "domain": a["domain_name"],
                "destination": a["destination"],
                "created_at": a["created_at"] or ""
            } for a in aliases],
            "storage": {
                "used_mb": used_mb,
                "quota_mb": quota_mb,
                "available_mb": avail_mb,
                "pct_used": 0.0
            },
            "protocols": {
                "imap": {"host": f"mail.{dom_name}", "port": 993, "security": "SSL/TLS", "proto": "IMAPS"},
                "smtp": {"host": f"mail.{dom_name}", "port": 587, "security": "STARTTLS", "proto": "SMTP Submission"},
                "webmail": {"url": "/webmail/", "sso": True}
            }
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
@rate_limit(max_requests=30, window_seconds=60)
def create_mailbox():
    try:
        data = request.json or {}
        user = data.get("user", "").strip().lower()
        domain = data.get("domain", "").strip().lower()
        password = data.get("password", "").strip()
        quota_mb = int(data.get("quota_mb") or 5120)
        quota_bytes = int(data.get("quota_bytes") or (quota_mb * 1024 * 1024))
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_username(user):
            return api_error("Invalid username syntax", code="VALIDATION_ERROR", status_code=400)
        if not is_valid_domain(domain):
            return api_error("Invalid domain name", code="VALIDATION_ERROR", status_code=400)
        if not is_valid_password(password):
            return api_error("Password must be at least 8 characters long", code="VALIDATION_ERROR", status_code=400)

        # 1. Create user in Mailu
        res = subprocess.run(["docker", "exec", "mailu_admin", "flask", "mailu", "user", user, domain, password], capture_output=True, text=True)
        if res.returncode != 0:
            # If user already exists, update password
            res_pw = subprocess.run(["docker", "exec", "mailu_admin", "flask", "mailu", "password", user, domain, password], capture_output=True, text=True)
            if res_pw.returncode != 0:
                log_audit(g.current_user["username"], ip, "MAILBOX_CREATE", f"{user}@{domain}", "FAILURE", res.stderr)
                return api_error(res.stderr or res.stdout, code="MAILU_RPC_ERROR", status_code=400)

        # 2. Update quota_bytes, enable_imap, enable_pop in database
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE user SET quota_bytes = ?, enabled = 1, enable_imap = 1, enable_pop = 1 WHERE email = ?", (quota_bytes, f"{user}@{domain}"))
        conn.commit()
        conn.close()

        log_audit(g.current_user["username"], ip, "MAILBOX_CREATE", f"{user}@{domain}", "SUCCESS", f"quota_mb={quota_mb}")
        return api_success(message=f"Mailbox {user}@{domain} provisioned with {quota_mb}MB ({round(quota_mb/1024, 1)}GB) storage")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes/<path:email>/quota", methods=["PATCH"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def update_mailbox_quota(email):
    try:
        email = email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_email(email):
            return api_error("Invalid email parameter", code="VALIDATION_ERROR", status_code=400)

        data = request.json or {}
        quota_mb = int(data.get("quota_mb") or 5120)
        quota_bytes = int(data.get("quota_bytes") or (quota_mb * 1024 * 1024))

        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE user SET quota_bytes = ? WHERE email = ?", (quota_bytes, email))
        conn.commit()
        conn.close()

        log_audit(g.current_user["username"], ip, "MAILBOX_QUOTA_CHANGE", email, "SUCCESS", f"quota_mb={quota_mb}")
        return api_success(message=f"Storage quota for {email} updated to {quota_mb} MB ({round(quota_mb/1024, 1)} GB)")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes/<path:email>", methods=["DELETE"])
@require_auth
@require_role("SUPER_ADMIN")
def delete_mailbox(email):
    try:
        email = email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_email(email):
            return api_error("Invalid email parameter", code="VALIDATION_ERROR", status_code=400)

        user_part, domain_part = email.split("@", 1)

        # Remove from Mailu DB
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM user WHERE email = ?", (email,))
        cur.execute("DELETE FROM token WHERE user_email = ?", (email,))
        conn.commit()
        conn.close()

        # Purge Maildir
        user_dir = f"/mail/{domain_part}/{user_part}"
        if os.path.exists(user_dir):
            try:
                shutil.rmtree(user_dir)
            except Exception:
                pass

        log_audit(g.current_user["username"], ip, "MAILBOX_DELETE", email, "SUCCESS")
        return api_success(message=f"Mailbox {email} deleted successfully")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes/<path:email>/status", methods=["PATCH"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def toggle_mailbox_status(email):
    try:
        email = email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_email(email):
            return api_error("Invalid email parameter", code="VALIDATION_ERROR", status_code=400)

        data = request.json or {}
        enabled = 1 if data.get("enabled", True) else 0

        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE user SET enabled = ?, enable_imap = ?, enable_pop = ? WHERE email = ?", (enabled, enabled, enabled, email))
        conn.commit()
        conn.close()

        log_audit(g.current_user["username"], ip, "MAILBOX_STATUS_CHANGE", email, "SUCCESS", f"enabled={enabled}")
        return api_success(message=f"Mailbox {email} status updated to {'Active' if enabled else 'Suspended'}")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@mailboxes_bp.route("/api/mailboxes/<path:email>/password", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
@rate_limit(max_requests=10, window_seconds=60)
def update_mailbox_password(email):
    try:
        email = email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_email(email):
            return api_error("Invalid email parameter", code="VALIDATION_ERROR", status_code=400)

        data = request.json or {}
        new_password = data.get("password", "").strip()
        if not is_valid_password(new_password):
            return api_error("Password must be at least 8 characters long", code="VALIDATION_ERROR", status_code=400)

        user_part, domain_part = email.split("@", 1)
        res = subprocess.run(["docker", "exec", "mailu_admin", "flask", "mailu", "password", user_part, domain_part, new_password], capture_output=True, text=True)
        if res.returncode != 0:
            log_audit(g.current_user["username"], ip, "MAILBOX_PASSWORD_CHANGE", email, "FAILURE", res.stderr)
            return api_error(res.stderr or res.stdout, code="MAILU_RPC_ERROR", status_code=400)

        log_audit(g.current_user["username"], ip, "MAILBOX_PASSWORD_CHANGE", email, "SUCCESS")
        return api_success(message=f"Password for {email} updated successfully")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)