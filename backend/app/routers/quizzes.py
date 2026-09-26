"""
Taking an MCQ quiz: the questions without the answers, and grading on the
server (see app/utils/quiz.py for why).
"""
from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession
from app.utils import quiz as quizlib
from app.utils.security import get_allowed_student_ids

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])


class QuizSubmission(BaseModel):
    student_id: UUID
    answers: Dict[str, str] = Field(default_factory=dict)


async def _assignment(db, assignment_id: UUID, school_id) -> dict:
    row = (await db.execute(
        text("SELECT id, school_id, class_section_id, title, description, max_marks, due_date, status"
             " FROM assignments WHERE id = :id AND school_id = CAST(:sid AS uuid)"),
        {"id": assignment_id, "sid": str(school_id)},
    )).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return dict(row)


async def _own_student(db, user, student_id: UUID) -> None:
    allowed = await get_allowed_student_ids(user, db)
    if allowed is not None and str(student_id) not in {str(s) for s in allowed}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only take a quiz as yourself or for your own child.")


async def _existing(db, assignment_id: UUID, student_id: UUID):
    return (await db.execute(
        text("SELECT id, status, content, marks FROM assignment_submissions"
             " WHERE assignment_id = :a AND student_id = :s ORDER BY submitted_at DESC NULLS LAST LIMIT 1"),
        {"a": assignment_id, "s": student_id},
    )).mappings().first()


def _review(parsed: dict, answers: Dict[str, str]) -> list:
    return [{**q, "yourAnswer": answers.get(str(q["questionNumber"]))} for q in parsed["questions"]]


@router.get("/{assignment_id}")
async def get_quiz(assignment_id: UUID, current_user: CurrentUser, db: DbSession,
                   student_id: Optional[UUID] = None):
    """The questions; with the answers and explanations once this student has handed it in."""
    if not current_user.school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No school context")
    a = await _assignment(db, assignment_id, current_user.school_id)
    parsed = quizlib.parse(a["description"])
    if not parsed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This assignment is not a quiz")
    staff = (await get_allowed_student_ids(current_user, db)) is None
    submitted = None
    if student_id:
        await _own_student(db, current_user, student_id)
        submitted = await _existing(db, assignment_id, student_id)
    if staff or submitted:
        answers = {}
        if submitted and (submitted["content"] or "").startswith("[ALTRIX_QUIZ_SUBMISSION]:"):
            import json
            try:
                answers = json.loads(submitted["content"][len("[ALTRIX_QUIZ_SUBMISSION]:"):])
            except ValueError:
                answers = {}
        return {"instructions": parsed["instructions"], "questions": _review(parsed, answers),
                "submitted": bool(submitted), "marks": submitted["marks"] if submitted else None}
    return {"instructions": parsed["instructions"], "submitted": False, "marks": None,
            "questions": [{k: q[k] for k in ("questionNumber", "question", "options")} for q in parsed["questions"]]}


@router.post("/{assignment_id}/submit")
async def submit_quiz(assignment_id: UUID, body: QuizSubmission, current_user: CurrentUser, db: DbSession):
    """Grade the answers against the key and record the submission."""
    import json

    if not current_user.school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No school context")
    await _own_student(db, current_user, body.student_id)
    a = await _assignment(db, assignment_id, current_user.school_id)
    parsed = quizlib.parse(a["description"])
    if not parsed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This assignment is not a quiz")
    enrolled = (await db.execute(
        text("SELECT 1 FROM student_enrollments WHERE student_id = :s AND class_section_id = :c"
             " AND end_date IS NULL LIMIT 1"),
        {"s": body.student_id, "c": a["class_section_id"]},
    )).first() if a["class_section_id"] else True
    if not enrolled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This quiz is not set for your class.")
    missing = [q["questionNumber"] for q in parsed["questions"] if not body.answers.get(str(q["questionNumber"]))]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Please answer every question (missing: {', '.join(map(str, missing))}).")

    result = quizlib.grade(parsed, body.answers, a["max_marks"])
    now = datetime.now(timezone.utc)
    due = a["due_date"]
    late = bool(due and (due if getattr(due, "tzinfo", None) else
                         datetime(due.year, due.month, due.day, 23, 59, 59, tzinfo=timezone.utc)) < now)
    graded = result["marks"] is not None
    state = "late" if late else ("graded" if graded else "submitted")
    feedback = (f"Auto-graded: {result['correct']} of {result['gradable']} correct."
                + (f" {result['total'] - result['gradable']} question(s) have no answer key and need the teacher."
                   if result["gradable"] < result["total"] else "")) if graded else \
        "No answer key on this quiz; the teacher will mark it."
    params = {"a": assignment_id, "s": body.student_id, "sid": str(current_user.school_id),
              "content": "[ALTRIX_QUIZ_SUBMISSION]:" + json.dumps(body.answers), "state": state,
              "marks": result["marks"], "fb": feedback, "now": now,
              "graded": now if result["marks"] is not None else None}
    existing = await _existing(db, assignment_id, body.student_id)
    # Once handed in, the answers are shown; a second attempt would be marked
    # against answers already seen (late submissions included).
    if existing and (existing["status"] == "graded"
                     or (existing["content"] or "").startswith("[ALTRIX_QUIZ_SUBMISSION]:")):
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz has already been handed in.")
    if existing:
        await db.execute(text(
            "UPDATE assignment_submissions SET content = :content, status = :state, marks = :marks,"
            " marks_obtained = :marks, feedback = :fb, submitted_at = :now,"
            " graded_at = CAST(:graded AS timestamptz) WHERE id = :id"), {**params, "id": existing["id"]})
    else:
        await db.execute(text(
            "INSERT INTO assignment_submissions (school_id, assignment_id, student_id, content, status, marks,"
            " marks_obtained, feedback, submitted_at, graded_at) VALUES (CAST(:sid AS uuid), :a, :s, :content,"
            " :state, :marks, :marks, :fb, :now, CAST(:graded AS timestamptz))"), params)
    await db.commit()
    return {**{k: (str(v) if k == "marks" and v is not None else v) for k, v in result.items()},
            "status": state, "feedback": feedback, "questions": _review(parsed, body.answers)}
