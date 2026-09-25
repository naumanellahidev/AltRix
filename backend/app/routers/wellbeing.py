"""
Student health, the infirmary desk and wellbeing check-ins.

What this replaced, and why:

* **Anyone could read any medical file.** No endpoint checked the caller's
  role — a parent or a student could list every child's allergies and
  conditions in the school — and ``/medical-records/{student_id}`` did not
  even check the school, so another school's child could be read by id.
  Now: school staff read their school's records; a guardian reads only
  their own children's, a student only their own; health files are written
  by leadership and counsellors, visits and incidents by any staff member.
* **The screen and this router disagreed on every form.** The screen sent
  ``reason`` for an infirmary visit, the router required ``symptoms``, so
  every visit failed to save; medications and insurance were dropped
  silently; there was no way to save a vaccination, the first-aid screen
  called ``/first-aid`` (the router had ``/incidents``), and the contacts
  directory and wellness check-ins had no endpoints at all. Both spellings
  are accepted now and both are returned.
* **Claims nothing backed.** A first-aid incident was stored as "parent
  notified" and answered "parent notification dispatched" whatever
  happened. The student's guardians with an account are now notified, and
  the record says whether anyone was.
* **Invented defaults.** "School Nurse", "Playground" and "in clinic" were
  written when the form left them blank. Blank now stays blank.

Every query is scoped to the caller's school.
"""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession
from app.utils.permissions import expand_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wellbeing", tags=["Student Wellbeing"])

GOV = {"super_admin", "school_owner", "principal", "vice_principal", "school_admin"}
HEALTH_WRITERS = GOV | {"counselor"}
FAMILY = {"parent", "student"}


# ── Who may see and change what ───────────────────────────────────────────────

def _roles(user) -> Set[str]:
    roles = set(expand_roles(list(user.roles or [])))
    if getattr(user, "is_super_admin", False):
        roles.add("super_admin")
    return roles


def _is_staff(user) -> bool:
    return bool(_roles(user) - FAMILY)


def _school(user) -> str:
    if not user.school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No school context. Send the X-School-Id header.")
    return str(user.school_id)


async def _family_student_ids(db, user, school_id: str) -> List[str]:
    """The students a parent or student may see: their children, or themself."""
    rows = (await db.execute(text(
        """
        SELECT DISTINCT s.id::text FROM students s
        LEFT JOIN student_guardians g ON g.student_id = s.id
        WHERE s.school_id = CAST(:sid AS uuid)
          AND (g.user_id = CAST(:uid AS uuid) OR s.profile_id = CAST(:uid AS uuid))
        """
    ), {"sid": school_id, "uid": str(user.id)})).all()
    return [r[0] for r in rows]


async def _visible_students(db, user, school_id: str, student_id: Optional[UUID]) -> Optional[List[str]]:
    """None means every student in the school; otherwise the ids that may be read."""
    if _is_staff(user):
        return [str(student_id)] if student_id else None
    allowed = await _family_student_ids(db, user, school_id)
    if student_id:
        if str(student_id) not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only see your own child's health records.")
        return [str(student_id)]
    return allowed


async def _require_student(db, school_id: str, student_id: UUID) -> None:
    found = (await db.execute(text(
        "SELECT 1 FROM students WHERE id = CAST(:st AS uuid) AND school_id = CAST(:sid AS uuid)"
    ), {"st": str(student_id), "sid": school_id})).first()
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That student is not in this school.")


def _require(user, allowed: Set[str], what: str) -> None:
    if not (_roles(user) & allowed):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Your role cannot {what}.")


def _student_filter(ids: Optional[List[str]], column: str = "student_id") -> str:
    return "" if ids is None else f" AND {column}::text = ANY(:ids)"


def _binds(sid: str, ids: Optional[List[str]], **extra: Any) -> Dict[str, Any]:
    """The school, and the visible students only when the query filters on them."""
    out: Dict[str, Any] = {"sid": sid, **extra}
    if ids is not None:
        out["ids"] = ids
    return out


def _iso(v: Any) -> Any:
    return v.isoformat() if isinstance(v, (date, datetime)) else v


def _row(r) -> Dict[str, Any]:
    return {k: (str(v) if isinstance(v, UUID) else _iso(v)) for k, v in dict(r).items()}


# ── Medical profile ───────────────────────────────────────────────────────────

class MedicalRecordIn(BaseModel):
    student_id: UUID
    blood_group: Optional[str] = Field(default=None, max_length=10)
    allergies: Optional[str] = Field(default=None, max_length=2000)
    chronic_conditions: Optional[str] = Field(default=None, max_length=2000)
    conditions: Optional[str] = Field(default=None, max_length=2000)  # the screen's name for it
    medications: Optional[str] = Field(default=None, max_length=2000)
    health_insurance_info: Optional[str] = Field(default=None, max_length=500)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=120)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=40)
    doctor_notes: Optional[str] = Field(default=None, max_length=4000)


MEDICAL_COLUMNS = (
    "id, school_id, student_id, blood_group, allergies, chronic_conditions, "
    "chronic_conditions AS conditions, medications, health_insurance_info, "
    "emergency_contact_name, emergency_contact_phone, doctor_notes, updated_at"
)


@router.get("/medical-records")
async def list_medical_records(db: DbSession, current_user: CurrentUser, student_id: Optional[UUID] = Query(None)):
    sid = _school(current_user)
    ids = await _visible_students(db, current_user, sid, student_id)
    rows = (await db.execute(text(
        f"SELECT {MEDICAL_COLUMNS} FROM student_medical_records WHERE school_id = CAST(:sid AS uuid)"
        + _student_filter(ids) + " ORDER BY updated_at DESC NULLS LAST"
    ), _binds(sid, ids))).mappings().all()
    return [_row(r) for r in rows]


@router.get("/medical-records/{student_id}")
async def get_student_medical_record(student_id: UUID, db: DbSession, current_user: CurrentUser):
    sid = _school(current_user)
    await _visible_students(db, current_user, sid, student_id)
    row = (await db.execute(text(
        f"SELECT {MEDICAL_COLUMNS} FROM student_medical_records "
        "WHERE school_id = CAST(:sid AS uuid) AND student_id = CAST(:st AS uuid)"
    ), {"sid": sid, "st": str(student_id)})).mappings().first()
    return _row(row) if row else None


@router.post("/medical-records")
async def create_or_update_medical_record(payload: MedicalRecordIn, db: DbSession, current_user: CurrentUser):
    _require(current_user, HEALTH_WRITERS, "change a student's health file")
    sid = _school(current_user)
    await _require_student(db, sid, payload.student_id)
    row = (await db.execute(text(
        f"""
        INSERT INTO student_medical_records
          (school_id, student_id, blood_group, allergies, chronic_conditions, medications,
           health_insurance_info, emergency_contact_name, emergency_contact_phone, doctor_notes, updated_at)
        VALUES (CAST(:sid AS uuid), CAST(:st AS uuid), :bg, :al, :cc, :med, :ins, :ecn, :ecp, :dn, now())
        ON CONFLICT (school_id, student_id) DO UPDATE SET
          blood_group = EXCLUDED.blood_group, allergies = EXCLUDED.allergies,
          chronic_conditions = EXCLUDED.chronic_conditions, medications = EXCLUDED.medications,
          health_insurance_info = EXCLUDED.health_insurance_info,
          emergency_contact_name = EXCLUDED.emergency_contact_name,
          emergency_contact_phone = EXCLUDED.emergency_contact_phone,
          doctor_notes = EXCLUDED.doctor_notes, updated_at = now()
        RETURNING {MEDICAL_COLUMNS}
        """
    ), {
        "sid": sid, "st": str(payload.student_id), "bg": payload.blood_group, "al": payload.allergies,
        "cc": payload.chronic_conditions if payload.chronic_conditions is not None else payload.conditions,
        "med": payload.medications, "ins": payload.health_insurance_info,
        "ecn": payload.emergency_contact_name, "ecp": payload.emergency_contact_phone, "dn": payload.doctor_notes,
    })).mappings().first()
    await db.commit()
    return _row(row)


# ── Infirmary visits ──────────────────────────────────────────────────────────

class InfirmaryVisitIn(BaseModel):
    student_id: UUID
    symptoms: Optional[str] = Field(default=None, max_length=2000)
    reason: Optional[str] = Field(default=None, max_length=2000)  # the screen's name for it
    treatment: Optional[str] = Field(default=None, max_length=2000)
    treatment_given: Optional[str] = Field(default=None, max_length=2000)
    medication_given: Optional[str] = Field(default=None, max_length=500)
    doctor_notes: Optional[str] = Field(default=None, max_length=4000)
    nurse_name: Optional[str] = Field(default=None, max_length=120)
    status: Optional[str] = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _has_reason(self):
        if not (self.symptoms or self.reason or "").strip():
            raise ValueError("Say why the student came to the infirmary.")
        return self


INFIRMARY_COLUMNS = (
    "id, school_id, student_id, visit_date, symptoms, symptoms AS reason, treatment, "
    "treatment AS treatment_given, medication_given, doctor_notes, nurse_name, status"
)


@router.get("/infirmary")
@router.get("/infirmary-logs")
async def list_infirmary_visit_logs(db: DbSession, current_user: CurrentUser, student_id: Optional[UUID] = Query(None)):
    sid = _school(current_user)
    ids = await _visible_students(db, current_user, sid, student_id)
    rows = (await db.execute(text(
        f"SELECT {INFIRMARY_COLUMNS} FROM infirmary_visit_logs WHERE school_id = CAST(:sid AS uuid)"
        + _student_filter(ids) + " ORDER BY visit_date DESC NULLS LAST LIMIT 500"
    ), _binds(sid, ids))).mappings().all()
    return [_row(r) for r in rows]


@router.post("/infirmary")
@router.post("/infirmary-logs")
async def log_infirmary_visit(payload: InfirmaryVisitIn, db: DbSession, current_user: CurrentUser):
    if not _is_staff(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only school staff can record an infirmary visit.")
    sid = _school(current_user)
    await _require_student(db, sid, payload.student_id)
    row = (await db.execute(text(
        f"""
        INSERT INTO infirmary_visit_logs
          (school_id, student_id, visit_date, symptoms, treatment, medication_given, doctor_notes, nurse_name, status)
        VALUES (CAST(:sid AS uuid), CAST(:st AS uuid), now(), :sym, :tr, :med, :dn, :nurse, :st_)
        RETURNING {INFIRMARY_COLUMNS}
        """
    ), {
        "sid": sid, "st": str(payload.student_id),
        "sym": (payload.symptoms or payload.reason or "").strip(),
        "tr": payload.treatment if payload.treatment is not None else payload.treatment_given,
        "med": payload.medication_given, "dn": payload.doctor_notes, "nurse": payload.nurse_name,
        "st_": (payload.status or "recorded").strip(),
    })).mappings().first()
    await db.commit()
    return _row(row)


# ── Vaccinations ──────────────────────────────────────────────────────────────

class VaccinationIn(BaseModel):
    student_id: UUID
    vaccine_name: str = Field(min_length=1, max_length=120)
    dose_number: Optional[int] = Field(default=None, ge=1, le=20)
    administered_date: date
    next_due_date: Optional[date] = None


@router.get("/vaccinations")
async def list_vaccinations(db: DbSession, current_user: CurrentUser, student_id: Optional[UUID] = Query(None)):
    sid = _school(current_user)
    ids = await _visible_students(db, current_user, sid, student_id)
    rows = (await db.execute(text(
        "SELECT id, student_id, vaccine_name, dose_number, administered_date, next_due_date, status "
        "FROM vaccination_records WHERE school_id = CAST(:sid AS uuid)"
        + _student_filter(ids) + " ORDER BY administered_date DESC NULLS LAST"
    ), _binds(sid, ids))).mappings().all()
    return [_row(r) for r in rows]


@router.post("/vaccinations")
async def record_vaccination(payload: VaccinationIn, db: DbSession, current_user: CurrentUser):
    _require(current_user, HEALTH_WRITERS, "record a vaccination")
    sid = _school(current_user)
    await _require_student(db, sid, payload.student_id)
    row = (await db.execute(text(
        """
        INSERT INTO vaccination_records
          (school_id, student_id, vaccine_name, dose_number, administered_date, next_due_date, status, recorded_by)
        VALUES (CAST(:sid AS uuid), CAST(:st AS uuid), :name, :dose, :given, :due, 'administered', CAST(:uid AS uuid))
        RETURNING id, student_id, vaccine_name, dose_number, administered_date, next_due_date, status
        """
    ), {
        "sid": sid, "st": str(payload.student_id), "name": payload.vaccine_name.strip(),
        "dose": str(payload.dose_number) if payload.dose_number else None,
        "given": payload.administered_date.isoformat(), "due": payload.next_due_date,
        "uid": str(current_user.id),
    })).mappings().first()
    await db.commit()
    return _row(row)


# ── First-aid incidents ───────────────────────────────────────────────────────

class FirstAidIn(BaseModel):
    student_id: UUID
    incident_type: Optional[str] = Field(default=None, max_length=200)
    incident_description: Optional[str] = Field(default=None, max_length=2000)  # the screen's name
    action_taken: Optional[str] = Field(default=None, max_length=2000)
    first_aid_given: Optional[str] = Field(default=None, max_length=2000)  # the screen's name
    location: Optional[str] = Field(default=None, max_length=120)
    incident_date: Optional[date] = None

    @model_validator(mode="after")
    def _has_content(self):
        if not (self.incident_type or self.incident_description or "").strip():
            raise ValueError("Describe what happened.")
        if not (self.action_taken or self.first_aid_given or "").strip():
            raise ValueError("Say what first aid was given.")
        return self


INCIDENT_COLUMNS = (
    "id, student_id, incident_type, incident_type AS incident_description, location, action_taken, "
    "action_taken AS first_aid_given, parent_notified, reporter_user_id, "
    "COALESCE(incident_date, (created_at AT TIME ZONE 'Asia/Karachi')::date) AS incident_date, created_at"
)


@router.get("/incidents")
@router.get("/first-aid")
async def list_incidents(db: DbSession, current_user: CurrentUser, student_id: Optional[UUID] = Query(None)):
    sid = _school(current_user)
    ids = await _visible_students(db, current_user, sid, student_id)
    rows = (await db.execute(text(
        f"SELECT {INCIDENT_COLUMNS} FROM first_aid_incidents WHERE school_id = CAST(:sid AS uuid)"
        + _student_filter(ids) + " ORDER BY created_at DESC NULLS LAST LIMIT 500"
    ), _binds(sid, ids))).mappings().all()
    return [_row(r) for r in rows]


@router.post("/incidents")
@router.post("/first-aid")
async def log_first_aid_incident(payload: FirstAidIn, db: DbSession, current_user: CurrentUser):
    if not _is_staff(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only school staff can record a first-aid incident.")
    sid = _school(current_user)
    await _require_student(db, sid, payload.student_id)
    description = (payload.incident_type or payload.incident_description or "").strip()
    action = (payload.action_taken or payload.first_aid_given or "").strip()

    # Tell the student's guardians who have an account, and record whether anyone was told.
    guardians = [r[0] for r in (await db.execute(text(
        "SELECT DISTINCT g.user_id::text FROM student_guardians g "
        "WHERE g.student_id = CAST(:st AS uuid) AND g.user_id IS NOT NULL"
    ), {"st": str(payload.student_id)})).all()]

    row = (await db.execute(text(
        f"""
        INSERT INTO first_aid_incidents
          (school_id, student_id, incident_type, location, action_taken, parent_notified, incident_date, reporter_user_id)
        VALUES (CAST(:sid AS uuid), CAST(:st AS uuid), :what, :where, :action, :notified,
                COALESCE(CAST(:day AS date), (now() AT TIME ZONE 'Asia/Karachi')::date), CAST(:uid AS uuid))
        RETURNING {INCIDENT_COLUMNS}
        """
    ), {
        "sid": sid, "st": str(payload.student_id), "what": description, "where": payload.location,
        "action": action, "notified": bool(guardians),
        "day": payload.incident_date.isoformat() if payload.incident_date else None, "uid": str(current_user.id),
    })).mappings().first()

    for guardian in guardians:
        await db.execute(text(
            """
            INSERT INTO app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, category)
            VALUES (CAST(:sid AS uuid), CAST(:uid AS uuid), 'health', 'First aid given to your child',
                    :body, 'first_aid_incidents', CAST(:iid AS uuid), 'wellbeing')
            """
        ), {"sid": sid, "uid": guardian, "iid": str(row["id"]),
            "body": f"{description}. First aid: {action}."[:500]})
    await db.commit()
    out = _row(row)
    out["guardians_notified"] = len(guardians)
    out["message"] = (
        f"Recorded. {len(guardians)} guardian{'s' if len(guardians) != 1 else ''} notified."
        if guardians else "Recorded. No guardian of this student has an account, so nobody was notified."
    )
    return out


# ── Emergency medical contacts ────────────────────────────────────────────────

class ContactIn(BaseModel):
    contact_name: str = Field(min_length=2, max_length=120)
    specialty: Optional[str] = Field(default=None, max_length=120)
    phone: str = Field(min_length=5, max_length=40)
    hospital_name: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=400)


@router.get("/directory")
async def list_contacts(db: DbSession, current_user: CurrentUser):
    sid = _school(current_user)
    rows = (await db.execute(text(
        "SELECT id, contact_name, specialty, phone, hospital_name, address FROM school_medical_contacts "
        "WHERE school_id = CAST(:sid AS uuid) ORDER BY contact_name"
    ), {"sid": sid})).mappings().all()
    return [_row(r) for r in rows]


@router.post("/directory")
async def add_contact(payload: ContactIn, db: DbSession, current_user: CurrentUser):
    _require(current_user, HEALTH_WRITERS, "change the emergency contacts")
    sid = _school(current_user)
    row = (await db.execute(text(
        """
        INSERT INTO school_medical_contacts (school_id, contact_name, specialty, phone, hospital_name, address, created_by)
        VALUES (CAST(:sid AS uuid), :n, :sp, :ph, :h, :a, CAST(:uid AS uuid))
        RETURNING id, contact_name, specialty, phone, hospital_name, address
        """
    ), {"sid": sid, "n": payload.contact_name.strip(), "sp": payload.specialty, "ph": payload.phone.strip(),
        "h": payload.hospital_name, "a": payload.address, "uid": str(current_user.id)})).mappings().first()
    await db.commit()
    return _row(row)


@router.delete("/directory/{contact_id}")
async def remove_contact(contact_id: UUID, db: DbSession, current_user: CurrentUser):
    _require(current_user, HEALTH_WRITERS, "change the emergency contacts")
    sid = _school(current_user)
    res = await db.execute(text(
        "DELETE FROM school_medical_contacts WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"
    ), {"id": str(contact_id), "sid": sid})
    await db.commit()
    if not res.rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That contact was not found.")
    return {"ok": True}


# ── Wellness check-ins ────────────────────────────────────────────────────────

class SurveyIn(BaseModel):
    student_id: UUID
    mood_score: int = Field(ge=1, le=10)
    stress_level: int = Field(ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/surveys")
async def submit_survey(payload: SurveyIn, db: DbSession, current_user: CurrentUser):
    sid = _school(current_user)
    await _require_student(db, sid, payload.student_id)
    if not _is_staff(current_user):
        await _visible_students(db, current_user, sid, payload.student_id)  # own child / self only
    row = (await db.execute(text(
        """
        INSERT INTO wellbeing_surveys (school_id, student_id, submitted_by, mood_score, stress_level, notes)
        VALUES (CAST(:sid AS uuid), CAST(:st AS uuid), CAST(:uid AS uuid), :m, :s, :n)
        RETURNING id, student_id, mood_score, stress_level, notes, created_at
        """
    ), {"sid": sid, "st": str(payload.student_id), "uid": str(current_user.id),
        "m": payload.mood_score, "s": payload.stress_level, "n": payload.notes})).mappings().first()
    await db.commit()
    return _row(row)


@router.get("/surveys/summary")
async def survey_summary(db: DbSession, current_user: CurrentUser, student_id: Optional[UUID] = Query(None),
                         days: int = Query(30, ge=1, le=365)):
    """Average mood and stress over the last `days`, for the school or one student."""
    sid = _school(current_user)
    ids = await _visible_students(db, current_user, sid, student_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    row = (await db.execute(text(
        "SELECT COUNT(*) AS responses, ROUND(AVG(mood_score)::numeric, 1) AS average_mood_score, "
        "ROUND(AVG(stress_level)::numeric, 1) AS average_stress_level "
        "FROM wellbeing_surveys WHERE school_id = CAST(:sid AS uuid) AND created_at >= :since"
        + _student_filter(ids)
    ), _binds(sid, ids, since=since))).mappings().first()
    responses = int(row["responses"] or 0)
    if not responses:
        # No check-ins is not an average of zero.
        return None
    return {
        "responses": responses,
        "period_days": days,
        "average_mood_score": float(row["average_mood_score"]),
        "average_stress_level": float(row["average_stress_level"]),
    }
