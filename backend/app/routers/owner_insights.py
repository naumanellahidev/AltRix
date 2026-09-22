"""
AI-Powered Owner Insights Router
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta, date, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError
from app.models.owner_insights import OwnerAiInsight
from app.models.finance import FeePayment
from app.models.people import Student, TeacherProfile
from app.models.misc import Complaint
from app.schemas import OwnerAiInsightOut
from app.utils.money import money
from app.utils.permissions import expand_roles

_PK_TZ = ZoneInfo("Asia/Karachi")

router = APIRouter(prefix="/owner-insights", tags=["Owner Insights"])


@router.get("/summary", response_model=OwnerAiInsightOut)
async def get_owner_insights_summary(current_user: CurrentUser, db: DbSession):
    """
    The owner's board figures, every one computed from the school's records.

    This endpoint could never succeed — it read `years_experience` and
    `description`, fields that do not exist — so the screen always fell back
    to invented numbers, and the endpoint itself invented more: named
    "faculty" when there were no teachers, a 72% positive parent sentiment and
    at least 240 "responses" when there were no complaints, and fixed
    benchmark scores against a "provincial average" from nowhere. Failed and
    refunded payments counted as revenue.

    Now: collected fees by calendar month (successful payments only) with a
    linear projection only when there are three months of history to project
    from; new admissions by month and the current roll; teachers flagged by
    tenure from their joining date, by name; the tone of parent messages by a
    stated keyword rule, with the real count; and the school's own rates
    (fee recovery, attendance, complaint resolution). Anything that cannot be
    known is null, never a stand-in.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective = expand_roles(current_user.roles or [])
    if not current_user.is_super_admin and not any(
        r in effective for r in ("school_owner", "principal", "vice_principal", "school_admin")
    ):
        raise ForbiddenError("Accessible only to School Owners and Board Directors")
    school_id = current_user.school_id
    today = datetime.now(_PK_TZ).date()

    # 1. Fees collected per calendar month, last six months.
    months = []
    y, m = today.year, today.month
    for _ in range(6):
        months.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    months.reverse()
    first = datetime(months[0][0], months[0][1], 1, tzinfo=_PK_TZ)
    rows = await db.execute(
        text(
            """
            SELECT to_char(paid_at AT TIME ZONE 'UTC' + INTERVAL '5 hours', 'YYYY-MM') AS ym, SUM(amount) AS total
            FROM fee_payments
            WHERE school_id = CAST(:school AS UUID)
              -- fee_payment_status holds pending/success/failed/refunded.
              -- Asking for 'completed' or 'paid' made Postgres reject the whole
              -- statement, so this board's revenue line never loaded.
              AND status = 'success'
              AND paid_at >= :since
            GROUP BY 1
            """
        ),
        {"school": str(school_id), "since": first},
    )
    by_month = {r["ym"]: money(r["total"] or 0) for r in rows.mappings()}
    labels = [date(yy, mm, 1).strftime("%b %Y") for yy, mm in months]
    historical = [by_month.get(f"{yy:04d}-{mm:02d}", money(0)) for yy, mm in months]

    forecast_labels, forecast_values = [], []
    history_months = sum(1 for v in historical if v > 0)
    if history_months >= 3:
        xs = list(range(len(historical)))
        ys = [float(v) for v in historical]
        mean_x, mean_y = sum(xs) / len(xs), sum(ys) / len(ys)
        den = sum((x - mean_x) ** 2 for x in xs)
        slope = sum((x - mean_x) * (yv - mean_y) for x, yv in zip(xs, ys)) / den if den else 0.0
        intercept = mean_y - slope * mean_x
        yy, mm = months[-1]
        for i in range(1, 4):
            mm2 = (mm - 1 + i) % 12 + 1
            yy2 = yy + (mm - 1 + i) // 12
            forecast_labels.append(date(yy2, mm2, 1).strftime("%b %Y"))
            forecast_values.append(str(money(max(0.0, slope * (len(xs) - 1 + i) + intercept))))
    revenue_forecast = {
        "labels": labels + forecast_labels,
        "historical": [str(v) for v in historical],
        "forecast": [None] * len(historical) + forecast_values,
        "method": "linear trend of the last six months" if forecast_values else None,
        "note": None if forecast_values else "At least three months of collections are needed before a projection is shown.",
    }

    # 2. Admissions per month and the current roll.
    rows = await db.execute(
        text(
            """
            SELECT to_char(created_at AT TIME ZONE 'UTC' + INTERVAL '5 hours', 'YYYY-MM') AS ym, COUNT(*) AS n
            FROM students
            WHERE school_id = CAST(:school AS UUID) AND created_at >= :since
            GROUP BY 1
            """
        ),
        {"school": str(school_id), "since": first},
    )
    admissions = {r["ym"]: int(r["n"]) for r in rows.mappings()}
    roll = (
        await db.execute(
            text(
                "SELECT COUNT(*) FROM students WHERE school_id = CAST(:school AS UUID) "
                "AND COALESCE(status, 'active') = 'active'"
            ),
            {"school": str(school_id)},
        )
    ).scalar() or 0
    enrollment_forecast = {
        "labels": labels,
        "data": [admissions.get(f"{yy:04d}-{mm:02d}", 0) for yy, mm in months],
        "series": "New admissions",
        "current_roll": int(roll),
    }

    # 3. Teachers by tenure, from their joining date.
    teachers = (
        await db.execute(
            select(TeacherProfile).where(TeacherProfile.school_id == school_id, TeacherProfile.is_active.is_(True))
        )
    ).scalars().all()
    risks = []
    unknown_tenure = 0
    for t in teachers:
        if not t.joining_date:
            unknown_tenure += 1
            continue
        years = (today - t.joining_date).days / 365.25
        if years < 1:
            category, score, factor = "high", 60, "In first year at the school"
        elif years < 2:
            category, score, factor = "medium", 35, "Under two years at the school"
        else:
            category, score, factor = "low", 10, "Two years or more at the school"
        risks.append({
            "name": t.full_name,
            "experience": round(years, 1),
            "risk_score": score,
            "category": category,
            "factor": factor,
        })
    risks.sort(key=lambda r: -r["risk_score"])
    teacher_risk_scores = {
        "risks": risks,
        "average_score": round(sum(r["risk_score"] for r in risks) / len(risks)) if risks else None,
        "basis": "Tenure at this school, from each teacher's joining date",
        "unknown_tenure": unknown_tenure,
    }

    # 4. The tone of parents' messages, by a stated keyword rule.
    complaints = (await db.execute(select(Complaint).where(Complaint.school_id == school_id))).scalars().all()
    positive_words = ("good", "excellent", "great", "thank", "happy", "satisfied", "shukriya", "acha")
    negative_words = ("bad", "poor", "slow", "worst", "unhappy", "angry", "delay", "broken", "complaint", "bura")
    pos = neg = neu = 0
    for c in complaints:
        body = f"{c.subject or ''} {c.content or ''}".lower()
        if any(w in body for w in negative_words):
            neg += 1
        elif any(w in body for w in positive_words):
            pos += 1
        else:
            neu += 1
    total = pos + neg + neu
    parent_sentiments = {
        "positive": round(pos * 100 / total) if total else None,
        "negative": round(neg * 100 / total) if total else None,
        "neutral": (100 - round(pos * 100 / total) - round(neg * 100 / total)) if total else None,
        "total_responses": total,
        "basis": "Keywords in messages parents sent to the school",
    }

    # 5. The school's own rates. No outside benchmark is available, so none is shown.
    recovery = (
        await db.execute(
            text(
                """
                SELECT SUM(total_amount) AS billed, SUM(paid_amount) AS paid
                FROM fee_invoices
                WHERE school_id = CAST(:school AS UUID) AND status <> 'cancelled' AND status <> 'draft'
                  AND due_date >= :year_start AND due_date <= :today
                """
            ),
            {"school": str(school_id), "year_start": date(today.year if today.month >= 7 else today.year - 1, 7, 1), "today": today},
        )
    ).mappings().first()
    billed, paid = (recovery["billed"] if recovery else None), (recovery["paid"] if recovery else None)
    attendance = (
        await db.execute(
            text(
                """
                SELECT COUNT(*) FILTER (WHERE e.status IN ('present', 'late')) AS present, COUNT(*) AS total
                FROM attendance_entries e
                JOIN attendance_sessions s ON s.id = e.session_id
                WHERE s.school_id = CAST(:school AS UUID) AND s.session_date >= :since
                """
            ),
            {"school": str(school_id), "since": today - timedelta(days=30)},
        )
    ).mappings().first()
    resolved = sum(1 for c in complaints if (c.status or "") in ("resolved", "closed"))

    def pct(a, b):
        return float(money(Decimal(a) * 100 / Decimal(b))) if a is not None and b else None

    benchmark_scores = {
        "labels": ["Fee recovery (this fiscal year)", "Attendance (last 30 days)", "Messages resolved"],
        "school": [
            pct(paid, billed),
            pct(attendance["present"] if attendance else None, attendance["total"] if attendance else None),
            pct(resolved, len(complaints)),
        ],
        "provincial_average": None,
    }

    cached_insight = OwnerAiInsight(
        school_id=school_id,
        revenue_forecast=revenue_forecast,
        enrollment_forecast=enrollment_forecast,
        teacher_risk_scores=teacher_risk_scores,
        parent_sentiments=parent_sentiments,
        benchmark_scores=benchmark_scores,
    )
    db.add(cached_insight)
    await db.flush()
    await db.commit()
    await db.refresh(cached_insight)
    return cached_insight


from fastapi.responses import StreamingResponse
from pydantic import BaseModel

class OwnerAiAdvisorRequest(BaseModel):
    message: str
    schoolId: str
    schoolData: Optional[dict] = None

@router.post("/ai-advisor")
async def owner_ai_advisor(
    body: OwnerAiAdvisorRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id or str(current_user.school_id) != body.schoolId:
        raise ForbiddenError("No school context or cross-tenant access denied")

    sd = body.schoolData or {}
    context_data = f"""
Current School Performance Data:
- Total Students: {sd.get('totalStudents', 0)} (Active: {sd.get('activeStudents', 0)})
- Revenue MTD: {sd.get('revenueMtd', 0)} | Revenue YTD: {sd.get('revenueYtd', 0)}
- Expenses MTD: {sd.get('expensesMtd', 0)} | Expenses YTD: {sd.get('expensesYtd', 0)}
- Profit MTD: {sd.get('profit', 0)} | Margin: {sd.get('profitMargin', 0)}%
- Attendance Rate (7 days): {sd.get('attendanceRate', 0)}%
- Academic Performance Index: {sd.get('academicIndex', 0)}
- Open Leads: {sd.get('openLeads', 0)} | Conversion Rate: {sd.get('conversionRate', 0)}%
- Dropout Risk: {sd.get('dropoutRisk', 0)}%
- Total Teachers: {sd.get('totalTeachers', 0)} | Total Staff: {sd.get('totalStaff', 0)}
- Pending Invoices: {sd.get('pendingInvoices', 0)} | Unpaid Amount: {sd.get('unpaidAmount', 0)}
- Fee Collection Rate: {sd.get('collectionRate', 0)}%
"""

    system_prompt = f"""You are an elite AI Strategy Advisor for school owners and educational institution CEOs. You analyze real institutional data and provide strategic, actionable recommendations.

{context_data}

Your role:
1. Analyze the provided metrics and identify patterns, risks, and opportunities
2. Provide strategic recommendations backed by data
3. Compare against industry benchmarks (typical school profit margins: 10-20%, attendance targets: 95%+, collection rates: 90%+)
4. Suggest specific actions with expected outcomes
5. Flag urgent issues that need immediate attention

Guidelines:
- Be concise but insightful
- Use specific numbers from the data
- Prioritize recommendations by impact
- Consider both financial and educational outcomes
- Think like a management consultant

Always structure responses clearly with actionable insights. Never be generic - use the actual data provided."""

    from app.utils.ai_service import OllamaAIService
    
    async def sse_generator():
        async for chunk in OllamaAIService.stream_completion(
            system_prompt=system_prompt,
            user_message=body.message,
            context_messages=[]
        ):
            yield chunk

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
