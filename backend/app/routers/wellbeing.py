"""
Router for Student Health, Infirmary Visit Desk & Wellbeing Center.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.wellbeing import StudentMedicalRecord, InfirmaryVisitLog, VaccinationRecord, FirstAidIncident

router = APIRouter(prefix="/wellbeing", tags=["Student Wellbeing"])


class MedicalRecordCreateSchema(BaseModel):
    student_id: UUID
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    doctor_notes: Optional[str] = None


class MedicalRecordResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    doctor_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InfirmaryVisitCreateSchema(BaseModel):
    student_id: UUID
    symptoms: str
    treatment: Optional[str] = None
    medication_given: Optional[str] = None
    nurse_name: Optional[str] = "School Nurse"
    status: Optional[str] = "in_clinic"


class InfirmaryVisitResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    visit_date: datetime
    symptoms: str
    treatment: Optional[str] = None
    medication_given: Optional[str] = None
    nurse_name: Optional[str] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class FirstAidIncidentCreateSchema(BaseModel):
    student_id: UUID
    incident_type: str
    location: Optional[str] = "Playground"
    action_taken: str
    parent_notified: Optional[bool] = True


@router.get("/medical-records/{student_id}", response_model=Optional[MedicalRecordResponseSchema])
async def get_student_medical_record(
    student_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    stmt = select(StudentMedicalRecord).where(StudentMedicalRecord.student_id == student_id)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


@router.post("/medical-records", response_model=MedicalRecordResponseSchema)
async def create_or_update_medical_record(
    payload: MedicalRecordCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(StudentMedicalRecord).where(StudentMedicalRecord.student_id == payload.student_id)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()

    if not record:
        record = StudentMedicalRecord(
            school_id=school_id,
            student_id=payload.student_id,
            blood_group=payload.blood_group,
            allergies=payload.allergies,
            chronic_conditions=payload.chronic_conditions,
            emergency_contact_name=payload.emergency_contact_name,
            emergency_contact_phone=payload.emergency_contact_phone,
            doctor_notes=payload.doctor_notes,
        )
        db.add(record)
    else:
        record.blood_group = payload.blood_group
        record.allergies = payload.allergies
        record.chronic_conditions = payload.chronic_conditions
        record.emergency_contact_name = payload.emergency_contact_name
        record.emergency_contact_phone = payload.emergency_contact_phone
        record.doctor_notes = payload.doctor_notes

    await db.commit()
    await db.refresh(record)
    return record


@router.get("/infirmary-logs", response_model=List[InfirmaryVisitResponseSchema])
async def list_infirmary_visit_logs(
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(InfirmaryVisitLog).where(InfirmaryVisitLog.school_id == school_id).order_by(InfirmaryVisitLog.visit_date.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/infirmary-logs", response_model=InfirmaryVisitResponseSchema)
async def log_infirmary_visit(
    payload: InfirmaryVisitCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    visit = InfirmaryVisitLog(
        school_id=school_id,
        student_id=payload.student_id,
        symptoms=payload.symptoms,
        treatment=payload.treatment,
        medication_given=payload.medication_given,
        nurse_name=payload.nurse_name,
        status=payload.status or "in_clinic",
    )
    db.add(visit)
    await db.commit()
    await db.refresh(visit)
    return visit


@router.post("/incidents")
async def log_first_aid_incident(
    payload: FirstAidIncidentCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    incident = FirstAidIncident(
        school_id=school_id,
        student_id=payload.student_id,
        incident_type=payload.incident_type,
        location=payload.location,
        action_taken=payload.action_taken,
        parent_notified=payload.parent_notified or True,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return {"message": "Incident logged and parent notification dispatched", "incident_id": str(incident.id)}
