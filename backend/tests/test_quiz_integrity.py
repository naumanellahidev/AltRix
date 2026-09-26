# -*- coding: utf-8 -*-
"""
A student is sent the questions, not the answers, and cannot mark themselves.

The quiz preview printed "Correct Answer: C" under each question; the browser
graded the quiz and wrote the marks itself (a student could submit any
mark); a question with no key counted "A" as correct.
"""
import json
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.utils import quiz  # noqa: E402
from app.utils import family_scope as fs  # noqa: E402
from app.routers import vps_db as v  # noqa: E402

TEXT = """Please complete the following quiz.
**Q1: Which part of the plant goes down into the soil?**
A. The leaf
B. The stem
C. The roots
D. The flower
*Correct Answer: C* *Explanation: Roots go down into the soil.*
**Q2: What do plants need?**
A. Sunlight
B. Plastic
Correct Answer: A
Explanation: Light for photosynthesis.
**Q3: A question with no key?**
A. Yes
B. No
"""
JSON_Q = quiz.JSON_PREFIX + json.dumps({"instructions": "Answer all", "questions": [
    {"questionNumber": 1, "question": "2+2?", "options": ["3", "4"], "correctAnswer": "B", "explanation": "Sum"}]})


def test_the_text_quiz_is_parsed_without_inventing_answers():
    q = quiz.parse(TEXT)
    assert [x["correctAnswer"] for x in q["questions"]] == ["C", "A", None]
    assert q["questions"][0]["options"] == ["The leaf", "The stem", "The roots", "The flower"]


def test_a_student_sees_no_answer_or_explanation():
    view = quiz.student_view(TEXT)
    assert "Correct Answer" not in view and "Explanation" not in view and "Roots go down" not in view
    assert "Which part of the plant" in view and "The roots" in view
    jv = quiz.student_view(JSON_Q)
    assert "correctAnswer" not in jv and "explanation" not in jv and "2+2?" in jv


def test_grading_counts_only_keyed_questions_and_scales_to_max_marks():
    r = quiz.grade(quiz.parse(TEXT), {"1": "C", "2": "B", "3": "A"}, 10)
    assert r["gradable"] == 2 and r["correct"] == 1 and str(r["marks"]) == "5.00"


def test_family_reads_of_assignments_are_redacted():
    rows = [{"id": "x", "description": TEXT}, {"assignments": {"description": JSON_Q}}]
    fs.redact_rows(rows)
    assert "Correct Answer" not in rows[0]["description"]
    assert "correctAnswer" not in rows[1]["assignments"]["description"]


@pytest.mark.parametrize("item", [{"marks": 10}, {"marks_obtained": 5}, {"feedback": "great"},
                                  {"status": "graded"}])
def test_a_family_cannot_mark_its_own_work(item):
    with pytest.raises(HTTPException) as err:
        v._family_guard_values(fs.WRITE_RULES["assignment_submissions"], item)
    assert err.value.status_code == 403


def test_handing_work_in_is_still_allowed():
    v._family_guard_values(fs.WRITE_RULES["assignment_submissions"], {"status": "submitted", "content": "x"})


def test_the_browser_no_longer_grades():
    for screen in ("student-modules/StudentAssignmentsModule.tsx", "parent-modules/ParentAssignmentsModule.tsx"):
        src = open("../src/pages/tenant/" + screen, encoding="utf-8").read()
        assert "/submit`" in src and "marks_obtained: quizMarks" not in src and 'correctAnswer = "A"' not in src
