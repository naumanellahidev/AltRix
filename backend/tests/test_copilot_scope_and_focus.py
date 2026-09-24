# -*- coding: utf-8 -*-
"""
The Copilot answers about your school, and about what you asked.

Two separate complaints, two separate defects.

**Scope.** The endpoint resolved its school as
`current_user.school_id or request.headers["X-School-Id"]`. A header is
whatever the caller says it is, so any authenticated user whose token carried
no school could name someone else's school and have the Copilot read that
school's live records — its students, its fees, its salaries — straight back
to them.

**Focus.** The prompt was trimmed by cutting sections in the order the builder
wrote them until the budget ran out. The direct answer survived, because it is
written first; everything after that was kept or dropped by position. A
question about attendance could lose the attendance section because the fee
ledger happened to be written before it and was long — and then the model
answered about fees.
"""
import ast
import io
import os
import re

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers.misc import (  # noqa: E402
    AI_CONTEXT_BUDGET_CHARS,
    AI_CONTEXT_PINNED_MARKERS,
    _question_terms,
    trim_ai_context,
)

SRC = io.open("app/routers/misc.py", encoding="utf-8").read()
BUILDER = io.open("app/utils/ai_context_builder.py", encoding="utf-8").read()
TREE = ast.parse(SRC)

NL = chr(10)
GAP = NL + NL


def fn(name: str) -> str:
    node = next(
        n for n in ast.walk(TREE)
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == name
    )
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


# --- Scope -------------------------------------------------------------------

def test_only_a_super_admin_may_name_a_school_in_a_header():
    body = fn("copilot_chat")
    assert "current_user.is_super_admin" in body
    # The old expression must be gone entirely.
    assert not re.search(r"current_user\.school_id or request\.headers", body)


def test_another_school_named_in_the_header_is_refused():
    body = fn("copilot_chat")
    assert "You can only ask about your own school." in body
    assert "HTTP_403_FORBIDDEN" in body


def test_a_user_with_no_school_is_refused_rather_than_given_someone_elses():
    body = fn("copilot_chat")
    assert "not attached to a school" in body


def test_every_record_query_in_the_context_is_scoped():
    """No SELECT over a school-scoped table without a school filter.

    A query may also be scoped indirectly — through `:cids`, the parent's own
    children, or through a student id that was itself resolved with a school
    filter — so those count too.
    """
    scoped_tables = (
        "students", "fee_invoices", "fee_payments", "attendance_entries",
        "exam_results", "diary_entries", "report_cards", "admission_applications",
    )
    unscoped = []
    for statement in re.findall(r'"""(.*?)"""', BUILDER, re.S):
        lowered = statement.lower()
        if "select" not in lowered or "from" not in lowered:
            continue
        touches = any(
            re.search(rf"\b(from|join)\s+(public\.)?{table}\b", lowered)
            for table in scoped_tables
        )
        if not touches:
            continue
        if "school_id" in lowered or ":cids" in lowered or ":sid as uuid" in lowered:
            continue
        unscoped.append(" ".join(statement.split())[:120])
    assert not unscoped, "not scoped to a school: " + "; ".join(unscoped)


# --- Focus -------------------------------------------------------------------

def test_a_short_context_is_left_alone():
    context = "### Only section" + GAP + "### Another"
    assert trim_ai_context(context, budget=10_000, question="anything") == context


def test_the_section_that_answers_the_question_survives_a_long_one_that_does_not():
    sections = [
        "### Fee Ledger: " + "x" * 4000,
        "### Attendance Register: present absent late " + "y" * 2000,
        "### Holidays: " + "z" * 4000,
    ]
    out = trim_ai_context(GAP.join(sections), budget=3000, question="what is my attendance")
    assert "Attendance Register" in out
    assert "Fee Ledger" not in out


def test_the_direct_answer_is_never_cut():
    # Pinned even when the question shares no words with it.
    direct = "### 🎯 DIRECT QUERY ANSWER DATA (Your Salary): Rs. 90,000"
    filler = "### Something Else: " + "q" * 9000
    out = trim_ai_context(direct + GAP + filler, budget=200, question="zzzz")
    assert "DIRECT QUERY ANSWER DATA" in out


@pytest.mark.parametrize("marker", AI_CONTEXT_PINNED_MARKERS)
def test_every_pinned_marker_is_honoured(marker):
    pinned = f"### {marker} something"
    filler = "### Filler: " + "q" * 9000
    out = trim_ai_context(pinned + GAP + filler, budget=200, question="unrelated")
    assert marker in out


def test_nothing_is_cut_in_half():
    sections = ["### A: " + "a" * 1000, "### B: " + "b" * 1000, "### C: " + "c" * 1000]
    out = trim_ai_context(GAP.join(sections), budget=1200, question="b")
    for part in out.split(GAP):
        if part.startswith("["):
            continue  # the "some sections were left out" note
        assert part in sections


def test_the_model_is_told_when_records_were_left_out():
    # Otherwise it answers as though it had seen everything.
    sections = ["### A: " + "a" * 5000, "### B: " + "b" * 5000]
    out = trim_ai_context(GAP.join(sections), budget=5200, question="a")
    assert "left out of this prompt" in out


def test_sections_keep_the_order_the_builder_wrote_them_in():
    sections = ["### First: alpha", "### Second: beta", "### Third: gamma"]
    out = trim_ai_context(GAP.join(sections), budget=10, question="beta gamma")
    kept = [p for p in out.split(GAP) if not p.startswith("[")]
    assert kept == sorted(kept, key=lambda p: sections.index(p))


def test_the_budget_is_small_enough_for_the_model_it_runs_on():
    # Sixteen thousand characters was most of a small model's attention spent
    # on records that had nothing to do with the question.
    assert AI_CONTEXT_BUDGET_CHARS <= 10_000


# --- Picking the words to match on -------------------------------------------

@pytest.mark.parametrize("question,expected", [
    ("what is my attendance", {"attendance"}),
    ("kitni fee collect hui hai", {"fee", "collect", "hui"}),
    ("show me the unpaid invoices", {"unpaid", "invoices"}),
])
def test_question_terms_drop_the_filler_words(question, expected):
    assert _question_terms(question) == expected


def test_question_terms_cope_with_urdu_script():
    assert _question_terms("حاضری کتنی ہے")


def test_no_question_means_no_ranking_rather_than_a_crash():
    sections = ["### A: " + "a" * 5000, "### B: " + "b" * 5000]
    out = trim_ai_context(GAP.join(sections), budget=5200, question="")
    assert out  # still trims, just by the builder's own order
