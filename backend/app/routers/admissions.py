"""
Admissions router: applications, documents, status changes, convert-to-student.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select
from datetime import datetime, timezone

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.admissions import AdmissionApplication, AdmissionApplicationDocument
from app.models.people import Student
from app.schemas import (
    AdmissionCreate, AdmissionStatusUpdate, AdmissionOut,
    StudentOut, MessageResponse,
)
from app.utils.pagination import PaginatedResponse
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/admissions", tags=["Admissions"])


@router.get("", response_model=PaginatedResponse[AdmissionOut])
async def list_applications(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    query = select(AdmissionApplication).where(
        AdmissionApplication.school_id == current_user.school_id
    )

    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                AdmissionApplication.first_name.ilike(like),
                AdmissionApplication.last_name.ilike(like),
                AdmissionApplication.parent_phone.ilike(like),
                AdmissionApplication.registration_number.ilike(like),
            )
        )
    if status_filter:
        query = query.where(AdmissionApplication.status == status_filter)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(AdmissionApplication.created_at.desc()).offset(offset).limit(page_size)
    )
    apps = result.scalars().all()
    return PaginatedResponse.create(apps, total, page, page_size)


@router.post("", response_model=AdmissionOut, status_code=status.HTTP_201_CREATED)
async def create_application(body: AdmissionCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    app = AdmissionApplication(
        school_id=current_user.school_id,
        submitted_by_user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.get("/{application_id}", response_model=AdmissionOut)
async def get_application(application_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AdmissionApplication).where(AdmissionApplication.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise NotFoundError("Application", str(application_id))
    return app


@router.patch("/{application_id}/status", response_model=AdmissionOut)
async def update_status(
    application_id: UUID,
    body: AdmissionStatusUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    result = await db.execute(
        select(AdmissionApplication).where(AdmissionApplication.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise NotFoundError("Application", str(application_id))

    app.status = body.status
    app.decision_notes = body.decision_notes
    app.reviewed_by_user_id = current_user.id
    app.reviewed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(app)
    return app


@router.post("/{application_id}/convert", response_model=StudentOut)
async def convert_to_student(application_id: UUID, current_user: CurrentUser, db: DbSession):
    """Convert an approved admission application into a student record."""
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    result = await db.execute(
        select(AdmissionApplication).where(AdmissionApplication.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise NotFoundError("Application", str(application_id))
    if app.status != "approved":
        raise ForbiddenError("Only approved applications can be converted")

    # Create the student record
    student = Student(
        school_id=app.school_id,
        first_name=app.first_name,
        last_name=app.last_name,
        date_of_birth=app.date_of_birth,
        gender=app.gender,
        photo_url=app.photo_url,
        registration_number=app.registration_number,
        roll_number=app.roll_number,
        section_id=app.applying_for_section_id,
        status="active",
    )
    db.add(student)
    await db.flush()

    # Mark application as converted
    app.status = "converted"
    app.converted_student_id = student.id
    app.converted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(student)
    return student


@router.get("/{application_id}/documents")
async def list_documents(application_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AdmissionApplicationDocument).where(
            AdmissionApplicationDocument.application_id == application_id
        )
    )
    return result.scalars().all()
