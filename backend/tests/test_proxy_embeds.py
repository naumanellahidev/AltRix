# -*- coding: utf-8 -*-
"""
Embedded relations in the data proxy (``students(first_name)``).

The frontend's Supabase-style selects came back without any relation, so
screens showed no class or student names and no max marks; filters on a
relation's column were dropped, widening results. See proxy_embeds.py.
"""
import asyncio
import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.utils import proxy_embeds as pe  # noqa: E402

COLS = {
    "students": {"id", "school_id", "first_name", "last_name", "class_section_id"},
    "class_sections": {"id", "school_id", "name", "class_id"},
    "academic_classes": {"id", "school_id", "name"},
    "fee_invoices": {"id", "school_id", "student_id", "total_amount"},
    "fee_invoice_items": {"id", "school_id", "invoice_id", "amount"},
    "behavior_notes": {"id", "school_id", "student_id", "teacher_user_id"},
    "profiles": {"id", "display_name"},
    "hr_salary_records": {"id", "school_id", "user_id"},
}
FKS = [
    ("students", "class_section_id", "class_sections", "id"),
    ("class_sections", "class_id", "academic_classes", "id"),
    ("fee_invoices", "student_id", "students", "id"),
    ("fee_invoice_items", "invoice_id", "fee_invoices", "id"),
    ("behavior_notes", "student_id", "students", "id"),
]


@pytest.fixture(autouse=True)
def _fks(monkeypatch):
    monkeypatch.setattr(pe, "_FK_CACHE", FKS)


def builder(scoped=None):
    async def cols(t):
        return COLS.get(t, set())

    async def scope(t, c, alias):
        if scoped and t in scoped:
            raise pe.EmbedError(f"'{t}' refused", 403)
        return f'{alias}."school_id" = :s' if "school_id" in c else ""
    return pe.EmbedBuilder(None, cols, scope)


def sql(table, select, scoped=None):
    return asyncio.run(builder(scoped).columns_sql(table, f'"{table}"', select))


def test_many_to_one_and_nested():
    out, inners = sql("students", "id, class_sections(name, academic_classes(name))")
    assert 'row_to_json' in out and '"class_sections"' in out and '"academic_classes"' in out
    assert not inners


def test_one_to_many_is_an_array():
    out, _ = sql("fee_invoices", "*, fee_invoice_items(*)")
    assert "json_agg" in out


def test_alias_and_column_hint():
    out, _ = sql("behavior_notes", "id, students:student_id(first_name,last_name)")
    assert 'AS "students"' in out


def test_inner_narrows_the_parent():
    _, inners = sql("fee_invoices", "id, students!inner(first_name)")
    assert inners and inners[0][1].startswith("EXISTS")


def test_every_relation_is_scoped_to_the_school():
    out, _ = sql("fee_invoices", "id, students(first_name)")
    assert '."school_id" = :s' in out


def test_an_account_id_links_to_the_profile():
    out, _ = sql("behavior_notes", "id, teacher_user_id(display_name)")
    assert '"profiles"' in out


def test_whitespace_before_the_parenthesis():
    out, _ = sql("fee_invoices", "id, student_id (\n  first_name\n)")
    assert '"students"' in out


def test_unknown_columns_and_relations_are_refused():
    with pytest.raises(pe.EmbedError):
        sql("students", "id, class_sections(no_such_column)")
    with pytest.raises(pe.EmbedError):
        sql("students", "id, hr_salary_records(id)")


def test_a_refused_table_cannot_be_reached_through_a_relation():
    with pytest.raises(pe.EmbedError):
        sql("fee_invoices", "id, students(first_name)", scoped={"students"})


def test_a_filter_on_a_relation_column_is_an_exists():
    cond = asyncio.run(builder().filter_condition(
        "fee_invoices", '"fee_invoices"', "id, students!inner(first_name)", "students.first_name",
        lambda ref, col, cols: f'{ref}."{col}" = :v'))
    assert cond.startswith("EXISTS") and '."first_name" = :v' in cond
