import re
import time
import threading
from app.services.mail.connection_manager import connection_manager
from app.services.mail.errors import FolderNotFoundError, MailServiceError

SPECIAL_ROLE_ORDER = {
    "inbox": 1,
    "sent": 2,
    "drafts": 3,
    "junk": 4,
    "trash": 5,
    "archive": 6,
    "custom": 10
}

PROTECTED_SYSTEM_ROLES = {"inbox", "sent", "drafts", "junk", "trash", "archive"}
PROTECTED_SYSTEM_NAMES = {"inbox", "sent", "drafts", "trash", "junk", "spam", "archive", "deleted items", "sent items"}

INVALID_CHARS_REGEX = re.compile(r'[\*\%\?\\~]')

class FolderService:
    def __init__(self):
        # In-memory per-mailbox folder cache: { mailbox_email: { "timestamp": float, "folders": list } }
        self._cache = {}
        self._lock = threading.Lock()
        self._cache_ttl = 30 # 30 seconds TTL

    def _detect_special_role(self, flags: list, folder_name: str) -> str:
        flags_lower = [f.lower().strip() for f in flags]
        name_lower = folder_name.lower().strip()

        # 1. RFC 6154 Special-Use IMAP Attributes
        if r"\inbox" in flags_lower or name_lower == "inbox":
            return "inbox"
        if r"\sent" in flags_lower or name_lower in ["sent", "sent items", "sent messages"]:
            return "sent"
        if r"\drafts" in flags_lower or name_lower in ["drafts"]:
            return "drafts"
        if r"\junk" in flags_lower or name_lower in ["junk", "spam", "junk e-mail"]:
            return "junk"
        if r"\trash" in flags_lower or name_lower in ["trash", "deleted items", "bin"]:
            return "trash"
        if r"\archive" in flags_lower or name_lower in ["archive", "archives"]:
            return "archive"
        if r"\all" in flags_lower:
            return "all"
        if r"\flagged" in flags_lower:
            return "flagged"

        return "custom"

    def _parse_folder_list_line(self, line_bytes: bytes):
        if not line_bytes:
            return None
        line = line_bytes.decode("utf-8", errors="replace")
        
        pattern = r'^\((?P<flags>[^\)]*)\)\s+(?:"(?P<delim_q>[^"]+)"|(?P<delim_raw>\S+))\s+(?:"(?P<name_q>[^"]+)"|(?P<name_raw>.+))$'
        match = re.match(pattern, line)
        if not match:
            parts = line.split('"')
            if len(parts) >= 5:
                flags = parts[0].strip("() ").split()
                delim = parts[1]
                name = parts[3]
                return flags, delim, name
            return None

        flags = match.group("flags").split() if match.group("flags") else []
        delim = match.group("delim_q") or match.group("delim_raw") or "/"
        name = match.group("name_q") or match.group("name_raw") or ""
        return flags, delim, name.strip()

    def validate_folder_name(self, folder_name: str) -> str:
        """Validates folder name format and disallows dangerous or reserved characters."""
        if not folder_name or not folder_name.strip():
            raise MailServiceError("Folder name cannot be empty", code="INVALID_FOLDER_NAME", status_code=400)
        
        name = folder_name.strip()
        if len(name) > 100:
            raise MailServiceError("Folder name cannot exceed 100 characters", code="INVALID_FOLDER_NAME", status_code=400)
        
        if INVALID_CHARS_REGEX.search(name):
            raise MailServiceError("Folder name contains invalid characters (*, %, ?, \\, ~)", code="INVALID_FOLDER_NAME", status_code=400)
        
        if name.startswith("/") or name.endswith("/"):
            raise MailServiceError("Folder name cannot start or end with a slash", code="INVALID_FOLDER_NAME", status_code=400)
            
        if "//" in name:
            raise MailServiceError("Folder name cannot contain consecutive slashes", code="INVALID_FOLDER_NAME", status_code=400)

        return name

    def list_folders(self, mailbox_email: str, force_refresh: bool = False) -> list:
        mailbox_email = mailbox_email.strip().lower()
        now = time.time()

        with self._lock:
            cached = self._cache.get(mailbox_email)
            if not force_refresh and cached and (now - cached["timestamp"] < self._cache_ttl):
                return cached["folders"]

        folders = []
        with connection_manager.get_connection(mailbox_email) as client:
            typ, raw_list = client.list()
            if typ != "OK" or not raw_list:
                return []

            for item in raw_list:
                if not item or not isinstance(item, bytes):
                    continue
                parsed = self._parse_folder_list_line(item)
                if not parsed:
                    continue
                flags, delim, folder_name = parsed

                role = self._detect_special_role(flags, folder_name)
                
                # Query STATUS for live message counts
                total_messages = 0
                unread_messages = 0
                recent_messages = 0
                uid_next = 1

                try:
                    status_typ, status_data = client.status(f'"{folder_name}"', "(MESSAGES UNSEEN RECENT UIDNEXT)")
                    if status_typ == "OK" and status_data and status_data[0]:
                        stat_str = status_data[0].decode("utf-8", errors="ignore")
                        msg_match = re.search(r"MESSAGES\s+(\d+)", stat_str)
                        unseen_match = re.search(r"UNSEEN\s+(\d+)", stat_str)
                        recent_match = re.search(r"RECENT\s+(\d+)", stat_str)
                        uid_match = re.search(r"UIDNEXT\s+(\d+)", stat_str)

                        if msg_match: total_messages = int(msg_match.group(1))
                        if unseen_match: unread_messages = int(unseen_match.group(1))
                        if recent_match: recent_messages = int(recent_match.group(1))
                        if uid_match: uid_next = int(uid_match.group(1))
                except Exception:
                    pass

                # Parent and nesting detection
                parent_folder = None
                display_name = folder_name
                nesting_level = 0
                if delim in folder_name:
                    parts = folder_name.split(delim)
                    display_name = parts[-1]
                    parent_folder = delim.join(parts[:-1])
                    nesting_level = len(parts) - 1

                folders.append({
                    "name": folder_name,
                    "display_name": display_name,
                    "full_path": folder_name,
                    "delimiter": delim,
                    "parent_folder": parent_folder,
                    "nesting_level": nesting_level,
                    "role": role,
                    "is_system": role in PROTECTED_SYSTEM_ROLES,
                    "flags": flags,
                    "is_selectable": r"\Noselect" not in [f.lower() for f in flags],
                    "total_messages": total_messages,
                    "unread_messages": unread_messages,
                    "recent_messages": recent_messages,
                    "uid_next": uid_next,
                    "order": SPECIAL_ROLE_ORDER.get(role, 10)
                })

        # Sort: Inbox -> Sent -> Drafts -> Junk -> Trash -> Archive -> Custom (alphabetical)
        folders.sort(key=lambda f: (f["order"], f["name"].lower()))

        with self._lock:
            self._cache[mailbox_email] = {
                "timestamp": now,
                "folders": folders
            }

        return folders

    def get_folder_summary(self, mailbox_email: str, folder_name: str) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                status_typ, status_data = client.status(f'"{folder_name}"', "(MESSAGES UNSEEN RECENT UIDNEXT UIDVALIDITY)")
                if status_typ != "OK" or not status_data or not status_data[0]:
                    raise FolderNotFoundError(folder_name)
                
                stat_str = status_data[0].decode("utf-8", errors="ignore")
                msg_match = re.search(r"MESSAGES\s+(\d+)", stat_str)
                unseen_match = re.search(r"UNSEEN\s+(\d+)", stat_str)
                recent_match = re.search(r"RECENT\s+(\d+)", stat_str)
                uidnext_match = re.search(r"UIDNEXT\s+(\d+)", stat_str)
                uidvalidity_match = re.search(r"UIDVALIDITY\s+(\d+)", stat_str)

                role = self._detect_special_role([], folder_name)

                return {
                    "mailbox": mailbox_email,
                    "folder": folder_name,
                    "role": role,
                    "is_system": role in PROTECTED_SYSTEM_ROLES,
                    "total_messages": int(msg_match.group(1)) if msg_match else 0,
                    "unread_messages": int(unseen_match.group(1)) if unseen_match else 0,
                    "recent_messages": int(recent_match.group(1)) if recent_match else 0,
                    "uid_next": int(uidnext_match.group(1)) if uidnext_match else 1,
                    "uid_validity": int(uidvalidity_match.group(1)) if uidvalidity_match else 1
                }
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

    def get_sync_status(self, mailbox_email: str, folder_name: str = "INBOX") -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                status_typ, status_data = client.status(f'"{folder_name}"', "(MESSAGES UNSEEN RECENT UIDNEXT UIDVALIDITY HIGHESTMODSEQ)")
                if status_typ != "OK" or not status_data or not status_data[0]:
                    status_typ, status_data = client.status(f'"{folder_name}"', "(MESSAGES UNSEEN RECENT UIDNEXT UIDVALIDITY)")
                
                stat_str = status_data[0].decode("utf-8", errors="ignore") if (status_data and status_data[0]) else ""
                msg_match = re.search(r"MESSAGES\s+(\d+)", stat_str)
                unseen_match = re.search(r"UNSEEN\s+(\d+)", stat_str)
                recent_match = re.search(r"RECENT\s+(\d+)", stat_str)
                uidnext_match = re.search(r"UIDNEXT\s+(\d+)", stat_str)
                uidvalidity_match = re.search(r"UIDVALIDITY\s+(\d+)", stat_str)
                modseq_match = re.search(r"HIGHESTMODSEQ\s+(\d+)", stat_str)

                return {
                    "mailbox": mailbox_email,
                    "folder": folder_name,
                    "total_messages": int(msg_match.group(1)) if msg_match else 0,
                    "unread_messages": int(unseen_match.group(1)) if unseen_match else 0,
                    "recent_messages": int(recent_match.group(1)) if recent_match else 0,
                    "uid_next": int(uidnext_match.group(1)) if uidnext_match else 1,
                    "uid_validity": int(uidvalidity_match.group(1)) if uidvalidity_match else 1,
                    "highest_modseq": int(modseq_match.group(1)) if modseq_match else None,
                    "sync_timestamp": time.time()
                }
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

    def create_folder(
        self,
        mailbox_email: str,
        folder_name: str,
        parent_folder: str = None
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        clean_name = self.validate_folder_name(folder_name)

        # Check reserved system names
        if clean_name.lower() in PROTECTED_SYSTEM_NAMES and not parent_folder:
            raise MailServiceError(f"'{clean_name}' is a reserved system folder name", code="RESERVED_FOLDER_NAME", status_code=400)

        full_folder_name = clean_name
        if parent_folder and parent_folder.strip():
            full_folder_name = f"{parent_folder.strip()}/{clean_name}"

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, res = client.create(f'"{full_folder_name}"')
                if typ != "OK":
                    raise MailServiceError(f"Failed creating folder '{full_folder_name}': {str(res)}", code="FOLDER_CREATE_FAILED", status_code=400)
                
                # Subscribe to newly created folder so Roundcube and IMAP clients see it
                try:
                    client.subscribe(f'"{full_folder_name}"')
                except Exception:
                    pass

            except Exception as e:
                raise MailServiceError(f"IMAP folder create error: {str(e)}", code="FOLDER_CREATE_FAILED", status_code=400)

        self.invalidate_cache(mailbox_email)
        return {
            "name": full_folder_name,
            "display_name": clean_name,
            "parent_folder": parent_folder,
            "status": "created"
        }

    def rename_folder(
        self,
        mailbox_email: str,
        old_name: str,
        new_name: str
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        old_clean = old_name.strip()
        new_clean = self.validate_folder_name(new_name)

        # Protect system folders
        old_role = self._detect_special_role([], old_clean)
        if old_role in PROTECTED_SYSTEM_ROLES or old_clean.lower() in PROTECTED_SYSTEM_NAMES:
            raise MailServiceError(f"System folder '{old_clean}' cannot be renamed", code="PROTECTED_SYSTEM_FOLDER", status_code=403)

        # If old_name had a parent path, preserve the parent prefix
        if "/" in old_clean:
            parent = "/".join(old_clean.split("/")[:-1])
            new_clean = f"{parent}/{new_clean}"

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, res = client.rename(f'"{old_clean}"', f'"{new_clean}"')
                if typ != "OK":
                    raise MailServiceError(f"Failed renaming folder: {str(res)}", code="FOLDER_RENAME_FAILED", status_code=400)
                
                try:
                    client.unsubscribe(f'"{old_clean}"')
                    client.subscribe(f'"{new_clean}"')
                except Exception:
                    pass

            except Exception as e:
                raise MailServiceError(f"IMAP folder rename error: {str(e)}", code="FOLDER_RENAME_FAILED", status_code=400)

        self.invalidate_cache(mailbox_email)
        return {
            "old_name": old_clean,
            "new_name": new_clean,
            "status": "renamed"
        }

    def delete_folder(
        self,
        mailbox_email: str,
        folder_name: str,
        force: bool = False
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_clean = folder_name.strip()

        # Protect system folders
        role = self._detect_special_role([], folder_clean)
        if role in PROTECTED_SYSTEM_ROLES or folder_clean.lower() in PROTECTED_SYSTEM_NAMES:
            raise MailServiceError(f"System folder '{folder_clean}' cannot be deleted", code="PROTECTED_SYSTEM_FOLDER", status_code=403)

        # Check message count
        summary = self.get_folder_summary(mailbox_email, folder_clean)
        if summary.get("total_messages", 0) > 0 and not force:
            raise MailServiceError(
                f"Folder '{folder_clean}' contains {summary['total_messages']} messages. Set force=true to confirm deletion.",
                code="FOLDER_NOT_EMPTY",
                status_code=409
            )

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                try:
                    client.unsubscribe(f'"{folder_clean}"')
                except Exception:
                    pass

                typ, res = client.delete(f'"{folder_clean}"')
                if typ != "OK":
                    raise MailServiceError(f"Failed deleting folder '{folder_clean}': {str(res)}", code="FOLDER_DELETE_FAILED", status_code=400)

            except Exception as e:
                raise MailServiceError(f"IMAP folder delete error: {str(e)}", code="FOLDER_DELETE_FAILED", status_code=400)

        self.invalidate_cache(mailbox_email)
        return {
            "folder": folder_clean,
            "status": "deleted"
        }

    def invalidate_cache(self, mailbox_email: str = None):
        with self._lock:
            if mailbox_email:
                self._cache.pop(mailbox_email.strip().lower(), None)
            else:
                self._cache.clear()

folder_service = FolderService()
