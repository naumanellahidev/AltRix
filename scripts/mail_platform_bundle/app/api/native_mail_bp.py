from flask import Blueprint, request, g, jsonify
from datetime import datetime
from app.database import get_db, log_audit
from app.security.rbac import require_auth, require_role
from app.security.rate_limit import rate_limit
from app.services.mail.authorization import mail_auth_service
from app.services.mail.folders import folder_service
from app.services.mail.messages import message_service
from app.services.mail.compose import compose_service
from app.services.mail.preferences import preference_service
from app.services.mail.connection_manager import connection_manager
from app.services.mail.errors import (
    MailServiceError,
    MailboxNotFoundError,
    MailboxAccessDeniedError,
    ImapUnavailableError,
    AuthFailedError,
    FolderNotFoundError
)
from app.utils.response import api_success, api_error

native_mail_bp = Blueprint("native_mail_bp", __name__)

@native_mail_bp.errorhandler(MailServiceError)
def handle_mail_error(error):
    return api_error(error.message, code=error.code, status_code=error.status_code)


@native_mail_bp.route("/api/mail/send", methods=["POST"])
@require_auth
@rate_limit(max_requests=30, window_seconds=60)
def send_email():
    try:
        principal = g.current_user
        data = request.json or {}
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        from_email = data.get("from_email", "").strip().lower()
        to_list = data.get("to", [])
        cc_list = data.get("cc", [])
        bcc_list = data.get("bcc", [])
        subject = data.get("subject", "")
        body_plain = data.get("body_plain", "")
        body_html = data.get("body_html", "")
        attachments = data.get("attachments", [])
        draft_uid = data.get("draft_uid")
        in_reply_to = data.get("in_reply_to")
        references = data.get("references")

        if not from_email:
            return api_error("Sender 'from_email' is required", code="VALIDATION_ERROR", status_code=400)

        result = compose_service.send_message(
            principal=principal,
            from_email=from_email,
            to_list=to_list,
            cc_list=cc_list,
            bcc_list=bcc_list,
            subject=subject,
            body_plain=body_plain,
            body_html=body_html,
            attachments=attachments,
            draft_uid=draft_uid,
            in_reply_to=in_reply_to,
            references=references
        )

        log_audit(principal["username"], ip, "EMAIL_SENT_SUBMITTED", from_email, "SUCCESS", f"Subject: {subject[:30]}, To: {len(to_list)}")

        return api_success(result)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/conversation/prepare", methods=["POST"])
@require_auth
def prepare_conversation_action():
    try:
        principal = g.current_user
        data = request.json or {}
        mailbox_email = data.get("mailbox_email", "").strip().lower()
        folder_name = data.get("folder_name", "").strip()
        message_uid = data.get("message_uid")
        mode = data.get("mode", "reply")

        if not mailbox_email or not folder_name or not message_uid:
            return api_error("mailbox_email, folder_name, and message_uid are required", code="VALIDATION_ERROR", status_code=400)

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        orig_detail = message_service.get_message_detail(mailbox_email, folder_name, int(message_uid), mark_read=False)
        action_data = compose_service.prepare_conversation_action(orig_detail, mailbox_email, mode)

        return api_success(action_data)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/drafts", methods=["POST"])
@require_auth
def save_draft():
    try:
        principal = g.current_user
        data = request.json or {}
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        from_email = data.get("from_email", "").strip().lower()
        to_list = data.get("to", [])
        cc_list = data.get("cc", [])
        bcc_list = data.get("bcc", [])
        subject = data.get("subject", "")
        body_plain = data.get("body_plain", "")
        body_html = data.get("body_html", "")
        attachments = data.get("attachments", [])
        existing_draft_uid = data.get("existing_draft_uid")

        if not from_email:
            return api_error("Sender 'from_email' is required", code="VALIDATION_ERROR", status_code=400)

        result = compose_service.save_draft(
            principal=principal,
            from_email=from_email,
            to_list=to_list,
            cc_list=cc_list,
            bcc_list=bcc_list,
            subject=subject,
            body_plain=body_plain,
            body_html=body_html,
            attachments=attachments,
            existing_draft_uid=existing_draft_uid
        )

        log_audit(principal["username"], ip, "DRAFT_SAVED", from_email, "SUCCESS", f"Subject: {subject[:30]}")

        return api_success(result)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/messages/<int:message_uid>", methods=["DELETE"])
@require_auth
def delete_message(mailbox_email, folder_name, message_uid):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MESSAGE_DELETE_DENIED", mailbox_email, "FAILURE", f"Unauthorized delete UID {message_uid}")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        with connection_manager.get_connection(mailbox_email) as client:
            try:
                typ, data = client.select(f'"{folder_name}"')
                if typ != "OK":
                    raise FolderNotFoundError(folder_name)
            except Exception as e:
                raise FolderNotFoundError(f"{folder_name} ({str(e)})")

            client.uid("store", str(message_uid), "+FLAGS", "(\\Deleted)")
            client.expunge()

        log_audit(principal["username"], ip, "MESSAGE_DELETED", mailbox_email, "SUCCESS", f"Folder: {folder_name}, UID: {message_uid}")

        return api_success({"status": "deleted", "folder": folder_name, "uid": message_uid})

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/access/mailboxes", methods=["GET"])
@native_mail_bp.route("/api/mail/mailboxes", methods=["GET"])
@require_auth
def list_accessible_mailboxes():
    try:
        principal = g.current_user
        mailboxes = mail_auth_service.list_accessible_mailboxes(principal)
        
        # Get active mailbox from DB context
        conn = get_db()
        cur = conn.cursor()
        active_row = cur.execute(
            "SELECT mailbox_email FROM user_active_mailbox WHERE principal_id = ?",
            (principal["username"].strip().lower(),)
        ).fetchone()
        conn.close()
        active_mailbox = active_row["mailbox_email"] if active_row else (mailboxes[0]["email"] if mailboxes else None)

        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"
        log_audit(principal["username"], ip, "MAILBOX_LIST_ACCESSED", "native_mail", "SUCCESS", f"Count: {len(mailboxes)}")

        return api_success({
            "mailboxes": mailboxes,
            "active_mailbox": active_mailbox,
            "total_count": len(mailboxes)
        })
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/messages", methods=["GET"])
@require_auth
def list_folder_messages(mailbox_email, folder_name):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        # 1. Authoritative Server-side Authorization Check
        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MESSAGES_ACCESS_DENIED", mailbox_email, "FAILURE", f"Unauthorized messages attempt for folder {folder_name}")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        # 2. Extract and sanitize pagination parameters
        page = request.args.get("page", 1, type=int)
        limit = request.args.get("limit", 25, type=int)
        filter_type = request.args.get("filter", "all")

        # 3. Retrieve Live IMAP Messages via MessageService
        result = message_service.list_messages(
            mailbox_email=mailbox_email,
            folder_name=folder_name,
            page=page,
            limit=limit,
            filter_type=filter_type
        )

        log_audit(principal["username"], ip, "MESSAGES_LIST_ACCESSED", mailbox_email, "SUCCESS", f"Folder: {folder_name}, Count: {len(result.get('messages', []))}")

        return api_success(result)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/messages/<int:message_uid>", methods=["GET"])
@require_auth
def get_message_detail(mailbox_email, folder_name, message_uid):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        # 1. Authoritative Server-side Authorization Check
        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MESSAGE_DETAIL_DENIED", mailbox_email, "FAILURE", f"Unauthorized message fetch UID {message_uid}")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        mark_read = request.args.get("mark_read", "true").lower() in ["true", "1", "yes"]

        # 2. Retrieve Full Message Detail
        detail = message_service.get_message_detail(
            mailbox_email=mailbox_email,
            folder_name=folder_name,
            message_uid=message_uid,
            mark_read=mark_read
        )

        log_audit(principal["username"], ip, "MESSAGE_READ", mailbox_email, "SUCCESS", f"Folder: {folder_name}, UID: {message_uid}, Subject: {detail.get('subject', '')[:30]}")

        return api_success(detail)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/messages/<int:message_uid>/flags", methods=["PUT"])
@require_auth
def update_message_flags(mailbox_email, folder_name, message_uid):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MESSAGE_FLAGS_DENIED", mailbox_email, "FAILURE", f"Unauthorized flag update UID {message_uid}")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        data = request.json or {}
        action = data.get("action", "")
        if not action:
            return api_error("Action parameter is required", code="MISSING_ACTION", status_code=400)

        result = message_service.set_message_flags(
            mailbox_email=mailbox_email,
            folder_name=folder_name,
            message_uid=message_uid,
            action=action
        )

        log_audit(principal["username"], ip, "MESSAGE_FLAGS_UPDATED", mailbox_email, "SUCCESS", f"UID {message_uid}, Action: {action}")
        return api_success(result)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/messages/<int:message_uid>/attachments/<part_id>", methods=["GET"])
@require_auth
def download_attachment(mailbox_email, folder_name, message_uid, part_id):
    try:
        from flask import Response
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "ATTACHMENT_DOWNLOAD_DENIED", mailbox_email, "FAILURE", f"Unauthorized attachment fetch UID {message_uid}, part {part_id}")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        payload, content_type, filename = message_service.get_attachment(
            mailbox_email=mailbox_email,
            folder_name=folder_name,
            message_uid=message_uid,
            part_id=part_id
        )

        log_audit(principal["username"], ip, "ATTACHMENT_DOWNLOADED", mailbox_email, "SUCCESS", f"UID: {message_uid}, File: {filename}, Size: {len(payload)}")

        response = Response(payload, mimetype=content_type)
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/active-mailbox", methods=["POST"])
@require_auth
@rate_limit(max_requests=60, window_seconds=60)
def set_active_mailbox():
    try:
        principal = g.current_user
        data = request.json or {}
        mailbox_email = data.get("mailbox_email", "").strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mailbox_email:
            return api_error("Mailbox email is required", code="VALIDATION_ERROR", status_code=400)

        # 1. Authoritative Server-side Authorization Check
        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MAILBOX_SWITCH_DENIED", mailbox_email, "FAILURE", "Unauthorized mailbox switch attempt")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        # 2. Persist active mailbox context in database
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO user_active_mailbox (principal_id, mailbox_email, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(principal_id) DO UPDATE SET
                mailbox_email = excluded.mailbox_email,
                updated_at = excluded.updated_at
            """,
            (principal["username"].strip().lower(), mailbox_email, now_str)
        )
        conn.commit()
        conn.close()

        log_audit(principal["username"], ip, "MAILBOX_SWITCHED", mailbox_email, "SUCCESS", f"Active context set to {mailbox_email}")

        return api_success({
            "active_mailbox": mailbox_email,
            "status": "ready",
            "updated_at": now_str
        }, message=f"Active mailbox switched to {mailbox_email}")

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/active-mailbox", methods=["GET"])
@require_auth
def get_active_mailbox():
    try:
        principal = g.current_user
        conn = get_db()
        cur = conn.cursor()
        row = cur.execute(
            "SELECT mailbox_email, updated_at FROM user_active_mailbox WHERE principal_id = ?",
            (principal["username"].strip().lower(),)
        ).fetchone()
        conn.close()

        if row and mail_auth_service.can_access_mailbox(principal, row["mailbox_email"]):
            active = row["mailbox_email"]
        else:
            prefs = preference_service.get_user_preferences(principal["username"])
            def_mb = prefs.get("default_mailbox")
            if def_mb and mail_auth_service.can_access_mailbox(principal, def_mb):
                active = def_mb
            else:
                accessible = mail_auth_service.list_accessible_mailboxes(principal)
                active = accessible[0]["email"] if accessible else None

        return api_success({
            "active_mailbox": active
        })
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders", methods=["GET"])
@require_auth
def list_mailbox_folders(mailbox_email):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        # 1. Authoritative Server-side Authorization Check
        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            log_audit(principal["username"], ip, "MAILBOX_FOLDERS_DENIED", mailbox_email, "FAILURE", "Unauthorized folder listing attempt")
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        force_refresh = request.args.get("refresh", "false").lower() in ["true", "1", "yes"]

        # 2. Query Live IMAP Folders
        folders = folder_service.list_folders(mailbox_email, force_refresh=force_refresh)

        # Calculate aggregated unread count
        inbox_unread = next((f["unread_messages"] for f in folders if f["role"] == "inbox"), 0)
        total_unread = sum(f["unread_messages"] for f in folders if f["role"] != "trash")

        log_audit(principal["username"], ip, "MAILBOX_FOLDERS_ACCESSED", mailbox_email, "SUCCESS", f"Folders: {len(folders)}")

        return api_success({
            "mailbox": mailbox_email,
            "folders": folders,
            "inbox_unread": inbox_unread,
            "total_unread": total_unread,
            "cached": not force_refresh
        })

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>/summary", methods=["GET"])
@require_auth
def get_folder_summary(mailbox_email, folder_name):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        summary = folder_service.get_folder_summary(mailbox_email, folder_name)
        return api_success(summary)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders", methods=["POST"])
@require_auth
def create_mailbox_folder(mailbox_email):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        data = request.json or {}
        folder_name = data.get("name", "")
        parent_folder = data.get("parent_folder")

        res = folder_service.create_folder(mailbox_email, folder_name, parent_folder)
        log_audit(principal["username"], ip, "FOLDER_CREATED", mailbox_email, "SUCCESS", f"Folder: {res['name']}")

        return api_success(res, message="Folder created successfully")

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/sync/status", methods=["GET"])
@require_auth
def get_mailbox_sync_status(mailbox_email):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        folder_name = request.args.get("folder", "INBOX")
        status = folder_service.get_sync_status(mailbox_email, folder_name)
        return api_success(status)
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>", methods=["PUT"])
@require_auth
def rename_mailbox_folder(mailbox_email, folder_name):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        data = request.json or {}
        new_name = data.get("name", "")
        if not new_name:
            return api_error("New folder 'name' is required", code="VALIDATION_ERROR", status_code=400)

        res = folder_service.rename_folder(mailbox_email, folder_name, new_name)
        log_audit(principal["username"], ip, "FOLDER_RENAMED", mailbox_email, "SUCCESS", f"From {folder_name} to {res['new_name']}")

        return api_success(res, message="Folder renamed successfully")

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<mailbox_email>/folders/<path:folder_name>", methods=["DELETE"])
@require_auth
def delete_mailbox_folder(mailbox_email, folder_name):
    try:
        principal = g.current_user
        mailbox_email = mailbox_email.strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        force = request.args.get("force", "false").lower() in ["true", "1", "yes"]

        res = folder_service.delete_folder(mailbox_email, folder_name, force=force)
        log_audit(principal["username"], ip, "FOLDER_DELETED", mailbox_email, "SUCCESS", f"Folder: {folder_name}")

        return api_success(res, message="Folder deleted successfully")

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/session/status", methods=["GET"])
@require_auth
def get_mail_session_status():
    principal = g.current_user
    accessible = mail_auth_service.list_accessible_mailboxes(principal)
    return api_success({
        "principal": principal["username"],
        "role": principal["role"],
        "accessible_mailbox_count": len(accessible),
        "gateway_status": "ONLINE",
        "supported_features": ["IMAP_FOLDER_TREE", "SPECIAL_USE_ROLES", "UNREAD_AGGREGATION", "ONE_CLICK_SWITCHING", "ACCESS_DELEGATION", "PREFERENCES_PERSISTENCE"]
    })


@native_mail_bp.route("/api/mail/preferences", methods=["GET"])
@require_auth
def get_user_mail_preferences():
    try:
        principal = g.current_user
        prefs = preference_service.get_user_preferences(principal["username"])
        return api_success(prefs)
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/preferences", methods=["PUT"])
@require_auth
def update_user_mail_preferences():
    try:
        principal = g.current_user
        updates = request.json or {}
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        prefs = preference_service.update_user_preferences(principal, updates)
        log_audit(principal["username"], ip, "USER_PREFERENCES_UPDATED", "native_mail", "SUCCESS")
        return api_success(prefs, message="Preferences updated successfully")
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/preferences/identity", methods=["GET"])
@require_auth
def get_mailbox_identity_preferences():
    try:
        principal = g.current_user
        mailbox_email = request.args.get("mailbox", "").strip().lower()
        if not mailbox_email:
            return api_error("Query parameter 'mailbox' is required", code="MISSING_MAILBOX", status_code=400)

        if not mail_auth_service.can_access_mailbox(principal, mailbox_email):
            raise MailboxAccessDeniedError(principal["username"], mailbox_email)

        identity_prefs = preference_service.get_identity_preferences(principal["username"], mailbox_email)
        return api_success(identity_prefs)
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/preferences/identity", methods=["PUT"])
@require_auth
def update_mailbox_identity_preferences():
    try:
        principal = g.current_user
        mailbox_email = request.args.get("mailbox", "").strip().lower()
        if not mailbox_email:
            return api_error("Query parameter 'mailbox' is required", code="MISSING_MAILBOX", status_code=400)

        updates = request.json or {}
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        identity_prefs = preference_service.update_identity_preferences(principal, mailbox_email, updates)
        log_audit(principal["username"], ip, "IDENTITY_PREFERENCES_UPDATED", mailbox_email, "SUCCESS")
        return api_success(identity_prefs, message="Identity preferences updated successfully")
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/health", methods=["GET"])
def get_mail_health():
    try:
        from app.services.mail.connection_manager import connection_manager
        host, port, use_ssl = connection_manager._resolve_imap_endpoint()
        return api_success({
            "status": "healthy",
            "imap": {
                "host": host,
                "port": port,
                "ssl": use_ssl,
                "state": "operational"
            },
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        })
    except Exception as e:
        return api_error(str(e), code="IMAP_UNAVAILABLE", status_code=503)


# Search & Bulk Operations
@native_mail_bp.route("/api/mail/mailboxes/<email>/search", methods=["GET"])
@require_auth
def search_messages(email):
    try:
        principal = g.current_user
        if not mail_auth_service.can_access_mailbox(principal, email):
            raise MailboxAccessDeniedError(principal["username"], email)

        folder_name = request.args.get("folder", "INBOX")
        query = request.args.get("q", "")
        from_term = request.args.get("from")
        to_term = request.args.get("to")
        subject_term = request.args.get("subject")
        
        is_unread_param = request.args.get("is_unread")
        is_unread = None
        if is_unread_param is not None:
            is_unread = is_unread_param.lower() in ["true", "1", "yes"]

        is_starred_param = request.args.get("is_starred")
        is_starred = None
        if is_starred_param is not None:
            is_starred = is_starred_param.lower() in ["true", "1", "yes"]

        has_attachment_param = request.args.get("has_attachment")
        has_attachment = None
        if has_attachment_param is not None:
            has_attachment = has_attachment_param.lower() in ["true", "1", "yes"]

        since_date = request.args.get("since")
        before_date = request.args.get("before")
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 25))

        res = message_service.search_messages(
            mailbox_email=email,
            folder_name=folder_name,
            query=query,
            from_term=from_term,
            to_term=to_term,
            subject_term=subject_term,
            is_unread=is_unread,
            is_starred=is_starred,
            has_attachment=has_attachment,
            since_date=since_date,
            before_date=before_date,
            page=page,
            limit=limit
        )
        return api_success(res)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/mailboxes/<email>/folders/<path:folder_name>/bulk", methods=["POST"])
@require_auth
def bulk_message_action(email, folder_name):
    try:
        principal = g.current_user
        if not mail_auth_service.can_access_mailbox(principal, email):
            raise MailboxAccessDeniedError(principal["username"], email)

        data = request.json or {}
        uids = data.get("uids", [])
        action = data.get("action", "").strip().lower()
        target_folder = data.get("target_folder")

        if not uids or not action:
            return api_error("Both 'uids' list and 'action' are required", code="VALIDATION_ERROR", status_code=400)

        res = message_service.bulk_action(
            mailbox_email=email,
            folder_name=folder_name,
            uids=uids,
            action=action,
            target_folder=target_folder
        )

        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"
        log_audit(principal["username"], ip, "BULK_MAIL_ACTION", email, "SUCCESS", f"Action: {action}, Folder: {folder_name}, Count: {len(uids)}")

        return api_success(res)

    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


# Access Grants Management
@native_mail_bp.route("/api/mail/access/grants", methods=["GET"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def list_grants():
    grants = mail_auth_service.list_access_grants()
    return api_success(grants)


@native_mail_bp.route("/api/mail/access/grants", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def create_grant():
    try:
        data = request.json or {}
        principal_id = data.get("principal_id", "")
        mailbox_email = data.get("mailbox_email", "")
        permission_scope = data.get("permission_scope", "READ_WRITE")
        
        if not principal_id or not mailbox_email:
            return api_error("Both principal_id and mailbox_email are required", code="VALIDATION_ERROR", status_code=400)

        grant = mail_auth_service.grant_mailbox_access(
            principal_id, mailbox_email, permission_scope, g.current_user["username"]
        )
        return api_success(grant, message="Mailbox access grant created successfully")
    except MailServiceError as e:
        return handle_mail_error(e)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)


@native_mail_bp.route("/api/mail/access/grants/<int:grant_id>", methods=["DELETE"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN")
def delete_grant(grant_id):
    success = mail_auth_service.revoke_mailbox_access(grant_id, g.current_user["username"])
    if not success:
        return api_error("Access grant not found or already revoked", code="NOT_FOUND", status_code=404)
    return api_success(message="Mailbox access grant revoked successfully")
