"""
Admissions router: applications, documents, status changes, convert-to-student.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from datetime import date, datetime, timezone

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.admissions import AdmissionApplication, AdmissionApplicationDocument
from app.models.academic import ClassSection
from app.models.people import Guardian, Student, StudentEnrollment
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

    # Only admissions/academic staff may list all applications
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError("Insufficient permissions to view admission applications")

    query = select(AdmissionApplication).where(
        AdmissionApplication.school_id == current_user.school_id
    )

    if search:
        search = search[:100]  # Limit search input length
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
    from app.utils.security import require_school_match
    require_school_match(current_user, app.school_id)
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
    from app.utils.security import require_school_match
    require_school_match(current_user, app.school_id)
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
    from app.utils.security import require_school_match
    require_school_match(current_user, app.school_id)
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
        status="active",
    )
    db.add(student)
    await db.flush()

    # The enrolment is what puts the child on a register.
    #
    # This used to pass `section_id=` to the Student constructor.
    # `Student.section_id` is a read-only view over the enrolments whose setter
    # does nothing, so the section the office chose was discarded without a
    # word and the child was created belonging to no class at all - missing
    # from every register, report card run and seating plan.
    if app.applying_for_section_id:
        db.add(StudentEnrollment(
            school_id=app.school_id,
            student_id=student.id,
            class_section_id=app.applying_for_section_id,
            start_date=date.today(),
        ))
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
    # Verify the application belongs to user's school first
    app_res = await db.execute(
        select(AdmissionApplication).where(AdmissionApplication.id == application_id)
    )
    app = app_res.scalar_one_or_none()
    if not app:
        raise NotFoundError("Application", str(application_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, app.school_id)
    result = await db.execute(
        select(AdmissionApplicationDocument).where(
            AdmissionApplicationDocument.application_id == application_id
        )
    )
    return result.scalars().all()


class BulkImportRow(BaseModel):
    """One line of the school's register, already checked in the browser."""

    line: int = Field(ge=1, description="The row number in the sheet, for reporting back")
    class_section_id: Optional[UUID] = None
    values: Dict[str, Any] = Field(default_factory=dict)


class BulkImportRequest(BaseModel):
    rows: List[BulkImportRow] = Field(min_length=1, max_length=2000)
    #: Check everything and write nothing. The screen uses this to show the
    #: office exactly what would happen before it happens.
    dry_run: bool = False


class BulkImportRowResult(BaseModel):
    line: int
    ok: bool
    student_id: Optional[UUID] = None
    name: str
    reason: Optional[str] = None


class BulkImportResult(BaseModel):
    dry_run: bool
    created: int
    failed: int
    rows: List[BulkImportRowResult]


#: What a row may set on a student. Anything else in `values` is ignored
#: rather than trusted, so a crafted request cannot reach another column.
_STUDENT_FIELDS = {
    "first_name", "last_name", "registration_number", "roll_number",
    "date_of_birth", "gender", "address", "phone", "emergency_contact",
    "admission_date", "notes", "blood_group",
}
_TEXT_LIMIT = 500


@router.post("/bulk-import", response_model=BulkImportResult)
async def bulk_import_students(
    body: BulkImportRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Bring a paper register into the app, one sheet at a time.

    A school joining AltRix has its students in a ledger. Typing four hundred
    children in one at a time is why a school gives up on the first afternoon.

    Every row is written in its own savepoint, so one bad line does not cost
    the school the other three hundred and ninety-nine, and the result says
    exactly which lines landed and which did not. `dry_run` does all of the
    checking and none of the writing.
    """
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError("Insufficient permissions to import students")
    if not current_user.school_id:
        raise ForbiddenError("No school in context")

    school_id = current_user.school_id

    # Every section named must belong to this school. Checked once, here,
    # rather than trusted from the browser.
    wanted = {r.class_section_id for r in body.rows if r.class_section_id}
    allowed: set = set()
    if wanted:
        found = await db.execute(
            select(ClassSection.id).where(
                ClassSection.id.in_(wanted), ClassSection.school_id == school_id
            )
        )
        allowed = {row[0] for row in found.all()}

    def clean(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text[:_TEXT_LIMIT] if text else None

    results: List[BulkImportRowResult] = []
    created = 0

    for row in body.rows:
        values = row.values or {}
        first = clean(values.get("first_name"))
        last = clean(values.get("last_name"))
        name = " ".join(p for p in (first, last) if p) or f"row {row.line}"

        if not first:
            results.append(BulkImportRowResult(
                line=row.line, ok=False, name=name, reason="No first name on this row",
            ))
            continue
        if row.class_section_id and row.class_section_id not in allowed:
            results.append(BulkImportRowResult(
                line=row.line, ok=False, name=name,
                reason="That class section does not belong to this school",
            ))
            continue

        try:
            async with db.begin_nested():
                student = Student(
                    school_id=school_id,
                    status="active",
                    **{f: clean(values.get(f)) for f in _STUDENT_FIELDS if f != "first_name"},
                    first_name=first,
                )
                db.add(student)
                await db.flush()

                if row.class_section_id:
                    db.add(StudentEnrollment(
                        school_id=school_id,
                        student_id=student.id,
                        class_section_id=row.class_section_id,
                        start_date=(
                            date.fromisoformat(values["admission_date"])
                            if clean(values.get("admission_date")) else date.today()
                        ),
                    ))

                guardian_name = clean(values.get("parent_name"))
                guardian_phone = clean(values.get("parent_phone"))
                guardian_email = clean(values.get("parent_email"))
                if guardian_name or guardian_phone or guardian_email:
                    # Recorded even without a login: a number the school can
                    # ring is worth having before the parent has an account.
                    db.add(Guardian(
                        school_id=school_id,
                        student_id=student.id,
                        full_name=guardian_name,
                        phone=guardian_phone,
                        email=guardian_email,
                        relationship="parent",
                        is_primary=True,
                        is_emergency_contact=True,
                    ))

                await db.flush()
                student_id = student.id

            results.append(BulkImportRowResult(
                line=row.line, ok=True, student_id=student_id, name=name,
            ))
            created += 1
        except Exception as exc:  # noqa: BLE001 - reported per row, never swallowed
            results.append(BulkImportRowResult(
                line=row.line, ok=False, name=name, reason=str(exc)[:300],
            ))

    if body.dry_run:
        # Nothing is kept. The office sees the same report it would have got.
        await db.rollback()

    return BulkImportResult(
        dry_run=body.dry_run,
        created=0 if body.dry_run else created,
        failed=sum(1 for r in results if not r.ok),
        rows=results,
    )

