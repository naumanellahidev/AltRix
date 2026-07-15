"""
Document Management System (DMS) router
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date, timedelta, timezone

from fastapi import APIRouter, Query, HTTPException, status
from sqlalchemy import select, or_, and_

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.documents import SchoolDocument, DocumentTemplate, IssuedCertificate
from app.models.people import Student, TeacherProfile
from app.schemas import (
    SchoolDocumentCreate, SchoolDocumentOut,
    DocumentTemplateOut,
    IssuedCertificateCreate, IssuedCertificateOut,
    MessageResponse,
)

router = APIRouter(prefix="/documents", tags=["Document Management (DMS)"])


# ─── DOCUMENT VAULTS ──────────────────────────────────────────────────────────

@router.get("", response_model=List[SchoolDocumentOut])
async def list_vault_documents(
    current_user: CurrentUser,
    db: DbSession,
    owner_type: Optional[str] = None,
    owner_id: Optional[UUID] = None,
):
    """List student or staff documents from vaults."""
    if not current_user.school_id:
        return []
    
    query = select(SchoolDocument).where(SchoolDocument.school_id == current_user.school_id)
    if owner_type:
        query = query.where(SchoolDocument.owner_type == owner_type)
    if owner_id:
        query = query.where(SchoolDocument.owner_id == owner_id)
        
    res = await db.execute(query.order_by(SchoolDocument.created_at.desc()))
    return res.scalars().all()


@router.post("", response_model=SchoolDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_vault_document(
    body: SchoolDocumentCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Upload scan or PDF document to student/staff vault."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    exp = None
    if body.expiry_date:
        exp = datetime.strptime(body.expiry_date, "%Y-%m-%d").date()

    doc = SchoolDocument(
        school_id=current_user.school_id,
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        document_type=body.document_type,
        file_name=body.file_name,
        file_url=body.file_url,
        expiry_date=exp,
    )
    db.add(doc)
    await db.flush()
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{document_id}", response_model=MessageResponse)
async def delete_vault_document(document_id: UUID, current_user: CurrentUser, db: DbSession):
    """Delete a document vault scan entry."""
    res = await db.execute(
        select(SchoolDocument).where(
            SchoolDocument.id == document_id,
            SchoolDocument.school_id == current_user.school_id
        )
    )
    doc = res.scalar_one_or_none()
    if not doc:
        raise NotFoundError("Document", str(document_id))
        
    await db.delete(doc)
    await db.commit()
    return MessageResponse(message="Document deleted from vault")


@router.get("/alerts", response_model=List[SchoolDocumentOut])
async def list_expiring_documents(current_user: CurrentUser, db: DbSession):
    """Retrieve list of documents expiring within the next 30 days."""
    if not current_user.school_id:
        return []
        
    warning_date = date.today() + timedelta(days=30)
    query = select(SchoolDocument).where(
        SchoolDocument.school_id == current_user.school_id,
        SchoolDocument.expiry_date.isnot(None),
        SchoolDocument.expiry_date >= date.today(),
        SchoolDocument.expiry_date <= warning_date
    )
    res = await db.execute(query.order_by(SchoolDocument.expiry_date))
    return res.scalars().all()


# ─── CERTIFICATES TEMPLATE ENGINE ─────────────────────────────────────────────

@router.get("/templates", response_model=List[DocumentTemplateOut])
async def list_templates(current_user: CurrentUser, db: DbSession):
    """List pre-loaded standard certificates templates."""
    if not current_user.school_id:
         return []
    res = await db.execute(
        select(DocumentTemplate).where(DocumentTemplate.school_id == current_user.school_id)
    )
    templates = res.scalars().all()
    
    # Pre-populate defaults if missing
    if not templates:
        defaults = [
            ("bonafide", "<h3>BONAFIDE CERTIFICATE</h3><p>This is to certify that <strong>{{STUDENT_NAME}}</strong>, student roll number <strong>{{ROLL_NUMBER}}</strong>, is a bonafide student of class <strong>{{CLASS}}</strong> at AltRix Academy.</p>"),
            ("transfer_certificate", "<h3>SCHOOL LEAVING / TRANSFER CERTIFICATE</h3><p>It is certified that student <strong>{{STUDENT_NAME}}</strong>, having roll number <strong>{{ROLL_NUMBER}}</strong>, has completed term studies and is cleared to transfer to other campuses.</p>"),
            ("character_certificate", "<h3>CHARACTER CERTIFICATE</h3><p>This certifies that <strong>{{STUDENT_NAME}}</strong> has shown exemplary behavior and outstanding academic focus during studies at class <strong>{{CLASS}}</strong>.</p>"),
            ("noc", "<h3>NO OBJECTION CERTIFICATE (NOC)</h3><p>The management has no objection for <strong>{{STUDENT_NAME}}</strong> participating in external state athletic and academic olympiads.</p>"),
        ]
        for name, html in defaults:
            tmpl = DocumentTemplate(school_id=current_user.school_id, template_name=name, body_content=html)
            db.add(tmpl)
        await db.commit()
        res = await db.execute(
            select(DocumentTemplate).where(DocumentTemplate.school_id == current_user.school_id)
        )
        templates = res.scalars().all()
        
    return templates


@router.post("/templates/render")
async def render_template_fields(
    template_name: str,
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Replace placeholder tokens in certificate templates with actual database metrics."""
    res = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.school_id == current_user.school_id,
            DocumentTemplate.template_name == template_name
        )
    )
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise NotFoundError("Template", template_name)
        
    std_res = await db.execute(select(Student).where(Student.id == student_id))
    student = std_res.scalar_one_or_none()
    if not student:
        raise NotFoundError("Student", str(student_id))
        
    body = tmpl.body_content
    body = body.replace("{{STUDENT_NAME}}", f"{student.first_name} {student.last_name or ''}".strip())
    body = body.replace("{{ROLL_NUMBER}}", student.roll_number or "N/A")
    body = body.replace("{{CLASS}}", f"Class ID: {str(student.class_id)[:8]}")
    
    return {"rendered_html": body}


@router.post("/templates/issue", response_model=IssuedCertificateOut)
async def issue_signed_certificate(
    body: IssuedCertificateCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Digitally signs and logs issued certificate records."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    certificate = IssuedCertificate(
        school_id=current_user.school_id,
        student_id=body.student_id,
        template_name=body.template_name,
        content=body.content,
        digital_signature_name=body.digital_signature_name,
        digital_signature_title=body.digital_signature_title,
        signed_at=datetime.now(timezone.utc),
    )
    db.add(certificate)
    await db.flush()
    await db.commit()
    await db.refresh(certificate)
    return certificate
