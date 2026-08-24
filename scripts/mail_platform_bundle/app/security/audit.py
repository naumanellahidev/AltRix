import os
import json
from datetime import datetime
from app.database import get_db

def log_audit(actor, ip, action, resource, status, details=None):
    try:
        # Sanitize details (remove secrets/passwords)
        safe_details = details or ""
        for sensitive_key in ["password", "token", "secret", "auth_header"]:
            if sensitive_key in safe_details:
                safe_details = "[REDACTED_CREDENTIALS]"

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_log (timestamp, actor, ip, action, resource, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (now_str, actor or "SYSTEM", ip or "127.0.0.1", action, resource, status, safe_details)
        )
        conn.commit()
        conn.close()

        # Output to container log stream for structured auditing
        print(f"[AUDIT] {now_str} | ACTOR: {actor} ({ip}) | ACTION: {action} | RES: {resource} | STATUS: {status}")
    except Exception as e:
        print(f"[AUDIT_ERROR] Failed logging audit event: {e}")
