"""
Document Vault & Certificate Engine router: TC, Character, Bonafide, NOC, digital signature & QR verification.
"""
import uuid
import secrets
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.documents import StudentDocument, IssuedCertificate

router = APIRouter(prefix="/documents", tags=["Document Vault & Certificates"])


# --- Schemas ---
class StudentDocumentCreateSchema(BaseModel):
    student_id: UUID
    document_name: str
    category: Optional[str] = "General"
    file_url: str
    expires_at: Optional[date] = None

class StudentDocumentOutSchema(StudentDocumentCreateSchema):
    id: UUID
    school_id: UUID
    uploaded_by: Optional[UUID]
    created_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class CertificateGenerateSchema(BaseModel):
    student_id: UUID
    certificate_type: str  # 'transfer_certificate', 'character_certificate', 'bonafide', 'noc'
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
    model_config = ConfigDict(from_attributes=True)


# --- Document Vault Endpoints ---
@router.get("/student/{student_id}", response_model=List[StudentDocumentOutSchema])
async def list_student_documents(student_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    stmt = select(StudentDocument).where(
        StudentDocument.student_id == student_id,
        StudentDocument.school_id == current_user.school_id
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/upload", response_model=StudentDocumentOutSchema)
async def upload_student_document(payload: StudentDocumentCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    doc = StudentDocument(
        school_id=current_user.school_id,
        uploaded_by=current_user.id,
        **payload.model_dump()
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


# --- Certificate Engine Endpoints ---
@router.get("/certificates", response_model=List[CertificateOutSchema])
async def list_certificates(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    stmt = select(IssuedCertificate).where(IssuedCertificate.school_id == current_user.school_id).order_by(IssuedCertificate.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/certificates/generate", response_model=CertificateOutSchema)
async def generate_certificate(payload: CertificateGenerateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Generate unique certificate number & QR verification hash
    prefix_map = {
        "transfer_certificate": "TC",
        "character_certificate": "CC",
        "bonafide": "BC",
        "noc": "NOC",
    }
    code_prefix = prefix_map.get(payload.certificate_type.lower(), "CERT")
    random_num = secrets.randbelow(899999) + 100000
    cert_no = f"{code_prefix}-{datetime.now().year}-{random_num}"
    qr_hash = secrets.token_hex(16)

    cert = IssuedCertificate(
        school_id=current_user.school_id,
        student_id=payload.student_id,
        certificate_type=payload.certificate_type,
        certificate_number=cert_no,
        issue_date=date.today(),
        remarks=payload.remarks,
        qr_verification_code=qr_hash,
        issued_by=current_user.id,
        status="valid"
    )
    db.add(cert)
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
    return {
        "valid": True if cert.status == "valid" else False,
        "certificate_number": cert.certificate_number,
        "certificate_type": cert.certificate_type,
        "issue_date": str(cert.issue_date),
        "status": cert.status,
        "remarks": cert.remarks,
    }
