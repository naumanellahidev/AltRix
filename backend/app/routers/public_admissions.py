"""
Router for Public Online Admissions Portal & Public Tracking Status.
"""
import uuid
import random
import string
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import DbSession
from app.models.admissions import AdmissionApplication

router = APIRouter(prefix="/public-admissions", tags=["Public Online Admissions"])


class PublicAdmissionApplySchema(BaseModel):
    school_id: UUID
    applicant_name: str
    guardian_name: str
    guardian_phone: str
    guardian_email: Optional[str] = None
    target_class: str
    previous_school: Optional[str] = None


@router.post("/apply")
async def submit_public_admission_application(
    payload: PublicAdmissionApplySchema,
    db: DbSession,
):
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    tracking_code = f"ADM-{datetime.now().year}-{random_str}"

    app_record = AdmissionApplication(
        school_id=payload.school_id,
        applicant_name=payload.applicant_name,
        guardian_name=payload.guardian_name,
        guardian_phone=payload.guardian_phone,
        guardian_email=payload.guardian_email,
        target_class=payload.target_class,
        previous_school=payload.previous_school,
        status="pending",
        application_number=tracking_code,
    )
    db.add(app_record)
    await db.commit()

    return {
        "message": "Application submitted successfully",
        "tracking_code": tracking_code,
        "status": "pending",
        "applicant_name": payload.applicant_name
    }


@router.get("/status/{tracking_code}")
async def check_public_admission_status(
    tracking_code: str,
    db: DbSession,
):
    stmt = select(AdmissionApplication).where(AdmissionApplication.application_number == tracking_code)
    res = await db.execute(stmt)
    application = res.scalar_one_or_none()

    if not application:
        raise HTTPException(status_code=404, detail="No application found matching this tracking reference")

    return {
        "tracking_code": application.application_number,
        "applicant_name": application.applicant_name,
        "target_class": application.target_class,
        "status": application.status,
        "submitted_at": application.created_at,
    }
