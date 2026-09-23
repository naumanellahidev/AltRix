"""
The ON CONFLICT predicate, for upserts against a partial unique index.

`report_cards` is keyed two ways: exam cards by (exam_id, student_id), and
every other card by (school_id, student_id, period_type, period_label) — but
that second index is partial, `WHERE exam_id IS NULL`. Postgres refuses to use
a partial index as a conflict arbiter unless the statement repeats its
predicate, so saving a monthly, termly or annual card failed outright with
"there is no unique or exclusion constraint matching the ON CONFLICT
specification".

The predicate therefore has to reach the statement. It is interpolated into
the SQL — it cannot be a bind parameter — so it is allowed exactly one shape
and nothing else.
"""
import pytest

from app.routers.vps_db import build_conflict_where

COLUMNS = {"id", "school_id", "student_id", "exam_id", "period_type", "period_label"}


def _build(predicate):
    return build_conflict_where(predicate, COLUMNS)


# --- What it is for ----------------------------------------------------------

def test_null_predicate_is_emitted_quoted():
    assert _build("exam_id IS NULL") == ' WHERE "exam_id" IS NULL'


def test_not_null_predicate_is_emitted_quoted():
    assert _build("exam_id IS NOT NULL") == ' WHERE "exam_id" IS NOT NULL'


@pytest.mark.parametrize("spelling", [
    "exam_id is null",
    "EXAM_ID IS NULL",
    "  exam_id   IS   NULL  ",
    "exam_id\tIS\tNULL",
])
def test_spelling_and_spacing_do_not_matter(spelling):
    assert _build(spelling) == ' WHERE "exam_id" IS NULL'


@pytest.mark.parametrize("empty", [None, "", False])
def test_no_predicate_means_no_where(empty):
    # An upsert against an ordinary unique index must not grow a WHERE clause.
    assert _build(empty) == ""


# --- What it refuses ---------------------------------------------------------

@pytest.mark.parametrize("payload", [
    # stack a second statement
    "exam_id IS NULL; DROP TABLE students; --",
    # widen the predicate so the arbiter matches rows it should not
    "exam_id IS NULL OR 1=1",
    "exam_id IS NULL AND period_type = 'annual'",
    # break out of the quoted identifier
    'exam_id" IS NULL OR "1"="1',
    # a comparison rather than a null test
    "exam_id = '00000000-0000-0000-0000-000000000000'",
    "1=1",
    # a function call
    "pg_sleep(10) IS NULL",
    # a subquery
    "(SELECT token FROM password_resets LIMIT 1) IS NULL",
    # a column of some other table
    "password_hash IS NULL",
    # a column this table does not have
    "not_a_column IS NULL",
])
def test_anything_else_is_refused(payload):
    with pytest.raises(ValueError):
        _build(payload)


def test_a_refusal_names_what_was_rejected():
    # The caller has to be able to see which predicate was turned down.
    with pytest.raises(ValueError, match="nonsense"):
        _build("nonsense IS NULL")


def test_the_column_is_checked_against_this_table():
    # The same predicate is fine for a table that has the column and refused
    # for one that does not, so a caller cannot probe another table's shape.
    assert build_conflict_where("exam_id IS NULL", {"exam_id"}) == ' WHERE "exam_id" IS NULL'
    with pytest.raises(ValueError):
        build_conflict_where("exam_id IS NULL", {"id", "name"})
