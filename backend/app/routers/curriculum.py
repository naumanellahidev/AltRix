"""
Curriculum router: presets, learning outcomes, assessment criteria, strand assessments, grade boundaries.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status, Request
from sqlalchemy import select, func, or_

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.curriculum import (
    CurriculumPreset, LearningOutcome, AssessmentLOMapping,
    AssessmentCriteria, CriteriaScore, StrandAssessment, GradeBoundary,
)
from app.schemas import (
    CurriculumPresetOut,
    LearningOutcomeCreate, LearningOutcomeOut,
    AssessmentCriteriaCreate, AssessmentCriteriaOut,
    CriteriaScoreCreate, CriteriaScoreOut,
    StrandAssessmentCreate, StrandAssessmentOut,
    GradeBoundaryCreate, GradeBoundaryOut,
    AssessmentLOMappingCreate, AssessmentLOMappingOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/curriculum", tags=["Curriculum"])


# ─── PRESETS ──────────────────────────────────────────────────────────────────

@router.get("/presets", response_model=List[CurriculumPresetOut])
async def list_presets(current_user: CurrentUser, db: DbSession):
    """List available curriculum presets (global + school-specific)."""
    if not current_user.school_id:
        return []
    try:
        result = await db.execute(
            select(CurriculumPreset)
            .where(
                or_(
                    CurriculumPreset.is_global == True,
                    CurriculumPreset.school_id == current_user.school_id,
                ),
                CurriculumPreset.is_active == True,
            )
            .order_by(CurriculumPreset.is_global.desc(), CurriculumPreset.name)
        )
        return list(result.scalars().all())
    except Exception:
        return []


@router.get("/presets/{preset_id}", response_model=CurriculumPresetOut)
async def get_preset(preset_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(CurriculumPreset).where(CurriculumPreset.id == preset_id))
    p = result.scalar_one_or_none()
    if not p:
        raise NotFoundError("Preset", str(preset_id))
    return p


@router.post("/presets", response_model=CurriculumPresetOut, status_code=status.HTTP_201_CREATED)
async def create_preset(body: dict, current_user: CurrentUser, db: DbSession):
    """Create a custom curriculum preset for the school."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    preset = CurriculumPreset(
        school_id=current_user.school_id,
        name=body.get("name", "Custom"),
        code=body.get("code", "custom"),
        description=body.get("description"),
        is_global=False,
        grade_structure=body.get("grade_structure"),
        strand_definitions=body.get("strand_definitions"),
    )
    db.add(preset)
    await db.flush()
    await db.refresh(preset)
    return preset


# ─── LEARNING OUTCOMES ────────────────────────────────────────────────────────

@router.get("/learning-outcomes", response_model=List[LearningOutcomeOut])
async def list_learning_outcomes(
    current_user: CurrentUser,
    db: DbSession,
    subject_id: Optional[UUID] = Query(None),
    strand: Optional[str] = Query(None),
    grade_level: Optional[int] = Query(None),
    preset_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(LearningOutcome).where(
        LearningOutcome.school_id == current_user.school_id,
        LearningOutcome.is_active == True,
    )
    if subject_id:
        query = query.where(LearningOutcome.subject_id == subject_id)
    if strand:
        query = query.where(LearningOutcome.strand == strand)
    if grade_level:
        query = query.where(LearningOutcome.grade_level == grade_level)
    if preset_id:
        query = query.where(LearningOutcome.preset_id == preset_id)

    result = await db.execute(query.order_by(LearningOutcome.strand, LearningOutcome.sort_order))
    return result.scalars().all()


@router.post("/learning-outcomes", response_model=LearningOutcomeOut, status_code=status.HTTP_201_CREATED)
async def create_learning_outcome(body: LearningOutcomeCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()

    lo = LearningOutcome(
        school_id=current_user.school_id,
        **body.model_dump(),
    )
    db.add(lo)
    await db.flush()
    await db.refresh(lo)
    return lo


@router.post("/learning-outcomes/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_learning_outcomes(
    outcomes: List[LearningOutcomeCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """Bulk import learning outcomes."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    created = []
    for body in outcomes:
        lo = LearningOutcome(
            school_id=current_user.school_id,
            **body.model_dump(),
        )
        db.add(lo)
        created.append(lo)

    await db.flush()
    for lo in created:
        await db.refresh(lo)
    return {"message": f"Created {len(created)} learning outcomes", "count": len(created)}


@router.patch("/learning-outcomes/{lo_id}", response_model=LearningOutcomeOut)
async def update_learning_outcome(lo_id: UUID, body: LearningOutcomeCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(LearningOutcome).where(LearningOutcome.id == lo_id))
    lo = result.scalar_one_or_none()
    if not lo:
        raise NotFoundError("Learning Outcome", str(lo_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, lo.school_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(lo, field, value)
    await db.flush()
    await db.refresh(lo)
    return lo


@router.delete("/learning-outcomes/{lo_id}", response_model=MessageResponse)
async def delete_learning_outcome(lo_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(LearningOutcome).where(LearningOutcome.id == lo_id))
    lo = result.scalar_one_or_none()
    if not lo:
        raise NotFoundError("Learning Outcome", str(lo_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, lo.school_id)
    lo.is_active = False
    await db.flush()
    return MessageResponse(message="Learning outcome deactivated")


# ─── STRANDS ──────────────────────────────────────────────────────────────────

@router.get("/strands/{subject_id}")
async def list_strands(subject_id: UUID, current_user: CurrentUser, db: DbSession):
    """List unique strands for a subject from learning outcomes."""
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(LearningOutcome.strand, func.count(LearningOutcome.id))
        .where(
            LearningOutcome.school_id == current_user.school_id,
            LearningOutcome.subject_id == subject_id,
            LearningOutcome.is_active == True,
            LearningOutcome.strand.isnot(None),
        )
        .group_by(LearningOutcome.strand)
        .order_by(LearningOutcome.strand)
    )
    return [{"strand": row[0], "outcome_count": row[1]} for row in result.fetchall()]


# ─── ASSESSMENT-LO MAPPINGS ──────────────────────────────────────────────────

@router.post("/lo-mappings", response_model=List[AssessmentLOMappingOut], status_code=status.HTTP_201_CREATED)
async def create_lo_mappings(
    mappings: List[AssessmentLOMappingCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()

    created = []
    for m in mappings:
        mapping = AssessmentLOMapping(
            school_id=current_user.school_id,
            assessment_id=m.assessment_id,
            learning_outcome_id=m.learning_outcome_id,
            weightage=m.weightage,
        )
        db.add(mapping)
        created.append(mapping)

    await db.flush()
    for mapping in created:
        await db.refresh(mapping)
    return created


@router.get("/lo-mappings/{assessment_id}", response_model=List[AssessmentLOMappingOut])
async def list_lo_mappings(assessment_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AssessmentLOMapping).where(AssessmentLOMapping.assessment_id == assessment_id)
    )
    return result.scalars().all()


# ─── ASSESSMENT CRITERIA (RUBRICS) ────────────────────────────────────────────

@router.post("/assessment-criteria", response_model=AssessmentCriteriaOut, status_code=status.HTTP_201_CREATED)
async def create_criteria(body: AssessmentCriteriaCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()

    criteria = AssessmentCriteria(
        school_id=current_user.school_id,
        **body.model_dump(exclude_none=True),
    )
    db.add(criteria)
    await db.flush()
    await db.refresh(criteria)
    return criteria


@router.get("/assessment-criteria", response_model=List[AssessmentCriteriaOut])
async def list_criteria(
    current_user: CurrentUser,
    db: DbSession,
    assessment_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(AssessmentCriteria).where(AssessmentCriteria.school_id == current_user.school_id)
    if assessment_id:
        query = query.where(AssessmentCriteria.assessment_id == assessment_id)
    result = await db.execute(query.order_by(AssessmentCriteria.sort_order))
    return result.scalars().all()


@router.post("/criteria-scores", response_model=List[CriteriaScoreOut], status_code=status.HTTP_201_CREATED)
async def record_criteria_scores(
    scores: List[CriteriaScoreCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """Record student scores for criteria (rubric-based assessment)."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    created = []
    for s in scores:
        score = CriteriaScore(
            school_id=current_user.school_id,
            criteria_id=s.criteria_id,
            student_id=s.student_id,
            score=s.score,
            level_achieved=s.level_achieved,
            teacher_feedback=s.teacher_feedback,
            scored_by=current_user.id,
        )
        db.add(score)
        created.append(score)
    await db.flush()
    for sc in created:
        await db.refresh(sc)
    return created


@router.get("/criteria-scores/student/{student_id}", response_model=List[CriteriaScoreOut])
async def get_student_criteria_scores(student_id: UUID, current_user: CurrentUser, db: DbSession):
    from app.utils.security import get_allowed_student_ids
    allowed = await get_allowed_student_ids(current_user, db)
    if allowed is not None and student_id not in allowed:
        raise ForbiddenError("Permission denied")
    result = await db.execute(
        select(CriteriaScore).where(CriteriaScore.student_id == student_id)
        .order_by(CriteriaScore.created_at.desc())
    )
    return result.scalars().all()


# ─── STRAND ASSESSMENTS ──────────────────────────────────────────────────────

@router.post("/strand-assessments", response_model=List[StrandAssessmentOut], status_code=status.HTTP_201_CREATED)
async def record_strand_assessments(
    assessments: List[StrandAssessmentCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()

    created = []
    for a in assessments:
        pct = round(a.score / a.max_score * 100, 2) if a.score is not None and a.max_score else None
        sa = StrandAssessment(
            school_id=current_user.school_id,
            student_id=a.student_id,
            subject_id=a.subject_id,
            strand_name=a.strand_name,
            sub_strand_name=a.sub_strand_name,
            academic_year=a.academic_year,
            term_label=a.term_label,
            score=a.score,
            max_score=a.max_score,
            percentage=pct,
            level=a.level,
            assessed_by=current_user.id,
        )
        db.add(sa)
        created.append(sa)
    await db.flush()
    for sa in created:
        await db.refresh(sa)
    return created


@router.get("/strand-assessments/student/{student_id}", response_model=List[StrandAssessmentOut])
async def get_student_strand_assessments(
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    subject_id: Optional[UUID] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    from app.utils.security import get_allowed_student_ids
    allowed = await get_allowed_student_ids(current_user, db)
    if allowed is not None and student_id not in allowed:
        raise ForbiddenError("Permission denied")

    query = select(StrandAssessment).where(StrandAssessment.student_id == student_id)
    if subject_id:
        query = query.where(StrandAssessment.subject_id == subject_id)
    if academic_year:
        query = query.where(StrandAssessment.academic_year == academic_year)

    result = await db.execute(query.order_by(StrandAssessment.strand_name, StrandAssessment.created_at))
    return result.scalars().all()


# ─── GRADE BOUNDARIES ────────────────────────────────────────────────────────

@router.get("/grade-boundaries", response_model=List[GradeBoundaryOut])
async def list_grade_boundaries(
    current_user: CurrentUser,
    db: DbSession,
    subject_id: Optional[UUID] = Query(None),
    preset_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(GradeBoundary).where(GradeBoundary.school_id == current_user.school_id)
    if subject_id:
        query = query.where(GradeBoundary.subject_id == subject_id)
    if preset_id:
        query = query.where(GradeBoundary.preset_id == preset_id)
    try:
        result = await db.execute(query.order_by(GradeBoundary.sort_order, GradeBoundary.min_percentage.desc()))
        return list(result.scalars().all())
    except Exception:
        return []


@router.post("/grade-boundaries", response_model=List[GradeBoundaryOut], status_code=status.HTTP_201_CREATED)
async def upsert_grade_boundaries(
    boundaries: List[GradeBoundaryCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """Bulk upsert grade boundaries for a subject/preset."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    created = []
    for i, b in enumerate(boundaries):
        gb = GradeBoundary(
            school_id=current_user.school_id,
            subject_id=b.subject_id,
            preset_id=b.preset_id,
            label=b.label,
            min_percentage=b.min_percentage,
            max_percentage=b.max_percentage,
            gpa_equivalent=b.gpa_equivalent,
            description=b.description,
            is_passing=b.is_passing if b.is_passing is not None else True,
            sort_order=i,
        )
        db.add(gb)
        created.append(gb)
    await db.flush()
    for gb in created:
        await db.refresh(gb)
    return created
