"""
Students router: full CRUD + parent/guardian management.
"""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status, HTTPException, Request
from app.cache import cache
from app.utils.cache_decorator import cache_response
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
from sqlalchemy import func, or_, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.people import Student, Guardian, StudentEnrollment, SchoolIdCardSettings
from app.models.inquiry import SchoolInquirySettings
from app.schemas import (
    StudentCreate, StudentUpdate, StudentOut,
    GuardianCreate, GuardianOut,
    MessageResponse, MyStudentIdOut,
    SchoolIdCardSettingsCreate, SchoolIdCardSettingsUpdate, SchoolIdCardSettingsOut,
    SchoolInquirySettingsCreate, SchoolInquirySettingsUpdate, SchoolInquirySettingsOut,
)
from app.utils.pagination import ListPageParams, PaginatedResponse, PaginationParams
from app.utils.permissions import expand_roles, ACADEMIC_GOV


# A guardian link is what gives an account a child's records: marks, fees,
# attendance, health. Any signed-in account could create one, for any
# student, in any school, and so read any child. Only the school's
# administration links parents to children now, and only its own students.
def _require_guardian_admin(user) -> None:
    roles = expand_roles(user.roles or [])
    if not (user.is_super_admin or any(r in roles for r in ACADEMIC_GOV)):
        raise ForbiddenError("Only the school's administration can link parents to students.")


def _is_staff(user) -> bool:
    return bool(user.is_super_admin or set(expand_roles(user.roles or [])) - {"parent", "student"})


async def _own_student(db, student_id, user) -> None:
    """The student belongs to the caller's school (404 otherwise, as for a missing one)."""
    if not user.school_id:
        raise ForbiddenError("No school context")
    found = await db.execute(
        select(Student.id).where(Student.id == student_id, Student.school_id == user.school_id)
    )
    if found.first() is None:
        raise NotFoundError("Student", str(student_id))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/students", tags=["Students"])



async def _place_in_section(db, school_id, student_id, section_id) -> None:
    """
    Put a student in a section: close their open enrolment and open one in
    the new section, only if it changed. A school's own sections only.

    This used to insert a `class_id` the enrolment table does not have, and
    read the section from a model property whose setter does nothing, so a
    student created with a class was silently left without one. Changing a
    student's section deleted every enrolment they had ever had, promotion
    history included.
    """
    if not section_id:
        return
    owned = await db.execute(
        text("SELECT 1 FROM class_sections WHERE id = CAST(:sec AS uuid) AND school_id = CAST(:sch AS uuid)"),
        {"sec": str(section_id), "sch": str(school_id)},
    )
    if owned.first() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That class section is not in this school.")
    current = (await db.execute(
        text("SELECT class_section_id FROM student_enrollments WHERE student_id = CAST(:st AS uuid) AND end_date IS NULL"),
        {"st": str(student_id)},
    )).first()
    if current and str(current[0]) == str(section_id):
        return
    await db.execute(
        text("UPDATE student_enrollments SET end_date = CURRENT_DATE WHERE student_id = CAST(:st AS uuid) AND end_date IS NULL"),
        {"st": str(student_id)},
    )
    await db.execute(
        text(
            "INSERT INTO student_enrollments (school_id, student_id, class_section_id, start_date, session_id)"
            " VALUES (CAST(:sch AS uuid), CAST(:st AS uuid), CAST(:sec AS uuid), CURRENT_DATE,"
            " (SELECT id FROM academic_sessions WHERE school_id = CAST(:sch AS uuid) AND is_current LIMIT 1))"
        ),
        {"sch": str(school_id), "st": str(student_id), "sec": str(section_id)},
    )

@router.get("", response_model=PaginatedResponse[StudentOut])
async def list_students(
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=10000),
    search: Optional[str] = Query(None),
    section_id: Optional[UUID] = Query(None),
    campus_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    if current_user.campus_id and not campus_id:
        try:
            campus_id = UUID(current_user.campus_id)
        except (ValueError, TypeError):
            pass

    query = select(Student).where(Student.school_id == current_user.school_id)

    from app.utils.security import get_allowed_student_ids
    allowed_student_ids = await get_allowed_student_ids(current_user, db)
    if allowed_student_ids is not None:
        if not allowed_student_ids:
            return PaginatedResponse.create([], 0, page, page_size)
        query = query.where(Student.id.in_(allowed_student_ids))

    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                Student.first_name.ilike(like),
                Student.last_name.ilike(like),
                Student.registration_number.ilike(like),
                Student.roll_number.ilike(like),
            )
        )
    if section_id:
        query = query.join(StudentEnrollment).where(StudentEnrollment.class_section_id == section_id)
    if campus_id:
        query = query.where(Student.campus_id == campus_id)
    if status:
        query = query.where(Student.status == status)

    # Count total
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(Student.last_name, Student.first_name).offset(offset).limit(page_size)
    )
    students = result.scalars().all()

    return PaginatedResponse.create(list(students), total, page, page_size)


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
async def create_student(body: StudentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()
    student = Student(school_id=current_user.school_id, **body.model_dump())
    db.add(student)
    await db.flush()
    
    await _place_in_section(db, current_user.school_id, student.id, body.model_dump().get("section_id"))
    await db.flush()

    await db.refresh(student)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:list*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["students"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
    return student


@router.get("/my-children")
@cache_response(ttl=600, key_prefix="students:my-children")
async def list_parent_children(current_user: CurrentUser, db: DbSession, request: Request):
    """List students associated with the current user as a parent/guardian."""
    # This read a `guardians` table and student columns (photo_url, section_id)
    # that do not exist, so it failed on every call and every parent's portal
    # said "No children linked to your account". The current enrolment gives
    # the class (a student's past enrolments stay on record).
    if not current_user.school_id:
        return []
    sql = """
        SELECT
            s.id AS student_id,
            s.first_name,
            s.last_name,
            c.name AS class_name,
            sec.name AS section_name,
            s.roll_number,
            COALESCE(s.student_code, s.registration_number) AS student_code,
            s.profile_image_url,
            s.date_of_birth,
            s.gender,
            se.class_section_id
        FROM student_guardians g
        JOIN students s ON s.id = g.student_id AND s.school_id = CAST(:school_id AS uuid)
        LEFT JOIN LATERAL (
            SELECT e.class_section_id FROM student_enrollments e
            WHERE e.student_id = s.id AND e.end_date IS NULL
            ORDER BY e.start_date DESC NULLS LAST LIMIT 1
        ) se ON TRUE
        LEFT JOIN class_sections sec ON sec.id = se.class_section_id
        LEFT JOIN academic_classes c ON c.id = sec.class_id
        WHERE g.user_id = CAST(:uid AS uuid)
        GROUP BY s.id, c.name, sec.name, se.class_section_id
        ORDER BY s.first_name
    """
    res = await db.execute(
        text(sql),
        {"uid": str(current_user.id), "school_id": str(current_user.school_id)}
    )
    rows = res.fetchall()
    return [
        {
            "student_id": str(r[0]),
            "first_name": r[1],
            "last_name": r[2],
            "class_name": r[3],
            "section_name": r[4],
            "roll_number": r[5],
            "student_code": r[6],
            "profile_image_url": r[7],
            "date_of_birth": r[8],
            "gender": r[9],
            "class_section_id": str(r[10]) if r[10] else None,
        }
        for r in rows
    ]


@router.get("/my-student-id", response_model=MyStudentIdOut)
async def get_my_student_id(
    school_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Retrieve the student ID linked to the current user in this school."""
    result = await db.execute(
        select(Student.id).where(
            Student.school_id == school_id,
            Student.user_id == current_user.id
        ).limit(1)
    )
    student_id = result.scalar_one_or_none()
    return MyStudentIdOut(student_id=student_id)


class GuardianCreateAll(BaseModel):
    student_id: UUID
    full_name: str
    relationship: Optional[str] = "father"
    phone: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_primary: Optional[bool] = True


class GuardianUpdateAll(BaseModel):
    user_id: Optional[UUID] = None
    full_name: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[bool] = None


@router.get("/enrollments")
async def get_student_enrollments(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    if not _is_staff(current_user):
        raise ForbiddenError("Only school staff can list enrolments.")
    try:
        sql = "SELECT student_id, class_section_id FROM student_enrollments WHERE school_id = :school_id"
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "student_id": str(r[0]),
                "class_section_id": str(r[1]),
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.students").warning(f"Error fetching student enrollments: {e}")
        return []


@router.get("/parents")
async def get_parents_directory(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    # Every parent's name and email: the school's staff only.
    if not _is_staff(current_user):
        raise ForbiddenError("Only school staff can list parents.")
    try:
        sql = """
            SELECT DISTINCT r.user_id, p.display_name, u.email
            FROM public.user_roles r
            JOIN auth.users u ON u.id = r.user_id
            LEFT JOIN public.profiles p ON p.id = r.user_id
            WHERE r.school_id = :school_id AND r.role = 'parent'
        """
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "user_id": str(r[0]),
                "full_name": r[1] or (r[2].split("@")[0] if r[2] else "Parent"),
                "email": r[2] or "",
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.students").warning(f"Error fetching parents: {e}")
        return []


@router.get("/guardians")
async def get_all_guardians(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    # Every family's names, phones and emails: the school's staff only.
    if not _is_staff(current_user):
        raise ForbiddenError("Only school staff can list guardians.")
    try:
        result = await db.execute(
            select(Guardian).where(Guardian.school_id == current_user.school_id).order_by(Guardian.created_at.desc())
        )
        return result.scalars().all()
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("app.students").warning(f"Error fetching all guardians: {e}")
        return []


@router.post("/guardians")
async def create_school_guardian(body: GuardianCreateAll, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    _require_guardian_admin(current_user)
    await _own_student(db, body.student_id, current_user)
    try:
        guardian = Guardian(
            school_id=current_user.school_id,
            student_id=body.student_id,
            full_name=body.full_name,
            relationship=body.relationship,
            phone=body.phone,
            email=body.email,
            user_id=body.user_id,
            is_primary=body.is_primary,
        )
        db.add(guardian)
        await db.flush()
        await db.refresh(guardian)
        return guardian
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("app.students").error(f"Error creating guardian: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database service error: {str(e)}")


@router.patch("/guardians/{guardian_id}")
async def update_school_guardian(guardian_id: UUID, body: GuardianUpdateAll, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    _require_guardian_admin(current_user)
    if getattr(body, "student_id", None):
        await _own_student(db, body.student_id, current_user)
    try:
        result = await db.execute(
            select(Guardian).where(Guardian.id == guardian_id, Guardian.school_id == current_user.school_id)
        )
        guardian = result.scalar_one_or_none()
        if not guardian:
            raise NotFoundError("Guardian", str(guardian_id))
        
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(guardian, field, value)
        await db.flush()
        await db.refresh(guardian)
        return guardian
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("app.students").error(f"Error updating guardian: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database service error: {str(e)}")


@router.delete("/guardians/{guardian_id}")
async def delete_school_guardian(guardian_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    _require_guardian_admin(current_user)
    try:
        result = await db.execute(
            select(Guardian).where(Guardian.id == guardian_id, Guardian.school_id == current_user.school_id)
        )
        guardian = result.scalar_one_or_none()
        if not guardian:
            raise NotFoundError("Guardian", str(guardian_id))
        await db.delete(guardian)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("app.students").error(f"Error deleting guardian: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database service error: {str(e)}")


@router.get("/{student_id}", response_model=StudentOut)
async def get_student(student_id: UUID, current_user: CurrentUser, db: DbSession):
    from app.utils.security import get_allowed_student_ids, require_school_match
    allowed_student_ids = await get_allowed_student_ids(current_user, db)
    if allowed_student_ids is not None and student_id not in allowed_student_ids:
        raise ForbiddenError("Permission denied: cannot access this student's details")
        
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise NotFoundError("Student", str(student_id))
    require_school_match(current_user, student.school_id)
    return student


@router.patch("/{student_id}", response_model=StudentOut)
async def update_student(student_id: UUID, body: StudentUpdate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()
        
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise NotFoundError("Student", str(student_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, student.school_id)
    
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(student, field, value)
    await db.flush()

    if "section_id" in body.model_dump(exclude_none=True):
        await _place_in_section(db, student.school_id, student.id, body.model_dump(exclude_none=True)["section_id"])
        await db.flush()

    await db.refresh(student)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:list*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:my-children*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["students"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
    return student


@router.delete("/{student_id}", response_model=MessageResponse)
async def delete_student(student_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise NotFoundError("Student", str(student_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, student.school_id)
        
    try:
        await db.execute(
            text("DELETE FROM student_enrollments WHERE student_id = :student_id"),
            {"student_id": student.id}
        )
        await db.flush()
    except Exception as e:
        import logging
        logging.getLogger("app.students").warning(f"Failed to delete student enrollment: {e}")

    await db.delete(student)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:list*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:my-children*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["students"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
    return MessageResponse(message="Student deleted")


# ─── GUARDIANS / PARENTS ─────────────────────────────────────────────────────

@router.get("/{student_id}/guardians", response_model=List[GuardianOut])
async def list_guardians(student_id: UUID, current_user: CurrentUser, db: DbSession, page: ListPageParams):
    # Any student's guardians, in any school, were readable by id.
    await _own_student(db, student_id, current_user)
    if not _is_staff(current_user):
        from app.utils.security import get_allowed_student_ids
        if student_id not in {UUID(str(s)) for s in (await get_allowed_student_ids(current_user, db) or [])}:
            raise NotFoundError("Student", str(student_id))
    result = await db.execute(
        page.apply(select(Guardian).where(Guardian.student_id == student_id).order_by(Guardian.is_primary.desc()))
    )
    return result.scalars().all()


@router.post("/{student_id}/guardians", response_model=GuardianOut, status_code=status.HTTP_201_CREATED)
async def add_guardian(student_id: UUID, body: GuardianCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    _require_guardian_admin(current_user)
    await _own_student(db, student_id, current_user)
    fields = body.stored_fields()
    if not fields.get("full_name"):
        raise HTTPException(status_code=422, detail="The guardian's name is required.")
    guardian = Guardian(school_id=current_user.school_id, student_id=student_id, **fields)
    db.add(guardian)
    await db.flush()
    await db.refresh(guardian)
    return guardian


@router.patch("/{student_id}/guardians/{guardian_id}", response_model=GuardianOut)
async def update_guardian(
    student_id: UUID, guardian_id: UUID, body: GuardianCreate,
    current_user: CurrentUser, db: DbSession,
):
    _require_guardian_admin(current_user)
    await _own_student(db, student_id, current_user)
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id, Guardian.student_id == student_id)
    )
    guardian = result.scalar_one_or_none()
    if not guardian:
        raise NotFoundError("Guardian", str(guardian_id))
    for field, value in body.stored_fields().items():
        setattr(guardian, field, value)
    await db.flush()
    await db.refresh(guardian)
    return guardian


@router.delete("/{student_id}/guardians/{guardian_id}", response_model=MessageResponse)
async def delete_guardian(student_id: UUID, guardian_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_guardian_admin(current_user)
    await _own_student(db, student_id, current_user)
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id, Guardian.student_id == student_id)
    )
    guardian = result.scalar_one_or_none()
    if not guardian:
        raise NotFoundError("Guardian", str(guardian_id))
    await db.delete(guardian)
    return MessageResponse(message="Guardian removed")


# ─── ID CARD SETTINGS ─────────────────────────────────────────────────────────

@router.get("/id-card-settings", response_model=SchoolIdCardSettingsOut)
async def get_id_card_settings(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    result = await db.execute(
        select(SchoolIdCardSettings).where(SchoolIdCardSettings.school_id == current_user.school_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = SchoolIdCardSettings(school_id=current_user.school_id)
        db.add(settings)
        await db.flush()
        await db.refresh(settings)

    return settings


@router.post("/id-card-settings", response_model=SchoolIdCardSettingsOut)
async def save_id_card_settings(body: SchoolIdCardSettingsCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Check permission: principal, vice_principal, school_admin, super_admin, school_owner
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ["principal", "vice_principal", "school_admin", "school_owner"])):
        raise ForbiddenError("Access denied. You do not have permission to manage ID card settings.")

    result = await db.execute(
        select(SchoolIdCardSettings).where(SchoolIdCardSettings.school_id == current_user.school_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = SchoolIdCardSettings(school_id=current_user.school_id, **body.model_dump())
        db.add(settings)
    else:
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(settings, field, value)

    await db.flush()
    await db.refresh(settings)
    return settings


# ─── INQUIRY FORM SETTINGS ───────────────────────────────────────────────────

@router.get("/inquiry-settings", response_model=SchoolInquirySettingsOut)
async def get_inquiry_settings(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    result = await db.execute(
        select(SchoolInquirySettings).where(SchoolInquirySettings.school_id == current_user.school_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = SchoolInquirySettings(school_id=current_user.school_id)
        db.add(settings)
        await db.flush()
        await db.refresh(settings)

    return settings


@router.post("/inquiry-settings", response_model=SchoolInquirySettingsOut)
async def save_inquiry_settings(body: SchoolInquirySettingsCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Check permission: principal, vice_principal, school_admin, super_admin, school_owner
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ["principal", "vice_principal", "school_admin", "school_owner"])):
        raise ForbiddenError("Access denied. You do not have permission to manage Inquiry Form settings.")

    result = await db.execute(
        select(SchoolInquirySettings).where(SchoolInquirySettings.school_id == current_user.school_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = SchoolInquirySettings(school_id=current_user.school_id, **body.model_dump())
        db.add(settings)
    else:
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(settings, field, value)

    await db.flush()
    await db.refresh(settings)
    return settings

