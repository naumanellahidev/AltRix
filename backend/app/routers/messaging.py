"""
Messaging, notices, and diary routers.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.messaging import AdminMessage, AdminMessageRecipient, Notice
from app.models.misc import DiaryEntry
from app.schemas import (
    AdminMessageCreate, AdminMessageOut,
    NoticeCreate, NoticeOut,
    DiaryEntryCreate, DiaryEntryOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, can_broadcast_notices

# ─── MESSAGING ────────────────────────────────────────────────────────────────
messaging_router = APIRouter(prefix="/messages", tags=["Messaging"])


@messaging_router.get("", response_model=List[AdminMessageOut])
async def list_messages(
    current_user: CurrentUser,
    db: DbSession,
    sent: bool = Query(False, description="If true, return sent messages"),
):
    if not current_user.school_id:
        return []

    if sent:
        query = select(AdminMessage).where(
            AdminMessage.school_id == current_user.school_id,
            AdminMessage.sender_user_id == current_user.id,
        )
    else:
        # Messages where user is a recipient
        query = (
            select(AdminMessage)
            .join(AdminMessageRecipient, AdminMessageRecipient.message_id == AdminMessage.id)
            .where(AdminMessageRecipient.recipient_user_id == current_user.id)
        )

    result = await db.execute(query.order_by(AdminMessage.created_at.desc()))
    return result.scalars().all()


@messaging_router.post("", response_model=AdminMessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(body: AdminMessageCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    msg = AdminMessage(
        school_id=current_user.school_id,
        sender_user_id=current_user.id,
        created_by=current_user.id,
        subject=body.subject,
        content=body.content,
        priority=body.priority,
        campus_id=body.campus_id,
        attachment_urls=body.attachment_urls,
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    await db.flush()

    # Add recipients
    for recipient_id in body.recipient_user_ids:
        r = AdminMessageRecipient(
            message_id=msg.id,
            recipient_user_id=recipient_id,
        )
        db.add(r)

    await db.flush()
    await db.refresh(msg)
    return msg


# NOTE: /unread-count MUST be before /{message_id} to avoid being shadowed
@messaging_router.get("/unread-count")
async def get_unread_count(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return {"count": 0}

    try:
        sql = """
            SELECT COUNT(*)::integer FROM admin_message_recipients r
            JOIN admin_messages m ON r.message_id = m.id
            WHERE r.recipient_user_id = :uid
              AND r.is_read = false
              AND m.school_id = :school_id
        """
        res = await db.execute(
            text(sql),
            {"uid": current_user.id, "school_id": current_user.school_id}
        )
        count = res.scalar() or 0
        return {"count": count}
    except Exception as e:
        import logging
        logging.getLogger("app.messaging").warning(f"Error listing unread messages count: {e}")
        return {"count": 0}


@messaging_router.get("/{message_id}", response_model=AdminMessageOut)
async def get_message(message_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(AdminMessage).where(AdminMessage.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise NotFoundError("Message", str(message_id))
    return msg


@messaging_router.post("/{message_id}/read", response_model=MessageResponse)
async def mark_read(message_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AdminMessageRecipient).where(
            AdminMessageRecipient.message_id == message_id,
            AdminMessageRecipient.recipient_user_id == current_user.id,
        )
    )
    recipient = result.scalar_one_or_none()
    if recipient:
        recipient.is_read = True
        recipient.read_at = datetime.now(timezone.utc)
    return MessageResponse(message="Marked as read")


# ─── NOTICES ──────────────────────────────────────────────────────────────────
notices_router = APIRouter(prefix="/notices", tags=["Notices"])


@notices_router.get("", response_model=List[NoticeOut])
async def list_notices(
    current_user: CurrentUser,
    db: DbSession,
    campus_id: Optional[UUID] = Query(None),
    published_only: bool = Query(True),
):
    if not current_user.school_id:
        return []
    query = select(Notice).where(Notice.school_id == current_user.school_id)
    if campus_id:
        query = query.where(Notice.campus_id == campus_id)
    if published_only:
        query = query.where(Notice.is_published == True)
    result = await db.execute(query.order_by(Notice.created_at.desc()))
    return result.scalars().all()


@notices_router.post("", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
async def create_notice(body: NoticeCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or can_broadcast_notices(effective_roles)):
        raise ForbiddenError()
    notice = Notice(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(notice)
    await db.flush()
    await db.refresh(notice)
    return notice


@notices_router.post("/{notice_id}/publish", response_model=NoticeOut)
async def publish_notice(notice_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise NotFoundError("Notice", str(notice_id))
    notice.is_published = True
    notice.published_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(notice)
    return notice


@notices_router.delete("/{notice_id}", response_model=MessageResponse)
async def delete_notice(notice_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise NotFoundError("Notice", str(notice_id))
    await db.delete(notice)
    return MessageResponse(message="Notice deleted")


# ─── DIARY ────────────────────────────────────────────────────────────────────
diary_router = APIRouter(prefix="/diary", tags=["Diary"])


@diary_router.get("", response_model=List[DiaryEntryOut])
async def list_diary(
    current_user: CurrentUser,
    db: DbSession,
    section_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    teacher_user_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(DiaryEntry).where(DiaryEntry.school_id == current_user.school_id)
    if section_id:
        query = query.where(DiaryEntry.class_section_id == section_id)
    if teacher_user_id:
        query = query.where(DiaryEntry.teacher_user_id == teacher_user_id)
    if from_date:
        query = query.where(DiaryEntry.entry_date >= from_date)
    if to_date:
        query = query.where(DiaryEntry.entry_date <= to_date)
    result = await db.execute(query.order_by(DiaryEntry.entry_date.desc()))
    return result.scalars().all()


@diary_router.post("", response_model=DiaryEntryOut, status_code=status.HTTP_201_CREATED)
async def create_diary_entry(body: DiaryEntryCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    entry = DiaryEntry(
        school_id=current_user.school_id,
        teacher_user_id=current_user.id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@diary_router.patch("/{entry_id}", response_model=DiaryEntryOut)
async def update_diary(entry_id: UUID, body: DiaryEntryCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Diary entry", str(entry_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    await db.flush()
    await db.refresh(entry)
    return entry


@diary_router.delete("/{entry_id}", response_model=MessageResponse)
async def delete_diary(entry_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Diary entry", str(entry_id))
    await db.delete(entry)
    return MessageResponse(message="Diary entry deleted")
