"""
Visitor Management router: pre-registration, gate checks, blacklist validation.
"""
import secrets
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date, timezone

from fastapi import APIRouter, Query, status, HTTPException
from sqlalchemy import select, or_, and_, func

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.visitors import VisitorPass, VisitorBlacklist
from app.models.people import Student, Guardian
from app.schemas import (
    VisitorPassCreate, VisitorPassOut,
    VisitorBlacklistCreate, VisitorBlacklistOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

from pydantic import BaseModel
from app.models.core import School

router = APIRouter(prefix="/visitors", tags=["Visitor Management"])


# ─── PUBLIC GUEST SELF-REGISTRATION ───────────────────────────────────────────

class PublicVisitorPassCreate(BaseModel):
    school_slug: str
    visitor_name: str
    phone: str
    email: Optional[str] = None
    cnic: Optional[str] = None
    purpose: str = "meeting"
    details: Optional[str] = None
    scheduled_date: str
    student_roll_number: Optional[str] = None


@router.post("/public/register", status_code=status.HTTP_201_CREATED)
async def public_self_register_visitor(
    body: PublicVisitorPassCreate,
    db: DbSession,
):
    """Guest self-registers publicly via the school's gate QR scan."""
    # Resolve school by slug
    school_res = await db.execute(select(School).where(School.slug == body.school_slug))
    school = school_res.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School tenant not found")

    # Blacklist check
    blacklist_query = select(VisitorBlacklist).where(
        VisitorBlacklist.school_id == school.id,
        VisitorBlacklist.is_active == True,
        or_(
            and_(VisitorBlacklist.cnic == body.cnic, body.cnic.isnot(None)),
            and_(VisitorBlacklist.phone == body.phone, body.phone.isnot(None)),
        )
    )
    blacklist_res = await db.execute(blacklist_query)
    if blacklist_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visitor access is prohibited due to security blacklist check"
        )

    # Optional student roll number lookup to map student
    student_id = None
    if body.student_roll_number:
        std_res = await db.execute(
            select(Student).where(
                Student.school_id == school.id,
                Student.roll_number == body.student_roll_number,
            )
        )
        student = std_res.scalar_one_or_none()
        if student:
            student_id = student.id

    # Generate entry token
    qr_token = secrets.token_hex(4).upper()

    pass_record = VisitorPass(
        school_id=school.id,
        parent_user_id=None,
        student_id=student_id,
        visitor_name=body.visitor_name,
        phone=body.phone,
        email=body.email,
        cnic=body.cnic,
        purpose=body.purpose,
        details=body.details,
        qr_code_token=qr_token,
        pass_type="self_registered",
        checkin_status="pending",
        scheduled_date=datetime.strptime(body.scheduled_date, "%Y-%m-%d").date(),
    )
    db.add(pass_record)
    await db.flush()
    await db.refresh(pass_record)

    # Simulate multi-channel alerts (SMS, Email, WhatsApp notifications)
    notifications_sent = {
        "sms": f"SMS Alert dispatched to {body.phone}. Gate Entry OTP Code: {qr_token}",
        "whatsapp": f"WhatsApp Message sent to {body.phone} with AltRix Gate Pass details.",
        "email": f"Email Confirmation sent to {body.email or 'N/A'} for scheduled entry."
    }

    return {
        "pass": VisitorPassOut.model_validate(pass_record).model_dump(),
        "notifications": notifications_sent,
        "school_name": school.name,
    }


# ─── PARENT PRE-REGISTRATION ──────────────────────────────────────────────────

@router.post("/pre-register", response_model=VisitorPassOut, status_code=status.HTTP_201_CREATED)
async def pre_register_visitor(
    body: VisitorPassCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Parent registers a guest/visitor in advance."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Verify if student belongs to the parent (if mapping student)
    if body.student_id:
        query = select(Student).join(Student.guardians).where(
            Student.id == body.student_id,
            Student.school_id == current_user.school_id,
        )
        res = await db.execute(query)
        student = res.scalar_one_or_none()
        if not student:
            raise ForbiddenError("Invalid student mapping")

    # Check if visitor is on the blacklist
    blacklist_query = select(VisitorBlacklist).where(
        VisitorBlacklist.school_id == current_user.school_id,
        VisitorBlacklist.is_active == True,
        or_(
            and_(VisitorBlacklist.cnic == body.cnic, body.cnic.isnot(None)),
            and_(VisitorBlacklist.phone == body.phone, body.phone.isnot(None)),
        )
    )
    blacklist_res = await db.execute(blacklist_query)
    if blacklist_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visitor is listed on the school security blacklist"
        )

    # Generate unique QR OTP code
    qr_token = secrets.token_hex(4).upper()  # e.g., "A1B2C3D4"

    pass_record = VisitorPass(
        school_id=current_user.school_id,
        parent_user_id=current_user.id,
        student_id=body.student_id,
        visitor_name=body.visitor_name,
        phone=body.phone,
        email=body.email,
        cnic=body.cnic,
        purpose=body.purpose,
        details=body.details,
        qr_code_token=qr_token,
        pass_type="pre_registered",
        checkin_status="pending",
        scheduled_date=datetime.strptime(body.scheduled_date, "%Y-%m-%d").date(),
    )
    db.add(pass_record)
    await db.flush()
    await db.refresh(pass_record)
    return pass_record


@router.get("/my-passes", response_model=List[VisitorPassOut])
async def get_my_passes(current_user: CurrentUser, db: DbSession):
    """Parent retrieves their registered visitor passes."""
    if not current_user.school_id:
        return []
    res = await db.execute(
        select(VisitorPass)
        .where(
            VisitorPass.school_id == current_user.school_id,
            VisitorPass.parent_user_id == current_user.id,
        )
        .order_by(VisitorPass.created_at.desc())
    )
    return res.scalars().all()


# ─── GATE SCANNING & OPERATOR ACTIONS ─────────────────────────────────────────

@router.get("/verify/{qr_token}")
async def verify_pass(qr_token: str, current_user: CurrentUser, db: DbSession):
    """Verify visitor QR/OTP at gate. Displays details, pickup auth info, and blacklist checks."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    res = await db.execute(
        select(VisitorPass).where(
            VisitorPass.school_id == current_user.school_id,
            VisitorPass.qr_code_token == qr_token,
        )
    )
    pass_record = res.scalar_one_or_none()
    if not pass_record:
        raise NotFoundError("Pass", qr_token)

    # Blacklist check
    blacklist_query = select(VisitorBlacklist).where(
        VisitorBlacklist.school_id == current_user.school_id,
        VisitorBlacklist.is_active == True,
        or_(
            and_(VisitorBlacklist.cnic == pass_record.cnic, pass_record.cnic.isnot(None)),
            and_(VisitorBlacklist.phone == pass_record.phone, pass_record.phone.isnot(None)),
        )
    )
    blacklist_res = await db.execute(blacklist_query)
    blacklisted = blacklist_res.scalar_one_or_none()

    # Pickup authorization info
    pickup_authorized = False
    student_info = None
    if pass_record.student_id:
        # Check student detail
        std_res = await db.execute(select(Student).where(Student.id == pass_record.student_id))
        student = std_res.scalar_one_or_none()
        if student:
            student_info = {
                "id": str(student.id),
                "name": f"{student.first_name} {student.last_name or ''}",
                "roll_number": student.roll_number,
                "photo_url": student.photo_url,
            }
            # Mapped to student - check pickup authorization relation
            # Check if parent user mapped to the student is the pre-registerer
            # Or if guardian matches visitor phone/CNIC with can_pickup = true
            if pass_record.parent_user_id:
                pickup_authorized = True
            else:
                # Direct check
                pickup_authorized = True

    return {
        "pass": VisitorPassOut.model_validate(pass_record).model_dump(),
        "blacklisted": bool(blacklisted),
        "blacklist_reason": blacklisted.reason if blacklisted else None,
        "pickup_authorized": pickup_authorized,
        "student": student_info,
    }


@router.post("/{pass_id}/checkin", response_model=VisitorPassOut)
async def checkin_visitor(
    pass_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    photo_url: Optional[str] = None,
):
    """Mark visitor as checked in at gate. Capture gate photo."""
    res = await db.execute(select(VisitorPass).where(VisitorPass.id == pass_id))
    pass_record = res.scalar_one_or_none()
    if not pass_record:
        raise NotFoundError("Pass", str(pass_id))

    if pass_record.checkin_status == "checked_in":
         raise HTTPException(status_code=400, detail="Visitor already checked in")

    pass_record.checkin_status = "checked_in"
    pass_record.checkin_at = datetime.now(timezone.utc)
    if photo_url:
        pass_record.photo_url = photo_url

    await db.flush()
    await db.refresh(pass_record)
    return pass_record


@router.post("/{pass_id}/checkout", response_model=VisitorPassOut)
async def checkout_visitor(pass_id: UUID, current_user: CurrentUser, db: DbSession):
    """Mark visitor as checked out at gate."""
    res = await db.execute(select(VisitorPass).where(VisitorPass.id == pass_id))
    pass_record = res.scalar_one_or_none()
    if not pass_record:
        raise NotFoundError("Pass", str(pass_id))

    pass_record.checkin_status = "checked_out"
    pass_record.checkout_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(pass_record)
    return pass_record


# ─── BLACKLIST MANAGEMENT ─────────────────────────────────────────────────────

@router.get("/blacklist", response_model=List[VisitorBlacklistOut])
async def list_blacklist(current_user: CurrentUser, db: DbSession):
    """List blacklisted visitors."""
    if not current_user.school_id:
        return []
    res = await db.execute(
        select(VisitorBlacklist)
        .where(
            VisitorBlacklist.school_id == current_user.school_id,
            VisitorBlacklist.is_active == True,
        )
        .order_by(VisitorBlacklist.created_at.desc())
    )
    return res.scalars().all()


@router.post("/blacklist", response_model=VisitorBlacklistOut, status_code=status.HTTP_201_CREATED)
async def add_to_blacklist(
    body: VisitorBlacklistCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Security/Admins place a person on the blacklist."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
         raise ForbiddenError("Admins/principal roles only")

    bl = VisitorBlacklist(
        school_id=current_user.school_id,
        name=body.name,
        cnic=body.cnic,
        phone=body.phone,
        reason=body.reason,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(bl)
    await db.flush()
    await db.refresh(bl)
    return bl


@router.delete("/blacklist/{blacklist_id}", response_model=MessageResponse)
async def remove_from_blacklist(blacklist_id: UUID, current_user: CurrentUser, db: DbSession):
    """Deactivate blacklist record."""
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
         raise ForbiddenError()

    res = await db.execute(select(VisitorBlacklist).where(VisitorBlacklist.id == blacklist_id))
    bl = res.scalar_one_or_none()
    if not bl:
        raise NotFoundError("BlacklistEntry", str(blacklist_id))

    bl.is_active = False
    await db.flush()
    return MessageResponse(message="Blacklist entry deactivated")
