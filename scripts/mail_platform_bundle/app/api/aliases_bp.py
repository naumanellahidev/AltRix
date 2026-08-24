import subprocess
from flask import Blueprint, request, g
from app.database import get_db
from app.schemas.validation import is_valid_domain, is_valid_email, is_valid_username
from app.security.rbac import require_auth, require_role
from app.security.audit import log_audit
from app.security.rate_limit import rate_limit
from app.utils.response import api_success, api_error

aliases_bp = Blueprint("aliases_bp", __name__)

@aliases_bp.route("/api/aliases", methods=["GET"])
@require_auth
def list_aliases():
    try:
        conn = get_db()
        cur = conn.cursor()
        aliases = cur.execute("SELECT email, domain_name, destination, comment, created_at FROM alias ORDER BY email").fetchall()
        result = [
            {
                "email": a["email"],
                "domain": a["domain_name"],
                "destination": a["destination"],
                "comment": a["comment"] or "",
                "created_at": a["created_at"] or ""
            }
            for a in aliases
        ]
        conn.close()
        return api_success(result)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@aliases_bp.route("/api/aliases", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
@rate_limit(max_requests=30, window_seconds=60)
def create_alias():
    try:
        data = request.json or {}
        alias_name = data.get("alias", "").strip().lower()
        domain = data.get("domain", "").strip().lower()
        destination = data.get("destination", "").strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_username(alias_name):
            return api_error("Invalid alias prefix syntax", code="VALIDATION_ERROR", status_code=400)
        if not is_valid_domain(domain):
            return api_error("Invalid domain name", code="VALIDATION_ERROR", status_code=400)

        alias_email = f"{alias_name}@{domain}"

        # Parse and validate destinations (supports single or comma-separated)
        dest_list = [d.strip().lower() for d in destination.split(",") if d.strip()]
        if not dest_list:
            return api_error("Destination cannot be empty", code="VALIDATION_ERROR", status_code=400)

        for d in dest_list:
            if not is_valid_email(d):
                return api_error(f"Invalid destination email syntax: '{d}'", code="VALIDATION_ERROR", status_code=400)
            # Direct loop prevention
            if d == alias_email:
                return api_error("Direct loop detected: Alias cannot route to itself", code="ROUTING_LOOP", status_code=400)

        cleaned_dest = ",".join(dest_list)

        # Check existing alias in database
        conn = get_db()
        cur = conn.cursor()
        exists = cur.execute("SELECT 1 FROM alias WHERE email = ?", (alias_email,)).fetchone()
        conn.close()

        if exists:
            return api_error(f"Alias '{alias_email}' already exists", code="DUPLICATE_RESOURCE", status_code=409)

        res = subprocess.run(
            ["docker", "exec", "mailu_admin", "flask", "mailu", "alias", alias_name, domain, cleaned_dest],
            capture_output=True, text=True, timeout=15
        )
        if res.returncode != 0:
            log_audit(g.current_user["username"], ip, "ALIAS_CREATE", alias_email, "FAILURE", res.stderr)
            return api_error(res.stderr or res.stdout, code="MAILU_RPC_ERROR", status_code=400)

        log_audit(g.current_user["username"], ip, "ALIAS_CREATE", alias_email, "SUCCESS", f"-> {cleaned_dest}")
        return api_success(message=f"Alias {alias_email} -> {cleaned_dest} created successfully")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@aliases_bp.route("/api/aliases/<path:email>", methods=["DELETE"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def delete_alias(email):
    try:
        email = email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not is_valid_email(email):
            return api_error("Invalid email parameter", code="VALIDATION_ERROR", status_code=400)

        user_part, domain_part = email.split("@", 1)

        res = subprocess.run(
            ["docker", "exec", "mailu_admin", "flask", "mailu", "alias-delete", user_part, domain_part],
            capture_output=True, text=True, timeout=15
        )

        # Fallback database cleanup
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM alias WHERE email = ?", (email,))
        conn.commit()
        conn.close()

        log_audit(g.current_user["username"], ip, "ALIAS_DELETE", email, "SUCCESS")
        return api_success(message=f"Alias {email} deleted successfully")
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)
