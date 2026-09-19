"""
SQL injection tests for the data proxy's select-clause builder.

Filter values reach the database as bind parameters, but the column list cannot:
it is interpolated into the statement text. The alias half of ``alias:column``
used to be emitted without validation, so a crafted select string could close
the quoted identifier and append arbitrary SQL.
"""
import pytest

from app.routers.vps_db import build_select_clause

COLUMNS = {"id", "name", "school_id", "created_at", "amount"}


def _build(select):
    return build_select_clause(select, COLUMNS)


# --- Injection attempts ------------------------------------------------------

@pytest.mark.parametrize("payload", [
    # the original break-out: close the alias quote, append a subquery
    'x", (SELECT token FROM password_resets LIMIT 1) AS "y:id',
    # stack a second expression
    'a" , pg_sleep(10) AS "b:id',
    # comment out the rest of the statement
    'x" --:id',
    # quote break on the column side
    'id:y" FROM schools --',
    # nested quotes
    'a""b:id',
    # semicolon
    'x; DROP TABLE students; --:id',
    # whitespace-padded break-out
    '  x"  ,  1  AS  "z  :  id  ',
])
def test_injection_attempts_never_reach_the_statement(payload):
    out = _build(payload)
    # Nothing but quoted identifiers and separators may survive.
    assert ";" not in out, f"statement separator survived: {out!r}"
    assert "--" not in out, f"comment survived: {out!r}"
    assert "(" not in out, f"parenthesis survived: {out!r}"
    assert "pg_sleep" not in out
    assert "password_resets" not in out
    assert out.count('"') % 2 == 0, f"unbalanced quotes: {out!r}"


def test_unvalidated_alias_cannot_escape_the_quotes():
    """
    The specific regression: a quote inside the alias must not be emitted.
    """
    out = _build('evil", (SELECT 1) AS "x:id')
    # Either the item was dropped entirely, or it came back as a plain "*".
    assert out in ("*",), f"expected the item to be dropped, got {out!r}"


def test_quote_count_stays_balanced():
    """Every identifier emitted must be a complete quoted pair."""
    for payload in ('id', 'id,name', 'label:name', 'x":id', 'id,BAD,name'):
        out = _build(payload)
        if out != "*":
            assert out.count('"') % 2 == 0, f"unbalanced quotes from {payload!r}: {out!r}"


# --- Legitimate usage keeps working -----------------------------------------

def test_star_passes_through():
    assert _build("*") == "*"
    assert _build("") == "*"
    assert _build(None) == "*"


def test_plain_columns():
    assert _build("id") == '"id"'
    assert _build("id,name") == '"id", "name"'
    assert _build(" id , name ") == '"id", "name"'


def test_alias_syntax_both_directions():
    # alias:column -> the column is real
    assert _build("label:name") == '"name" AS "label"'
    # column:alias -> the first half is the real column
    assert _build("name:label") == '"name" AS "label"'


def test_unknown_columns_are_dropped_not_passed_through():
    assert _build("id,nonexistent") == '"id"'
    assert _build("nonexistent") == "*"


def test_relation_syntax_falls_back_to_star():
    """Supabase embedded joins are not supported; must not be interpolated."""
    assert _build("id,students(name)") == "*"
