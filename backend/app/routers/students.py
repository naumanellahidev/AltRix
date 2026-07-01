"""
Students router: full CRUD + parent/guardian management.
"""
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
from app.utils.pagination import PaginationParams, PaginatedResponse
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("", response_model=PaginatedResponse[StudentOut])
@cache_response(ttl=300, key_prefix="students:list")
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
    
    if student.section_id:
        try:
            class_id_res = await db.execute(
                text("SELECT class_id FROM class_sections WHERE id = :section_id"),
                {"section_id": student.section_id}
            )
            class_id = class_id_res.scalar()
            
            await db.execute(
                text("""
                    INSERT INTO student_enrollments (school_id, student_id, class_section_id, class_id)
                    VALUES (:school_id, :student_id, :class_section_id, :class_id)
                """),
                {
                    "school_id": student.school_id,
                    "student_id": student.id,
                    "class_section_id": student.section_id,
                    "class_id": class_id
                }
            )
            await db.flush()
        except Exception as e:
            import logging
            logging.getLogger("app.students").warning(f"Failed to auto-insert student_enrollments: {e}")

    await db.refresh(student)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:list*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["students"])
    except Exception:
        pass
    return student


@router.get("/my-children")
@cache_response(ttl=600, key_prefix="students:my-children")
async def list_parent_children(current_user: CurrentUser, db: DbSession, request: Request):
    """List students associated with the current user as a parent/guardian."""
    sql = """
        SELECT 
            s.id AS student_id,
            s.first_name,
            s.last_name,
            c.name AS class_name,
            sec.name AS section_name,
            s.roll_number,
            s.registration_number AS student_code,
            s.photo_url AS profile_image_url,
            s.date_of_birth,
            s.gender,
            s.section_id AS class_section_id
        FROM guardians g
        JOIN students s ON g.student_id = s.id
        LEFT JOIN student_enrollments se ON s.id = se.student_id AND se.school_id = s.school_id
        LEFT JOIN class_sections sec ON se.class_section_id = sec.id
        LEFT JOIN academic_classes c ON se.class_id = c.id
        WHERE g.user_id = :uid AND g.school_id = :school_id
    """
    res = await db.execute(
        text(sql),
        {"uid": current_user.id, "school_id": current_user.school_id}
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
    try:
        result = await db.execute(
            select(Guardian).where(Guardian.school_id == current_user.school_id).order_by(Guardian.created_at.desc())
        )
        return result.scalars().all()
    except Exception as e:
        import logging
        logging.getLogger("app.students").warning(f"Error fetching all guardians: {e}")
        return []


@router.post("/guardians")
async def create_school_guardian(body: GuardianCreateAll, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
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
    except Exception as e:
        import logging
        logging.getLogger("app.students").error(f"Error creating guardian: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database service error: {str(e)}")


@router.patch("/guardians/{guardian_id}")
async def update_school_guardian(guardian_id: UUID, body: GuardianUpdateAll, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
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
    except Exception as e:
        import logging
        logging.getLogger("app.students").error(f"Error updating guardian: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database service error: {str(e)}")


@router.delete("/guardians/{guardian_id}")
async def delete_school_guardian(guardian_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    try:
        result = await db.execute(
            select(Guardian).where(Guardian.id == guardian_id, Guardian.school_id == current_user.school_id)
        )
        guardian = result.scalar_one_or_none()
        if not guardian:
            raise NotFoundError("Guardian", str(guardian_id))
        await db.delete(guardian)
        return {"status": "success"}
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
        try:
            await db.execute(
                text("DELETE FROM student_enrollments WHERE student_id = :student_id"),
                {"student_id": student.id}
            )
            if student.section_id:
                class_id_res = await db.execute(
                    text("SELECT class_id FROM class_sections WHERE id = :section_id"),
                    {"section_id": student.section_id}
                )
                class_id = class_id_res.scalar()
                
                await db.execute(
                    text("""
                        INSERT INTO student_enrollments (school_id, student_id, class_section_id, class_id)
                        VALUES (:school_id, :student_id, :class_section_id, :class_id)
                    """),
                    {
                        "school_id": student.school_id,
                        "student_id": student.id,
                        "class_section_id": student.section_id,
                        "class_id": class_id
                    }
                )
            await db.flush()
        except Exception as e:
            import logging
            logging.getLogger("app.students").warning(f"Failed to auto-update student_enrollments: {e}")

    await db.refresh(student)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:list*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*students:my-children*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["students"])
    except Exception:
        pass
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
    except Exception:
        pass
    return MessageResponse(message="Student deleted")


# ─── GUARDIANS / PARENTS ─────────────────────────────────────────────────────

@router.get("/{student_id}/guardians", response_model=List[GuardianOut])
async def list_guardians(student_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Guardian).where(Guardian.student_id == student_id).order_by(Guardian.is_primary.desc())
    )
    return result.scalars().all()


@router.post("/{student_id}/guardians", response_model=GuardianOut, status_code=status.HTTP_201_CREATED)
async def add_guardian(student_id: UUID, body: GuardianCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    guardian = Guardian(
        school_id=current_user.school_id,
        student_id=student_id,
        **{k: v for k, v in body.model_dump().items() if k != "student_id"},
    )
    db.add(guardian)
    await db.flush()
    await db.refresh(guardian)
    return guardian


@router.patch("/{student_id}/guardians/{guardian_id}", response_model=GuardianOut)
async def update_guardian(
    student_id: UUID, guardian_id: UUID, body: GuardianCreate,
    current_user: CurrentUser, db: DbSession,
):
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id, Guardian.student_id == student_id)
    )
    guardian = result.scalar_one_or_none()
    if not guardian:
        raise NotFoundError("Guardian", str(guardian_id))
    for field, value in body.model_dump(exclude_none=True, exclude={"student_id"}).items():
        setattr(guardian, field, value)
    await db.flush()
    await db.refresh(guardian)
    return guardian


@router.delete("/{student_id}/guardians/{guardian_id}", response_model=MessageResponse)
async def delete_guardian(student_id: UUID, guardian_id: UUID, current_user: CurrentUser, db: DbSession):
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

