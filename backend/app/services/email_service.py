"""
Centralized Enterprise Email Service for AltRix Cloud OS.
Handles dynamic sender identity resolution, template rendering with safe variable interpolation,
SMTP dispatch via local Mailu VPS engine (127.0.0.1:25), and delivery audit logging.
"""
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.services.email_service")

# Fallback default sender if DB table is empty
DEFAULT_SENDER = {
    "key": "no_reply",
    "name": "AltRix Platform System",
    "email": "no-reply@altrixcore.com",
}

# Fallback templates in memory in case DB is unreachable
FALLBACK_TEMPLATES = {
    "staff_invitation": {
        "subject": "Official Invitation to Join {{tenant_name}} on AltRix Cloud",
        "html": """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AltRix Staff Invitation</title></head>
<body style="margin:0;padding:20px;background:#0f172a;font-family:sans-serif;color:#334155;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;padding:32px;">
    <h1 style="color:#0f172a;margin-top:0;">ALT<span style="color:#3b82f6;">RIX</span></h1>
    <h2>Welcome, {{name}}!</h2>
    <p>You have been invited to join <strong>{{tenant_name}}</strong> as <strong>{{role}}</strong> on AltRix Cloud.</p>
    <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:20px 0;">
      <p style="margin:4px 0;"><strong>Institute:</strong> {{tenant_name}}</p>
      <p style="margin:4px 0;"><strong>Role:</strong> {{role}}</p>
      <p style="margin:4px 0;"><strong>Email:</strong> {{email}}</p>
      <p style="margin:4px 0;"><strong>Expires in:</strong> {{expires_in}}</p>
    </div>
    <div style="text-align:center;margin:30px 0;">
      <a href="{{activation_link}}" style="background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Activate Your Account &rarr;</a>
    </div>
    <p style="font-size:12px;color:#64748b;">If the button does not work, copy and paste this link in your browser:<br>{{activation_link}}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">&copy; {{year}} AltRix Cloud OS. Support: {{support_email}}</p>
  </div>
</body>
</html>""",
        "text": "Welcome {{name}},\n\nYou have been invited to join {{tenant_name}} as {{role}} on AltRix Cloud.\n\nActivate your account: {{activation_link}}\n\nValid for {{expires_in}}.\n\nSupport: {{support_email}}",
    },
    "password_reset": {
        "subject": "AltRix Security: Password Reset Request",
        "html": """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AltRix Password Reset</title></head>
<body style="margin:0;padding:20px;background:#0f172a;font-family:sans-serif;color:#334155;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;padding:32px;">
    <h1 style="color:#0f172a;margin-top:0;">ALT<span style="color:#ef4444;">RIX</span></h1>
    <h2>Password Reset Request</h2>
    <p>Hello,</p>
    <p>We received a request to reset the password for your AltRix account (<strong>{{email}}</strong>).</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="{{reset_link}}" style="background:#ef4444;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Reset Password &rarr;</a>
    </div>
    <p style="font-size:12px;color:#64748b;">If the button does not work, copy and paste this link in your browser:<br>{{reset_link}}</p>
    <p style="font-size:12px;color:#64748b;">This link is valid for 1 hour. If you did not request this, you can safely ignore this email.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">&copy; {{year}} AltRix Cloud OS. Support: {{support_email}}</p>
  </div>
</body>
</html>""",
        "text": "Hello,\n\nWe received a request to reset your AltRix password ({{email}}).\n\nReset link: {{reset_link}}\n\nValid for 1 hour. If you did not request this, please ignore this email.\n\nSupport: {{support_email}}",
    }
}


def interpolate_variables(template_str: str, context: Dict[str, Any]) -> str:
    """Safely replace {{key}} occurrences with context[key]."""
    if not template_str:
        return ""
    result = template_str
    for k, v in context.items():
        placeholder = f"{{{{{k}}}}}"
        result = result.replace(placeholder, str(v) if v is not None else "")
    return result


class CentralEmailService:
    """
    Central AltRix Email Service.
    Resolves sender identities & templates dynamically from the database,
    interpolates context variables, dispatches via Mailu SMTP on 127.0.0.1:25,
    and records audit logs without sensitive tokens.
    """

    @staticmethod
    async def resolve_event(
        event_name: str,
        db: AsyncSession,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Resolves the (sender_identity, template) mapped to the specified event_name.
        Falls back to default system sender and fallback templates if not mapped.
        """
        sender_identity = dict(DEFAULT_SENDER)
        template_data = FALLBACK_TEMPLATES.get(event_name, {
            "subject": f"AltRix Notification: {event_name.replace('_', ' ').title()}",
            "html": "<p>AltRix System Notification</p>",
            "text": "AltRix System Notification",
        })

        try:
            # Query event mapping
            res_map = await db.execute(
                text("""
                    SELECT m.sender_identity_key, m.template_key,
                           s.name as sender_name, s.email as sender_email, s.reply_to,
                           t.subject, t.html_content, t.text_content, t.cta_text, t.cta_url_variable
                    FROM public.email_event_mappings m
                    LEFT JOIN public.email_sender_identities s ON m.sender_identity_key = s.key
                    LEFT JOIN public.email_templates t ON m.template_key = t.key
                    WHERE m.event_name = :event_name AND (s.is_active = TRUE OR s.is_active IS NULL) AND (t.is_active = TRUE OR t.is_active IS NULL)
                    LIMIT 1
                """),
                {"event_name": event_name},
            )
            row = res_map.fetchone()

            if row:
                if row.sender_email:
                    sender_identity = {
                        "key": row.sender_identity_key,
                        "name": row.sender_name or DEFAULT_SENDER["name"],
                        "email": row.sender_email,
                        "reply_to": row.reply_to,
                    }
                if row.html_content:
                    template_data = {
                        "subject": row.subject,
                        "html": row.html_content,
                        "text": row.text_content or "",
                        "cta_text": row.cta_text,
                        "cta_url_variable": row.cta_url_variable,
                    }
            else:
                # Direct template fallback by event name
                res_tmpl = await db.execute(
                    text("""
                        SELECT t.subject, t.html_content, t.text_content, t.sender_identity_key,
                               s.name as sender_name, s.email as sender_email, s.reply_to
                        FROM public.email_templates t
                        LEFT JOIN public.email_sender_identities s ON t.sender_identity_key = s.key
                        WHERE t.key = :event_name AND t.is_active = TRUE
                        LIMIT 1
                    """),
                    {"event_name": event_name},
                )
                row_t = res_tmpl.fetchone()
                if row_t:
                    template_data = {
                        "subject": row_t.subject,
                        "html": row_t.html_content,
                        "text": row_t.text_content or "",
                    }
                    if row_t.sender_email:
                        sender_identity = {
                            "key": row_t.sender_identity_key or "security",
                            "name": row_t.sender_name or "AltRix Security HQ",
                            "email": row_t.sender_email,
                            "reply_to": row_t.reply_to,
                        }
        except Exception as e:
            logger.warning(f"Error resolving email event mapping for '{event_name}': {e}. Using fallback.")

        return sender_identity, template_data

    @staticmethod
    async def send_event(
        event_name: str,
        recipient: str,
        context: Dict[str, Any],
        db: AsyncSession,
        override_sender_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Central entry point to dispatch a transactional event email.
        """
        # Inject standard global context defaults
        ctx = dict(context)
        ctx.setdefault("year", datetime.now(timezone.utc).year)
        ctx.setdefault("support_email", "support@altrixcore.com")
        ctx.setdefault("email", recipient)

        sender, template = await CentralEmailService.resolve_event(event_name, db)

        # Allow explicit sender override if requested
        if override_sender_key:
            try:
                res_s = await db.execute(
                    text("SELECT name, email, reply_to FROM public.email_sender_identities WHERE key = :key LIMIT 1"),
                    {"key": override_sender_key}
                )
                row_s = res_s.fetchone()
                if row_s:
                    sender = {
                        "key": override_sender_key,
                        "name": row_s.name,
                        "email": row_s.email,
                        "reply_to": row_s.reply_to,
                    }
            except Exception as e:
                logger.warning(f"Failed to load override sender {override_sender_key}: {e}")

        # Render subject, HTML body, and text body
        subject_rendered = interpolate_variables(template.get("subject", "AltRix Notification"), ctx)
        html_rendered = interpolate_variables(template.get("html", "<p>AltRix Notification</p>"), ctx)
        text_rendered = interpolate_variables(template.get("text", "AltRix Notification"), ctx)

        # Construct EmailMessage
        msg = EmailMessage()
        msg["Subject"] = subject_rendered
        msg["From"] = formataddr((sender["name"], sender["email"]))
        msg["To"] = recipient
        if sender.get("reply_to"):
            msg["Reply-To"] = sender["reply_to"]

        if text_rendered:
            msg.set_content(text_rendered)
        else:
            msg.set_content("Please view this email in an HTML-compatible client.")

        msg.add_alternative(html_rendered, subtype="html")

        # Dispatch via Mailu Local SMTP
        status = "sent"
        error_details = None
        message_id = f"{uuid4()}@altrixcore.com"
        msg["Message-ID"] = f"<{message_id}>"

        try:
            with smtplib.SMTP("127.0.0.1", 25, timeout=10) as server:
                server.send_message(msg)
            logger.info(f"Successfully dispatched '{event_name}' email to {recipient} via {sender['email']}")
        except Exception as smtp_err:
            status = "failed"
            error_details = str(smtp_err)
            logger.error(f"SMTP error sending '{event_name}' to {recipient}: {smtp_err}")

        # Record delivery log (NEVER store sensitive tokens or passwords in logs!)
        safe_meta = {
            "role": ctx.get("role"),
            "tenant_name": ctx.get("tenant_name"),
            "event": event_name,
        }
        try:
            await db.execute(
                text("""
                    INSERT INTO public.email_logs (
                        recipient_email, sender_email, sender_name, event_name, template_key, subject, status, error_details, message_id, sent_at, metadata
                    ) VALUES (
                        :recipient, :sender_email, :sender_name, :event_name, :template_key, :subject, :status, :error_details, :message_id, NOW(), CAST(:meta AS jsonb)
                    )
                """),
                {
                    "recipient": recipient,
                    "sender_email": sender["email"],
                    "sender_name": sender["name"],
                    "event_name": event_name,
                    "template_key": template.get("key", event_name),
                    "subject": subject_rendered,
                    "status": status,
                    "error_details": error_details,
                    "message_id": message_id,
                    "meta": '{"event": "' + event_name + '"}',
                },
            )
            await db.commit()
        except Exception as log_err:
            logger.warning(f"Failed to record email delivery log: {log_err}")

        return {
            "ok": status == "sent",
            "status": status,
            "message_id": message_id,
            "recipient": recipient,
            "sender": sender["email"],
            "error": error_details,
        }

    @staticmethod
    async def send_raw_test(
        sender_email: str,
        sender_name: str,
        recipient: str,
        subject: str,
        html_content: str,
        text_content: Optional[str],
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Sends an immediate test email from the Super Master Admin Test Lab.
        """
        msg = EmailMessage()
        msg["Subject"] = f"[TEST] {subject}"
        msg["From"] = formataddr((sender_name, sender_email))
        msg["To"] = recipient
        msg["X-AltRix-Test"] = "true"

        if text_content:
            msg.set_content(text_content)
        else:
            msg.set_content("This is an AltRix test email dispatch.")

        msg.add_alternative(html_content, subtype="html")

        status = "sent"
        error_details = None
        message_id = f"test-{uuid4()}@altrixcore.com"
        msg["Message-ID"] = f"<{message_id}>"

        try:
            with smtplib.SMTP("127.0.0.1", 25, timeout=10) as server:
                server.send_message(msg)
            logger.info(f"Successfully dispatched TEST email to {recipient} from {sender_email}")
        except Exception as err:
            status = "failed"
            error_details = str(err)
            logger.error(f"Failed to send test email to {recipient}: {err}")

        try:
            await db.execute(
                text("""
                    INSERT INTO public.email_logs (
                        recipient_email, sender_email, sender_name, event_name, template_key, subject, status, error_details, message_id, sent_at, metadata
                    ) VALUES (
                        :recipient, :sender_email, :sender_name, 'test_dispatch', 'custom_test', :subject, :status, :error_details, :message_id, NOW(), '{"is_test": true}'::jsonb
                    )
                """),
                {
                    "recipient": recipient,
                    "sender_email": sender_email,
                    "sender_name": sender_name,
                    "subject": f"[TEST] {subject}",
                    "status": status,
                    "error_details": error_details,
                    "message_id": message_id,
                },
            )
            await db.commit()
        except Exception as log_err:
            logger.warning(f"Failed to record test email log: {log_err}")

        return {
            "ok": status == "sent",
            "status": status,
            "message_id": message_id,
            "recipient": recipient,
            "sender": sender_email,
            "error": error_details,
        }
