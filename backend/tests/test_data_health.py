# -*- coding: utf-8 -*-
"""
The data-health card: what in a school's records is not joined up.

Each check names the people or records it found, and every one of its
queries is scoped to the school asking. Two checks were added after a live
look at the data: invoices whose student record is gone (seven in one school,
three still counted as owed) and student photos left on the old Supabase
storage, which no longer loads.
"""
import ast
import io
import re

SRC = io.open("app/routers/misc.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def _data_health() -> str:
    node = next(n for n in ast.walk(TREE)
                if isinstance(n, ast.AsyncFunctionDef) and n.name == "data_health")
    return ast.get_source_segment(SRC, node)


def test_every_check_query_is_scoped_to_the_school():
    body = _data_health()
    queries = re.findall(r'"""(.*?)"""', body, re.S)[1:]  # [0] is the docstring
    assert len(queries) >= 6
    for sql in queries:
        assert "school_id = CAST(:sid AS uuid)" in sql, sql


def test_invoices_without_a_student_are_reported_and_never_deleted():
    body = _data_health()
    assert '"invoices_without_student"' in body
    assert "NOT EXISTS (SELECT 1 FROM students s WHERE s.id = fi.student_id)" in body
    # ("deleted" appears as a student status the queries skip; no statement
    # may remove anything.)
    assert not re.search(r"\bDELETE\s+FROM\b", body, re.I)


def test_photos_on_the_old_storage_are_reported():
    body = _data_health()
    assert '"photos_on_old_storage"' in body
    assert "supabase.co" in body


def test_every_check_says_where_to_fix_it():
    body = _data_health()
    ids = re.findall(r'"id": "([a-z_]+)"', body)
    tabs = re.findall(r'"fix_tab": "([a-z-]+)"', body)
    assert len(ids) == len(tabs) >= 6
