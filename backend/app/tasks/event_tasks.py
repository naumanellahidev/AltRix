import logging
import uuid
import time
import asyncio
import importlib
from datetime import datetime, timezone
from typing import Dict, Any

from app.celery_app import celery_app

logger = logging.getLogger("app.tasks.event_tasks")


@celery_app.task(
    name="app.tasks.event_tasks.process_event_task",
    bind=True,
    max_retries=3,
    queue="default",
)
def process_event_task(self, event_data: Dict[str, Any], subscriber_path: str):
    """
    Asynchronous Celery task to process an event subscriber handler.
    Provides database persistence for telemetry, execution logging,
    and automatic retries with exponential backoff.
    """
    event_id_str = event_data["id"]
    logger.info(f"Processing event {event_id_str} via subscriber {subscriber_path} (Attempt {self.request.retries + 1})")

    # Track execution performance and state
    start_time = time.time()
    subscriber_log_id = uuid.uuid4()
    
    async def _execute():
        from app.database import get_db_context
        from app.models.misc import EventSubscriberLog
        from sqlalchemy import text

        # 1. Create Subscriber Log entry (Pending state)
        async with get_db_context() as db:
            log_entry = EventSubscriberLog(
                id=subscriber_log_id,
                event_id=uuid.UUID(event_id_str),
                subscriber_name=subscriber_path,
                status="pending",
                retry_count=self.request.retries,
                created_at=datetime.now(timezone.utc)
            )
            db.add(log_entry)
            await db.commit()

        # 2. Dynamically import subscriber function
        try:
            module_name, func_name = subscriber_path.rsplit(".", 1)
            module = importlib.import_module(module_name)
            handler_func = getattr(module, func_name)
        except Exception as import_err:
            error_msg = f"Failed to dynamically import {subscriber_path}: {import_err}"
            logger.error(error_msg)
            async with get_db_context() as db:
                await db.execute(
                    text("""
                        UPDATE event_subscribers_log 
                        SET status = 'failed', error_message = :err, updated_at = NOW() 
                        WHERE id = :lid
                    """),
                    {"err": error_msg[:1000], "lid": subscriber_log_id}
                )
                await db.commit()
            return

        # 3. Invoke handler inside database context
        try:
            async with get_db_context() as db:
                # Execute subscriber async handler
                await handler_func(event_data, db)
                duration_ms = int((time.time() - start_time) * 1000)
                
                # Update log to completed
                await db.execute(
                    text("""
                        UPDATE event_subscribers_log 
                        SET status = 'completed', execution_time_ms = :dur, updated_at = NOW() 
                        WHERE id = :lid
                    """),
                    {"dur": duration_ms, "lid": subscriber_log_id}
                )
                await db.commit()
                logger.info(f"Subscriber {subscriber_path} completed successfully in {duration_ms}ms")
        except Exception as handler_err:
            db_error_msg = str(handler_err)
            logger.error(f"Subscriber {subscriber_path} failed: {db_error_msg}")
            
            async with get_db_context() as db:
                await db.execute(
                    text("""
                        UPDATE event_subscribers_log 
                        SET status = 'failed', error_message = :err, updated_at = NOW() 
                        WHERE id = :lid
                    """),
                    {"err": db_error_msg[:1000], "lid": subscriber_log_id}
                )
                await db.commit()
                
            # Reraise to trigger Celery retry mechanism
            raise handler_err

    # Run the async operations inside event loop
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_execute())
        loop.close()
    except Exception as exc:
        # Exponential backoff retry: 60s, 120s, 240s
        retry_delay = 60 * (2 ** self.request.retries)
        logger.warning(f"Retrying subscriber {subscriber_path} in {retry_delay}s due to exception: {exc}")
        raise self.retry(exc=exc, countdown=retry_delay)
