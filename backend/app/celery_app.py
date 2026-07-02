"""
AltRix Celery Application
Configured with Redis as both broker and result backend.
"""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "altrix",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.email_tasks",
        "app.tasks.notification_tasks",
        "app.tasks.pdf_tasks",
        "app.tasks.ai_tasks",
        "app.tasks.event_tasks",
    ],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Result expiry
    result_expires=3600,  # 1 hour

    # Worker concurrency / prefetch
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Retry policy defaults
    task_max_retries=3,
    task_default_retry_delay=60,  # seconds

    # Beat schedule (periodic tasks)
    beat_schedule={
        "cleanup-expired-tokens": {
            "task": "app.tasks.notification_tasks.cleanup_expired_token_blacklist",
            "schedule": 3600.0,  # every hour
        },
        "flush-audit-log-buffer": {
            "task": "app.tasks.notification_tasks.flush_audit_buffer",
            "schedule": 30.0,  # every 30 seconds
        },
    },

    # Routing
    task_routes={
        "app.tasks.email_tasks.*": {"queue": "emails"},
        "app.tasks.pdf_tasks.*": {"queue": "pdfs"},
        "app.tasks.ai_tasks.*": {"queue": "ai"},
        "app.tasks.notification_tasks.*": {"queue": "default"},
        "app.tasks.event_tasks.*": {"queue": "default"},
    },
)
