"""
AltRix Celery Application
Configured with Redis as both broker and result backend.
"""
from celery import Celery
from celery.schedules import crontab

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
        "app.tasks.backup_tasks",
    ],
)

celery_app.conf.update(
    # Fail-fast settings if Redis is down
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=2,
    task_publish_retry=False,

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
        # A crontab, not an interval. An interval fires relative to when the
        # beat process started, so a worker restarted at midday would fire at
        # midday every day and be turned away by the off-peak guard every time
        # — which is one of the reasons no backup was ever taken.
        "daily-db-backup": {
            "task": "app.tasks.backup_tasks.run_daily_backup",
            "schedule": crontab(hour=21, minute=0),  # 21:00 UTC = 02:00 PKT
            "options": {"expires": 3600},
        },
        # Backups fail quietly. Check that a recent one exists and shout if not.
        "backup-freshness-check": {
            "task": "app.tasks.backup_tasks.check_backup_freshness",
            "schedule": crontab(hour=9, minute=0),
        },
        # Weekly proof that the newest dump can actually be turned back into a
        # database. Without this the backups are only assumed to work.
        "weekly-restore-drill": {
            "task": "app.tasks.backup_tasks.run_restore_drill",
            "schedule": crontab(hour=22, minute=30, day_of_week=0),
            "options": {"expires": 7200},
        },
    },

    # Routing
    task_routes={
        "app.tasks.email_tasks.*": {"queue": "emails"},
        "app.tasks.pdf_tasks.*": {"queue": "pdfs"},
        "app.tasks.ai_tasks.*": {"queue": "ai"},
        "app.tasks.notification_tasks.*": {"queue": "default"},
        "app.tasks.event_tasks.*": {"queue": "default"},
        # Routed to "default" deliberately: the deployed worker consumes
        # default,emails,pdfs,ai — a dedicated backups queue would have no
        # consumer and the task would sit unrun.
        "app.tasks.backup_tasks.*": {"queue": "default"},
    },
)
