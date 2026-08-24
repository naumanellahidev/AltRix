from datetime import datetime
from app.database import get_db
from app.services.mail.errors import MailboxNotFoundError, MailboxAccessDeniedError

class MailAuthorizationService:
    @staticmethod
    def can_access_mailbox(principal_user: dict, mailbox_email: str) -> bool:
        if not principal_user or not mailbox_email:
            return False
        
        mailbox_email = mailbox_email.strip().lower()
        role = principal_user.get("role", "")
        username = principal_user.get("username", "").strip().lower()

        conn = get_db()
        cur = conn.cursor()
        
        # 1. Verify mailbox exists in Mailu
        user_row = cur.execute("SELECT email, domain_name, enabled FROM user WHERE email = ?", (mailbox_email,)).fetchone()
        if not user_row:
            conn.close()
            raise MailboxNotFoundError(mailbox_email)
        
        if not user_row["enabled"]:
            conn.close()
            return False

        # 2. SUPER_ADMIN has platform-wide authorization
        if role in ["SUPER_ADMIN", "ADMIN"]:
            conn.close()
            return True

        # 3. DOMAIN_ADMIN: Check domain match
        if role == "DOMAIN_ADMIN":
            domain = mailbox_email.split("@")[-1] if "@" in mailbox_email else ""
            admin_domain = principal_user.get("domain", "")
            conn.close()
            return domain == admin_domain

        # 4. Direct mailbox owner
        if username == mailbox_email:
            conn.close()
            return True

        # 5. Explicit Mailbox Access Grant check
        grant = cur.execute(
            """
            SELECT id FROM mailbox_access_grant
            WHERE principal_id = ? AND mailbox_email = ? AND revoked_at IS NULL
            """,
            (username, mailbox_email)
        ).fetchone()
        
        conn.close()
        return grant is not None

    @staticmethod
    def list_accessible_mailboxes(principal_user: dict) -> list:
        if not principal_user:
            return []

        role = principal_user.get("role", "")
        username = principal_user.get("username", "").strip().lower()
        conn = get_db()
        cur = conn.cursor()

        results = []

        if role in ["SUPER_ADMIN", "ADMIN"]:
            # All mailboxes on platform
            rows = cur.execute(
                """
                SELECT u.email, u.domain_name, u.quota_bytes, u.enabled, u.comment, u.created_at
                FROM user u
                JOIN domain d ON u.domain_name = d.name
                WHERE u.enabled = 1
                ORDER BY u.domain_name ASC, u.email ASC
                """
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["email"],
                    "email": r["email"],
                    "domain": r["domain_name"],
                    "display_name": r["comment"] or r["email"].split("@")[0].capitalize(),
                    "quota_bytes": r["quota_bytes"],
                    "quota_mb": round((r["quota_bytes"] or 0) / (1024 * 1024), 1),
                    "created_at": str(r["created_at"]) if r["created_at"] else "",
                    "permission_scope": "FULL_ADMIN",
                    "is_primary": (r["email"] == username)
                })

        elif role == "DOMAIN_ADMIN":
            domain = principal_user.get("domain", "")
            rows = cur.execute(
                """
                SELECT email, domain_name, quota_bytes, enabled, comment, created_at
                FROM user
                WHERE domain_name = ? AND enabled = 1
                ORDER BY email ASC
                """,
                (domain,)
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["email"],
                    "email": r["email"],
                    "domain": r["domain_name"],
                    "display_name": r["comment"] or r["email"].split("@")[0].capitalize(),
                    "quota_bytes": r["quota_bytes"],
                    "quota_mb": round((r["quota_bytes"] or 0) / (1024 * 1024), 1),
                    "created_at": str(r["created_at"]) if r["created_at"] else "",
                    "permission_scope": "DOMAIN_ADMIN",
                    "is_primary": (r["email"] == username)
                })

        else:
            # MAILBOX_USER: Own mailbox + granted mailboxes
            rows = cur.execute(
                """
                SELECT u.email, u.domain_name, u.quota_bytes, u.enabled, u.comment, u.created_at,
                       COALESCE(g.permission_scope, 'OWNER') as perm_scope
                FROM user u
                LEFT JOIN mailbox_access_grant g ON u.email = g.mailbox_email AND g.principal_id = ? AND g.revoked_at IS NULL
                WHERE u.enabled = 1 AND (u.email = ? OR g.id IS NOT NULL)
                ORDER BY u.email ASC
                """,
                (username, username)
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["email"],
                    "email": r["email"],
                    "domain": r["domain_name"],
                    "display_name": r["comment"] or r["email"].split("@")[0].capitalize(),
                    "quota_bytes": r["quota_bytes"],
                    "quota_mb": round((r["quota_bytes"] or 0) / (1024 * 1024), 1),
                    "created_at": str(r["created_at"]) if r["created_at"] else "",
                    "permission_scope": r["perm_scope"],
                    "is_primary": (r["email"] == username)
                })

        conn.close()
        return results

    @staticmethod
    def grant_mailbox_access(principal_id: str, mailbox_email: str, permission_scope: str, created_by: str) -> dict:
        principal_id = principal_id.strip().lower()
        mailbox_email = mailbox_email.strip().lower()
        permission_scope = permission_scope.upper() if permission_scope else "READ_WRITE"
        
        if permission_scope not in ["READ_ONLY", "READ_WRITE", "FULL_ADMIN"]:
            permission_scope = "READ_WRITE"

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        
        # Check target mailbox exists
        user_row = cur.execute("SELECT email FROM user WHERE email = ?", (mailbox_email,)).fetchone()
        if not user_row:
            conn.close()
            raise MailboxNotFoundError(mailbox_email)

        cur.execute(
            """
            INSERT INTO mailbox_access_grant (principal_id, mailbox_email, permission_scope, created_at, created_by, revoked_at)
            VALUES (?, ?, ?, ?, ?, NULL)
            ON CONFLICT(principal_id, mailbox_email) DO UPDATE SET
                permission_scope = excluded.permission_scope,
                created_at = excluded.created_at,
                created_by = excluded.created_by,
                revoked_at = NULL
            """,
            (principal_id, mailbox_email, permission_scope, now_str, created_by)
        )
        conn.commit()
        
        grant = cur.execute(
            "SELECT id, principal_id, mailbox_email, permission_scope, created_at, created_by FROM mailbox_access_grant WHERE principal_id = ? AND mailbox_email = ?",
            (principal_id, mailbox_email)
        ).fetchone()
        conn.close()

        return {
            "id": grant["id"],
            "principal_id": grant["principal_id"],
            "mailbox_email": grant["mailbox_email"],
            "permission_scope": grant["permission_scope"],
            "created_at": grant["created_at"],
            "created_by": grant["created_by"]
        }

    @staticmethod
    def revoke_mailbox_access(grant_id: int, revoked_by: str) -> bool:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE mailbox_access_grant SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
            (now_str, grant_id)
        )
        changed = cur.rowcount > 0
        conn.commit()
        conn.close()
        return changed

    @staticmethod
    def list_access_grants(principal_id: str = None) -> list:
        conn = get_db()
        cur = conn.cursor()
        if principal_id:
            rows = cur.execute(
                """
                SELECT id, principal_id, mailbox_email, permission_scope, created_at, created_by
                FROM mailbox_access_grant
                WHERE principal_id = ? AND revoked_at IS NULL
                ORDER BY created_at DESC
                """,
                (principal_id.strip().lower(),)
            ).fetchall()
        else:
            rows = cur.execute(
                """
                SELECT id, principal_id, mailbox_email, permission_scope, created_at, created_by
                FROM mailbox_access_grant
                WHERE revoked_at IS NULL
                ORDER BY created_at DESC
                """
            ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "principal_id": r["principal_id"],
                "mailbox_email": r["mailbox_email"],
                "permission_scope": r["permission_scope"],
                "created_at": r["created_at"],
                "created_by": r["created_by"]
            }
            for r in rows
        ]

mail_auth_service = MailAuthorizationService()
