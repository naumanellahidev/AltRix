import email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.utils import formatdate, make_msgid, parseaddr
from email import encoders
import smtplib
import ssl
import re
import html
import base64
from app.services.mail.authorization import mail_auth_service
from app.services.mail.connection_manager import connection_manager
from app.services.mail.folders import folder_service
from app.services.mail.errors import (
    MailServiceError,
    MailboxAccessDeniedError,
    FolderNotFoundError
)

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PREFIX_REGEX = re.compile(r"^(?:(?:re|fwd|fw|aw|sv|vs)\s*(?:\[\d+\])?\s*:\s*)+", re.IGNORECASE)

def normalize_subject(subject: str, prefix: str = "Re:") -> str:
    """Strips repeated Re:/Fwd: prefixes and applies the requested prefix cleanly."""
    if not subject:
        return f"{prefix} (No Subject)"
    clean = PREFIX_REGEX.sub("", subject.strip()).strip()
    return f"{prefix} {clean}"


class ComposeService:
    def validate_recipients(self, recipients: list) -> list:
        """Validates and deduplicates email recipient addresses."""
        valid = []
        seen = set()
        for r in recipients:
            if not r:
                continue
            name, addr = parseaddr(str(r).strip())
            addr_clean = addr.lower().strip()
            if addr_clean and EMAIL_REGEX.match(addr_clean):
                if addr_clean not in seen:
                    seen.add(addr_clean)
                    valid.append({"name": name, "email": addr_clean})
            else:
                raise MailServiceError(f"Invalid email address: {r}", code="INVALID_RECIPIENT", status_code=400)
        return valid

    def build_mime_message(
        self,
        from_email: str,
        to_recipients: list,
        cc_recipients: list = None,
        bcc_recipients: list = None,
        subject: str = "",
        body_plain: str = "",
        body_html: str = "",
        attachments: list = None,
        in_reply_to: str = None,
        references: str = None
    ) -> tuple[MIMEMultipart, str]:
        """Constructs an RFC 5322 compliant MIME message object."""
        domain = from_email.split("@")[1] if "@" in from_email else "altrixcore.com"
        msg_id = make_msgid(domain=domain)

        if attachments:
            msg = MIMEMultipart("mixed")
            body_alternative = MIMEMultipart("alternative")
            plain_content = body_plain or (re.sub(r"<[^>]+>", " ", body_html) if body_html else "")
            part_plain = MIMEText(plain_content, "plain", "utf-8")
            body_alternative.attach(part_plain)
            if body_html:
                part_html = MIMEText(body_html, "html", "utf-8")
                body_alternative.attach(part_html)
            msg.attach(body_alternative)

            for att in attachments:
                filename = att.get("filename", "attachment.bin")
                content_type = att.get("content_type", "application/octet-stream")
                content_b64 = att.get("content_base64", "")
                
                try:
                    payload = base64.b64decode(content_b64) if content_b64 else b""
                except Exception:
                    payload = b""

                if len(payload) > 10 * 1024 * 1024:
                    raise MailServiceError(f"Attachment '{filename}' exceeds maximum 10 MB size limit", code="ATTACHMENT_TOO_LARGE", status_code=400)

                maintype, _, subtype = content_type.partition("/")
                part_att = MIMEBase(maintype or "application", subtype or "octet-stream")
                part_att.set_payload(payload)
                encoders.encode_base64(part_att)
                part_att.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                msg.attach(part_att)
        else:
            msg = MIMEMultipart("alternative")
            plain_content = body_plain or (re.sub(r"<[^>]+>", " ", body_html) if body_html else "")
            part_plain = MIMEText(plain_content, "plain", "utf-8")
            msg.attach(part_plain)
            if body_html:
                part_html = MIMEText(body_html, "html", "utf-8")
                msg.attach(part_html)

        msg["Message-ID"] = msg_id
        msg["Date"] = formatdate(localtime=True)
        msg["From"] = from_email
        msg["Subject"] = subject or "(No Subject)"
        msg["User-Agent"] = "AltriX Mail Enterprise Control Center/1.0"

        # Format To, CC headers
        if to_recipients:
            to_formatted = [f'"{r["name"]}" <{r["email"]}>' if r.get("name") else r["email"] for r in to_recipients]
            msg["To"] = ", ".join(to_formatted)

        if cc_recipients:
            cc_formatted = [f'"{r["name"]}" <{r["email"]}>' if r.get("name") else r["email"] for r in cc_recipients]
            msg["Cc"] = ", ".join(cc_formatted)

        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
        if references:
            msg["References"] = references

        return msg, msg_id

    def prepare_conversation_action(
        self,
        original_msg: dict,
        current_mailbox: str,
        mode: str = "reply"
    ) -> dict:
        """
        Calculates recipients, normalized subject, thread headers, and quoted body
        for Reply, Reply All, and Forward.
        """
        current_mailbox = current_mailbox.strip().lower()
        mode = mode.lower().strip()

        orig_from = original_msg.get("from", {})
        orig_from_email = orig_from.get("email", "").strip().lower()
        orig_from_name = orig_from.get("name", "") or orig_from_email
        orig_reply_to = original_msg.get("reply_to", "").strip().lower()
        orig_to = [t.get("email", "").strip().lower() for t in original_msg.get("to", []) if t.get("email")]
        orig_cc = [c.get("email", "").strip().lower() for c in original_msg.get("cc", []) if c.get("email")]
        orig_subject = original_msg.get("subject", "")
        orig_date = original_msg.get("date_formatted") or original_msg.get("date") or "Recently"
        orig_msg_id = original_msg.get("message_id", "")
        orig_references = original_msg.get("references", "")
        orig_body_plain = original_msg.get("body_plain", "")
        orig_body_html = original_msg.get("body_html", "")

        to_recipients = []
        cc_recipients = []
        subject = orig_subject
        in_reply_to = orig_msg_id
        
        # Build references thread chain
        if orig_references:
            references = f"{orig_references} {orig_msg_id}".strip()
        else:
            references = orig_msg_id

        if mode == "reply":
            subject = normalize_subject(orig_subject, "Re:")
            primary_target = orig_reply_to or orig_from_email
            # If user is replying to their own sent email, target the original recipient
            if primary_target == current_mailbox and orig_to:
                primary_target = orig_to[0]
            to_recipients = [primary_target] if primary_target else []

            # Format Quoted Body
            quote_header = f"On {orig_date}, {orig_from_name} &lt;{orig_from_email}&gt; wrote:"
            quoted_plain = f"\n\nOn {orig_date}, {orig_from_name} <{orig_from_email}> wrote:\n> " + orig_body_plain.replace("\n", "\n> ")
            quoted_html = f"<br/><br/><div style='font-size: 13px; color: #475569;'>{quote_header}</div><blockquote style='border-left: 2px solid #cbd5e1; padding-left: 12px; margin-left: 0; color: #334155;'>{orig_body_html or orig_body_plain}</blockquote>"

        elif mode == "reply_all":
            subject = normalize_subject(orig_subject, "Re:")
            primary_target = orig_reply_to or orig_from_email
            to_candidates = [primary_target] + orig_to
            
            # Filter self address and deduplicate for To
            seen_to = set()
            for addr in to_candidates:
                if addr and addr != current_mailbox and addr not in seen_to:
                    seen_to.add(addr)
                    to_recipients.append(addr)

            # If To list became empty (e.g. self to self), keep primary target
            if not to_recipients and primary_target:
                to_recipients = [primary_target]

            # Filter CC candidates
            seen_cc = set(seen_to)
            seen_cc.add(current_mailbox)
            for addr in orig_cc:
                if addr and addr not in seen_cc:
                    seen_cc.add(addr)
                    cc_recipients.append(addr)

            quote_header = f"On {orig_date}, {orig_from_name} &lt;{orig_from_email}&gt; wrote:"
            quoted_plain = f"\n\nOn {orig_date}, {orig_from_name} <{orig_from_email}> wrote:\n> " + orig_body_plain.replace("\n", "\n> ")
            quoted_html = f"<br/><br/><div style='font-size: 13px; color: #475569;'>{quote_header}</div><blockquote style='border-left: 2px solid #cbd5e1; padding-left: 12px; margin-left: 0; color: #334155;'>{orig_body_html or orig_body_plain}</blockquote>"

        elif mode == "forward":
            subject = normalize_subject(orig_subject, "Fwd:")
            to_recipients = []  # User enters forward recipients
            in_reply_to = None
            references = None

            fwd_header_plain = (
                f"\n\n---------- Forwarded message ---------\n"
                f"From: {orig_from_name} <{orig_from_email}>\n"
                f"Date: {orig_date}\n"
                f"Subject: {orig_subject}\n"
                f"To: {', '.join(orig_to)}\n\n"
            )
            quoted_plain = fwd_header_plain + orig_body_plain
            
            fwd_header_html = (
                f"<br/><br/><div style='padding: 8px; background-color: #f8fafc; border-left: 3px solid #6366f1; border-radius: 4px; font-size: 12px; color: #334155; margin-bottom: 12px;'>"
                f"<b>---------- Forwarded message ---------</b><br/>"
                f"<b>From:</b> {orig_from_name} &lt;{orig_from_email}&gt;<br/>"
                f"<b>Date:</b> {orig_date}<br/>"
                f"<b>Subject:</b> {html.escape(orig_subject)}<br/>"
                f"<b>To:</b> {html.escape(', '.join(orig_to))}<br/>"
                f"</div>"
            )
            quoted_html = fwd_header_html + (orig_body_html or orig_body_plain)

        else:
            quoted_plain = ""
            quoted_html = ""

        return {
            "mode": mode,
            "from_email": current_mailbox,
            "to": to_recipients,
            "cc": cc_recipients,
            "subject": subject,
            "in_reply_to": in_reply_to,
            "references": references,
            "body_plain": quoted_plain,
            "body_html": quoted_html
        }

    def save_draft(
        self,
        principal: dict,
        from_email: str,
        to_list: list,
        cc_list: list = None,
        bcc_list: list = None,
        subject: str = "",
        body_plain: str = "",
        body_html: str = "",
        attachments: list = None,
        existing_draft_uid: int = None
    ) -> dict:
        """Saves a draft message directly into the mailbox's IMAP Drafts folder."""
        from_email = from_email.strip().lower()

        # 1. Authorize Sender
        if not mail_auth_service.can_access_mailbox(principal, from_email):
            raise MailboxAccessDeniedError(principal.get("username", ""), from_email)

        # 2. Parse Recipients
        to_recipients = self.validate_recipients(to_list) if to_list else []
        cc_recipients = self.validate_recipients(cc_list) if cc_list else []
        bcc_recipients = self.validate_recipients(bcc_list) if bcc_list else []

        # 3. Build MIME draft
        msg, msg_id = self.build_mime_message(
            from_email=from_email,
            to_recipients=to_recipients,
            cc_recipients=cc_recipients,
            bcc_recipients=bcc_recipients,
            subject=subject,
            body_plain=body_plain,
            body_html=body_html,
            attachments=attachments
        )

        msg_bytes = msg.as_bytes()

        # 4. Append to IMAP Drafts Folder
        with connection_manager.get_connection(from_email) as client:
            folders = folder_service.list_folders(from_email)
            drafts_folder_obj = next((f for f in folders if f["role"] == "drafts"), None)
            drafts_folder_name = drafts_folder_obj["name"] if drafts_folder_obj else "Drafts"

            # Delete existing draft if updating
            if existing_draft_uid:
                try:
                    client.select(f'"{drafts_folder_name}"')
                    client.uid("store", str(existing_draft_uid), "+FLAGS", "(\\Deleted)")
                    client.expunge()
                except Exception:
                    pass

            # Append new draft with \Draft and \Seen flags
            res = client.append(f'"{drafts_folder_name}"', "(\\Draft \\Seen)", None, msg_bytes)

            return {
                "status": "saved",
                "folder": drafts_folder_name,
                "message_id": msg_id,
                "timestamp": formatdate(localtime=True)
            }

    def send_message(
        self,
        principal: dict,
        from_email: str,
        to_list: list,
        cc_list: list = None,
        bcc_list: list = None,
        subject: str = "",
        body_plain: str = "",
        body_html: str = "",
        attachments: list = None,
        draft_uid: int = None,
        in_reply_to: str = None,
        references: str = None
    ) -> dict:
        """Submits message to Mailu Postfix SMTP and saves a copy in IMAP Sent folder."""
        from_email = from_email.strip().lower()

        # 1. Authorize Sender
        if not mail_auth_service.can_access_mailbox(principal, from_email):
            raise MailboxAccessDeniedError(principal.get("username", ""), from_email)

        # 2. Validate recipients (at least 1 recipient in To or CC)
        to_recipients = self.validate_recipients(to_list) if to_list else []
        cc_recipients = self.validate_recipients(cc_list) if cc_list else []
        bcc_recipients = self.validate_recipients(bcc_list) if bcc_list else []

        if not to_recipients and not cc_recipients and not bcc_recipients:
            raise MailServiceError("At least one recipient is required to send an email", code="NO_RECIPIENTS", status_code=400)

        # Collect all envelope destination addresses
        all_destinations = [r["email"] for r in (to_recipients + cc_recipients + bcc_recipients)]

        # 3. Build MIME Message
        msg, msg_id = self.build_mime_message(
            from_email=from_email,
            to_recipients=to_recipients,
            cc_recipients=cc_recipients,
            bcc_recipients=bcc_recipients,
            subject=subject,
            body_plain=body_plain,
            body_html=body_html,
            attachments=attachments,
            in_reply_to=in_reply_to,
            references=references
        )

        msg_bytes = msg.as_bytes()

        # Total size limit check (25 MB)
        if len(msg_bytes) > 25 * 1024 * 1024:
            raise MailServiceError("Total message size exceeds 25 MB SMTP limit", code="MESSAGE_TOO_LARGE", status_code=400)

        # 4. Authenticated SMTP Submission to Mailu Postfix
        auth_token = connection_manager._get_or_create_token(from_email)
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        smtp_sent = False
        last_error = None

        # Attempt SMTPS (port 465) first, then STARTTLS (port 587)
        for port, use_ssl in [(465, True), (587, False)]:
            try:
                if use_ssl:
                    with smtplib.SMTP_SSL("127.0.0.1", port, context=ssl_ctx, timeout=15) as s:
                        s.login(from_email, auth_token)
                        s.sendmail(from_email, all_destinations, msg_bytes)
                        smtp_sent = True
                        break
                else:
                    with smtplib.SMTP("127.0.0.1", port, timeout=15) as s:
                        s.starttls(context=ssl_ctx)
                        s.login(from_email, auth_token)
                        s.sendmail(from_email, all_destinations, msg_bytes)
                        smtp_sent = True
                        break
            except Exception as e:
                last_error = e

        if not smtp_sent:
            raise MailServiceError(f"SMTP mail submission failed: {str(last_error)}", code="SMTP_SUBMISSION_FAILED", status_code=503)

        # 5. Append Sent Message Copy to IMAP Sent Folder
        try:
            with connection_manager.get_connection(from_email) as client:
                folders = folder_service.list_folders(from_email)
                sent_folder_obj = next((f for f in folders if f["role"] == "sent"), None)
                sent_folder_name = sent_folder_obj["name"] if sent_folder_obj else "Sent"
                client.append(f'"{sent_folder_name}"', "(\\Seen)", None, msg_bytes)

                # Delete draft if draft_uid was supplied
                if draft_uid:
                    drafts_folder_obj = next((f for f in folders if f["role"] == "drafts"), None)
                    drafts_folder_name = drafts_folder_obj["name"] if drafts_folder_obj else "Drafts"
                    try:
                        client.select(f'"{drafts_folder_name}"')
                        client.uid("store", str(draft_uid), "+FLAGS", "(\\Deleted)")
                        client.expunge()
                    except Exception:
                        pass
        except Exception:
            pass

        return {
            "status": "submitted",
            "message": "Message successfully submitted to mail server for delivery",
            "message_id": msg_id,
            "sender": from_email,
            "recipients_count": len(all_destinations),
            "timestamp": formatdate(localtime=True)
        }

compose_service = ComposeService()
