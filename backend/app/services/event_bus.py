import logging
import uuid
import json
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.schemas import EventEnvelope
from app.cache import get_redis

logger = logging.getLogger("app.event_bus")

# Event Registry mapping event names to subscriber execution paths
EVENT_REGISTRY: Dict[str, List[str]] = {
    "AttendanceMarked": [
        "app.services.subscribers.handle_attendance_marked_notification",
        "app.services.subscribers.handle_attendance_marked_analytics",
    ],
    "FeePaid": [
        "app.services.subscribers.handle_fee_paid_notification",
        "app.services.subscribers.handle_fee_paid_analytics",
    ],
    "UserLogin": [
        "app.services.subscribers.handle_user_login_activity",
    ],
    "ResultPublished": [
        "app.services.subscribers.handle_result_published_notification",
        "app.services.subscribers.handle_result_published_ai_copilot",
    ],
    "ReportGenerated": [
        "app.services.subscribers.handle_report_generated_analytics",
    ]
}

# Generic subscribers that process ALL events automatically
GENERIC_SUBSCRIBERS: List[str] = [
    "app.services.subscribers.handle_generic_audit_log",
    "app.services.subscribers.handle_generic_activity_timeline",
]


class EnterpriseEventBus:
    """
    Centralized Enterprise Event Bus System.
    Manages publishing, smart deduplication, database persistence,
    real-time dashboard broadcasts, and Celery asynchronous subscriber execution.
    """

    @staticmethod
    async def publish(event: EventEnvelope, db: AsyncSession) -> Dict[str, Any]:
        """
        Publish an event to the ERP-wide Event Bus.
        """
        start_time = time.time()
        
        # 1. Enforce validation of IDs
        event_id = event.id or uuid.uuid4()
        correlation_id = event.correlation_id or uuid.uuid4()
        
        # 2. Check for duplicate event (Smart Deduplication via Redis)
        redis = await get_redis()
        is_duplicate = False
        
        if redis and event.school_id:
            # Generate stable deduplication hash based on school, event name, and payload
            payload_str = json.dumps(event.payload, sort_keys=True)
            dedup_key = f"event_dedup:{event.school_id}:{event.event_name}:{hash(payload_str)}"
            
            # Use Redis SET with NX option and short 5-second TTL
            set_success = await redis.set(dedup_key, "1", ex=5, nx=True)
            if not set_success:
                is_duplicate = True
                logger.warning(f"Duplicate event throttled: {event.event_name} for school {event.school_id}")

        if is_duplicate:
            return {
                "status": "ignored",
                "reason": "duplicate_throttled",
                "event_id": str(event_id),
                "correlation_id": str(correlation_id)
            }

        # 3. Persist Event to Postgres Event Store
        try:
            from app.models.misc import EventStore
            db_event = EventStore(
                id=event_id,
                event_name=event.event_name,
                category=event.category,
                school_id=event.school_id,
                campus_id=event.campus_id,
                user_id=event.user_id,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                payload=event.payload,
                metadata_json=event.metadata,
                correlation_id=correlation_id,
                request_id=event.request_id,
                source=event.source or "system",
                status="published",
                version=event.version or "1.0.0",
                created_at=datetime.now(timezone.utc)
            )
            db.add(db_event)
            await db.commit()
        except Exception as db_err:
            logger.error(f"Failed to persist event {event.event_name} to database: {db_err}")
            # Fall back to volatile processing if DB fails
            await db.rollback()

        # 4. Real-time Broadcasting via Redis Pub/Sub
        if redis:
            try:
                broadcast_payload = {
                    "id": str(event_id),
                    "event_name": event.event_name,
                    "category": event.category,
                    "school_id": str(event.school_id) if event.school_id else None,
                    "campus_id": str(event.campus_id) if event.campus_id else None,
                    "user_id": str(event.user_id) if event.user_id else None,
                    "correlation_id": str(correlation_id),
                    "payload": event.payload,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await redis.publish("altrix:realtime:events", json.dumps(broadcast_payload))
            except Exception as redis_err:
                logger.error(f"Failed to broadcast real-time event via Redis: {redis_err}")

        # 5. Assemble List of Subscribers (Generic + Custom)
        subscribers = list(GENERIC_SUBSCRIBERS)
        custom_subs = EVENT_REGISTRY.get(event.event_name, [])
        subscribers.extend(custom_subs)

        # 6. Dispatch Async Subscribers via Celery Background Workers
        from app.tasks.event_tasks import process_event_task
        
        event_dict = {
            "id": str(event_id),
            "event_name": event.event_name,
            "category": event.category,
            "school_id": str(event.school_id) if event.school_id else None,
            "campus_id": str(event.campus_id) if event.campus_id else None,
            "user_id": str(event.user_id) if event.user_id else None,
            "entity_type": event.entity_type,
            "entity_id": str(event.entity_id) if event.entity_id else None,
            "payload": event.payload,
            "metadata": event.metadata,
            "correlation_id": str(correlation_id),
            "request_id": event.request_id,
            "source": event.source or "system",
            "version": event.version or "1.0.0",
        }

        for sub_path in subscribers:
            try:
                # Enqueue to Celery event queue
                process_event_task.apply_async(
                    args=[event_dict, sub_path],
                    queue="default"
                )
            except Exception as task_err:
                logger.error(f"Failed to queue task for subscriber {sub_path}: {task_err}")

        # 7. Update Event Store Status & latency log
        duration_ms = int((time.time() - start_time) * 1000)
        try:
            await db.execute(
                text("UPDATE event_store SET status = 'processed', execution_time_ms = :dur WHERE id = :eid"),
                {"dur": duration_ms, "eid": event_id}
            )
            await db.commit()
        except Exception as update_err:
            logger.error(f"Failed to update execution time for event {event_id}: {update_err}")

        return {
            "status": "published",
            "event_id": str(event_id),
            "correlation_id": str(correlation_id),
            "subscribers_triggered": len(subscribers),
            "execution_time_ms": duration_ms
        }
