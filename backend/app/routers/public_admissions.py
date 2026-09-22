"""
The public admissions portal: apply from outside the app, and track it later.

Neither half had ever worked. Both were written against fields the model does
not have — ``applicant_name``, ``guardian_name``, ``guardian_phone``,
``guardian_email``, ``target_class`` and ``application_number``. Constructing
the row raised a TypeError before it reached the database, and the status
lookup raised on ``AdmissionApplication.application_number``, so an applicant
got a 500 whether they applied or checked. The table's real columns are
first_name / last_name, parent_*, applying_for_class_id and
registration_number.

It also wrote ``status="pending"``, which is not one of that enum's values
(submitted / under_review / approved / rejected / withdrawn), so even a
corrected insert would have been rejected by Postgres.
"""
import random
import string
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status as http_status
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from app.dependencies import DbSession
from app.models.admissions import AdmissionApplication

router = APIRouter(prefix="/public-admissions", tags=["Public Online Admissions"])

#: The value the column's enum actually carries for a new application.
NEW_APPLICATION_STATUS = "submitted"

#: What each stored status means to someone outside the school.
PUBLIC_STATUS_LABELS = {
    "submitted": "Received — waiting to be reviewed",
    "under_review": "Under review by the admissions office",
    "approved": "Approved — the school will contact you",
    "rejected": "Not accepted this term",
    "withdrawn": "Withdrawn",
}


class PublicAdmissionApplySchema(BaseModel):
    school_id: UUID
    applicant_name: str = Field(min_length=2, max_length=120)
    guardian_name: str = Field(min_length=2, max_length=120)
    guardian_phone: str = Field(min_length=6, max_length=32)
    guardian_email: Optional[str] = Field(default=None, max_length=200)
    target_class: str = Field(min_length=1, max_length=80)
    previous_school: Optional[str] = Field(default=None, max_length=200)


def _split_name(full_name: str) -> tuple[str, str]:
    """The table stores a first and a last name; a form collects one line."""
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return ("Applicant", "")
    if len(parts) == 1:
        return (parts[0], "")
    return (" ".join(parts[:-1]), parts[-1])


def _tracking_code() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ADM-{datetime.now().year}-{suffix}"


@router.post("/apply")
async def submit_public_admission_application(
    payload: PublicAdmissionApplySchema,
    db: DbSession,
):
    """Record an application from outside the app and hand back its reference."""
    school = await db.execute(
        text("SELECT 1 FROM schools WHERE id = CAST(:sid AS uuid)"),
        {"sid": str(payload.school_id)},
    )
    if school.first() is None:
        raise HTTPException(status_code=404, detail="That school was not found")

    # The form collects a class by name; the table holds an id. An unmatched
    # name is kept in the notes rather than dropped, so the office can see what
    # the family asked for.
    class_row = await db.execute(
        text(
            """
            SELECT id FROM academic_classes
             WHERE school_id = CAST(:sid AS uuid)
               AND lower(name) = lower(:name)
             LIMIT 1
            """
        ),
        {"sid": str(payload.school_id), "name": payload.target_class.strip()},
    )
    matched = class_row.first()
    applying_for_class_id = matched[0] if matched else None

    notes = [f"Applied online for: {payload.target_class.strip()}"]
    if not matched:
        notes.append("(no class of that name exists; the office should assign one)")

    first_name, last_name = _split_name(payload.applicant_name)

    # A tracking code a family will read out over the phone has to be unique.
    tracking_code = ""
    for _ in range(5):
        candidate = _tracking_code()
        taken = await db.execute(
            text(
                """
                SELECT 1 FROM admission_applications
                 WHERE school_id = CAST(:sid AS uuid) AND registration_number = :code
                """
            ),
            {"sid": str(payload.school_id), "code": candidate},
        )
        if taken.first() is None:
            tracking_code = candidate
            break
    if not tracking_code:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A tracking reference could not be issued. Please try again.",
        )

    record = AdmissionApplication(
        school_id=payload.school_id,
        first_name=first_name,
        last_name=last_name,
        parent_name=payload.guardian_name.strip(),
        parent_phone=payload.guardian_phone.strip(),
        parent_email=(payload.guardian_email or "").strip() or None,
        previous_school=(payload.previous_school or "").strip() or None,
        applying_for_class_id=applying_for_class_id,
        registration_number=tracking_code,
        status=NEW_APPLICATION_STATUS,
        notes=" ".join(notes),
    )
    db.add(record)
    await db.commit()

    return {
        "message": "Application submitted successfully",
        "tracking_code": tracking_code,
        "status": NEW_APPLICATION_STATUS,
        "status_label": PUBLIC_STATUS_LABELS[NEW_APPLICATION_STATUS],
        "applicant_name": payload.applicant_name.strip(),
    }


@router.get("/status/{tracking_code}")
async def check_public_admission_status(
    tracking_code: str,
    db: DbSession,
):
    """
    What an applicant is told about their own application.

    Deliberately narrow: a tracking code is not a password, so this returns
    the applicant's own name, the class applied for and where the application
    has reached — never the office's decision notes, contact details or
    anything about another family.
    """
    code = (tracking_code or "").strip()
    if len(code) < 6:
        raise HTTPException(status_code=404, detail="No application found matching this tracking reference")

    result = await db.execute(
        select(AdmissionApplication).where(AdmissionApplication.registration_number == code)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="No application found matching this tracking reference")

    class_name = None
    if application.applying_for_class_id:
        row = await db.execute(
            text("SELECT name FROM academic_classes WHERE id = CAST(:cid AS uuid)"),
            {"cid": str(application.applying_for_class_id)},
        )
        found = row.first()
        class_name = found[0] if found else None

    stored_status = str(application.status or NEW_APPLICATION_STATUS)
    return {
        "tracking_code": code,
        "applicant_name": " ".join(p for p in [application.first_name, application.last_name] if p),
        "target_class": class_name,
        "status": stored_status,
        "status_label": PUBLIC_STATUS_LABELS.get(stored_status, stored_status.replace("_", " ")),
        "submitted_at": application.created_at.isoformat() if application.created_at else None,
    }
