"""
Celery task for scheduled database backups.

This module exists so the backup runs through the same registration path as
every other task: listed in ``celery_app.include`` and scheduled in
``beat_schedule``. The previous arrangement relied on a ``register_backup_tasks``
helper that nothing ever called, so the task was never registered and no backup
was ever attempted.
"""
import asyncio
import logging

from app.celery_app import celery_app

logger = logging.getLogger("app.tasks.backup")


@celery_app.task(
    name="app.tasks.backup_tasks.run_daily_backup",
    bind=True,
    max_retries=2,
    default_retry_delay=600,
)
def run_daily_backup(self, force: bool = False):
    """
    Dump the database, verify it, store it and rotate old copies.

    Failures are re-raised so Celery marks the task failed and retries. The
    earlier implementation caught everything and returned an error dict, which
    reads as success to Celery — the reason a completely broken backup went
    unnoticed.
    """
    from app.utils.backup_service import run_backup

    try:
        result = asyncio.run(run_backup(force=force))
        if result.get("status") == "success":
            logger.info(f"Backup succeeded: {result.get('filename')}")
            if not result.get("offsite", {}).get("replicated"):
                _alert("Backup was not copied off-site",
                       f"{result.get('filename')} was written locally but not "
                       f"replicated: {result.get('offsite', {}).get('reason')}",
                       event="offsite")
        return result
    except Exception as exc:
        logger.error(f"Backup task failed: {exc}")
        if self.request.retries >= self.max_retries:
            _alert(
                "Database backup failed",
                f"The scheduled backup failed after {self.max_retries} retries."
                f"\n\nError: {exc}",
            )
        raise self.retry(exc=exc)


@celery_app.task(name="app.tasks.backup_tasks.run_restore_drill")
def run_restore_drill_task():
    """
    Prove the newest backup can be restored.

    Restores it into a scratch database, checks real rows came back, drops the
    scratch database. A backup nobody has restored is a hypothesis, and the
    usual moment that hypothesis gets tested is during an outage.
    """
    from app.utils.restore_service import run_restore_drill

    result = run_restore_drill()
    if result.get("status") != "success":
        logger.error(f"RESTORE DRILL FAILED: {result.get('reason')}")
        _alert(
            "Restore drill failed",
            "The most recent backup could not be restored."
            f"\n\nBackup: {result.get('backup')}"
            f"\nReason: {result.get('reason')}"
            "\n\nRecovery is not currently proven. See docs/backup-restore.md.",
            event="drill",
        )
    return result


def _alert(subject: str, body: str, event: str = "failure") -> None:
    """
    Escalate beyond the log file.

    Recipients come from the database so they can be managed in the Super Admin
    dashboard without a redeploy. A WARNING in a container log is not an alert,
    and an alert address that needs a deploy to change is one that goes stale.
    """
    try:
        from app.database import get_db_context
        from app.services.email_service import CentralEmailService
        from app.utils.backup_settings import get_backup_settings

        async def _send():
            async with get_db_context() as db:
                config = await get_backup_settings(db)

                toggle = {
                    "failure": "alert_on_failure",
                    "stale": "alert_on_stale",
                    "offsite": "alert_on_missing_offsite",
                    "drill": "alert_on_drill_failure",
                }.get(event, "alert_on_failure")
                if not config.get(toggle, True):
                    return

                recipients = config.get("alert_emails") or []
                if not recipients:
                    logger.error(
                        f"[{subject}] {body} "
                        "(no backup alert recipients configured - set them in "
                        "Super Admin > Emails > Backup Alerts)"
                    )
                    return

                for recipient in recipients:
                    await CentralEmailService.send_event(
                        event_name="system_alert",
                        recipient=recipient,
                        context={"subject": subject, "message": body},
                        db=db,
                    )

        asyncio.run(_send())
    except Exception as e:
        # Never let the alert path mask the failure it is reporting.
        logger.error(f"Could not send backup alert '{subject}': {e}")


@celery_app.task(name="app.tasks.backup_tasks.check_backup_freshness")
def check_backup_freshness():
    """
    Warn when no recent backup exists.

    A backup system that stops working is only dangerous because it is quiet.
    This makes the silence audible in the logs.
    """
    from app.utils.backup_service import get_backup_status

    status = asyncio.run(get_backup_status())

    if not status.get("available"):
        logger.error("BACKUP ALERT: no database backups exist")
        _alert("No database backups exist",
               "The backup directory is empty. Nothing is protecting this "
               "database. See docs/backup-restore.md.")
    elif status.get("stale"):
        age = status.get("latest_age_hours")
        logger.error(f"BACKUP ALERT: newest backup is {age}h old")
        _alert("Backups have stopped",
               f"The newest database backup is {age} hours old. The scheduled "
               "job appears to have stopped running.", event="stale")
    elif not status.get("offsite_configured"):
        logger.error("BACKUP ALERT: no off-site copy is configured")
        _alert("Backups are not replicated off-site",
               "Backups exist but only on this server, so losing the host loses "
               "them too. Download it from the dashboard, or set "
               "BACKUP_OFFSITE_TARGET=path to have a copy made automatically.",
               event="offsite")
    return status
