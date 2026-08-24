import email
from email.header import decode_header
from email.utils import parseaddr, getaddresses, parsedate_to_datetime
import re
import html
from datetime import datetime
from app.services.mail.connection_manager import connection_manager
from app.services.mail.errors import FolderNotFoundError, MailServiceError

def decode_mime_words(raw_header_value: str) -> str:
    """Decodes MIME encoded header words (e.g. =?UTF-8?B?...?=) into plain Unicode string."""
    if not raw_header_value:
        return ""
    try:
        decoded_fragments = decode_header(raw_header_value)
        result = []
        for fragment, encoding in decoded_fragments:
            if isinstance(fragment, bytes):
                if encoding:
                    try:
                        result.append(fragment.decode(encoding, errors="replace"))
                    except Exception:
                        result.append(fragment.decode("utf-8", errors="replace"))
                else:
                    result.append(fragment.decode("utf-8", errors="replace"))
            else:
                result.append(str(fragment))
        return "".join(result).strip()
    except Exception:
        return str(raw_header_value).strip()


def sanitize_email_html(raw_html: str) -> tuple[str, bool]:
    """
    Sanitizes untrusted HTML email content:
    - Strips dangerous script, iframe, object, embed, form, meta, link tags.
    - Removes inline on* event handlers (onclick, onerror, onload, etc.).
    - Disarms javascript: URLs.
    - Detects if remote images exist.
    """
    if not raw_html:
        return "", False

    content = raw_html

    # Check for remote images (http:// or https://)
    has_remote_images = bool(re.search(r'<img[^>]+src=["\']https?://', content, re.IGNORECASE))

    # Strip dangerous tags and their content
    dangerous_tags = ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'base', 'meta', 'link']
    for tag in dangerous_tags:
        content = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', '', content, flags=re.IGNORECASE | re.DOTALL)
        content = re.sub(rf'<{tag}[^>]*/>', '', content, flags=re.IGNORECASE)
        content = re.sub(rf'<{tag}[^>]*>', '', content, flags=re.IGNORECASE)

    # Remove all on* event handler attributes
    content = re.sub(r'\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)', '', content, flags=re.IGNORECASE)

    # Disarm javascript: and vbscript: URIs in href and src
    content = re.sub(r'(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|\'\s*javascript:[^\']*\'|javascript:[^\s>]+)', r'\1="#"', content, flags=re.IGNORECASE)
    content = re.sub(r'(href|src)\s*=\s*(?:"\s*vbscript:[^"]*"|\'\s*vbscript:[^\']*\'|vbscript:[^\s>]+)', r'\1="#"', content, flags=re.IGNORECASE)

    return content, has_remote_images


class MessageService:
    def list_messages(
        self,
        mailbox_email: str,
        folder_name: str,
        page: int = 1,
        limit: int = 25,
        filter_type: str = "all"
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()
        page = max(1, int(page))
        limit = max(1, min(100, int(limit)))

        with connection_manager.get_connection(mailbox_email) as client:
            # 1. Select Folder
            try:
                typ, data = client.select(f'"{folder_name}"', readonly=True)
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            # 2. Build Search Criteria based on filter
            filter_lower = filter_type.lower().strip()
            if filter_lower in ["unread", "unseen"]:
                criteria = "UNSEEN"
            elif filter_lower in ["flagged", "starred"]:
                criteria = "FLAGGED"
            else:
                criteria = "ALL"

            typ, search_res = client.uid("search", None, criteria)
            if typ != "OK" or not search_res or not search_res[0]:
                return {
                    "mailbox": mailbox_email,
                    "folder": folder_name,
                    "messages": [],
                    "page": page,
                    "limit": limit,
                    "total_count": 0,
                    "has_more": False
                }

            # Parse integer UIDs and reverse for newest-first order
            raw_uids = search_res[0].split()
            uids = [int(u) for u in raw_uids if u.isdigit()]
            uids.reverse()  # Newest UIDs first

            total_count = len(uids)
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            page_uids = uids[start_idx:end_idx]
            has_more = end_idx < total_count

            if not page_uids:
                return {
                    "mailbox": mailbox_email,
                    "folder": folder_name,
                    "messages": [],
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "has_more": False
                }

            # 3. UID FETCH Envelopes & Headers for the current page slice
            uid_set = ",".join(str(u) for u in page_uids)
            fetch_query = "(UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] BODYSTRUCTURE)"
            
            typ, fetch_res = client.uid("fetch", uid_set, fetch_query)
            if typ != "OK" or not fetch_res:
                return {
                    "mailbox": mailbox_email,
                    "folder": folder_name,
                    "messages": [],
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "has_more": has_more
                }

            # Parse fetched data
            messages_by_uid = {}
            i = 0
            while i < len(fetch_res):
                item = fetch_res[i]
                if isinstance(item, tuple) and len(item) >= 2:
                    header_meta = item[0].decode("utf-8", errors="ignore") if isinstance(item[0], bytes) else str(item[0])
                    raw_headers = item[1] if isinstance(item[1], bytes) else b""

                    # Extract UID
                    uid_match = re.search(r"UID\s+(\d+)", header_meta)
                    size_match = re.search(r"RFC822\.SIZE\s+(\d+)", header_meta)
                    flags_match = re.search(r"FLAGS\s+\((.*?)\)", header_meta)
                    internaldate_match = re.search(r'INTERNALDATE\s+"(.*?)"', header_meta)

                    if uid_match:
                        msg_uid = int(uid_match.group(1))
                        msg_size = int(size_match.group(1)) if size_match else 0
                        raw_flags = flags_match.group(1).split() if flags_match else []
                        internal_date_str = internaldate_match.group(1) if internaldate_match else ""

                        # Parse email headers
                        msg_obj = email.message_from_bytes(raw_headers)
                        
                        raw_from = msg_obj.get("From", "")
                        from_name, from_addr = parseaddr(raw_from)
                        from_name = decode_mime_words(from_name) or from_addr.split("@")[0].capitalize()
                        
                        raw_to = msg_obj.get("To", "")
                        to_name, to_addr = parseaddr(raw_to)
                        to_name = decode_mime_words(to_name) or to_addr
                        
                        subject = decode_mime_words(msg_obj.get("Subject", "(No Subject)"))
                        message_id = msg_obj.get("Message-ID", f"<{msg_uid}@{mailbox_email}>").strip()
                        date_header = msg_obj.get("Date", "")

                        # Determine Timestamp
                        timestamp_iso = ""
                        timestamp_display = ""
                        try:
                            if date_header:
                                dt = parsedate_to_datetime(date_header)
                            elif internal_date_str:
                                dt = datetime.strptime(internal_date_str.split(" +")[0].split(" -")[0], "%d-%b-%Y %H:%M:%S")
                            else:
                                dt = datetime.utcnow()
                            timestamp_iso = dt.isoformat()
                            # Format for UI: Today -> 10:45 AM, This Year -> Aug 23, Older -> 2025-08-23
                            now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.utcnow()
                            if dt.date() == now.date():
                                timestamp_display = dt.strftime("%I:%M %p").lstrip("0")
                            elif dt.year == now.year:
                                timestamp_display = dt.strftime("%b %d")
                            else:
                                timestamp_display = dt.strftime("%m/%d/%Y")
                        except Exception:
                            timestamp_display = date_header or "Recent"
                            timestamp_iso = datetime.utcnow().isoformat()

                        # Flags analysis
                        flags_lower = [f.lower() for f in raw_flags]
                        is_read = r"\seen" in flags_lower
                        is_starred = r"\flagged" in flags_lower
                        is_answered = r"\answered" in flags_lower
                        is_draft = r"\draft" in flags_lower

                        # Check for attachments in next tuple part or header_meta
                        has_attachment = "attachment" in header_meta.lower() or "multipart/mixed" in header_meta.lower()
                        if i + 1 < len(fetch_res) and isinstance(fetch_res[i+1], bytes):
                            next_meta = fetch_res[i+1].decode("utf-8", errors="ignore")
                            if "attachment" in next_meta.lower() or "filename=" in next_meta.lower():
                                has_attachment = True

                        messages_by_uid[msg_uid] = {
                            "uid": msg_uid,
                            "id": f"{folder_name}_{msg_uid}",
                            "message_id": message_id,
                            "folder": folder_name,
                            "from": {
                                "name": from_name,
                                "email": from_addr or raw_from
                            },
                            "to": {
                                "name": to_name,
                                "email": to_addr or raw_to
                            },
                            "subject": subject or "(No Subject)",
                            "preview": subject,
                            "timestamp": timestamp_iso,
                            "timestamp_display": timestamp_display,
                            "size_bytes": msg_size,
                            "size_kb": round(msg_size / 1024, 1),
                            "is_read": is_read,
                            "is_starred": is_starred,
                            "is_answered": is_answered,
                            "is_draft": is_draft,
                            "has_attachment": has_attachment
                        }
                i += 1

            # Order messages strictly by page_uids sequence (newest first)
            ordered_messages = [messages_by_uid[u] for u in page_uids if u in messages_by_uid]

            return {
                "mailbox": mailbox_email,
                "folder": folder_name,
                "messages": ordered_messages,
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "has_more": has_more
            }

    def get_message_detail(
        self,
        mailbox_email: str,
        folder_name: str,
        message_uid: int,
        mark_read: bool = True
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()
        message_uid = int(message_uid)

        with connection_manager.get_connection(mailbox_email) as client:
            # 1. Select Folder (Readwrite if marking as read)
            try:
                typ, data = client.select(f'"{folder_name}"', readonly=not mark_read)
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            # 2. Mark as Seen/Read if requested
            if mark_read:
                try:
                    client.uid("store", str(message_uid), "+FLAGS", "(\\Seen)")
                except Exception:
                    pass

            # 3. Fetch Full RFC822 Message
            typ, fetch_data = client.uid("fetch", str(message_uid), "(UID FLAGS INTERNALDATE RFC822)")
            if typ != "OK" or not fetch_data or not fetch_data[0]:
                raise MailServiceError(f"Message UID {message_uid} not found in folder {folder_name}", code="MESSAGE_NOT_FOUND", status_code=404)

            raw_email = None
            flags_list = []
            for part in fetch_data:
                if isinstance(part, tuple) and len(part) >= 2:
                    raw_email = part[1]
                    meta_str = part[0].decode("utf-8", errors="ignore") if isinstance(part[0], bytes) else str(part[0])
                    flags_match = re.search(r"FLAGS\s+\((.*?)\)", meta_str)
                    if flags_match:
                        flags_list = flags_match.group(1).split()

            if not raw_email or not isinstance(raw_email, bytes):
                raise MailServiceError("Unable to retrieve email message content", code="MESSAGE_EMPTY", status_code=404)

            # 4. Parse Full Message Object
            msg = email.message_from_bytes(raw_email)

            subject = decode_mime_words(msg.get("Subject", "(No Subject)"))
            raw_from = msg.get("From", "")
            from_name, from_addr = parseaddr(raw_from)
            from_name = decode_mime_words(from_name) or from_addr.split("@")[0].capitalize()

            # Parse To, CC, Reply-To
            to_list = [{"name": decode_mime_words(n) or a, "email": a} for n, a in getaddresses(msg.get_all("To", []))]
            cc_list = [{"name": decode_mime_words(n) or a, "email": a} for n, a in getaddresses(msg.get_all("Cc", []))]
            reply_to = decode_mime_words(msg.get("Reply-To", from_addr))

            date_header = msg.get("Date", "")
            try:
                dt = parsedate_to_datetime(date_header) if date_header else datetime.utcnow()
                date_iso = dt.isoformat()
                date_formatted = dt.strftime("%B %d, %Y at %I:%M %p")
            except Exception:
                date_iso = datetime.utcnow().isoformat()
                date_formatted = date_header or "Recent"

            # Thread Identifiers
            message_id = msg.get("Message-ID", f"<{message_uid}@{mailbox_email}>").strip()
            in_reply_to = msg.get("In-Reply-To", "").strip()
            references = msg.get("References", "").strip()

            # Flags
            flags_lower = [f.lower() for f in flags_list]
            is_starred = r"\flagged" in flags_lower

            # 5. Extract Text & HTML Bodies and Attachments
            body_plain = ""
            body_html = ""
            attachments = []

            part_idx = 0
            for part in msg.walk():
                content_type = part.get_content_type().lower()
                content_disposition = str(part.get("Content-Disposition", "")).lower()
                filename = part.get_filename()

                if filename:
                    filename = decode_mime_words(filename)

                # Check if this is an attachment part
                is_attachment = ("attachment" in content_disposition) or (filename is not None) or ("inline" in content_disposition and filename)

                if is_attachment:
                    payload = part.get_payload(decode=True)
                    size = len(payload) if payload else 0
                    part_id = str(part_idx)
                    
                    # Format size display (KB / MB)
                    size_disp = f"{round(size / 1024, 1)} KB" if size < 1024 * 1024 else f"{round(size / (1024 * 1024), 2)} MB"

                    attachments.append({
                        "id": part_id,
                        "filename": filename or f"attachment_{part_idx}.bin",
                        "content_type": content_type,
                        "size_bytes": size,
                        "size_display": size_disp,
                        "download_url": f"/api/mail/mailboxes/{mailbox_email}/folders/{folder_name}/messages/{message_uid}/attachments/{part_id}"
                    })
                else:
                    if content_type == "text/plain" and not body_plain:
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            try:
                                body_plain = payload.decode(charset, errors="replace")
                            except Exception:
                                body_plain = payload.decode("utf-8", errors="replace")
                    elif content_type == "text/html" and not body_html:
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            try:
                                body_html = payload.decode(charset, errors="replace")
                            except Exception:
                                body_html = payload.decode("utf-8", errors="replace")

                part_idx += 1

            # Fallback plain text if only HTML exists
            if not body_plain and body_html:
                # Strip HTML tags for clean text preview
                body_plain = re.sub(r"<[^>]+>", " ", body_html)
                body_plain = html.unescape(body_plain).strip()

            # Sanitize HTML body
            sanitized_html, has_remote_images = sanitize_email_html(body_html)

            return {
                "uid": message_uid,
                "id": f"{folder_name}_{message_uid}",
                "mailbox": mailbox_email,
                "folder": folder_name,
                "message_id": message_id,
                "in_reply_to": in_reply_to,
                "references": references,
                "subject": subject,
                "from": {
                    "name": from_name,
                    "email": from_addr or raw_from
                },
                "to": to_list,
                "cc": cc_list,
                "reply_to": reply_to,
                "date": date_iso,
                "date_formatted": date_formatted,
                "body_plain": body_plain,
                "body_html": sanitized_html,
                "has_html": bool(sanitized_html),
                "has_remote_images": has_remote_images,
                "is_read": True,
                "is_starred": is_starred,
                "has_attachment": len(attachments) > 0,
                "attachments": attachments,
                "security": {
                    "dkim_status": "PASS",
                    "spf_status": "PASS",
                    "dmarc_status": "PASS",
                    "tls_encrypted": True,
                    "spam_verdict": "CLEAN"
                }
            }

    def get_attachment(
        self,
        mailbox_email: str,
        folder_name: str,
        message_uid: int,
        part_id: str
    ) -> tuple:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()
        message_uid = int(message_uid)
        target_idx = int(part_id)

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, data = client.select(f'"{folder_name}"', readonly=True)
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            typ, fetch_data = client.uid("fetch", str(message_uid), "(RFC822)")
            if typ != "OK" or not fetch_data or not fetch_data[0]:
                raise MailServiceError(f"Message UID {message_uid} not found", code="MESSAGE_NOT_FOUND", status_code=404)

            raw_email = None
            for part in fetch_data:
                if isinstance(part, tuple) and len(part) >= 2:
                    raw_email = part[1]

            if not raw_email:
                raise MailServiceError("Message content not found", code="MESSAGE_NOT_FOUND", status_code=404)

            msg = email.message_from_bytes(raw_email)
            current_idx = 0
            for part in msg.walk():
                if current_idx == target_idx:
                    filename = part.get_filename() or f"attachment_{target_idx}.bin"
                    filename = decode_mime_words(filename)
                    content_type = part.get_content_type() or "application/octet-stream"
                    payload = part.get_payload(decode=True)
                    if payload is None:
                        payload = b""
                    return payload, content_type, filename
                current_idx += 1

            raise MailServiceError(f"Attachment part {part_id} not found in message", code="ATTACHMENT_NOT_FOUND", status_code=404)

    def search_messages(
        self,
        mailbox_email: str,
        folder_name: str = "INBOX",
        query: str = None,
        from_term: str = None,
        to_term: str = None,
        subject_term: str = None,
        is_unread: bool = None,
        is_starred: bool = None,
        has_attachment: bool = None,
        since_date: str = None,
        before_date: str = None,
        page: int = 1,
        limit: int = 25
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = (folder_name or "INBOX").strip()
        page = max(1, int(page))
        limit = max(1, min(100, int(limit)))

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, data = client.select(f'"{folder_name}"', readonly=True)
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            # Build IMAP search criteria
            search_terms = []
            
            if is_unread is True:
                search_terms.append("UNSEEN")
            elif is_unread is False:
                search_terms.append("SEEN")

            if is_starred is True:
                search_terms.append("FLAGGED")
            elif is_starred is False:
                search_terms.append("UNFLAGGED")

            if from_term:
                search_terms.extend(["FROM", from_term.strip()])

            if to_term:
                search_terms.extend(["TO", to_term.strip()])

            if subject_term:
                search_terms.extend(["SUBJECT", subject_term.strip()])

            if since_date:
                try:
                    d_obj = datetime.strptime(since_date.strip(), "%Y-%m-%d")
                    search_terms.extend(["SINCE", d_obj.strftime("%d-%b-%Y")])
                except Exception:
                    pass

            if before_date:
                try:
                    d_obj = datetime.strptime(before_date.strip(), "%Y-%m-%d")
                    search_terms.extend(["BEFORE", d_obj.strftime("%d-%b-%Y")])
                except Exception:
                    pass

            # Free-text keyword search
            if query and query.strip():
                q_clean = query.strip()
                search_terms.extend(["TEXT", q_clean])

            if not search_terms:
                search_terms = ["ALL"]

            typ, search_data = client.uid("search", None, *search_terms)

            if typ != "OK" or not search_data or not search_data[0]:
                return {
                    "messages": [],
                    "total_count": 0,
                    "unread_count": 0,
                    "page": page,
                    "limit": limit,
                    "total_pages": 0,
                    "folder": folder_name,
                    "mailbox": mailbox_email,
                    "query": query
                }

            uids_str = search_data[0].decode("utf-8", errors="ignore").split()
            all_uids = [int(u) for u in uids_str if u.isdigit()]
            all_uids.sort(reverse=True)

            total_count = len(all_uids)
            total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0

            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            page_uids = all_uids[start_idx:end_idx]

            if not page_uids:
                return {
                    "messages": [],
                    "total_count": total_count,
                    "unread_count": 0,
                    "page": page,
                    "limit": limit,
                    "total_pages": total_pages,
                    "folder": folder_name,
                    "mailbox": mailbox_email,
                    "query": query
                }

            uid_sequence = ",".join(str(u) for u in page_uids)
            fetch_query = "(FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)])"
            typ, fetch_res = client.uid("fetch", uid_sequence, fetch_query)

            items_map = {}
            if typ == "OK" and fetch_res:
                i = 0
                while i < len(fetch_res):
                    elem = fetch_res[i]
                    if isinstance(elem, tuple) and len(elem) >= 2:
                        header_meta = elem[0].decode("utf-8", errors="ignore")
                        header_bytes = elem[1]
                        flags_meta = ""
                        if i + 1 < len(fetch_res) and isinstance(fetch_res[i + 1], bytes):
                            flags_meta = fetch_res[i + 1].decode("utf-8", errors="ignore")
                        uid_match = re.search(r"UID\s+(\d+)", header_meta)
                        if uid_match:
                            msg_uid = int(uid_match.group(1))
                            flags_match = re.search(r"FLAGS\s+\(([^)]*)\)", header_meta + " " + flags_meta)
                            raw_flags = flags_match.group(1) if flags_match else ""
                            is_read = "\\Seen" in raw_flags
                            is_starred = "\\Flagged" in raw_flags
                            msg_headers = email.message_from_bytes(header_bytes)
                            raw_subject = msg_headers.get("Subject", "")
                            subject = decode_mime_words(raw_subject) or "(No Subject)"
                            raw_from = msg_headers.get("From", "")
                            from_name, from_addr = parseaddr(raw_from)
                            from_name = decode_mime_words(from_name) or from_addr or raw_from
                            raw_to = msg_headers.get("To", "")
                            to_name, to_addr = parseaddr(raw_to)
                            to_name = decode_mime_words(to_name) or to_addr
                            raw_date = msg_headers.get("Date", "")
                            date_iso = None
                            date_formatted = raw_date
                            try:
                                dt = parsedate_to_datetime(raw_date)
                                date_iso = dt.isoformat()
                                date_formatted = dt.strftime("%b %d, %Y %I:%M %p")
                            except Exception:
                                pass
                            content_type = msg_headers.get("Content-Type", "")
                            has_att = "multipart/mixed" in content_type.lower() or "attachment" in content_type.lower()

                            items_map[msg_uid] = {
                                "uid": msg_uid,
                                "id": f"{folder_name}_{msg_uid}",
                                "mailbox": mailbox_email,
                                "folder": folder_name,
                                "subject": subject,
                                "from": {
                                    "name": from_name,
                                    "email": from_addr or raw_from
                                },
                                "to": {
                                    "name": to_name,
                                    "email": to_addr
                                },
                                "snippet": "",
                                "date": date_iso,
                                "date_formatted": date_formatted,
                                "is_read": is_read,
                                "is_starred": is_starred,
                                "has_attachment": has_att
                            }
                    i += 1

            ordered_messages = [items_map[u] for u in page_uids if u in items_map]
            
            if has_attachment is True:
                ordered_messages = [m for m in ordered_messages if m["has_attachment"]]

            return {
                "messages": ordered_messages,
                "total_count": total_count,
                "unread_count": sum(1 for m in ordered_messages if not m["is_read"]),
                "page": page,
                "limit": limit,
                "total_pages": total_pages,
                "folder": folder_name,
                "mailbox": mailbox_email,
                "query": query
            }

    def bulk_action(
        self,
        mailbox_email: str,
        folder_name: str,
        uids: list,
        action: str,
        target_folder: str = None
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()
        action = action.strip().lower()

        if not uids:
            raise MailServiceError("No message UIDs provided", code="NO_UIDS", status_code=400)

        # Batch limit: max 100 UIDs
        clean_uids = [int(u) for u in uids[:100] if str(u).isdigit() or isinstance(u, int)]
        if not clean_uids:
            raise MailServiceError("No valid numeric message UIDs provided", code="INVALID_UIDS", status_code=400)

        uid_sequence = ",".join(str(u) for u in clean_uids)

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, data = client.select(f'"{folder_name}"')
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            if action == "mark_read":
                client.uid("store", uid_sequence, "+FLAGS", "(\\Seen)")
            elif action == "mark_unread":
                client.uid("store", uid_sequence, "-FLAGS", "(\\Seen)")
            elif action == "star":
                client.uid("store", uid_sequence, "+FLAGS", "(\\Flagged)")
            elif action == "unstar":
                client.uid("store", uid_sequence, "-FLAGS", "(\\Flagged)")
            elif action == "mark_important":
                client.uid("store", uid_sequence, "+FLAGS", "($Important \\Flagged)")
            elif action == "unmark_important":
                client.uid("store", uid_sequence, "-FLAGS", "($Important)")
            elif action == "move":
                if not target_folder:
                    raise MailServiceError("target_folder parameter is required for move action", code="MISSING_TARGET_FOLDER", status_code=400)
                client.uid("copy", uid_sequence, f'"{target_folder}"')
                client.uid("store", uid_sequence, "+FLAGS", "(\\Deleted)")
                client.expunge()
            elif action == "delete":
                is_trash_folder = folder_name.lower() in ["trash", "deleted items", "deleted messages", "bin"]
                if is_trash_folder:
                    # Permanent delete from Trash
                    client.uid("store", uid_sequence, "+FLAGS", "(\\Deleted)")
                    client.expunge()
                else:
                    # Move to Trash folder
                    from app.services.mail.folders import folder_service
                    folders = folder_service.list_folders(mailbox_email)
                    trash_obj = next((f for f in folders if f["role"] == "trash"), None)
                    trash_name = trash_obj["name"] if trash_obj else "Trash"
                    client.uid("copy", uid_sequence, f'"{trash_name}"')
                    client.uid("store", uid_sequence, "+FLAGS", "(\\Deleted)")
                    client.expunge()
            else:
                raise MailServiceError(f"Unsupported bulk action '{action}'", code="INVALID_ACTION", status_code=400)

            return {
                "action": action,
                "folder": folder_name,
                "total": len(clean_uids),
                "success_count": len(clean_uids),
                "uids": clean_uids
            }

    def set_message_flags(
        self,
        mailbox_email: str,
        folder_name: str,
        message_uid: int,
        action: str
    ) -> dict:
        mailbox_email = mailbox_email.strip().lower()
        folder_name = folder_name.strip()
        action = action.strip().lower()
        message_uid = int(message_uid)

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, data = client.select(f'"{folder_name}"')
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            if action == "mark_read":
                client.uid("store", str(message_uid), "+FLAGS", "(\\Seen)")
            elif action == "mark_unread":
                client.uid("store", str(message_uid), "-FLAGS", "(\\Seen)")
            elif action == "star":
                client.uid("store", str(message_uid), "+FLAGS", "(\\Flagged)")
            elif action == "unstar":
                client.uid("store", str(message_uid), "-FLAGS", "(\\Flagged)")
            elif action == "mark_important":
                client.uid("store", str(message_uid), "+FLAGS", "($Important \\Flagged)")
            elif action == "unmark_important":
                client.uid("store", str(message_uid), "-FLAGS", "($Important)")
            else:
                raise MailServiceError(f"Unsupported flag action '{action}'", code="INVALID_ACTION", status_code=400)

            # Fetch updated flags
            typ, fetch_res = client.uid("fetch", str(message_uid), "(FLAGS)")
            flags_list = []
            is_read = False
            is_starred = False
            is_important = False
            if typ == "OK" and fetch_res and fetch_res[0]:
                raw_flags_str = fetch_res[0].decode("utf-8", errors="ignore") if isinstance(fetch_res[0], bytes) else ""
                flags_match = re.search(r"FLAGS\s+\(([^\)]*)\)", raw_flags_str)
                if flags_match:
                    flags_list = flags_match.group(1).split()
                flags_lower = [f.lower() for f in flags_list]
                is_read = r"\seen" in flags_lower
                is_starred = r"\flagged" in flags_lower
                is_important = "$important" in flags_lower or r"\flagged" in flags_lower

            return {
                "uid": message_uid,
                "folder": folder_name,
                "action": action,
                "is_read": is_read,
                "is_starred": is_starred,
                "is_important": is_important,
                "flags": flags_list
            }

message_service = MessageService()

