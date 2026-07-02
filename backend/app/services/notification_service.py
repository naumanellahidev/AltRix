import json
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime, timezone

from app.cache import get_redis
from app.tasks.notification_tasks import push_notification, flush_batched_notifications

logger = logging.getLogger("app.services.notification_service")

class CentralNotificationService:
    """
    Centralized Enterprise Notification Service for AltRix ERP.
    All modules dispatch notifications through this service to leverage
    lightweight Celery queueing, user preferences, multi-school tenant isolation,
    and smart deduplication/batching.
    """

    @staticmethod
    async def notify_user(
        user_id: UUID,
        school_id: UUID,
        title: str,
        body: Optional[str] = None,
        category: str = "general",
        priority: str = "normal",
        type: str = "info",
        icon: Optional[str] = None,
        color: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        action_url: Optional[str] = None,
        campus_id: Optional[UUID] = None,
        delay_seconds: int = 5,
    ) -> None:
        """
        Dispatches a notification to a specific user.
        Uses Redis to batch multiple notifications in a short window to prevent spam.
        """
        try:
            redis = await get_redis()
            if not redis:
                # Fallback: No Redis available, send immediately
                CentralNotificationService._send_immediate(
                    user_id=user_id,
                    school_id=school_id,
                    title=title,
                    body=body,
                    category=category,
                    priority=priority,
                    type=type,
                    icon=icon,
                    color=color,
                    metadata=metadata,
                    action_url=action_url,
                    campus_id=campus_id,
                )
                return

            # Smart deduplication & batching logic:
            # Create a key based on user, school, and category
            batch_key = f"notif:batch:{school_id}:{user_id}:{category}"
            lock_key = f"notif:batch_lock:{school_id}:{user_id}:{category}"

            notif_data = {
                "user_id": str(user_id),
                "school_id": str(school_id),
                "title": title,
                "body": body or "",
                "category": category,
                "priority": priority,
                "type": type,
                "icon": icon or "",
                "color": color or "",
                "metadata": metadata or {},
                "action_url": action_url or "",
                "campus_id": str(campus_id) if campus_id else None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Check if a batch is already active
            is_locked = await redis.get(lock_key)

            if is_locked:
                # Sibling notifications exist in the batch. Append to Redis list
                await redis.rpush(batch_key, json.dumps(notif_data))
                logger.info(f"Batched duplicate notification for user {user_id} in category {category}")
            else:
                # Start a new batch: set lock with TTL matching the batch window
                await redis.set(lock_key, "1", ex=delay_seconds)
                # Clear any stale list key
                await redis.delete(batch_key)
                # Add first notification to the batch list
                await redis.rpush(batch_key, json.dumps(notif_data))
                
                # Queue flush task to execute after the delay window
                flush_batched_notifications.apply_async(
                    args=[str(school_id), str(user_id), category],
                    countdown=delay_seconds
                )
                logger.info(f"Started notification batch for user {user_id} in category {category}")

        except Exception as e:
            logger.error(f"Error in notify_user: {e}. Falling back to immediate dispatch.")
            CentralNotificationService._send_immediate(
                user_id=user_id,
                school_id=school_id,
                title=title,
                body=body,
                category=category,
                priority=priority,
                type=type,
                icon=icon,
                color=color,
                metadata=metadata,
                action_url=action_url,
                campus_id=campus_id,
            )

    @staticmethod
    def _send_immediate(
        user_id: UUID,
        school_id: UUID,
        title: str,
        body: Optional[str] = None,
        category: str = "general",
        priority: str = "normal",
        type: str = "info",
        icon: Optional[str] = None,
        color: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        action_url: Optional[str] = None,
        campus_id: Optional[UUID] = None,
    ) -> None:
        """Helper to enqueue a single notification task directly into Celery."""
        push_notification.apply_async(
            kwargs={
                "user_id": str(user_id),
                "school_id": str(school_id),
                "title": title,
                "body": body,
                "category": category,
                "priority": priority,
                "notification_type": type,
                "icon": icon,
                "color": color,
                "metadata": metadata,
                "action_url": action_url,
                "campus_id": str(campus_id) if campus_id else None,
            }
        )

# Singleton service instance
notification_service = CentralNotificationService()
