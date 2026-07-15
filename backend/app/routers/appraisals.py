"""
Staff Appraisals and KPIs router
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date

from fastapi import APIRouter, Query, HTTPException, status
from sqlalchemy import select, or_, and_, func

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.appraisals import StaffKpi, StaffAppraisal, Feedback360, PerformanceImprovementPlan
from app.models.misc import HrPayroll
from app.schemas import (
    StaffKpiOut,
    StaffAppraisalCreate, StaffAppraisalOut,
    Feedback360Create, Feedback360Out,
    PerformanceImprovementPlanCreate, PerformanceImprovementPlanOut,
    MessageResponse,
)

router = APIRouter(prefix="/appraisals", tags=["Staff Appraisals & KPIs"])


# ─── KPI SCORES ───────────────────────────────────────────────────────────────

@router.get("/kpis", response_model=List[StaffKpiOut])
async def list_kpis(current_user: CurrentUser, db: DbSession, staff_user_id: Optional[UUID] = None):
    """List staff KPI scores."""
    if not current_user.school_id:
        return []
    query = select(StaffKpi).where(StaffKpi.school_id == current_user.school_id)
    if staff_user_id:
        query = query.where(StaffKpi.staff_user_id == staff_user_id)
    res = await db.execute(query.order_by(StaffKpi.created_at.desc()))
    return res.scalars().all()


@router.post("/kpis", response_model=StaffKpiOut)
async def update_staff_kpi(
    staff_user_id: UUID,
    evaluation_period: str,
    punctuality: float,
    results: float,
    parent_feedback: float,
    co_curricular: float,
    current_user: CurrentUser,
    db: DbSession,
):
    """HODs / Principal records or updates KPI score metrics for staff."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    avg = round((punctuality + results + parent_feedback + co_curricular) / 4.0, 2)
    
    # Upsert KPI
    existing = await db.execute(
        select(StaffKpi).where(
            StaffKpi.school_id == current_user.school_id,
            StaffKpi.staff_user_id == staff_user_id,
            StaffKpi.evaluation_period == evaluation_period,
        )
    )
    kpi = existing.scalar_one_or_none()
    if kpi:
        kpi.punctuality_score = punctuality
        kpi.results_score = results
        kpi.parent_feedback_score = parent_feedback
        kpi.co_curricular_score = co_curricular
        kpi.average_score = avg
    else:
        kpi = StaffKpi(
            school_id=current_user.school_id,
            staff_user_id=staff_user_id,
            punctuality_score=punctuality,
            results_score=results,
            parent_feedback_score=parent_feedback,
            co_curricular_score=co_curricular,
            average_score=avg,
            evaluation_period=evaluation_period,
        )
        db.add(kpi)
        
    await db.flush()
    await db.commit()
    await db.refresh(kpi)
    return kpi


# ─── APPRAISALS WORKFLOW ──────────────────────────────────────────────────────

@router.get("/my-appraisal", response_model=List[StaffAppraisalOut])
async def get_my_appraisals(current_user: CurrentUser, db: DbSession):
    """Teacher views their appraisal requests."""
    if not current_user.school_id:
        return []
    res = await db.execute(
        select(StaffAppraisal).where(
            StaffAppraisal.school_id == current_user.school_id,
            StaffAppraisal.staff_user_id == current_user.id,
        )
    )
    return res.scalars().all()


@router.post("/my-appraisal", response_model=StaffAppraisalOut, status_code=status.HTTP_201_CREATED)
async def submit_self_appraisal(
    body: StaffAppraisalCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Teacher submits self-appraisal form."""
    if not current_user.school_id:
        raise ForbiddenError()
        
    appraisal = StaffAppraisal(
        school_id=current_user.school_id,
        staff_user_id=current_user.id,
        self_appraisal_text=body.self_appraisal_text,
        status="pending_review",
        salary_increment_pct=0.0,
    )
    db.add(appraisal)
    await db.flush()
    await db.commit()
    await db.refresh(appraisal)
    return appraisal


@router.get("/reviews", response_model=List[StaffAppraisalOut])
async def list_appraisals_for_review(current_user: CurrentUser, db: DbSession):
    """List appraisal requests waiting HOD / Principal review."""
    if not current_user.school_id:
         return []
    res = await db.execute(
        select(StaffAppraisal).where(
            StaffAppraisal.school_id == current_user.school_id,
            StaffAppraisal.status == "pending_review"
        )
    )
    return res.scalars().all()


@router.patch("/{appraisal_id}/review", response_model=StaffAppraisalOut)
async def review_appraisal(
    appraisal_id: UUID,
    status_choice: str,  # approved, rejected
    review_comments: Optional[str],
    salary_increment_pct: float,
    current_user: CurrentUser,
    db: DbSession,
):
    """Review and approve/reject staff self-appraisals. Updates payroll salary if approved."""
    res = await db.execute(
        select(StaffAppraisal).where(
            StaffAppraisal.id == appraisal_id,
            StaffAppraisal.school_id == current_user.school_id
        )
    )
    appraisal = res.scalar_one_or_none()
    if not appraisal:
        raise NotFoundError("Appraisal", str(appraisal_id))
        
    appraisal.status = status_choice
    appraisal.review_comments = review_comments
    appraisal.reviewer_user_id = current_user.id
    appraisal.salary_increment_pct = salary_increment_pct
    
    # Trigger payroll base salary update if approved and increment is specified
    if status_choice == "approved" and salary_increment_pct > 0.0:
        pay_res = await db.execute(
            select(HrPayroll).where(
                HrPayroll.school_id == current_user.school_id,
                HrPayroll.user_id == appraisal.staff_user_id,
                HrPayroll.is_active == True,
            )
        )
        payroll = pay_res.scalar_one_or_none()
        if payroll:
            # Apply increment
            payroll.base_salary = round(payroll.base_salary * (1 + salary_increment_pct / 100), 2)
            payroll.notes = f"{payroll.notes or ''} | Increment of {salary_increment_pct}% applied via Appraisal Board approved on {date.today()}"
            
    await db.flush()
    await db.commit()
    await db.refresh(appraisal)
    return appraisal


# ─── 360 FEEDBACK (ANONYMOUS) ─────────────────────────────────────────────────

@router.post("/feedback-360", response_model=Feedback360Out, status_code=status.HTTP_201_CREATED)
async def submit_360_feedback(
    body: Feedback360Create,
    current_user: CurrentUser,
    db: DbSession,
):
    """Student submits anonymous feedback review for a teacher."""
    if not current_user.school_id:
        raise ForbiddenError()
        
    # We save without mapping student_id in the returned schema to ensure complete anonymity
    feedback = Feedback360(
        school_id=current_user.school_id,
        staff_user_id=body.staff_user_id,
        student_id=None,  # fully anonymous
        rating=body.rating,
        comments=body.comments,
    )
    db.add(feedback)
    await db.flush()
    await db.commit()
    await db.refresh(feedback)
    return feedback


@router.get("/feedback-360-summary")
async def get_teacher_feedback_summary(
    staff_user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Aggregate average ratings and list comments for a teacher."""
    if not current_user.school_id:
        raise ForbiddenError()
        
    res = await db.execute(
        select(Feedback360).where(
            Feedback360.school_id == current_user.school_id,
            Feedback360.staff_user_id == staff_user_id
        )
    )
    feedbacks = res.scalars().all()
    if not feedbacks:
         return {"average_rating": 5.0, "total_reviews": 0, "comments": []}
         
    total = sum(f.rating for f in feedbacks)
    avg = round(total / len(feedbacks), 2)
    comments = [f.comments for f in feedbacks if f.comments]
    
    return {
        "average_rating": avg,
        "total_reviews": len(feedbacks),
        "comments": comments,
    }


# ─── PERFORMANCE IMPROVEMENT PLANS (PIP) ──────────────────────────────────────

@router.get("/pip", response_model=List[PerformanceImprovementPlanOut])
async def list_pips(current_user: CurrentUser, db: DbSession, staff_user_id: Optional[UUID] = None):
    """List Performance Improvement Plans (PIPs)."""
    if not current_user.school_id:
        return []
    query = select(PerformanceImprovementPlan).where(PerformanceImprovementPlan.school_id == current_user.school_id)
    if staff_user_id:
        query = query.where(PerformanceImprovementPlan.staff_user_id == staff_user_id)
    res = await db.execute(query.order_by(PerformanceImprovementPlan.deadline_date))
    return res.scalars().all()


@router.post("/pip", response_model=PerformanceImprovementPlanOut, status_code=status.HTTP_201_CREATED)
async def create_pip(
    body: PerformanceImprovementPlanCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """HOD/Principal issues a Performance Improvement Plan (PIP) to a teacher."""
    if not current_user.school_id:
        raise ForbiddenError()
        
    deadline = datetime.strptime(body.deadline_date, "%Y-%m-%d").date()
    pip = PerformanceImprovementPlan(
        school_id=current_user.school_id,
        staff_user_id=body.staff_user_id,
        issues_identified=body.issues_identified,
        action_steps=body.action_steps,
        deadline_date=deadline,
        status="active",
    )
    db.add(pip)
    await db.flush()
    await db.commit()
    await db.refresh(pip)
    return pip


@router.patch("/pip/{pip_id}", response_model=PerformanceImprovementPlanOut)
async def toggle_pip_status(
    pip_id: UUID,
    status_choice: str,  # active, completed, failed
    current_user: CurrentUser,
    db: DbSession,
):
    """Principal marks PIP status."""
    res = await db.execute(
        select(PerformanceImprovementPlan).where(
            PerformanceImprovementPlan.id == pip_id,
            PerformanceImprovementPlan.school_id == current_user.school_id
        )
    )
    pip = res.scalar_one_or_none()
    if not pip:
         raise NotFoundError("PIP", str(pip_id))
         
    pip.status = status_choice
    await db.flush()
    await db.commit()
    await db.refresh(pip)
    return pip
