import re
import html
from datetime import datetime
from app.database import get_db
from app.services.mail.errors import MailServiceError
from app.services.mail.authorization import mail_auth_service

ALLOWED_DENSITIES = {"comfortable", "compact"}
ALLOWED_PAGE_SIZES = {10, 25, 50, 100}
ALLOWED_READING_PANES = {"split", "full", "bottom"}
ALLOWED_PREVIEW_LINES = {1, 2, 3}
ALLOWED_REMOTE_IMAGES = {"block", "ask", "allow"}

SAFE_HTML_TAGS = {"p", "br", "b", "strong", "i", "em", "u", "s", "a", "span", "div", "ul", "ol", "li", "hr", "img"}

def sanitize_signature_html(raw_html: str) -> str:
    """Sanitizes user HTML signature, disarming scripts, event handlers, and dangerous tags."""
    if not raw_html or not raw_html.strip():
        return ""
    
    # 1. Strip script, iframe, object, embed, style tags
    clean = re.sub(r"<(script|iframe|object|embed|style)[^>]*>.*?</\1>", "", raw_html, flags=re.IGNORECASE | re.DOTALL)
    
    # 2. Strip event handlers (onload, onerror, onclick, etc.)
    clean = re.sub(r"\bon\w+\s*=\s*(?:'[^']*'|\"[^\"]*\"|[^\s>]+)", "", clean, flags=re.IGNORECASE)
    
    # 3. Disarm javascript: and data: URIs in href and src (except safe images)
    clean = re.sub(r'(href|src)\s*=\s*["\']\s*javascript:[^"\']*["\']', r'\1="#"', clean, flags=re.IGNORECASE)

    # 4. Limit length
    if len(clean) > 10240: # 10 KB limit
        clean = clean[:10240]

    return clean.strip()

class PreferenceService:
    def get_user_preferences(self, principal_id: str) -> dict:
        principal_id = principal_id.strip().lower()
        conn = get_db()
        cur = conn.cursor()
        row = cur.execute(
            "SELECT * FROM user_mail_preferences WHERE principal_id = ?",
            (principal_id,)
        ).fetchone()
        conn.close()

        if row:
            return {
                "density": row["density"] or "comfortable",
                "page_size": row["page_size"] or 25,
                "reading_pane": row["reading_pane"] or "split",
                "preview_lines": row["preview_lines"] or 1,
                "default_mailbox": row["default_mailbox"],
                "default_folder": row["default_folder"] or "INBOX",
                "remote_images": row["remote_images"] or "block",
                "updated_at": row["updated_at"]
            }

        return {
            "density": "comfortable",
            "page_size": 25,
            "reading_pane": "split",
            "preview_lines": 1,
            "default_mailbox": None,
            "default_folder": "INBOX",
            "remote_images": "block",
            "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        }

    def update_user_preferences(self, principal: dict, updates: dict) -> dict:
        principal_id = principal["username"].strip().lower()
        current = self.get_user_preferences(principal_id)

        density = updates.get("density", current["density"]).strip().lower()
        if density not in ALLOWED_DENSITIES:
            raise MailServiceError(f"Invalid density '{density}'. Must be one of {list(ALLOWED_DENSITIES)}", code="INVALID_PREFERENCE", status_code=400)

        page_size = int(updates.get("page_size", current["page_size"]))
        if page_size not in ALLOWED_PAGE_SIZES:
            raise MailServiceError(f"Invalid page_size '{page_size}'. Must be one of {list(ALLOWED_PAGE_SIZES)}", code="INVALID_PREFERENCE", status_code=400)

        reading_pane = updates.get("reading_pane", current["reading_pane"]).strip().lower()
        if reading_pane not in ALLOWED_READING_PANES:
            raise MailServiceError(f"Invalid reading_pane '{reading_pane}'", code="INVALID_PREFERENCE", status_code=400)

        preview_lines = int(updates.get("preview_lines", current["preview_lines"]))
        if preview_lines not in ALLOWED_PREVIEW_LINES:
            raise MailServiceError(f"Invalid preview_lines '{preview_lines}'", code="INVALID_PREFERENCE", status_code=400)

        remote_images = updates.get("remote_images", current["remote_images"]).strip().lower()
        if remote_images not in ALLOWED_REMOTE_IMAGES:
            raise MailServiceError(f"Invalid remote_images '{remote_images}'", code="INVALID_PREFERENCE", status_code=400)

        default_folder = updates.get("default_folder", current["default_folder"]).strip()
        default_mailbox = updates.get("default_mailbox", current["default_mailbox"])

        if default_mailbox:
            default_mailbox = default_mailbox.strip().lower()
            if not mail_auth_service.can_access_mailbox(principal, default_mailbox):
                raise MailServiceError(f"Cannot set inaccessible mailbox '{default_mailbox}' as default", code="MAILBOX_ACCESS_DENIED", status_code=403)

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO user_mail_preferences (
            principal_id, density, page_size, reading_pane, preview_lines, default_mailbox, default_folder, remote_images, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(principal_id) DO UPDATE SET
            density=excluded.density,
            page_size=excluded.page_size,
            reading_pane=excluded.reading_pane,
            preview_lines=excluded.preview_lines,
            default_mailbox=excluded.default_mailbox,
            default_folder=excluded.default_folder,
            remote_images=excluded.remote_images,
            updated_at=excluded.updated_at
        """, (principal_id, density, page_size, reading_pane, preview_lines, default_mailbox, default_folder, remote_images, now_str))
        conn.commit()
        conn.close()

        return self.get_user_preferences(principal_id)

    def get_identity_preferences(self, principal_id: str, mailbox_email: str) -> dict:
        principal_id = principal_id.strip().lower()
        mailbox_email = mailbox_email.strip().lower()

        conn = get_db()
        cur = conn.cursor()
        row = cur.execute(
            "SELECT * FROM mailbox_identity_preferences WHERE principal_id = ? AND mailbox_email = ?",
            (principal_id, mailbox_email)
        ).fetchone()
        conn.close()

        if row:
            return {
                "principal_id": principal_id,
                "mailbox_email": mailbox_email,
                "display_name": row["display_name"] or "",
                "signature_plain": row["signature_plain"] or "",
                "signature_html": row["signature_html"] or "",
                "reply_to": row["reply_to"] or "",
                "auto_save_drafts": bool(row["auto_save_drafts"]),
                "updated_at": row["updated_at"]
            }

        return {
            "principal_id": principal_id,
            "mailbox_email": mailbox_email,
            "display_name": "",
            "signature_plain": "",
            "signature_html": "",
            "reply_to": "",
            "auto_save_drafts": True,
            "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        }

    def update_identity_preferences(self, principal: dict, mailbox_email: str, updates: dict) -> dict:
        principal_id = principal["username"].strip().lower()
        mailbox_email = mailbox_email.strip().lower()

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailServiceError(f"Cannot configure identity for inaccessible mailbox '{mailbox_email}'", code="MAILBOX_ACCESS_DENIED", status_code=403)

        display_name = updates.get("display_name", "").strip()[:120]
        signature_plain = updates.get("signature_plain", "").strip()[:5000]
        raw_html = updates.get("signature_html", "")
        signature_html = sanitize_signature_html(raw_html)
        reply_to = updates.get("reply_to", "").strip()[:255]
        auto_save_drafts = 1 if updates.get("auto_save_drafts", True) else 0

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO mailbox_identity_preferences (
            principal_id, mailbox_email, display_name, signature_plain, signature_html, reply_to, auto_save_drafts, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(principal_id, mailbox_email) DO UPDATE SET
            display_name=excluded.display_name,
            signature_plain=excluded.signature_plain,
            signature_html=excluded.signature_html,
            reply_to=excluded.reply_to,
            auto_save_drafts=excluded.auto_save_drafts,
            updated_at=excluded.updated_at
        """, (principal_id, mailbox_email, display_name, signature_plain, signature_html, reply_to, auto_save_drafts, now_str))
        conn.commit()
        conn.close()

        return self.get_identity_preferences(principal_id, mailbox_email)

preference_service = PreferenceService()
