"""
AI analysis background tasks.
Handles expensive Gemini AI calls asynchronously.
"""
import asyncio
import logging
import uuid
from typing import Optional

from app.celery_app import celery_app

logger = logging.getLogger("altrix.tasks.ai")


@celery_app.task(
    name="app.tasks.ai_tasks.run_student_analysis",
    bind=True,
    max_retries=1,
    default_retry_delay=300,
    queue="ai",
    soft_time_limit=120,
    time_limit=180,
)
def run_student_analysis(
    self,
    student_id: str,
    school_id: str,
    force_refresh: bool = False,
):
    """
    Run AI analysis for a student (attendance, grades, behavior).
    Updates ai_student_profiles and ai_academic_predictions.
    """
    try:
        import asyncio
        from app.config import settings

        if not settings.gemini_api_key:
            logger.warning("Gemini API key not configured — skipping AI analysis")
            return {"status": "skipped", "reason": "no_api_key"}

        async def _analyze():
            from app.database import get_db_context
            from app.models.misc import AiStudentProfile
            from app.models.people import Student
            from sqlalchemy import select, text

            async with get_db_context() as db:
                # Fetch student
                s_res = await db.execute(select(Student).where(Student.id == uuid.UUID(student_id)))
                student = s_res.scalar_one_or_none()
                if not student:
                    return {"error": "Student not found"}

                # Fetch attendance stats
                att_res = await db.execute(text("""
                    SELECT
                        COUNT(*) FILTER (WHERE ae.status = 'present') as present,
                        COUNT(*) FILTER (WHERE ae.status = 'absent') as absent,
                        COUNT(*) as total
                    FROM attendance_entries ae
                    JOIN attendance_sessions ats ON ae.session_id = ats.id
                    WHERE ae.student_id = :sid
                    AND ats.school_id = :school_id
                """), {"sid": str(student_id), "school_id": str(school_id)})
                att_row = att_res.fetchone()
                attendance_rate = (att_row[0] / att_row[2] * 100) if att_row and att_row[2] else 0

                # Simple risk scoring (production: use Gemini for full analysis)
                risk_level = "low"
                risk_score = 0.1
                if attendance_rate < 75:
                    risk_level = "high"
                    risk_score = 0.8
                elif attendance_rate < 85:
                    risk_level = "medium"
                    risk_score = 0.4

                # Upsert AI profile
                existing = await db.execute(
                    select(AiStudentProfile).where(AiStudentProfile.student_id == uuid.UUID(student_id))
                )
                profile = existing.scalar_one_or_none()
                if not profile:
                    profile = AiStudentProfile(
                        school_id=uuid.UUID(school_id),
                        student_id=uuid.UUID(student_id),
                    )
                    db.add(profile)

                from datetime import datetime, timezone
                profile.risk_level = risk_level
                profile.risk_score = risk_score
                profile.last_analyzed_at = datetime.now(timezone.utc)
                profile.analysis_data = {
                    "attendance_rate": attendance_rate,
                    "present_days": att_row[0] if att_row else 0,
                    "absent_days": att_row[1] if att_row else 0,
                }

                return {
                    "status": "analyzed",
                    "student_id": student_id,
                    "risk_level": risk_level,
                    "attendance_rate": attendance_rate,
                }

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_analyze())
        loop.close()
        logger.info(f"AI analysis complete for student {student_id}: {result}")
        return result

    except Exception as exc:
        logger.error(f"AI analysis failed for {student_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.ai_tasks.generate_parent_update",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
    queue="ai",
)
def generate_parent_update(
    self,
    student_id: str,
    school_id: str,
    parent_user_id: Optional[str] = None,
):
    """
    Generate an AI parent update summary for a student.
    Stores result in ai_parent_updates table.
    """
    try:
        async def _generate():
            from app.database import get_db_context
            from app.models.misc import AiParentUpdate
            from sqlalchemy import text

            async with get_db_context() as db:
                # Get recent attendance
                att = await db.execute(text("""
                    SELECT status, COUNT(*) FROM attendance_entries ae
                    JOIN attendance_sessions ats ON ae.session_id = ats.id
                    WHERE ae.student_id = :sid
                    AND ats.session_date >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY status
                """), {"sid": str(student_id)})
                att_data = {row[0]: row[1] for row in att.fetchall()}
                present = att_data.get("present", 0)
                absent = att_data.get("absent", 0)
                total = present + absent
                rate = round(present / total * 100, 1) if total > 0 else 0

                summary = f"Your child attended {present}/{total} days ({rate}%) in the last 30 days."
                if rate < 75:
                    summary += " Attendance is below the required threshold. Please contact the school."

                from datetime import datetime, timezone, date
                update = AiParentUpdate(
                    school_id=uuid.UUID(school_id),
                    student_id=uuid.UUID(student_id),
                    parent_user_id=uuid.UUID(parent_user_id) if parent_user_id else None,
                    update_type="monthly_summary",
                    update_date=date.today().isoformat(),
                    content=summary,
                    ai_summary=summary,
                    attendance_status="good" if rate >= 85 else "needs_attention",
                    performance_change_percent=0.0,
                    created_at=datetime.now(timezone.utc),
                )
                db.add(update)
                return {"status": "generated", "summary": summary}

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_generate())
        loop.close()
        logger.info(f"Parent update generated for student {student_id}")
        return result

    except Exception as exc:
        logger.error(f"Parent update generation failed: {exc}")
        raise self.retry(exc=exc)
