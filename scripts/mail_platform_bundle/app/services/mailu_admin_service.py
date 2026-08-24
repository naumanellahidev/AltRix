import os
import shutil
import sqlite3
import subprocess
from datetime import datetime
from app.config.settings import config
from app.database import get_db
from app.schemas.validation import (
    is_valid_domain,
    is_valid_email,
    is_valid_username,
    is_valid_password,
    is_valid_destination
)

class MailuAdminService:
    @staticmethod
    def list_domains():
        conn = get_db()
        cur = conn.cursor()
        domains = cur.execute("SELECT name, comment, max_users, max_aliases, max_quota_bytes FROM domain ORDER BY name").fetchall()
        result = []
        for d in domains:
            d_name = d["name"]
            u_count = cur.execute("SELECT COUNT(*) FROM user WHERE domain_name = ?", (d_name,)).fetchone()[0]
            a_count = cur.execute("SELECT COUNT(*) FROM alias WHERE domain_name = ?", (d_name,)).fetchone()[0]
            
            result.append({
                "name": d_name,
                "comment": d["comment"] or "",
                "mailboxes": u_count,
                "aliases": a_count,
                "max_users": d["max_users"],
                "max_quota_bytes": d["max_quota_bytes"],
                "has_dkim": True,
                "dkim_selector": "mail",
                "spf_record": "v=spf1 mx ~all",
                "dmarc_record": f"v=DMARC1; p=reject; rua=mailto:postmaster@{d_name}"
            })
        conn.close()
        return result

    @staticmethod
    def create_domain(name: str):
        name = name.strip().lower()
        if not is_valid_domain(name):
            raise ValueError("Invalid domain name")

        conn = get_db()
        cur = conn.cursor()
        exists = cur.execute("SELECT 1 FROM domain WHERE name = ?", (name,)).fetchone()
        if exists:
            conn.close()
            raise KeyError(f"Domain '{name}' already exists")

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute(
            "INSERT INTO domain (name, comment, max_users, max_aliases, max_quota_bytes, signup_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (name, "Provisioned via Control Center", 50, 50, 53687091200, 0, now_str, now_str)
        )
        conn.commit()
        conn.close()

        # Official Rspamd/Mailu 2048-bit RSA DKIM Generation via mailu_antispam container
        subprocess.run(
            ["docker", "exec", "mailu_antispam", "rspamadm", "dkim_keygen", "-d", name, "-s", "mail", "-b", "2048", "-k", f"/dkim/{name}.key", "-f"],
            capture_output=True, text=True, timeout=15
        )

        return {"name": name, "dkim_selector": "mail"}

    @staticmethod
    def delete_domain(name: str):
        name = name.strip().lower()
        conn = get_db()
        cur = conn.cursor()
        domain = cur.execute("SELECT name FROM domain WHERE name = ?", (name,)).fetchone()
        if not domain:
            conn.close()
            raise LookupError(f"Domain '{name}' not found")

        u_count = cur.execute("SELECT COUNT(*) FROM user WHERE domain_name = ?", (name,)).fetchone()[0]
        a_count = cur.execute("SELECT COUNT(*) FROM alias WHERE domain_name = ?", (name,)).fetchone()[0]

        cur.execute("DELETE FROM user WHERE domain_name = ?", (name,))
        cur.execute("DELETE FROM alias WHERE domain_name = ?", (name,))
        cur.execute("DELETE FROM domain WHERE name = ?", (name,))
        conn.commit()
        conn.close()

        # Lifecycle cleanup: Purge Maildir storage via mailu_admin
        subprocess.run(
            ["docker", "exec", "mailu_admin", "rm", "-rf", f"/mail/{name}"],
            capture_output=True, timeout=10
        )

        # Lifecycle cleanup: Purge DKIM keys via mailu_antispam
        subprocess.run(
            ["docker", "exec", "mailu_antispam", "rm", "-f", f"/dkim/{name}.key", f"/dkim/{name}.pub", f"/dkim/{name}.mail.key", f"/dkim/{name}.priv"],
            capture_output=True, timeout=10
        )

        return {"domain": name, "purged_mailboxes": u_count, "purged_aliases": a_count}

    @staticmethod
    def get_queue_status():
        try:
            res = subprocess.run(
                ["docker", "exec", "mailu_smtp", "mailq"],
                capture_output=True, text=True, timeout=10
            )
            raw = res.stdout.strip()
            is_empty = "Mail queue is empty" in raw or len(raw) == 0
            count = 0 if is_empty else len([l for l in raw.splitlines() if l.strip().endswith("@") or "active" in l.lower()])
            return {
                "empty": is_empty,
                "count": count,
                "status": "HEALTHY" if count < 10 else "WARNING",
                "raw": raw
            }
        except Exception as e:
            return {
                "empty": True,
                "count": 0,
                "status": "UNAVAILABLE",
                "raw": f"Queue check error: {e}"
            }

    @staticmethod
    def flush_queue():
        try:
            res = subprocess.run(
                ["docker", "exec", "mailu_smtp", "postfix", "flush"],
                capture_output=True, text=True, timeout=10
            )
            return res.returncode == 0
        except Exception:
            return False

mailu_admin_service = MailuAdminService()
