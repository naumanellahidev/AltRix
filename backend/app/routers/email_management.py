"""
Super Master Admin Email Management Router for AltRix Cloud OS.
Provides central platform controls for:
- System Telemetry, Mailu Service Status & Delivery Analytics
- Official AltRix Sender Identities (Configured addresses on mail.altrixcore.com)
- Email Template Studio (CRUD, visual HTML editing, live preview)
- Event-to-Sender Dynamic Routing Matrix
- Test Send Lab
- Delivery Audit Logs (Safe from sensitive token leaks)
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, AuthenticatedUser
from app.services.email_service import CentralEmailService, interpolate_variables

router = APIRouter(prefix="/super_admin/email", tags=["Super Admin Email Management"])
logger = logging.getLogger("app.super_admin.email")


# ---------------------------------------------------------------------------
# Auth Guard: Super Master Admin Only
# ---------------------------------------------------------------------------
async def _require_super_admin(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedUser:
    try:
        uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id
    except ValueError:
        raise HTTPException(status_code=403, detail="Super Admin authorization required")

    res = await db.execute(
        text("SELECT user_id FROM public.platform_super_admins WHERE user_id = :uid LIMIT 1"),
        {"uid": uid},
    )
    if not res.fetchone() and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super Master Admin access only")

    return current_user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SenderIdentityIn(BaseModel):
    key: str = Field(..., description="Unique slug: security, support, no_reply, info, ceo, notifications")
    name: str = Field(..., description="Sender Display Name")
    email: EmailStr = Field(..., description="Configured sender address on mail.altrixcore.com")
    replyTo: Optional[str] = None
    isDefault: bool = False
    isActive: bool = True


class EmailTemplateIn(BaseModel):
    key: str = Field(..., description="Template unique slug: staff_invitation, password_reset, etc.")
    name: str
    category: str
    subject: str
    senderIdentityKey: Optional[str] = None
    htmlContent: str
    textContent: Optional[str] = None
    ctaText: Optional[str] = None
    ctaUrlVariable: Optional[str] = None
    availableVariables: List[str] = []
    isActive: bool = True


class EventMappingIn(BaseModel):
    senderIdentityKey: str
    templateKey: str
    description: Optional[str] = None


class PreviewTemplateRequest(BaseModel):
    htmlContent: str
    subject: str
    variables: Dict[str, Any] = {}


class TestSendRequest(BaseModel):
    recipientEmail: EmailStr
    senderIdentityKey: Optional[str] = "security"
    templateKey: Optional[str] = None
    customSubject: Optional[str] = None
    customMessage: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "/overview",
    summary="Email System Overview & Telemetry",
    description="Returns delivery counts, success rate, active senders, templates, and recent logs.",
)
async def get_email_overview(
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    # Total sent 24h & all time
    res_24h = await db.execute(
        text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'sent' OR status = 'delivered') as successful,
                COUNT(*) FILTER (WHERE status = 'failed' OR status = 'bounced') as failed
            FROM public.email_logs
            WHERE sent_at >= NOW() - INTERVAL '24 hours'
        """)
    )
    row_24h = res_24h.fetchone()

    res_all = await db.execute(
        text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'sent' OR status = 'delivered') as successful,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM public.email_logs
        """)
    )
    row_all = res_all.fetchone()

    # Senders count
    res_senders = await db.execute(text("SELECT COUNT(*) FROM public.email_sender_identities WHERE is_active = TRUE"))
    active_senders = res_senders.scalar_one()

    # Templates count
    res_templates = await db.execute(text("SELECT COUNT(*) FROM public.email_templates WHERE is_active = TRUE"))
    active_templates = res_templates.scalar_one()

    # Pending Invitations count
    res_invites = await db.execute(text("SELECT COUNT(*) FROM public.user_invitations WHERE status IN ('pending', 'sent', 'opened')"))
    pending_invites = res_invites.scalar_one()

    # Recent 10 logs
    res_logs = await db.execute(
        text("""
            SELECT id, recipient_email, sender_email, event_name, subject, status, sent_at, error_details
            FROM public.email_logs
            ORDER BY sent_at DESC
            LIMIT 10
        """)
    )
    logs = [
        {
            "id": str(r.id),
            "recipientEmail": r.recipient_email,
            "senderEmail": r.sender_email,
            "eventName": r.event_name,
            "subject": r.subject,
            "status": r.status,
            "sentAt": r.sent_at.isoformat() if r.sent_at else None,
            "errorDetails": r.error_details,
        }
        for r in res_logs.fetchall()
    ]

    total_24h = row_24h.total or 0
    succ_24h = row_24h.successful or 0
    success_rate_24h = round((succ_24h / total_24h) * 100, 1) if total_24h > 0 else 100.0

    return {
        "ok": True,
        "telemetry": {
            "sent24h": total_24h,
            "successful24h": succ_24h,
            "failed24h": row_24h.failed or 0,
            "successRate24h": success_rate_24h,
            "totalAllTime": row_all.total or 0,
            "activeSenders": active_senders,
            "activeTemplates": active_templates,
            "pendingInvitations": pending_invites,
            "mailServerHost": "mail.altrixcore.com",
            "mailServerStatus": "OPERATIONAL",
        },
        "recentLogs": logs,
    }


# ---------------------------------------------------------------------------
# Sender Identities CRUD
# ---------------------------------------------------------------------------
@router.get("/senders", summary="List Sender Identities")
async def list_senders(
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text("SELECT id, key, name, email, reply_to, is_default, is_active, created_at, updated_at FROM public.email_sender_identities ORDER BY key ASC")
    )
    return [
        {
            "id": str(r.id),
            "key": r.key,
            "name": r.name,
            "email": r.email,
            "replyTo": r.reply_to,
            "isDefault": r.is_default,
            "isActive": r.is_active,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in res.fetchall()
    ]


@router.post("/senders", summary="Create Sender Identity")
async def create_sender(
    body: SenderIdentityIn,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    clean_key = body.key.strip().lower().replace(" ", "_")
    sender_id = uuid.uuid4()

    if body.isDefault:
        await db.execute(text("UPDATE public.email_sender_identities SET is_default = FALSE"))

    await db.execute(
        text("""
            INSERT INTO public.email_sender_identities (id, key, name, email, reply_to, is_default, is_active, created_at, updated_at)
            VALUES (:id, :key, :name, :email, :replyTo, :isDefault, :isActive, NOW(), NOW())
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                reply_to = EXCLUDED.reply_to,
                is_default = EXCLUDED.is_default,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        """),
        {
            "id": sender_id,
            "key": clean_key,
            "name": body.name.strip(),
            "email": str(body.email).strip().lower(),
            "replyTo": body.replyTo.strip() if body.replyTo else None,
            "isDefault": body.isDefault,
            "isActive": body.isActive,
        },
    )
    await db.commit()
    return {"ok": True, "message": f"Sender identity '{clean_key}' saved successfully"}


@router.put("/senders/{sender_id}", summary="Update Sender Identity")
async def update_sender(
    sender_id: str,
    body: SenderIdentityIn,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        sid = uuid.UUID(sender_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sender UUID")

    if body.isDefault:
        await db.execute(text("UPDATE public.email_sender_identities SET is_default = FALSE WHERE id != :id"), {"id": sid})

    await db.execute(
        text("""
            UPDATE public.email_sender_identities
            SET name = :name,
                email = :email,
                reply_to = :replyTo,
                is_default = :isDefault,
                is_active = :isActive,
                updated_at = NOW()
            WHERE id = :id
        """),
        {
            "name": body.name.strip(),
            "email": str(body.email).strip().lower(),
            "replyTo": body.replyTo.strip() if body.replyTo else None,
            "isDefault": body.isDefault,
            "isActive": body.isActive,
            "id": sid,
        },
    )
    await db.commit()
    return {"ok": True, "message": "Sender identity updated successfully"}


@router.delete("/senders/{sender_id}", summary="Delete Sender Identity")
async def delete_sender(
    sender_id: str,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        sid = uuid.UUID(sender_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    await db.execute(text("DELETE FROM public.email_sender_identities WHERE id = :id"), {"id": sid})
    await db.commit()
    return {"ok": True, "message": "Sender identity removed"}


# ---------------------------------------------------------------------------
# Templates CRUD
# ---------------------------------------------------------------------------
@router.get("/templates", summary="List Email Templates")
async def list_templates(
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text("""
            SELECT t.id, t.key, t.name, t.category, t.subject, t.sender_identity_key,
                   t.html_content, t.text_content, t.cta_text, t.cta_url_variable,
                   t.available_variables, t.is_active, t.updated_at,
                   s.name as sender_name, s.email as sender_email
            FROM public.email_templates t
            LEFT JOIN public.email_sender_identities s ON t.sender_identity_key = s.key
            ORDER BY t.category, t.name ASC
        """)
    )
    return [
        {
            "id": str(r.id),
            "key": r.key,
            "name": r.name,
            "category": r.category,
            "subject": r.subject,
            "senderIdentityKey": r.sender_identity_key,
            "senderName": r.sender_name,
            "senderEmail": r.sender_email,
            "htmlContent": r.html_content,
            "textContent": r.text_content,
            "ctaText": r.cta_text,
            "ctaUrlVariable": r.cta_url_variable,
            "availableVariables": r.available_variables or [],
            "isActive": r.is_active,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in res.fetchall()
    ]


@router.post("/templates", summary="Create or Update Template")
async def save_template(
    body: EmailTemplateIn,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    import json
    clean_key = body.key.strip().lower().replace(" ", "_")
    tmpl_id = uuid.uuid4()

    await db.execute(
        text("""
            INSERT INTO public.email_templates (
                id, key, name, category, subject, sender_identity_key, html_content, text_content, cta_text, cta_url_variable, available_variables, is_active, created_at, updated_at
            ) VALUES (
                :id, :key, :name, :category, :subject, :senderKey, :html, :text, :ctaText, :ctaUrl, CAST(:vars AS jsonb), :isActive, NOW(), NOW()
            )
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                category = EXCLUDED.category,
                subject = EXCLUDED.subject,
                sender_identity_key = EXCLUDED.sender_identity_key,
                html_content = EXCLUDED.html_content,
                text_content = EXCLUDED.text_content,
                cta_text = EXCLUDED.cta_text,
                cta_url_variable = EXCLUDED.cta_url_variable,
                available_variables = EXCLUDED.available_variables,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        """),
        {
            "id": tmpl_id,
            "key": clean_key,
            "name": body.name.strip(),
            "category": body.category.strip(),
            "subject": body.subject.strip(),
            "senderKey": body.senderIdentityKey,
            "html": body.htmlContent,
            "text": body.textContent,
            "ctaText": body.ctaText,
            "ctaUrl": body.ctaUrlVariable,
            "vars": json.dumps(body.availableVariables or []),
            "isActive": body.isActive,
        },
    )
    await db.commit()
    return {"ok": True, "message": f"Email template '{clean_key}' saved successfully"}


@router.post("/templates/preview", summary="Live Render Template Preview")
async def preview_template(
    body: PreviewTemplateRequest,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
):
    sample_context = {
        "name": "Dr. Sarah Jenkins",
        "email": "sarah.jenkins@example.com",
        "role": "Senior Academic Coordinator",
        "tenant_name": "Apex International Academy",
        "activation_link": "https://altrixcore.com/activate-account/sample-secure-token-demo",
        "reset_link": "https://altrixcore.com/reset-password?token=sample-reset-token-demo",
        "expires_in": "48 hours",
        "support_email": "support@altrixcore.com",
        "year": datetime.now(timezone.utc).year,
        "title": "Quarterly Academic Review",
        "message": "The system will undergo standard platform maintenance tonight at 02:00 UTC.",
        "subject_text": "Quarterly Academic Review",
    }
    sample_context.update(body.variables)

    rendered_subject = interpolate_variables(body.subject, sample_context)
    rendered_html = interpolate_variables(body.htmlContent, sample_context)

    return {
        "ok": True,
        "renderedSubject": rendered_subject,
        "renderedHtml": rendered_html,
    }


# ---------------------------------------------------------------------------
# Event Routing Mappings
# ---------------------------------------------------------------------------
@router.get("/mappings", summary="Get Event Routing Mappings")
async def get_event_mappings(
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text("""
            SELECT m.event_name, m.sender_identity_key, m.template_key, m.description, m.updated_at,
                   s.name as sender_name, s.email as sender_email,
                   t.name as template_name, t.subject as template_subject
            FROM public.email_event_mappings m
            LEFT JOIN public.email_sender_identities s ON m.sender_identity_key = s.key
            LEFT JOIN public.email_templates t ON m.template_key = t.key
            ORDER BY m.event_name ASC
        """)
    )
    return [
        {
            "eventName": r.event_name,
            "senderIdentityKey": r.sender_identity_key,
            "senderName": r.sender_name,
            "senderEmail": r.sender_email,
            "templateKey": r.template_key,
            "templateName": r.template_name,
            "templateSubject": r.template_subject,
            "description": r.description,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in res.fetchall()
    ]


@router.put("/mappings/{event_name}", summary="Update Event Routing Mapping")
async def update_event_mapping(
    event_name: str,
    body: EventMappingIn,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO public.email_event_mappings (event_name, sender_identity_key, template_key, description, updated_at)
            VALUES (:event_name, :senderKey, :templateKey, :desc, NOW())
            ON CONFLICT (event_name) DO UPDATE SET
                sender_identity_key = EXCLUDED.sender_identity_key,
                template_key = EXCLUDED.template_key,
                description = COALESCE(EXCLUDED.description, email_event_mappings.description),
                updated_at = NOW()
        """),
        {
            "event_name": event_name.strip(),
            "senderKey": body.senderIdentityKey.strip(),
            "templateKey": body.templateKey.strip(),
            "desc": body.description,
        },
    )
    await db.commit()
    return {"ok": True, "message": f"Mapping for event '{event_name}' updated"}


# ---------------------------------------------------------------------------
# Test Send Lab
# ---------------------------------------------------------------------------
@router.post("/test-send", summary="Send Test Email")
async def test_send_email(
    body: TestSendRequest,
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    recipient = str(body.recipientEmail).strip().lower()

    # Load sender identity
    sender_key = body.senderIdentityKey or "security"
    res_s = await db.execute(
        text("SELECT name, email FROM public.email_sender_identities WHERE key = :key LIMIT 1"),
        {"key": sender_key},
    )
    sender_row = res_s.fetchone()
    sender_name = sender_row.name if sender_row else "AltRix Security HQ"
    sender_email = sender_row.email if sender_row else "security@altrixcore.com"

    subject = body.customSubject or "AltRix Central Mail Engine Test Dispatch"
    message_body = body.customMessage or "This is a verified test dispatch from the AltRix Super Master Admin Email Test Lab."

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AltRix Test Email</title></head>
<body style="margin:0;padding:24px;background:#0f172a;font-family:sans-serif;color:#334155;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border-top:4px solid #3b82f6;">
    <h1 style="color:#0f172a;margin-top:0;">ALT<span style="color:#3b82f6;">RIX</span></h1>
    <span style="background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:9999px;text-transform:uppercase;">Test Dispatch</span>
    <h2 style="color:#0f172a;margin:16px 0 8px 0;">{subject}</h2>
    <p style="font-size:15px;line-height:1.6;">{message_body}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:8px;margin:20px 0;font-size:13px;">
      <p style="margin:2px 0;"><strong>Sender Identity:</strong> {sender_name} &lt;{sender_email}&gt;</p>
      <p style="margin:2px 0;"><strong>Recipient:</strong> {recipient}</p>
      <p style="margin:2px 0;"><strong>Timestamp:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">AltRix Cloud OS &bull; Automated Test Lab</p>
  </div>
</body>
</html>"""

    result = await CentralEmailService.send_raw_test(
        sender_email=sender_email,
        sender_name=sender_name,
        recipient=recipient,
        subject=subject,
        html_content=html_content,
        text_content=message_body,
        db=db,
    )

    if not result["ok"]:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {result.get('error')}")

    return {
        "ok": True,
        "message": f"Test email successfully dispatched to {recipient} from {sender_email}",
        "result": result,
    }


# ---------------------------------------------------------------------------
# Delivery Logs
# ---------------------------------------------------------------------------
@router.get("/logs", summary="Get Email Delivery Logs")
async def get_email_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    status: Optional[str] = Query(None),
    event: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    _admin: AuthenticatedUser = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    where_clauses = ["1=1"]
    params: Dict[str, Any] = {"limit": limit, "offset": offset}

    if status and status.strip():
        where_clauses.append("status = :status")
        params["status"] = status.strip().lower()

    if event and event.strip():
        where_clauses.append("event_name = :event")
        params["event"] = event.strip().lower()

    if search and search.strip():
        where_clauses.append("(LOWER(recipient_email) LIKE :search OR LOWER(subject) LIKE :search)")
        params["search"] = f"%{search.strip().lower()}%"

    where_sql = " AND ".join(where_clauses)

    res_count = await db.execute(text(f"SELECT COUNT(*) FROM public.email_logs WHERE {where_sql}"), params)
    total_count = res_count.scalar_one()

    res_logs = await db.execute(
        text(f"""
            SELECT id, recipient_email, sender_email, sender_name, event_name, template_key,
                   subject, status, error_details, message_id, sent_at
            FROM public.email_logs
            WHERE {where_sql}
            ORDER BY sent_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )

    logs = [
        {
            "id": str(r.id),
            "recipientEmail": r.recipient_email,
            "senderEmail": r.sender_email,
            "senderName": r.sender_name,
            "eventName": r.event_name,
            "templateKey": r.template_key,
            "subject": r.subject,
            "status": r.status,
            "errorDetails": r.error_details,
            "messageId": r.message_id,
            "sentAt": r.sent_at.isoformat() if r.sent_at else None,
        }
        for r in res_logs.fetchall()
    ]

    return {
        "ok": True,
        "total": total_count,
        "page": page,
        "limit": limit,
        "logs": logs,
    }
