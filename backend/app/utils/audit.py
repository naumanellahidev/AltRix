"""
Audit logging utility.
Records all significant actions to the audit_logs table.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.audit")


# Action type constants
class AuditAction:
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"
    ROLE_CHANGE = "role_change"
    FEE_UPDATE = "fee_update"
    ATTENDANCE_UPDATE = "attendance_update"
    RESULT_UPDATE = "result_update"
    PERMISSION_CHANGE = "permission_change"
    CAMPUS_SWITCH = "campus_switch"
    ADMISSION_STATUS_CHANGE = "admission_status_change"


async def log_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    user_id: Optional[Any] = None,
    school_id: Optional[Any] = None,
    resource_id: Optional[str] = None,
    old_values: Optional[Dict] = None,
    new_values: Optional[Dict] = None,
    request: Optional[Request] = None,
    extra_data: Optional[Dict] = None,
):
    """
    Write an audit log entry to the database.
    Designed to be fire-and-forget (errors are swallowed and logged).
    
    Usage:
        await log_audit_event(
            db=db,
            action=AuditAction.CREATE,
            resource_type="student",
            resource_id=str(student.id),
            user_id=current_user.id,
            school_id=current_user.school_id,
            new_values={"name": student.first_name},
            request=request,
        )
    """
    try:
        from app.models.misc import AuditLog

        ip_address = None
        user_agent = None
        correlation_id = None

        if request:
            # Get real IP from X-Forwarded-For (behind proxy) or direct
            forwarded_for = request.headers.get("X-Forwarded-For")
            ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else (
                request.client.host if request.client else None
            )
            user_agent = request.headers.get("User-Agent", "")[:500]
            correlation_id = getattr(request.state, "correlation_id", None)

        # Sanitize sensitive fields from values
        if new_values:
            new_values = _sanitize_values(new_values)
        if old_values:
            old_values = _sanitize_values(old_values)

        # Resolve school_id from user_id if not provided to prevent NULL violations on database constraint
        if not school_id and user_id:
            try:
                import uuid
                from sqlalchemy import text
                uid_obj = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
                
                role_res = await db.execute(
                    text("SELECT school_id FROM user_roles WHERE user_id = :uid AND school_id IS NOT NULL LIMIT 1"),
                    {"uid": uid_obj}
                )
                row = role_res.fetchone()
                if row:
                    school_id = row[0]
                else:
                    mem_res = await db.execute(
                        text("SELECT school_id FROM school_memberships WHERE user_id = :uid AND school_id IS NOT NULL LIMIT 1"),
                        {"uid": uid_obj}
                    )
                    row_mem = mem_res.fetchone()
                    if row_mem:
                        school_id = row_mem[0]
            except Exception as resolve_err:
                logger.warning(f"Failed to auto-resolve school_id for audit log: {resolve_err}")

        # Absolute fallback if school_id is still None (due to strict NOT NULL DB constraint)
        if not school_id:
            try:
                from sqlalchemy import text
                sch_res = await db.execute(text("SELECT id FROM schools LIMIT 1"))
                row_sch = sch_res.fetchone()
                if row_sch:
                    school_id = row_sch[0]
            except Exception as sch_err:
                logger.warning(f"Failed to fetch fallback school_id: {sch_err}")

        log_entry = AuditLog(
            school_id=_to_uuid(school_id),
            user_id=_to_uuid(user_id),
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=datetime.now(timezone.utc),
        )

        # Attach extra data if schema supports it
        if extra_data:
            try:
                log_entry.extra_data = extra_data
            except AttributeError:
                pass

        if correlation_id:
            try:
                log_entry.session_id = correlation_id
            except AttributeError:
                pass

        db.add(log_entry)
        # Don't commit — let the enclosing transaction handle it
        # (or use db.flush() to get the ID)

    except Exception as e:
        # Audit logging must NEVER break the main request
        logger.error(f"Audit log write failed: {e}")


def _to_uuid(value) -> Optional[uuid.UUID]:
    """Safely convert a value to UUID."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return None


SENSITIVE_FIELDS = {
    "password", "token", "secret", "key", "hash", "salt",
    "access_token", "refresh_token", "api_key", "private_key",
    "credit_card", "card_number", "cvv", "pin",
}


def _sanitize_values(values: Dict) -> Dict:
    """Remove sensitive fields from audit log values."""
    return {
        k: ("***REDACTED***" if k.lower() in SENSITIVE_FIELDS else v)
        for k, v in values.items()
        if v is not None
    }


def model_to_audit_dict(obj, exclude_fields=None) -> Dict:
    """
    Convert a SQLAlchemy model instance to a dict suitable for audit logging.
    Excludes relationships and internal SQLAlchemy state.
    """
    exclude = set(exclude_fields or [])
    exclude.update(["_sa_instance_state"])
    
    result = {}
    for col in obj.__class__.__table__.columns:
        if col.name not in exclude:
            val = getattr(obj, col.name, None)
            if val is not None:
                result[col.name] = str(val) if not isinstance(val, (str, int, float, bool)) else val
    
    return _sanitize_values(result)
