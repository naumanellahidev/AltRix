import logging
from typing import Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.audit import log_audit_event
from app.services.notification_service import CentralNotificationService

logger = logging.getLogger("app.subscribers")


async def handle_generic_audit_log(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Generates an audit entry in the audit_logs table for every published event.
    """
    try:
        user_id = UUID(event["user_id"]) if event.get("user_id") else None
        school_id = UUID(event["school_id"]) if event.get("school_id") else None
        
        await log_audit_event(
            db=db,
            action=event["category"],
            resource_type=event["entity_type"] or "system",
            user_id=user_id,
            school_id=school_id,
            resource_id=event.get("entity_id"),
            new_values=event.get("payload"),
            extra_data=event.get("metadata")
        )
        logger.info(f"Audit log generated automatically for event: {event['event_name']}")
    except Exception as e:
        logger.error(f"Failed to generate generic audit log: {e}")


async def handle_generic_activity_timeline(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Translates every event into a human-readable timeline record in the database.
    """
    try:
        from app.models.misc import ActivityTimeline

        school_id = UUID(event["school_id"]) if event.get("school_id") else None
        campus_id = UUID(event["campus_id"]) if event.get("campus_id") else None
        user_id = UUID(event["user_id"]) if event.get("user_id") else None
        entity_id = UUID(event["entity_id"]) if event.get("entity_id") else None

        title = event["event_name"].replace("_", " ").title()
        desc = f"Action performed successfully under category {event['category']}."

        # Map key events to custom, premium human-readable text
        payload = event.get("payload", {})
        if event["event_name"] == "AttendanceMarked":
            student_name = payload.get("student_name", "Student")
            status = payload.get("status", "Present")
            desc = f"Attendance marked as {status} for student '{student_name}'."
        elif event["event_name"] == "FeePaid":
            amount = payload.get("amount", "0")
            voucher_id = payload.get("voucher_id", "N/A")
            desc = f"Fee payment of PKR {amount} received for voucher ID: {voucher_id}."
        elif event["event_name"] == "UserLogin":
            desc = "User logged in to the dashboard."
        elif event["event_name"] == "ResultPublished":
            exam_name = payload.get("exam_name", "Assessment")
            desc = f"Exam results published for assessment: {exam_name}."

        timeline_item = ActivityTimeline(
            school_id=school_id,
            campus_id=campus_id,
            user_id=user_id,
            event_name=event["event_name"],
            title=title,
            description=desc,
            category=event["category"],
            entity_type=event["entity_type"],
            entity_id=entity_id,
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(timeline_item)
        await db.commit()
        logger.info(f"Timeline item logged automatically for event: {event['event_name']}")
    except Exception as e:
        logger.error(f"Failed to write to activity timeline: {e}")
        await db.rollback()


async def handle_attendance_marked_notification(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Notifies parents when attendance is marked.
    """
    try:
        payload = event.get("payload", {})
        student_name = payload.get("student_name", "Student")
        status = payload.get("status", "Present")
        guardian_id_str = payload.get("guardian_user_id")

        if guardian_id_str and event.get("school_id"):
            await CentralNotificationService.notify_user(
                user_id=UUID(guardian_id_str),
                school_id=UUID(event["school_id"]),
                title="Attendance Notification",
                body=f"Dear Parent, {student_name} was marked {status} in class today.",
                category="attendance",
                type="info",
                campus_id=UUID(event["campus_id"]) if event.get("campus_id") else None
            )
            logger.info("Sent attendance push notification to guardian")
    except Exception as e:
        logger.error(f"Failed in handle_attendance_marked_notification: {e}")


async def handle_fee_paid_notification(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Sends receipt confirmation notification for fee payments.
    """
    try:
        payload = event.get("payload", {})
        amount = payload.get("amount", "0")
        voucher_id = payload.get("voucher_id", "N/A")

        if event.get("user_id") and event.get("school_id"):
            await CentralNotificationService.notify_user(
                user_id=UUID(event["user_id"]),
                school_id=UUID(event["school_id"]),
                title="Payment Received",
                body=f"Your fee payment of PKR {amount} for voucher ID {voucher_id} was successfully processed.",
                category="finance",
                type="success",
                campus_id=UUID(event["campus_id"]) if event.get("campus_id") else None
            )
            logger.info("Sent payment confirmation notification to user")
    except Exception as e:
        logger.error(f"Failed in handle_fee_paid_notification: {e}")


async def handle_user_login_activity(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Additional action triggered on UserLogin.
    """
    logger.info(f"User log-in event listener processed: {event.get('user_id')}")


async def handle_result_published_notification(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Notifies parent when student results are published.
    """
    try:
        payload = event.get("payload", {})
        exam_name = payload.get("exam_name", "Exam")
        guardian_id_str = payload.get("guardian_user_id")

        if guardian_id_str and event.get("school_id"):
            await CentralNotificationService.notify_user(
                user_id=UUID(guardian_id_str),
                school_id=UUID(event["school_id"]),
                title="Exam Results Published",
                body=f"Results for {exam_name} have been published. Check your portal for detail report card.",
                category="academic",
                type="info",
                campus_id=UUID(event["campus_id"]) if event.get("campus_id") else None
            )
            logger.info("Sent exam result notification to parent")
    except Exception as e:
        logger.error(f"Failed in handle_result_published_notification: {e}")


async def handle_result_published_ai_copilot(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Updates the AI queue with details of exam results for counseling predict logs.
    """
    try:
        from app.models.misc import AiCounselingQueue
        payload = event.get("payload", {})
        student_id_str = payload.get("student_id")
        
        if student_id_str and event.get("school_id"):
            pred = AiCounselingQueue(
                school_id=UUID(event["school_id"]),
                student_id=UUID(student_id_str),
                reason="Automatic AI update: fresh exam results published.",
                status="pending",
            )
            db.add(pred)
            await db.commit()
            logger.info("Created counseling queue predict item via AI subscriber")
    except Exception as e:
        logger.error(f"Failed in handle_result_published_ai_copilot: {e}")
        await db.rollback()


async def handle_report_generated_analytics(event: Dict[str, Any], db: AsyncSession) -> None:
    """
    Logs analytical events when PDFs or reports are generated.
    """
    logger.info(f"Report generated subscriber processed for correlation {event.get('correlation_id')}")
