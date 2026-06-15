"""
Academic router: classes, sections, subjects, timetable, holidays.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select, delete, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.academic import (
    AcademicClass, ClassSection, Subject,
    ClassSectionSubject, TimetableSlot, Holiday,
)
from app.schemas import (
    ClassCreate, ClassOut,
    SectionCreate, SectionOut,
    SubjectCreate, SubjectOut,
    TimetableSlotCreate, TimetableSlotOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/academic", tags=["Academic"])


# ─── CLASSES ──────────────────────────────────────────────────────────────────

@router.get("/classes", response_model=List[ClassOut])
async def list_classes(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(AcademicClass)
        .where(AcademicClass.school_id == current_user.school_id)
        .order_by(AcademicClass.grade_level, AcademicClass.name)
    )
    return result.scalars().all()


@router.post("/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
async def create_class(body: ClassCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    cls = AcademicClass(school_id=current_user.school_id, **body.model_dump())
    db.add(cls)
    await db.flush()
    await db.refresh(cls)
    return cls


@router.patch("/classes/{class_id}", response_model=ClassOut)
async def update_class(class_id: UUID, body: ClassCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(AcademicClass).where(AcademicClass.id == class_id))
    cls = result.scalar_one_or_none()
    if not cls:
        raise NotFoundError("Class", str(class_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cls, field, value)
    await db.flush()
    await db.refresh(cls)
    return cls


@router.delete("/classes/{class_id}", response_model=MessageResponse)
async def delete_class(class_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(AcademicClass).where(AcademicClass.id == class_id))
    cls = result.scalar_one_or_none()
    if not cls:
        raise NotFoundError("Class", str(class_id))
    await db.delete(cls)
    return MessageResponse(message="Class deleted")


# ─── SECTIONS ─────────────────────────────────────────────────────────────────

@router.get("/sections", response_model=List[SectionOut])
async def list_sections(
    current_user: CurrentUser,
    db: DbSession,
    class_id: UUID | None = None,
    campus_id: UUID | None = None,
):
    if not current_user.school_id:
        return []
    query = select(ClassSection).where(ClassSection.school_id == current_user.school_id)
    if class_id:
        query = query.where(ClassSection.class_id == class_id)
    if campus_id:
        query = query.where(ClassSection.campus_id == campus_id)
    result = await db.execute(query.order_by(ClassSection.name))
    return result.scalars().all()


@router.post("/sections", response_model=SectionOut, status_code=status.HTTP_201_CREATED)
async def create_section(body: SectionCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    section = ClassSection(school_id=current_user.school_id, **body.model_dump())
    db.add(section)
    await db.flush()
    await db.refresh(section)
    return section


@router.get("/sections/{section_id}", response_model=SectionOut)
async def get_section(section_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(ClassSection).where(ClassSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise NotFoundError("Section", str(section_id))
    return section


@router.patch("/sections/{section_id}", response_model=SectionOut)
async def update_section(section_id: UUID, body: SectionCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(ClassSection).where(ClassSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise NotFoundError("Section", str(section_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(section, field, value)
    await db.flush()
    await db.refresh(section)
    return section


@router.delete("/sections/{section_id}", response_model=MessageResponse)
async def delete_section(section_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(ClassSection).where(ClassSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise NotFoundError("Section", str(section_id))
    await db.delete(section)
    return MessageResponse(message="Section deleted")


# ─── SUBJECTS ─────────────────────────────────────────────────────────────────

@router.get("/subjects", response_model=List[SubjectOut])
async def list_subjects(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(Subject).where(Subject.school_id == current_user.school_id).order_by(Subject.name)
    )
    return result.scalars().all()


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def create_subject(body: SubjectCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    subject = Subject(school_id=current_user.school_id, **body.model_dump())
    db.add(subject)
    await db.flush()
    await db.refresh(subject)
    return subject


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
async def update_subject(subject_id: UUID, body: SubjectCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if not subject:
        raise NotFoundError("Subject", str(subject_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(subject, field, value)
    await db.flush()
    await db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}", response_model=MessageResponse)
async def delete_subject(subject_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if not subject:
        raise NotFoundError("Subject", str(subject_id))
    await db.delete(subject)
    return MessageResponse(message="Subject deleted")


# ─── TIMETABLE ────────────────────────────────────────────────────────────────

@router.get("/timetable", response_model=List[TimetableSlotOut])
async def get_timetable(
    current_user: CurrentUser,
    db: DbSession,
    section_id: UUID | None = None,
    campus_id: UUID | None = None,
    teacher_user_id: UUID | None = None,
):
    if not current_user.school_id:
        return []
    query = select(TimetableSlot).where(
        TimetableSlot.school_id == current_user.school_id,
        TimetableSlot.is_active == True,
    )
    if section_id:
        query = query.where(TimetableSlot.class_section_id == section_id)
    if campus_id:
        query = query.where(TimetableSlot.campus_id == campus_id)
    if teacher_user_id:
        query = query.where(TimetableSlot.teacher_user_id == teacher_user_id)
    result = await db.execute(query.order_by(TimetableSlot.day_of_week, TimetableSlot.start_time))
    return result.scalars().all()


@router.post("/timetable", response_model=TimetableSlotOut, status_code=status.HTTP_201_CREATED)
async def create_timetable_slot(body: TimetableSlotCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    slot = TimetableSlot(school_id=current_user.school_id, **body.model_dump())
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    return slot


@router.delete("/timetable/{slot_id}", response_model=MessageResponse)
async def delete_timetable_slot(slot_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(TimetableSlot).where(TimetableSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFoundError("Timetable slot", str(slot_id))
    await db.delete(slot)
    return MessageResponse(message="Timetable slot deleted")


@router.get("/periods")
async def get_timetable_periods(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        sql = """
            SELECT id, label, sort_order, start_time, end_time, is_break FROM timetable_periods
            WHERE school_id = :school_id
            ORDER BY sort_order ASC
        """
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "id": str(r[0]),
                "label": r[1],
                "sort_order": r[2],
                "start_time": str(r[3]) if r[3] else None,
                "end_time": str(r[4]) if r[4] else None,
                "is_break": r[5] or False,
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.academic").warning(f"Error querying timetable periods: {e}")
        # Return mock periods
        import uuid
        return [
            {"id": str(uuid.UUID("11111111-1111-1111-1111-111111111111")), "label": "Period 1", "sort_order": 1, "start_time": "08:00:00", "end_time": "08:45:00", "is_break": False},
            {"id": str(uuid.UUID("22222222-2222-2222-2222-222222222222")), "label": "Period 2", "sort_order": 2, "start_time": "08:45:00", "end_time": "09:30:00", "is_break": False},
            {"id": str(uuid.UUID("33333333-3333-3333-3333-333333333333")), "label": "Break", "sort_order": 3, "start_time": "09:30:00", "end_time": "10:00:00", "is_break": True},
            {"id": str(uuid.UUID("44444444-4444-4444-4444-444444444444")), "label": "Period 3", "sort_order": 4, "start_time": "10:00:00", "end_time": "10:45:00", "is_break": False},
        ]


# ─── HOLIDAYS ─────────────────────────────────────────────────────────────────

@router.get("/holidays")
async def list_holidays(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(Holiday).where(Holiday.school_id == current_user.school_id).order_by(Holiday.start_date)
    )
    return result.scalars().all()


@router.post("/holidays", status_code=status.HTTP_201_CREATED)
async def create_holiday(body: dict, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    holiday = Holiday(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **{k: v for k, v in body.items() if k in ["title", "description", "start_date", "end_date", "holiday_type", "campus_id"]},
    )
    db.add(holiday)
    await db.flush()
    await db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_id}", response_model=MessageResponse)
async def delete_holiday(holiday_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Holiday).where(Holiday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise NotFoundError("Holiday", str(holiday_id))
    await db.delete(holiday)
    return MessageResponse(message="Holiday deleted")


# ─── SECTION SUBJECTS ─────────────────────────────────────────────────────────
from pydantic import BaseModel

class SectionSubjectCreate(BaseModel):
    class_section_id: UUID
    subject_id: UUID

class SectionSubjectOut(BaseModel):
    id: UUID
    school_id: UUID
    class_section_id: UUID
    subject_id: UUID

    model_config = {"from_attributes": True}

@router.get("/section-subjects", response_model=List[SectionSubjectOut])
async def list_section_subjects(
    current_user: CurrentUser,
    db: DbSession,
    class_section_id: Optional[UUID] = None,
):
    if not current_user.school_id:
        return []
    query = select(ClassSectionSubject).where(ClassSectionSubject.school_id == current_user.school_id)
    if class_section_id:
        query = query.where(ClassSectionSubject.class_section_id == class_section_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/section-subjects", response_model=SectionSubjectOut, status_code=status.HTTP_201_CREATED)
async def create_section_subject(
    body: SectionSubjectCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    
    # Check if duplicate
    dup_res = await db.execute(
        select(ClassSectionSubject).where(
            ClassSectionSubject.school_id == current_user.school_id,
            ClassSectionSubject.class_section_id == body.class_section_id,
            ClassSectionSubject.subject_id == body.subject_id
        )
    )
    dup = dup_res.scalar_one_or_none()
    if dup:
        return dup

    link = ClassSectionSubject(
        school_id=current_user.school_id,
        class_section_id=body.class_section_id,
        subject_id=body.subject_id
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link

@router.delete("/section-subjects/{link_id}", response_model=MessageResponse)
async def delete_section_subject(link_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    result = await db.execute(
        select(ClassSectionSubject).where(
            ClassSectionSubject.id == link_id,
            ClassSectionSubject.school_id == current_user.school_id
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise NotFoundError("SectionSubject link", str(link_id))
    await db.delete(link)
    return MessageResponse(message="Subject unassigned from section successfully")

@router.delete("/section-subjects/by-subject/{subject_id}", response_model=MessageResponse)
async def delete_section_subjects_by_subject(subject_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    await db.execute(
        delete(ClassSectionSubject).where(
            ClassSectionSubject.school_id == current_user.school_id,
            ClassSectionSubject.subject_id == subject_id
        )
    )
    return MessageResponse(message="Subject assignments removed successfully")
