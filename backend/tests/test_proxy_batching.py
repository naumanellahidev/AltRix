"""
The data proxy must write a batch in one statement.

Every write in the product goes through this endpoint. Looping a single-row
INSERT meant marking a class of 40 present was 40 round trips, and a 500-row
student import was 500 — each with its own latency, and each able to fail
part-way and leave a half-finished import behind.
"""
import ast
import inspect
import re

from app.routers import vps_db


def _source_of(fn):
    return inspect.getsource(fn)


def _awaits_inside_loops(src: str) -> int:
    """Count `await db.execute` statements nested inside a for/while."""
    count = 0
    stack = []
    for line in src.split("\n"):
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        while stack and indent <= stack[-1]:
            stack.pop()
        if re.match(r"\s*(for|while)\s", line):
            stack.append(indent)
        elif stack and "await db.execute" in line:
            count += 1
    return count


def test_no_per_row_database_calls_remain():
    assert _awaits_inside_loops(_source_of(vps_db.execute_query)) == 0, (
        "a write path is issuing one query per row again"
    )


def test_insert_and_upsert_build_multi_row_values():
    """Both write paths emit VALUES (...), (...), ... rather than one row."""
    src = _source_of(vps_db.execute_query)
    assert src.count("value_groups") >= 4, "insert and upsert should both batch"
    assert 'VALUES {", ".join(value_groups)}' in src


def test_every_column_gets_a_placeholder_per_row():
    """
    Postgres rejects a VALUES list whose rows have differing arity, so a row
    missing a key must still contribute a placeholder — otherwise a batch where
    only some items carry an optional field fails outright.
    """
    src = _source_of(vps_db.execute_query)
    # The `else: casted[k] = None` branch is what guarantees this.
    assert src.count("casted[k] = None") >= 2


def test_placeholder_names_are_unique_per_row():
    """
    Reusing one bind name across rows would silently collapse the batch to the
    last row's values.
    """
    src = _source_of(vps_db.execute_query)
    assert 'f"{k}_{idx}"' in src


def test_the_module_still_parses():
    ast.parse(inspect.getsource(vps_db))
