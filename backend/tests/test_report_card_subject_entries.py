# -*- coding: utf-8 -*-
"""
The subject lines a report card prints.

`report_card_subject_entries` held no rows at all, for any school. The Report
Cards screen saved the card header and the exam results but never the
per-subject lines, and the printed card reads exactly those lines — so every
card came out of the printer complete except for its marks, under the sentence
"No subject results have been recorded on this card".

The table has no `school_id`, so the data proxy refuses to write it; the
scoping has to come from the card's own school, which is what this endpoint
does.
"""
import ast
import io

SRC = io.open("app/routers/report_cards.py", encoding="utf-8").read()
TREE = ast.parse(SRC)
MIGRATION = io.open(
    "sql_migrations/20260922020000_backfill_report_card_subject_entries.sql", encoding="utf-8"
).read()


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


SAVE = fn("replace_subject_entries")


def test_the_endpoint_exists_and_replaces_rather_than_appends():
    assert '@router.put("/{card_id}/subject-entries"' in SRC
    assert "delete(ReportCardSubjectEntry)" in SAVE


def test_only_academic_staff_may_write_a_childs_marks():
    assert "ACADEMIC_GOV" in SAVE and "ForbiddenError" in SAVE


def test_it_stays_inside_the_cards_own_school():
    assert "require_school_match(current_user, card.school_id)" in SAVE


def test_a_subject_with_no_mark_is_still_recorded():
    # Dropping the row would remove the subject from the child's card; a blank
    # mark means "not recorded", which the printed card states in words.
    assert "if entry.marks_obtained" not in SAVE
    assert "continue" not in SAVE


def test_the_order_the_school_chose_is_kept():
    assert "sort_order=entry.sort_order if entry.sort_order is not None else i" in SAVE


# ── The cards that already existed ───────────────────────────────────────────

def test_the_backfill_only_fills_cards_that_have_no_lines():
    assert "NOT EXISTS (" in MIGRATION
    assert "FROM public.report_card_subject_entries e" in MIGRATION


def test_the_backfill_rebuilds_from_the_results_the_card_was_computed_from():
    assert "JOIN public.exam_results er" in MIGRATION
    assert "er.exam_id = rc.exam_id" in MIGRATION
    assert "er.student_id = rc.student_id" in MIGRATION
    assert "er.school_id = rc.school_id" in MIGRATION


def test_the_backfill_never_touches_a_card_it_cannot_rebuild():
    assert "rc.exam_id IS NOT NULL" in MIGRATION


def test_the_backfill_does_not_delete_or_update_anything():
    upper = MIGRATION.upper()
    assert "DELETE FROM" not in upper
    assert "UPDATE PUBLIC.REPORT_CARD" not in upper


def test_the_id_column_gets_the_default_it_never_had():
    assert "ALTER COLUMN id SET DEFAULT gen_random_uuid()" in MIGRATION


def test_the_migration_is_registered_and_transactional():
    listed = io.open("app/sql_migrations.py", encoding="utf-8").read()
    assert "20260922020000_backfill_report_card_subject_entries.sql" in listed
    assert "BEGIN;" in MIGRATION and MIGRATION.strip().endswith("COMMIT;")
    assert "Idempotent" in MIGRATION
