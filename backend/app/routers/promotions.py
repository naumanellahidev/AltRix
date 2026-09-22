"""
Moving a school up a year.

At the end of an annual session every child either moves up, stays where they
are, or leaves at the top of the school — and until now none of that existed.
`student_enrollments` held a section and two dates, nothing named the year, and
no table recorded who had decided what. A school's only option was to re-enrol
every student by hand.

This router does it as one reviewed, reversible run:

    preview  →  the principal sees every child, their annual result, and what
                is proposed for them, and may override any of it
    run      →  enrolments are closed and reopened in the new year, and every
                decision is recorded with who made it
    undo     →  a whole run is reversed, by its batch

Nothing is guessed. A child with no annual result is shown as having none and
is not promoted by default; a class with nowhere to promote to says so rather
than inventing a section.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError, NotFoundError
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/promotions", tags=["Promotions"])

#: Who may move a school up a year. This changes a child's class, so it sits
#: with the academic governance roles, not with a class teacher.
PROMOTION_ROLES = ACADEMIC_GOV

#: The pass mark used when a school has not given one.
DEFAULT_PASS_MARK = 40.0

OUTCOMES = ("promoted", "retained", "graduated")


def _require_promotion_access(current_user) -> None:
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective for r in PROMOTION_ROLES)):
        raise ForbiddenError("Permission denied: only the academic office can promote students")


# ─── Sessions ────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str = Field(min_length=4, max_length=40)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    make_current: bool = False


@router.get("/sessions")
async def list_sessions(current_user: CurrentUser, db: DbSession):
    """Every academic year this school has, newest first."""
    _require_promotion_access(current_user)
    rows = (
        await db.execute(
            text(
                """
                SELECT s.id::text, s.name, s.start_date, s.end_date, s.is_current,
                       (SELECT COUNT(*) FROM student_enrollments e
                         WHERE e.session_id = s.id AND e.end_date IS NULL) AS enrolled
                  FROM academic_sessions s
                 WHERE s.school_id = CAST(:sid AS uuid)
                 ORDER BY s.is_current DESC, s.name DESC
                """
            ),
            {"sid": str(current_user.school_id)},
        )
    ).fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "start_date": r[2].isoformat() if r[2] else None,
            "end_date": r[3].isoformat() if r[3] else None,
            "is_current": bool(r[4]),
            "enrolled": int(r[5]),
        }
        for r in rows
    ]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(body: SessionCreate, current_user: CurrentUser, db: DbSession):
    """
    Open a new academic year.

    Making it current is a separate decision from creating it: a school
    usually prepares next year's session weeks before it starts.
    """
    _require_promotion_access(current_user)
    params = {
        "sid": str(current_user.school_id),
        "name": body.name.strip(),
        "start": body.start_date,
        "end": body.end_date,
    }
    exists = await db.execute(
        text("SELECT 1 FROM academic_sessions WHERE school_id = CAST(:sid AS uuid) AND name = :name"),
        params,
    )
    if exists.first():
        raise HTTPException(status_code=409, detail=f"This school already has a session called {body.name}.")

    row = (
        await db.execute(
            text(
                """
                INSERT INTO academic_sessions (school_id, name, start_date, end_date, is_current)
                VALUES (CAST(:sid AS uuid), :name, :start, :end, false)
                RETURNING id::text
                """
            ),
            params,
        )
    ).first()
    session_id = row[0]

    if body.make_current:
        await _make_current(db, str(current_user.school_id), session_id)

    await db.flush()
    return {"id": session_id, "name": body.name.strip(), "is_current": body.make_current}


async def _make_current(db, school_id: str, session_id: str) -> None:
    """Exactly one session is current; the partial unique index insists on it."""
    await db.execute(
        text("UPDATE academic_sessions SET is_current = false WHERE school_id = CAST(:sid AS uuid) AND is_current"),
        {"sid": school_id},
    )
    await db.execute(
        text(
            "UPDATE academic_sessions SET is_current = true, updated_at = now()"
            " WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"
        ),
        {"id": session_id, "sid": school_id},
    )


@router.post("/sessions/{session_id}/make-current")
async def make_session_current(session_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    _require_promotion_access(current_user)
    found = await db.execute(
        text("SELECT 1 FROM academic_sessions WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"),
        {"id": str(session_id), "sid": str(current_user.school_id)},
    )
    if found.first() is None:
        raise NotFoundError("Academic session", str(session_id))
    await _make_current(db, str(current_user.school_id), str(session_id))
    await db.flush()
    return {"id": str(session_id), "is_current": True}


# ─── Preview ─────────────────────────────────────────────────────────────────

@router.get("/preview")
async def preview_promotion(
    current_user: CurrentUser,
    db: DbSession,
    from_session_id: uuid.UUID = Query(..., description="The year being closed"),
    to_session_id: uuid.UUID = Query(..., description="The year being opened"),
    class_section_id: Optional[uuid.UUID] = Query(None, description="One section, or all of them"),
    pass_mark: float = Query(DEFAULT_PASS_MARK, ge=0, le=100),
):
    """
    Every child in the year being closed, with what is proposed for them.

    The proposal is exactly what the records support:

      * an annual result at or above the pass mark → promoted
      * an annual result below it                  → retained
      * the top class of the school                → graduated
      * no annual result recorded                  → retained, and said so

    Nothing here changes anything. The principal decides on this screen and
    the run below records those decisions.
    """
    _require_promotion_access(current_user)
    school_id = str(current_user.school_id)

    for session in (from_session_id, to_session_id):
        found = await db.execute(
            text("SELECT 1 FROM academic_sessions WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"),
            {"id": str(session), "sid": school_id},
        )
        if found.first() is None:
            raise NotFoundError("Academic session", str(session))

    params = {
        "sid": school_id,
        "from_session": str(from_session_id),
        "to_session": str(to_session_id),
        "section": str(class_section_id) if class_section_id else None,
    }

    rows = (
        await db.execute(
            text(
                """
                SELECT s.id::text                                   AS student_id,
                       TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) AS name,
                       COALESCE(s.student_code, s.registration_number, s.roll_number) AS code,
                       cs.id::text                                  AS section_id,
                       cs.name                                      AS section_name,
                       c.id::text                                   AS class_id,
                       c.name                                       AS class_name,
                       c.grade_level                                AS grade_level,
                       c.next_class_id::text                        AS next_class_id,
                       (SELECT rc.percentage
                          FROM report_cards rc
                         WHERE rc.student_id = s.id
                           AND rc.school_id = s.school_id
                           AND rc.period_type = 'annual'
                         ORDER BY rc.published_at DESC NULLS LAST, rc.created_at DESC
                         LIMIT 1)                                   AS annual_percentage,
                       (SELECT p.outcome FROM student_promotions p
                         WHERE p.student_id = s.id
                           AND p.from_session_id = CAST(:from_session AS uuid)
                         LIMIT 1)                                   AS already
                  FROM student_enrollments se
                  JOIN students s  ON s.id = se.student_id
                  JOIN class_sections cs ON cs.id = se.class_section_id
                  JOIN academic_classes c ON c.id = cs.class_id
                 WHERE se.school_id = CAST(:sid AS uuid)
                   AND se.session_id = CAST(:from_session AS uuid)
                   AND se.end_date IS NULL
                   AND (CAST(:section AS uuid) IS NULL OR cs.id = CAST(:section AS uuid))
                 ORDER BY c.grade_level NULLS LAST, cs.name, s.first_name
                """
            ),
            params,
        )
    ).fetchall()

    # Where each class leads, and which section in the new year receives it.
    targets = await _target_sections(db, school_id, str(to_session_id))

    out = []
    for r in rows:
        percentage = float(r[9]) if r[9] is not None else None
        next_class_id = r[8]
        if not next_class_id:
            next_class_id = await _next_class_by_grade(db, school_id, r[7])

        target = targets.get((next_class_id or "", r[4])) or targets.get((next_class_id or "", None))
        top_of_school = next_class_id is None

        if top_of_school:
            outcome = "graduated"
            reason = "This is the highest class in the school."
        elif percentage is None:
            outcome = "retained"
            reason = "No annual result has been recorded, so nothing supports a promotion yet."
        elif percentage >= pass_mark:
            outcome = "promoted"
            reason = f"Annual result {percentage:.2f}% is at or above the {pass_mark:.0f}% pass mark."
        else:
            outcome = "retained"
            reason = f"Annual result {percentage:.2f}% is below the {pass_mark:.0f}% pass mark."

        out.append(
            {
                "student_id": r[0],
                "name": r[1] or "Unnamed student",
                "student_code": r[2],
                "from_section_id": r[3],
                "from_section_name": r[4],
                "from_class_id": r[5],
                "from_class_name": r[6],
                "grade_level": r[7],
                "annual_percentage": None if percentage is None else round(percentage, 2),
                "proposed_outcome": outcome,
                "reason": reason,
                "to_class_id": next_class_id,
                "to_section_id": target["id"] if target else None,
                "to_section_name": target["label"] if target else None,
                # True when the child would move up but the new year has no
                # section to move them into.
                "needs_section": outcome == "promoted" and target is None,
                "already_decided": r[10],
            }
        )

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "pass_mark": pass_mark,
        "count": len(out),
        "students": out,
    }


async def _target_sections(db, school_id: str, to_session_id: str) -> dict:
    """
    Sections available in the new year, keyed by (class_id, section name) and
    by (class_id, None) for "any section of that class".
    """
    rows = (
        await db.execute(
            text(
                """
                SELECT cs.id::text, cs.name, cs.class_id::text, c.name
                  FROM class_sections cs
                  JOIN academic_classes c ON c.id = cs.class_id
                 WHERE cs.school_id = CAST(:sid AS uuid)
                   AND cs.session_id = CAST(:session AS uuid)
                 ORDER BY cs.name
                """
            ),
            {"sid": school_id, "session": to_session_id},
        )
    ).fetchall()

    targets: dict = {}
    for section_id, section_name, class_id, class_name in rows:
        label = f"{class_name} – {section_name}"
        targets[(class_id, section_name)] = {"id": section_id, "label": label}
        targets.setdefault((class_id, None), {"id": section_id, "label": label})
    return targets


async def _next_class_by_grade(db, school_id: str, grade_level) -> Optional[str]:
    """The next class up, when the school has not set an explicit successor."""
    if grade_level is None:
        return None
    row = (
        await db.execute(
            text(
                """
                SELECT id::text FROM academic_classes
                 WHERE school_id = CAST(:sid AS uuid)
                   AND grade_level IS NOT NULL
                   AND grade_level > :level
                 ORDER BY grade_level
                 LIMIT 1
                """
            ),
            {"sid": school_id, "level": int(grade_level)},
        )
    ).first()
    return row[0] if row else None


# ─── The run ─────────────────────────────────────────────────────────────────

class PromotionDecision(BaseModel):
    student_id: uuid.UUID
    outcome: str
    to_section_id: Optional[uuid.UUID] = None
    result_percentage: Optional[float] = None
    note: Optional[str] = None


class PromotionRun(BaseModel):
    from_session_id: uuid.UUID
    to_session_id: uuid.UUID
    decisions: List[PromotionDecision]
    #: Carry each section's teachers into the section students move into, where
    #: that section has none of its own yet.
    carry_teachers: bool = True


@router.post("/run")
async def run_promotion(body: PromotionRun, current_user: CurrentUser, db: DbSession):
    """
    Record the decisions and move the school up a year.

    For each child: the old enrolment is closed, a new one is opened in the
    receiving section for the new year, and the decision is written down with
    the result it was based on and who made it. A child already promoted out of
    this session is skipped rather than moved twice.

    The whole run shares one batch id, so it can be undone together.
    """
    _require_promotion_access(current_user)
    school_id = str(current_user.school_id)
    batch_id = str(uuid.uuid4())
    today = date.today()

    for session in (body.from_session_id, body.to_session_id):
        found = await db.execute(
            text("SELECT 1 FROM academic_sessions WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"),
            {"id": str(session), "sid": school_id},
        )
        if found.first() is None:
            raise NotFoundError("Academic session", str(session))

    promoted = retained = graduated = skipped = 0
    problems: List[str] = []

    for decision in body.decisions:
        if decision.outcome not in OUTCOMES:
            raise HTTPException(status_code=400, detail=f"Unknown outcome '{decision.outcome}'")

        current = (
            await db.execute(
                text(
                    """
                    SELECT se.id::text, se.class_section_id::text
                      FROM student_enrollments se
                     WHERE se.school_id = CAST(:sid AS uuid)
                       AND se.student_id = CAST(:student AS uuid)
                       AND se.session_id = CAST(:from_session AS uuid)
                       AND se.end_date IS NULL
                     LIMIT 1
                    """
                ),
                {
                    "sid": school_id,
                    "student": str(decision.student_id),
                    "from_session": str(body.from_session_id),
                },
            )
        ).first()
        if current is None:
            skipped += 1
            problems.append(f"{decision.student_id} is not enrolled in the year being closed; skipped.")
            continue

        already = await db.execute(
            text(
                "SELECT 1 FROM student_promotions"
                " WHERE student_id = CAST(:student AS uuid) AND from_session_id = CAST(:from_session AS uuid)"
            ),
            {"student": str(decision.student_id), "from_session": str(body.from_session_id)},
        )
        if already.first():
            skipped += 1
            continue

        target_section_id = str(decision.to_section_id) if decision.to_section_id else None
        if decision.outcome == "promoted":
            if not target_section_id:
                skipped += 1
                problems.append(
                    f"{decision.student_id} was marked for promotion with no class to move into; skipped."
                )
                continue
            belongs = await db.execute(
                text(
                    "SELECT 1 FROM class_sections"
                    " WHERE id = CAST(:section AS uuid) AND school_id = CAST(:sid AS uuid)"
                    "   AND session_id = CAST(:to_session AS uuid)"
                ),
                {"section": target_section_id, "sid": school_id, "to_session": str(body.to_session_id)},
            )
            if belongs.first() is None:
                skipped += 1
                problems.append(
                    f"{decision.student_id}: the chosen class is not part of the new year; skipped."
                )
                continue
        elif decision.outcome == "retained":
            # Same class, new year. The section must exist in the new session.
            target_section_id = await _same_section_next_year(
                db, school_id, current[1], str(body.to_session_id)
            )
            if target_section_id is None:
                skipped += 1
                problems.append(
                    f"{decision.student_id}: their present class does not exist in the new year; skipped."
                )
                continue
        else:  # graduated
            target_section_id = None

        # Close the old enrolment.
        await db.execute(
            text("UPDATE student_enrollments SET end_date = :today WHERE id = CAST(:id AS uuid)"),
            {"today": today, "id": current[0]},
        )

        # Open the new one, unless they have left the school.
        if target_section_id:
            await db.execute(
                text(
                    """
                    INSERT INTO student_enrollments (school_id, student_id, class_section_id, start_date, session_id)
                    VALUES (CAST(:sid AS uuid), CAST(:student AS uuid), CAST(:section AS uuid), :today,
                            CAST(:to_session AS uuid))
                    """
                ),
                {
                    "sid": school_id,
                    "student": str(decision.student_id),
                    "section": target_section_id,
                    "today": today,
                    "to_session": str(body.to_session_id),
                },
            )

        await db.execute(
            text(
                """
                INSERT INTO student_promotions (
                    school_id, student_id, from_session_id, to_session_id,
                    from_class_section_id, to_class_section_id,
                    outcome, result_percentage, note, batch_id, decided_by
                ) VALUES (
                    CAST(:sid AS uuid), CAST(:student AS uuid), CAST(:from_session AS uuid),
                    CAST(:to_session AS uuid), CAST(:from_section AS uuid),
                    CAST(:to_section AS uuid), :outcome, :percentage, :note,
                    CAST(:batch AS uuid), CAST(:by AS uuid)
                )
                """
            ),
            {
                "sid": school_id,
                "student": str(decision.student_id),
                "from_session": str(body.from_session_id),
                "to_session": str(body.to_session_id),
                "from_section": current[1],
                "to_section": target_section_id,
                "outcome": decision.outcome,
                "percentage": decision.result_percentage,
                "note": decision.note,
                "batch": batch_id,
                "by": current_user.id,
            },
        )

        if decision.outcome == "promoted":
            promoted += 1
        elif decision.outcome == "retained":
            retained += 1
        else:
            graduated += 1

    carried = 0
    if body.carry_teachers:
        carried = await _carry_teachers(db, school_id, str(body.from_session_id), str(body.to_session_id))

    await db.flush()
    return {
        "batch_id": batch_id,
        "promoted": promoted,
        "retained": retained,
        "graduated": graduated,
        "skipped": skipped,
        "teacher_assignments_carried": carried,
        "problems": problems,
    }


async def _same_section_next_year(db, school_id: str, section_id: str, to_session_id: str) -> Optional[str]:
    """The same class and section name, in the new year."""
    row = (
        await db.execute(
            text(
                """
                SELECT target.id::text
                  FROM class_sections source
                  JOIN class_sections target
                    ON target.class_id = source.class_id
                   AND target.name = source.name
                   AND target.session_id = CAST(:to_session AS uuid)
                 WHERE source.id = CAST(:section AS uuid)
                   AND source.school_id = CAST(:sid AS uuid)
                 LIMIT 1
                """
            ),
            {"section": section_id, "sid": school_id, "to_session": to_session_id},
        )
    ).first()
    return row[0] if row else None


async def _carry_teachers(db, school_id: str, from_session_id: str, to_session_id: str) -> int:
    """
    Give each new-year section the teachers its predecessor had.

    Only sections that have no assignment of their own are touched, so a
    principal who has already staffed next year is never overwritten — and a
    later change by the principal stands, because this never runs over it.
    """
    result = await db.execute(
        text(
            """
            INSERT INTO teacher_assignments (school_id, teacher_user_id, class_section_id, subject_id, campus_id)
            SELECT ta.school_id, ta.teacher_user_id, target.id, ta.subject_id, target.campus_id
              FROM teacher_assignments ta
              JOIN class_sections source ON source.id = ta.class_section_id
              JOIN class_sections target
                ON target.class_id = source.class_id
               AND target.name = source.name
               AND target.session_id = CAST(:to_session AS uuid)
             WHERE ta.school_id = CAST(:sid AS uuid)
               AND source.session_id = CAST(:from_session AS uuid)
               AND NOT EXISTS (
                     SELECT 1 FROM teacher_assignments existing
                      WHERE existing.class_section_id = target.id
                   )
            RETURNING id
            """
        ),
        {"sid": school_id, "from_session": from_session_id, "to_session": to_session_id},
    )
    return len(result.fetchall())


# ─── History and undo ────────────────────────────────────────────────────────

@router.get("/history")
async def promotion_history(current_user: CurrentUser, db: DbSession, limit: int = Query(20, ge=1, le=100)):
    """The runs this school has made, newest first."""
    _require_promotion_access(current_user)
    rows = (
        await db.execute(
            text(
                """
                SELECT p.batch_id::text,
                       MIN(p.decided_at)                                   AS decided_at,
                       COUNT(*)                                            AS total,
                       COUNT(*) FILTER (WHERE p.outcome = 'promoted')      AS promoted,
                       COUNT(*) FILTER (WHERE p.outcome = 'retained')      AS retained,
                       COUNT(*) FILTER (WHERE p.outcome = 'graduated')     AS graduated,
                       MAX(f.name)                                         AS from_session,
                       MAX(t.name)                                         AS to_session
                  FROM student_promotions p
             LEFT JOIN academic_sessions f ON f.id = p.from_session_id
             LEFT JOIN academic_sessions t ON t.id = p.to_session_id
                 WHERE p.school_id = CAST(:sid AS uuid)
                 GROUP BY p.batch_id
                 ORDER BY MIN(p.decided_at) DESC
                 LIMIT :limit
                """
            ),
            {"sid": str(current_user.school_id), "limit": limit},
        )
    ).fetchall()
    return [
        {
            "batch_id": r[0],
            "decided_at": r[1].isoformat() if r[1] else None,
            "total": int(r[2]),
            "promoted": int(r[3]),
            "retained": int(r[4]),
            "graduated": int(r[5]),
            "from_session": r[6],
            "to_session": r[7],
        }
        for r in rows
    ]


@router.post("/undo/{batch_id}")
async def undo_promotion(batch_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """
    Reverse one run.

    The new enrolments it opened are removed and the old ones are reopened, so
    the school is exactly where it was before the run. A promotion is a
    decision about a child's year; it has to be possible to take it back.
    """
    _require_promotion_access(current_user)
    school_id = str(current_user.school_id)

    rows = (
        await db.execute(
            text(
                """
                SELECT student_id::text, from_class_section_id::text, to_class_section_id::text,
                       from_session_id::text, to_session_id::text
                  FROM student_promotions
                 WHERE batch_id = CAST(:batch AS uuid) AND school_id = CAST(:sid AS uuid)
                """
            ),
            {"batch": str(batch_id), "sid": school_id},
        )
    ).fetchall()
    if not rows:
        raise NotFoundError("Promotion run", str(batch_id))

    reopened = 0
    for student_id, from_section, to_section, from_session, to_session in rows:
        if to_section:
            await db.execute(
                text(
                    """
                    DELETE FROM student_enrollments
                     WHERE school_id = CAST(:sid AS uuid)
                       AND student_id = CAST(:student AS uuid)
                       AND class_section_id = CAST(:section AS uuid)
                       AND session_id = CAST(:session AS uuid)
                       AND end_date IS NULL
                    """
                ),
                {"sid": school_id, "student": student_id, "section": to_section, "session": to_session},
            )
        if from_section:
            await db.execute(
                text(
                    """
                    UPDATE student_enrollments SET end_date = NULL
                     WHERE school_id = CAST(:sid AS uuid)
                       AND student_id = CAST(:student AS uuid)
                       AND class_section_id = CAST(:section AS uuid)
                       AND session_id = CAST(:session AS uuid)
                    """
                ),
                {"sid": school_id, "student": student_id, "section": from_section, "session": from_session},
            )
            reopened += 1

    await db.execute(
        text("DELETE FROM student_promotions WHERE batch_id = CAST(:batch AS uuid) AND school_id = CAST(:sid AS uuid)"),
        {"batch": str(batch_id), "sid": school_id},
    )
    await db.flush()
    return {"batch_id": str(batch_id), "reversed": len(rows), "enrolments_reopened": reopened}
