# -*- coding: utf-8 -*-
"""
Moving a school up a year.

None of this existed. `student_enrollments` held a section and two dates,
nothing named the academic year, `academic_classes.grade_level` was null for
every class in production, and no table recorded that a child had been
promoted, retained or graduated — so a school had to re-enrol every student by
hand with no record of who decided what.

The rules these tests hold in place are the ones a parent would ask about: a
child is promoted on a recorded result, never on a guess; a child with nowhere
to go is reported rather than moved; and a whole run can be taken back.
"""
import ast
import io

from app.routers.promotions import DEFAULT_PASS_MARK, OUTCOMES, PROMOTION_ROLES

SRC = io.open("app/routers/promotions.py", encoding="utf-8").read()
TREE = ast.parse(SRC)
MIGRATION = io.open(
    "sql_migrations/20260922050000_academic_sessions_and_promotions.sql", encoding="utf-8"
).read()


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


PREVIEW = fn("preview_promotion")
RUN = fn("run_promotion")
UNDO = fn("undo_promotion")


# ── Who may do it ────────────────────────────────────────────────────────────

def test_only_the_academic_office_may_promote():
    assert "principal" in PROMOTION_ROLES
    assert "teacher" not in PROMOTION_ROLES
    for name in ("preview_promotion", "run_promotion", "undo_promotion", "create_session"):
        assert "_require_promotion_access" in fn(name), name


# ── The proposal ─────────────────────────────────────────────────────────────

def test_the_three_outcomes_are_the_only_ones():
    assert OUTCOMES == ("promoted", "retained", "graduated")


def test_a_child_with_no_result_is_not_promoted():
    assert "No annual result has been recorded" in PREVIEW
    # and the branch that decides it comes before the pass-mark comparison
    assert PREVIEW.index("percentage is None") < PREVIEW.index("percentage >= pass_mark")


def test_the_pass_mark_is_stated_not_hidden():
    assert DEFAULT_PASS_MARK == 40.0
    assert "pass_mark" in PREVIEW
    assert "'pass_mark': pass_mark" in PREVIEW


def test_every_row_says_why():
    assert "'reason': reason" in PREVIEW
    assert "is at or above the" in PREVIEW and "is below the" in PREVIEW


def test_the_top_of_the_school_graduates_rather_than_promoting_into_nothing():
    assert "top_of_school" in PREVIEW
    assert "'graduated'" in PREVIEW


def test_a_child_already_decided_is_shown_as_such():
    assert "already_decided" in PREVIEW


def test_the_preview_changes_nothing():
    for forbidden in ("INSERT INTO", "UPDATE ", "DELETE FROM"):
        assert forbidden not in PREVIEW, forbidden


# ── The run ──────────────────────────────────────────────────────────────────

def test_a_promotion_without_a_receiving_class_is_skipped_and_reported():
    assert "was marked for promotion with no class to move into" in RUN
    assert "problems.append" in RUN


def test_a_child_is_never_promoted_out_of_the_same_year_twice():
    assert "SELECT 1 FROM student_promotions" in RUN
    assert "UNIQUE (student_id, from_session_id)" in MIGRATION


def test_the_receiving_class_must_belong_to_the_year_being_opened():
    assert "session_id = CAST(:to_session AS uuid)" in RUN
    assert "is not part of the new year" in RUN


def test_the_old_enrolment_is_closed_and_a_new_one_opened():
    assert "UPDATE student_enrollments SET end_date" in RUN
    assert "INSERT INTO student_enrollments" in RUN


def test_a_leaver_gets_no_new_enrolment():
    assert "if target_section_id:" in RUN


def test_the_decision_and_who_made_it_are_recorded():
    assert "INSERT INTO student_promotions" in RUN
    assert "decided_by" in MIGRATION
    assert "'by': current_user.id" in RUN


def test_the_run_stays_inside_one_school():
    assert RUN.count("school_id = CAST(:sid AS uuid)") >= 3


def test_one_run_is_one_batch_so_it_can_be_undone_together():
    assert "batch_id = str(uuid.uuid4())" in RUN
    assert "'batch_id': batch_id" in RUN


# ── Teachers ─────────────────────────────────────────────────────────────────

CARRY = fn("_carry_teachers")


def test_teachers_follow_their_class_into_the_new_year():
    assert "INSERT INTO teacher_assignments" in CARRY
    assert "target.name = source.name" in CARRY


def test_a_class_the_principal_has_already_staffed_is_never_overwritten():
    assert "NOT EXISTS" in CARRY
    assert "FROM teacher_assignments existing" in CARRY


# ── Undo ─────────────────────────────────────────────────────────────────────

def test_undo_removes_the_new_enrolment_and_reopens_the_old_one():
    assert "DELETE FROM student_enrollments" in UNDO
    assert "SET end_date = NULL" in UNDO


def test_undo_stays_inside_one_school():
    assert UNDO.count("school_id = CAST(:sid AS uuid)") >= 3


def test_undo_clears_the_record_so_the_year_can_be_run_again():
    assert "DELETE FROM student_promotions" in UNDO


# ── The schema ───────────────────────────────────────────────────────────────

def test_one_current_session_per_school():
    assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_sessions_current" in MIGRATION
    assert "WHERE is_current" in MIGRATION


def test_class_order_is_derived_where_a_school_never_set_it():
    assert "UPDATE public.academic_classes" in MIGRATION
    assert "grade_level IS NULL" in MIGRATION
    # and a school that did set it is left alone
    assert "AND sub.level IS NOT NULL" in MIGRATION


def test_a_school_can_state_its_own_progression():
    assert "next_class_id" in MIGRATION
    assert "next_class_id" in PREVIEW


def test_the_migration_is_registered_and_idempotent():
    listed = io.open("app/sql_migrations.py", encoding="utf-8").read()
    assert "20260922050000_academic_sessions_and_promotions.sql" in listed
    assert "Idempotent" in MIGRATION
    assert "BEGIN;" in MIGRATION and MIGRATION.strip().endswith("COMMIT;")


def test_nothing_in_the_migration_deletes_a_student_or_an_enrolment():
    upper = MIGRATION.upper()
    assert "DELETE FROM PUBLIC.STUDENT" not in upper
    assert "DROP TABLE" not in upper
