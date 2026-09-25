"""
Document vault and certificate engine: student documents, and certificates
(transfer / school leaving, character, bonafide, NOC) with QR verification.

What this fixes:

- The vault listed every student's documents — CNIC copies, B-forms — to
  anyone signed in to the school, parents and students included. Families now
  see only their own children's; staff see the school's.
- Certificates could be issued by any signed-in user, for any student id —
  including a student of another school. Issuing is now for academic and
  administrative staff, for the school's own students.
- Certificate numbers were six random digits, so two certificates could draw
  the same number and the second issue failed on the unique constraint. They
  are now sequential per school, type and year.
- The screen called endpoints that did not exist (document create and delete,
  certificate types, certificate detail); they exist now. A certificate can be
  revoked, which the public verification page reports.
"""
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.dependencies import CurrentUser, DbSession
from app.models.documents import IssuedCertificate, StudentDocument
from app.utils.pagination import ListPageParams
from app.utils.permissions import ACADEMIC_GOV, expand_roles
from app.utils.security import get_allowed_student_ids, require_school_match

router = APIRouter(prefix="/documents", tags=["Document Vault & Certificates"])

#: Who may manage the vault and issue certificates.
DOCUMENT_STAFF = set(ACADEMIC_GOV) | {"teacher", "hr_manager", "counselor"}
CERTIFICATE_ISSUERS = set(ACADEMIC_GOV)

#: The certificates the school can issue, with the prefix their numbers carry.
CERTIFICATE_TYPES = {
    "transfer_certificate": {"prefix": "TC", "title": "School Leaving Certificate"},
    "character_certificate": {"prefix": "CC", "title": "Character Certificate"},
    "bonafide": {"prefix": "BC", "title": "Bonafide Certificate"},
    "noc": {"prefix": "NOC", "title": "No Objection Certificate"},
}


# --- Schemas ---------------------------------------------------------------

class StudentDocumentCreateSchema(BaseModel):
    student_id: UUID
    document_name: str = Field(min_length=1, max_length=255)
    category: Optional[str] = "General"
    #: A storage path in the student-documents bucket, as returned by upload.
    file_url: str = Field(min_length=1)
    expires_at: Optional[date] = None


class StudentDocumentOutSchema(StudentDocumentCreateSchema):
    id: UUID
    school_id: UUID
    uploaded_by: Optional[UUID]
    created_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)


class CertificateGenerateSchema(BaseModel):
    student_id: UUID
    certificate_type: str
    remarks: Optional[str] = None


class CertificateOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    certificate_type: str
    certificate_number: str
    issue_date: Optional[date]
    remarks: Optional[str]
    qr_verification_code: str
    status: str
    created_at: Optional[datetime]
    student_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CertificateRevokeSchema(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


# --- Helpers ---------------------------------------------------------------

def _is(current_user, allowed: set) -> bool:
    return current_user.is_super_admin or bool(expand_roles(current_user.roles) & allowed)


def _require(current_user, allowed: set, what: str) -> None:
    if not _is(current_user, allowed):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You do not have permission to {what}.")


def _school(current_user) -> UUID:
    if not current_user.school_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User has no associated school")
    return UUID(str(current_user.school_id))


async def _student_in_school(db, student_id: UUID, school_id: UUID) -> None:
    found = (await db.execute(
        text("SELECT 1 FROM students WHERE id = :sid AND school_id = :school"),
        {"sid": student_id, "school": school_id},
    )).scalar_one_or_none()
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found in this school")


async def _family_scope(current_user, db) -> Optional[set]:
    """None for staff (whole school); otherwise the student ids this family may see."""
    allowed = await get_allowed_student_ids(current_user, db)
    return None if allowed is None else {UUID(str(s)) for s in allowed}


# --- Document vault ----------------------------------------------------------

@router.get("", response_model=List[StudentDocumentOutSchema])
async def list_documents(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams,
    owner_type: Optional[str] = Query(None),
    owner_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    stmt = select(StudentDocument).where(StudentDocument.school_id == _school(current_user))
    scope = await _family_scope(current_user, db)
    if scope is not None:
        if not scope:
            return []
        stmt = stmt.where(StudentDocument.student_id.in_(scope))
    if owner_id:
        try:
            stmt = stmt.where(StudentDocument.student_id == UUID(owner_id))
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "owner_id is not a valid id")
    if category and category.lower() != "all":
        stmt = stmt.where(StudentDocument.category.ilike(category))
    res = await db.execute(page.apply(stmt.order_by(StudentDocument.created_at.desc())))
    return list(res.scalars().all())


@router.get("/alerts", response_model=List[StudentDocumentOutSchema])
async def list_document_alerts(current_user: CurrentUser, db: DbSession, page: ListPageParams):
    if not current_user.school_id or not _is(current_user, DOCUMENT_STAFF):
        return []
    threshold = date.today() + timedelta(days=30)
    stmt = select(StudentDocument).where(
        StudentDocument.school_id == _school(current_user),
        StudentDocument.expires_at.isnot(None),
        StudentDocument.expires_at <= threshold,
    ).order_by(StudentDocument.expires_at.asc())
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())


@router.get("/student/{student_id}", response_model=List[StudentDocumentOutSchema])
async def list_student_documents(student_id: UUID, current_user: CurrentUser, db: DbSession, page: ListPageParams):
    if not current_user.school_id:
        return []
    scope = await _family_scope(current_user, db)
    if scope is not None and student_id not in scope:
        return []
    stmt = select(StudentDocument).where(
        StudentDocument.student_id == student_id,
        StudentDocument.school_id == _school(current_user),
    ).order_by(StudentDocument.created_at.desc())
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())


@router.post("/upload", response_model=StudentDocumentOutSchema)
async def upload_student_document(payload: StudentDocumentCreateSchema, current_user: CurrentUser, db: DbSession):
    _require(current_user, DOCUMENT_STAFF, "add documents to the vault")
    school_id = _school(current_user)
    await _student_in_school(db, payload.student_id, school_id)
    doc = StudentDocument(school_id=school_id, uploaded_by=current_user.id, **payload.model_dump())
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_document(document_id: UUID, current_user: CurrentUser, db: DbSession):
    _require(current_user, DOCUMENT_STAFF, "remove documents from the vault")
    doc = (await db.execute(select(StudentDocument).where(StudentDocument.id == document_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    require_school_match(current_user, doc.school_id)
    await db.delete(doc)
    await db.commit()


# --- Certificates ------------------------------------------------------------

@router.get("/certificates/types")
async def certificate_types(current_user: CurrentUser):
    return [{"type": key, "title": value["title"]} for key, value in CERTIFICATE_TYPES.items()]


@router.get("/certificates", response_model=List[CertificateOutSchema])
async def list_certificates(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams,
    student_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    stmt = (
        select(IssuedCertificate)
        .where(IssuedCertificate.school_id == _school(current_user))
        .order_by(IssuedCertificate.created_at.desc())
    )
    scope = await _family_scope(current_user, db)
    if scope is not None:
        if not scope:
            return []
        stmt = stmt.where(IssuedCertificate.student_id.in_(scope))
    # One child's certificates (the parent and student screens). The family
    # scope above still applies, so another family's child yields nothing.
    if student_id:
        stmt = stmt.where(IssuedCertificate.student_id == student_id)
    certs = list((await db.execute(page.apply(stmt))).scalars().all())

    names = {}
    ids = list({c.student_id for c in certs})
    if ids:
        rows = await db.execute(
            text("SELECT id, first_name, last_name FROM students WHERE id = ANY(:ids)"),
            {"ids": ids},
        )
        names = {r.id: " ".join(filter(None, [r.first_name, r.last_name])) for r in rows}

    out = []
    for cert in certs:
        item = CertificateOutSchema.model_validate(cert)
        item.student_name = names.get(cert.student_id)
        out.append(item)
    return out


async def _next_certificate_number(db, school_id: UUID, certificate_type: str) -> str:
    """
    <PREFIX>-<YEAR>-<6 digits>-<school tag>: sequential within the school, type
    and year. The tag keeps numbers unique across schools, since the column is
    unique platform-wide.
    """
    prefix = CERTIFICATE_TYPES[certificate_type]["prefix"]
    year = datetime.now(timezone.utc).year
    tag = str(school_id).replace("-", "")[:4].upper()
    pattern = f"{prefix}-{year}-%-{tag}"
    count = (await db.execute(
        select(func.count()).select_from(IssuedCertificate).where(
            IssuedCertificate.school_id == school_id,
            IssuedCertificate.certificate_number.like(pattern),
        )
    )).scalar_one()
    return f"{prefix}-{year}-{count + 1:06d}-{tag}"


@router.post("/certificates/generate", response_model=CertificateOutSchema)
async def generate_certificate(payload: CertificateGenerateSchema, current_user: CurrentUser, db: DbSession):
    _require(current_user, CERTIFICATE_ISSUERS, "issue certificates")
    certificate_type = payload.certificate_type.lower()
    if certificate_type not in CERTIFICATE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown certificate type '{payload.certificate_type}'")
    school_id = _school(current_user)
    await _student_in_school(db, payload.student_id, school_id)

    # Two issues at the same moment can compute the same next number; the
    # unique constraint turns the loser away and it takes the next one.
    for _attempt in range(5):
        cert = IssuedCertificate(
            school_id=school_id,
            student_id=payload.student_id,
            certificate_type=certificate_type,
            certificate_number=await _next_certificate_number(db, school_id, certificate_type),
            issue_date=date.today(),
            remarks=payload.remarks,
            qr_verification_code=secrets.token_urlsafe(24),
            issued_by=current_user.id,
            status="valid",
        )
        db.add(cert)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        await db.refresh(cert)
        return cert
    raise HTTPException(status.HTTP_409_CONFLICT, "Could not allocate a certificate number; please try again.")


@router.get("/certificates/{certificate_id}")
async def certificate_detail(certificate_id: UUID, current_user: CurrentUser, db: DbSession):
    """Everything needed to print a certificate: the record and the student's particulars."""
    cert = (await db.execute(select(IssuedCertificate).where(IssuedCertificate.id == certificate_id))).scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    require_school_match(current_user, cert.school_id)
    scope = await _family_scope(current_user, db)
    if scope is not None and cert.student_id not in scope:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")

    student = (await db.execute(
        text(
            """
            SELECT s.first_name, s.last_name, s.roll_number, s.registration_number,
                   s.date_of_birth, s.gender, s.admission_date, s.status,
                   c.name AS class_name, cs.name AS section_name
            FROM students s
            LEFT JOIN LATERAL (
                SELECT class_section_id FROM student_enrollments se
                WHERE se.student_id = s.id
                ORDER BY (se.end_date IS NULL) DESC, se.start_date DESC NULLS LAST
                LIMIT 1
            ) e ON TRUE
            LEFT JOIN class_sections cs ON cs.id = e.class_section_id
            LEFT JOIN academic_classes c ON c.id = cs.class_id
            WHERE s.id = :sid
            """
        ),
        {"sid": cert.student_id},
    )).mappings().first()

    return {
        "certificate": CertificateOutSchema.model_validate(cert).model_dump(mode="json"),
        "title": CERTIFICATE_TYPES.get(cert.certificate_type, {}).get("title", cert.certificate_type),
        "student": dict(student) if student else None,
    }


@router.post("/certificates/{certificate_id}/revoke", response_model=CertificateOutSchema)
async def revoke_certificate(certificate_id: UUID, payload: CertificateRevokeSchema, current_user: CurrentUser, db: DbSession):
    """Withdraw a certificate. Its QR code then verifies as revoked."""
    _require(current_user, CERTIFICATE_ISSUERS, "revoke certificates")
    cert = (await db.execute(select(IssuedCertificate).where(IssuedCertificate.id == certificate_id))).scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    require_school_match(current_user, cert.school_id)
    cert.status = "revoked"
    stamp = datetime.now(timezone.utc).strftime("%d %b %Y")
    cert.remarks = f"{cert.remarks + ' · ' if cert.remarks else ''}Revoked {stamp}: {payload.reason}"
    await db.commit()
    await db.refresh(cert)
    return cert


@router.get("/certificates/verify/{qr_code}")
async def verify_certificate_public(qr_code: str, db: DbSession):
    stmt = select(IssuedCertificate).where(IssuedCertificate.qr_verification_code == qr_code)
    res = await db.execute(stmt)
    cert = res.scalar_one_or_none()
    if not cert:
        return {
            "valid": False,
            "message": "Invalid or non-existent certificate QR code."
        }
    # Whom it was issued to and by which school — the two things a verifier
    # actually needs. The student's name only; nothing else about them.
    who = (await db.execute(
        text(
            "SELECT s.first_name, s.last_name, sc.name AS school_name "
            "FROM students s JOIN schools sc ON sc.id = :school "
            "WHERE s.id = :student"
        ),
        {"student": cert.student_id, "school": cert.school_id},
    )).mappings().first()
    return {
        "valid": True if cert.status == "valid" else False,
        "certificate_number": cert.certificate_number,
        "certificate_type": cert.certificate_type,
        "issue_date": str(cert.issue_date),
        "status": cert.status,
        "remarks": cert.remarks,
        "student_name": " ".join(filter(None, [who["first_name"], who["last_name"]])) if who else None,
        "school_name": who["school_name"] if who else None,
    }
