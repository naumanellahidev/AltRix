"""
Operator-managed backup settings.

These live in ``system_settings`` rather than the environment so they can be
changed from the Super Admin dashboard. An alert address that needs a redeploy
to update is an alert address that goes stale — and a backup system that has
stopped working is only dangerous because it is quiet.

The environment value stays as a fallback for a brand-new deployment that has
not opened the dashboard yet.
"""
import json
import logging
from typing import Any, Dict

from sqlalchemy import text

logger = logging.getLogger("app.backup.settings")

SETTINGS_KEY = "backup_alert_config"

DEFAULTS: Dict[str, Any] = {
    # Comma-separated in the UI, stored as a list.
    "alert_emails": [],
    # Which events raise an email. All default on: the point of the alerts is
    # to notice silence, so opting out should be a deliberate act.
    "alert_on_failure": True,
    "alert_on_stale": True,
    "alert_on_missing_offsite": True,
    "alert_on_drill_failure": True,
    # A backup older than this many hours counts as stale.
    "stale_after_hours": 48,
}


async def get_backup_settings(db) -> Dict[str, Any]:
    """Read the operator's settings, falling back to defaults and to env."""
    config = dict(DEFAULTS)

    try:
        res = await db.execute(
            text("SELECT value FROM public.system_settings WHERE key = :k LIMIT 1"),
            {"k": SETTINGS_KEY},
        )
        row = res.fetchone()
        if row and row[0]:
            stored = row[0]
            if isinstance(stored, str):
                stored = json.loads(stored)
            if isinstance(stored, dict):
                config.update(stored)
    except Exception as e:
        logger.warning(f"Could not read backup alert settings: {e}")

    if not config.get("alert_emails"):
        from app.config import settings
        fallback = (settings.backup_alert_email or "").strip()
        if fallback:
            config["alert_emails"] = [fallback]

    return config


async def save_backup_settings(db, incoming: Dict[str, Any]) -> Dict[str, Any]:
    """Persist settings, keeping only recognised keys."""
    config = dict(DEFAULTS)
    for key in DEFAULTS:
        if key in incoming:
            config[key] = incoming[key]

    emails = config.get("alert_emails") or []
    if isinstance(emails, str):
        emails = [e.strip() for e in emails.split(",")]
    config["alert_emails"] = [e.strip() for e in emails if e and "@" in str(e)]

    try:
        config["stale_after_hours"] = max(1, int(config.get("stale_after_hours", 48)))
    except (TypeError, ValueError):
        config["stale_after_hours"] = 48

    await db.execute(
        text("""
            INSERT INTO public.system_settings (key, value)
            VALUES (:k, CAST(:v AS jsonb))
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        """),
        {"k": SETTINGS_KEY, "v": json.dumps(config)},
    )
    await db.commit()
    return config
