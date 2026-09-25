"""
Checking a hall ticket from its QR code, without signing in.

The verification page — what an invigilator's phone opens on scanning the
code printed on an admit card — called ``verify_exam_hall_ticket`` through
the signed-in data proxy, which refuses anyone not logged in (401). The
person scanning at the door is rarely signed in on that phone, so the check
failed exactly where it was meant to be used.

The ids in the code are the exam's and the student's (random UUIDs, printed
only on the card). The function returns the student's name and photo, the
school, the exam and the papers the student sits — what the card itself
already shows. Rate-limited per visitor.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from app.dependencies import DbSession
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/public-verify", tags=["Public verification"])


@router.get("/hall-ticket/{exam_id}/{student_id}")
@limiter.limit("30/minute")
async def verify_hall_ticket(request: Request, exam_id: UUID, student_id: UUID, db: DbSession):
    result = (await db.execute(
        text("SELECT verify_exam_hall_ticket(CAST(:e AS uuid), CAST(:s AS uuid))"),
        {"e": str(exam_id), "s": str(student_id)},
    )).scalar()
    if not result:
        raise HTTPException(status_code=404, detail="This hall ticket could not be found.")
    return result
