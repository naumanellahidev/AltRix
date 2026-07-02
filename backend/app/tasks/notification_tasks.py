"""
Notification and maintenance background tasks.
"""
import asyncio
import logging
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from app.celery_app import celery_app

logger = logging.getLogger("altrix.tasks.notifications")

# ─── In-memory audit log buffer ───────────────────────────────────────────────
_audit_buffer: List[dict] = []


@celery_app.task(
    name="app.tasks.notification_tasks.push_notification",
    bind=True,
    max_retries=3,
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
    category: str = "general",
    priority: str = "normal",
    icon: Optional[str] = None,
    color: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    action_url: Optional[str] = None,
    campus_id: Optional[str] = None,
):
    """
    Create an in-app notification record for a user and dispatch to real-time WebSockets,
    PWA Web Push, and email if configured.
    """
    try:
        async def _insert_and_dispatch():
            from app.database import get_db_context
            from app.models.misc import AppNotification
            from app.utils.webpush_service import send_web_push, get_vapid_keys
            from app.cache import get_redis
            from sqlalchemy import text
            from pywebpush import WebPushException

            async with get_db_context() as db:
                # 1. Fetch user preferences
                pref_in_app = True
                pref_push = True
                pref_email = False
                
                try:
                    res = await db.execute(
                        text("SELECT preferences FROM user_notification_preferences WHERE user_id = :uid AND school_id = :sid"),
                        {"uid": uuid.UUID(user_id), "sid": uuid.UUID(school_id)}
                    )
                    row = res.fetchone()
                    if row and row[0]:
                        prefs = row[0]
                        cat_pref = prefs.get(category, {})
                        pref_in_app = cat_pref.get("in_app", True)
                        pref_push = cat_pref.get("push", True)
                        pref_email = cat_pref.get("email", False)
                except Exception as pref_err:
                    logger.error(f"Failed to read preferences: {pref_err}")

                # 2. In-App Notification (database log)
                notif_id = None
                if pref_in_app:
                    notif = AppNotification(
                        user_id=uuid.UUID(user_id),
                        school_id=uuid.UUID(school_id),
                        campus_id=uuid.UUID(campus_id) if campus_id else None,
                        title=title,
                        body=body,
                        type=notification_type,
                        entity_id=uuid.UUID(entity_id) if entity_id else None,
                        entity_type=entity_type,
                        category=category,
                        action_url=action_url,
                        priority=priority,
                        icon=icon,
                        color=color,
                        metadata_json=metadata or {},
                        read_at=None
                    )
                    db.add(notif)
                    await db.flush() # Populate ID
                    notif_id = notif.id
                    logger.info(f"Saved database app_notification {notif_id} for user {user_id}")

                # 3. Publish to Redis Pub/Sub for FastAPI server WebSocket delivery
                try:
                    redis = await get_redis()
                    if redis:
                        ws_payload = {
                            "event": "notification",
                            "user_id": user_id,
                            "data": {
                                "id": str(notif_id) if notif_id else str(uuid.uuid4()),
                                "title": title,
                                "body": body,
                                "type": notification_type,
                                "category": category,
                                "priority": priority,
                                "icon": icon or "",
                                "color": color or "",
                                "metadata": metadata or {},
                                "action_url": action_url or "",
                                "created_at": datetime.now(timezone.utc).isoformat(),
                            }
                        }
                        await redis.publish("altrix:realtime:events", json.dumps(ws_payload))
                except Exception as ws_err:
                    logger.error(f"Failed to publish WebSocket event to Redis: {ws_err}")

                # 4. PWA Web Push Notifications
                if pref_push:
                    try:
                        res = await db.execute(
                            text("SELECT id, endpoint, p256dh, auth FROM user_web_push_subscriptions WHERE user_id = :uid"),
                            {"uid": uuid.UUID(user_id)}
                        )
                        subs = res.fetchall()
                        
                        if subs:
                            push_payload = {
                                "id": str(notif_id) if notif_id else str(uuid.uuid4()),
                                "title": title,
                                "body": body,
                                "category": category,
                                "action_url": action_url or "",
                                "icon": icon or "",
                            }
                            
                            for sub in subs:
                                sub_id, endpoint, p256dh, auth = sub
                                sub_info = {
                                    "endpoint": endpoint,
                                    "keys": {
                                        "p256dh": p256dh,
                                        "auth": auth
                                    }
                                }
                                try:
                                    # Reuse standard pywebpush utility
                                    keys = get_vapid_keys()
                                    from pywebpush import webpush
                                    webpush(
                                        subscription_info=sub_info,
                                        data=json.dumps(push_payload),
                                        vapid_private_key=keys["private_key"],
                                        vapid_claims={"sub": "mailto:support@alt-rix.com"},
                                        timeout=5
                                    )
                                except WebPushException as ex:
                                    if ex.response is not None and ex.response.status_code in [404, 410]:
                                        # Delete expired subscription
                                        await db.execute(
                                            text("DELETE FROM user_web_push_subscriptions WHERE id = :sub_id"),
                                            {"sub_id": sub_id}
                                        )
                                        logger.info(f"Deleted expired push subscription {sub_id}")
                    except Exception as push_err:
                        logger.error(f"Failed to send PWA push: {push_err}")

                # 5. Email Notifications (if user enabled it)
                if pref_email:
                    try:
                        # Fetch email address for user
                        email_res = await db.execute(
                            text("SELECT email FROM auth.users WHERE id = :uid"),
                            {"uid": uuid.UUID(user_id)}
                        )
                        email_row = email_res.fetchone()
                        if email_row and email_row[0]:
                            recipient_email = email_row[0]
                            from app.tasks.email_tasks import send_bulk_notification
                            send_bulk_notification.apply_async(
                                kwargs={
                                    "user_emails": [recipient_email],
                                    "subject": title,
                                    "body_text": body or "",
                                    "template_name": "general_notification",
                                }
                            )
                    except Exception as email_err:
                        logger.error(f"Failed to queue email notification: {email_err}")

        loop = asyncio.new_event_loop()
        loop.run_until_complete(_insert_and_dispatch())
        loop.close()
        return {"status": "dispatched", "user_id": user_id}

    except Exception as exc:
        logger.error(f"Notification task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.notification_tasks.flush_batched_notifications",
    queue="default",
)
def flush_batched_notifications(school_id: str, user_id: str, category: str):
    """
    Celery background task to flush a batch of notifications for a user,
    merging similar ones to prevent spam.
    """
    try:
        async def _flush():
            from app.cache import get_redis
            redis = await get_redis()
            if not redis:
                return

            batch_key = f"notif:batch:{school_id}:{user_id}:{category}"
            lock_key = f"notif:batch_lock:{school_id}:{user_id}:{category}"

            # Fetch all items in the batch
            items_raw = await redis.lrange(batch_key, 0, -1)
            # Remove batch keys
            await redis.delete(batch_key)
            await redis.delete(lock_key)

            if not items_raw:
                return

            items = [json.loads(x) for x in items_raw]
            count = len(items)

            if count == 1:
                # Only 1 notification: dispatch as is
                first = items[0]
                push_notification.apply_async(
                    kwargs={
                        "user_id": first["user_id"],
                        "school_id": first["school_id"],
                        "title": first["title"],
                        "body": first["body"],
                        "notification_type": first["type"],
                        "category": first["category"],
                        "priority": first["priority"],
                        "icon": first["icon"],
                        "color": first["color"],
                        "metadata": first["metadata"],
                        "action_url": first["action_url"],
                        "campus_id": first["campus_id"],
                    }
                )
                return

            # Multiple notifications: merge them intelligently
            first = items[0]
            merged_title = ""
            merged_body = ""

            if category == "attendance":
                merged_title = "Attendance updates"
                merged_body = f"Attendance status recorded/updated for {count} students."
            elif category == "billing" or category == "finance":
                merged_title = "Fee & billing updates"
                merged_body = f"You have {count} new fee invoice or billing status changes."
            elif category == "exams" or category == "grades":
                merged_title = "Academic & exam updates"
                merged_body = f"{count} new exam results or assessments have been published."
            elif category == "messages":
                merged_title = f"New messages ({count})"
                merged_body = f"You received {count} new messages."
            else:
                merged_title = f"{category.capitalize()} Updates ({count})"
                merged_body = f"You have {count} new updates in the {category} section."

            push_notification.apply_async(
                kwargs={
                    "user_id": user_id,
                    "school_id": school_id,
                    "title": merged_title,
                    "body": merged_body,
                    "notification_type": "info",
                    "category": category,
                    "priority": "normal",
                    "icon": first.get("icon"),
                    "color": first.get("color"),
                    "metadata": {
                        "merged_count": count,
                        "batch_items": [i.get("title") for i in items[:5]] # Keep first 5 titles for context
                    },
                    "action_url": first.get("action_url"),
                    "campus_id": first.get("campus_id"),
                }
            )
            logger.info(f"Flushed & merged {count} notifications for user {user_id} in category {category}")

        loop = asyncio.new_event_loop()
        loop.run_until_complete(_flush())
        loop.close()
        return {"status": "flushed"}

    except Exception as exc:
        logger.error(f"Failed to flush batched notifications: {exc}")
        return {"error": str(exc)}


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
                    "category": "notices",
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
