"""
Notification and maintenance background tasks.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from app.celery_app import celery_app

logger = logging.getLogger("altrix.tasks.notifications")

# ─── In-memory audit log buffer ───────────────────────────────────────────────
_audit_buffer: List[dict] = []


@celery_app.task(
    name="app.tasks.notification_tasks.push_notification",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="default",
)
def push_notification(
    self,
    user_id: str,
    school_id: str,
    title: str,
    body: str,
    notification_type: str = "info",
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
):
    """
    Create an in-app notification record for a user.
    Stored in app_notifications table.
    """
    try:
        import asyncio

        async def _insert():
            from app.database import get_db_context
            from app.models.misc import AppNotification
            import uuid

            async with get_db_context() as db:
                notif = AppNotification(
                    user_id=uuid.UUID(user_id),
                    school_id=uuid.UUID(school_id),
                    title=title,
                    body=body,
                    type=notification_type,
                    entity_type=entity_type,
                    entity_id=uuid.UUID(entity_id) if entity_id else None,
                )
                db.add(notif)

        loop = asyncio.new_event_loop()
        loop.run_until_complete(_insert())
        loop.close()
        logger.info(f"Notification created for user {user_id}: {title}")
        return {"status": "created", "user_id": user_id}

    except Exception as exc:
        logger.error(f"Notification task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.notification_tasks.broadcast_notice",
    bind=True,
    max_retries=2,
    queue="default",
)
def broadcast_notice(
    self,
    school_id: str,
    notice_id: str,
    target_user_ids: List[str],
    title: str,
    content: str,
):
    """
    Broadcast a school notice to multiple users as in-app notifications.
    """
    try:
        for uid in target_user_ids:
            push_notification.apply_async(
                kwargs={
                    "user_id": uid,
                    "school_id": school_id,
                    "title": f"Notice: {title}",
                    "body": content[:200] if content else "",
                    "notification_type": "notice",
                    "entity_type": "notice",
                    "entity_id": notice_id,
                },
                queue="default",
            )
        logger.info(f"Broadcast queued for notice {notice_id} → {len(target_user_ids)} users")
        return {"status": "queued", "recipients": len(target_user_ids)}

    except Exception as exc:
        logger.error(f"Broadcast notice task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.notification_tasks.cleanup_expired_token_blacklist",
    queue="default",
)
def cleanup_expired_token_blacklist():
    """
    Periodic task: remove expired tokens from token_blacklist table.
    Runs every hour via Celery Beat.
    """
    try:
        async def _cleanup():
            from app.database import get_db_context
            from sqlalchemy import text

            async with get_db_context() as db:
                result = await db.execute(text("""
                    DELETE FROM token_blacklist
                    WHERE expires_at < NOW()
                    RETURNING jti
                """))
                deleted = len(result.fetchall())
                return deleted

        loop = asyncio.new_event_loop()
        deleted = loop.run_until_complete(_cleanup())
        loop.close()
        logger.info(f"Cleaned up {deleted} expired token blacklist entries")
        return {"deleted": deleted}

    except Exception as exc:
        logger.error(f"Token cleanup failed: {exc}")
        return {"error": str(exc)}


@celery_app.task(
    name="app.tasks.notification_tasks.flush_audit_buffer",
    queue="default",
)
def flush_audit_buffer():
    """
    Periodic task: flush any buffered audit log entries to the DB.
    This task is a safety net — most audit logs are written immediately.
    """
    global _audit_buffer
    if not _audit_buffer:
        return {"flushed": 0}

    to_flush = _audit_buffer[:]
    _audit_buffer.clear()

    try:
        async def _insert_all():
            from app.database import get_db_context
            from app.models.misc import AuditLog
            import uuid

            async with get_db_context() as db:
                for entry in to_flush:
                    log = AuditLog(**entry)
                    db.add(log)

        loop = asyncio.new_event_loop()
        loop.run_until_complete(_insert_all())
        loop.close()
        logger.info(f"Flushed {len(to_flush)} audit log entries")
        return {"flushed": len(to_flush)}

    except Exception as exc:
        # Put them back if failed
        _audit_buffer.extend(to_flush)
        logger.error(f"Audit buffer flush failed: {exc}")
        return {"error": str(exc)}
