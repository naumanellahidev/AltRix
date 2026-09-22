# -*- coding: utf-8 -*-
"""
The schema bootstrap and the optional auth lookups, after the login outage.

Two faults together took production down on 19 Sep 2026:

* A bootstrap block sent several ;-separated statements in one ``text()``.
  asyncpg prepares each execute as a single command, so it raised "cannot
  insert multiple commands into a prepared statement" and the rest of that
  try block never ran - which is why ``user_token_invalidation`` did not
  exist.
* ``tokens_invalidated_before`` then failed inside the request's transaction.
  It caught the error, but the transaction stayed aborted, so every later
  query in that request failed too: login answered "Your account is not a
  member of this institute" and logout returned 503.
"""
import ast
import io
import re

BOOT = io.open("app/db_bootstrap.py", encoding="utf-8").read()
SEC = io.open("app/utils/security.py", encoding="utf-8").read()


def _statement_count(sql: str) -> int:
    without_bodies = re.sub(r"\$\$.*?\$\$", "", sql, flags=re.S)
    return len([part for part in without_bodies.split(";") if part.strip()])


def test_no_multi_statement_text_block_is_executed_directly():
    for match in re.finditer(r'(\w+)\.execute\(text\("""(.*?)"""\)\)', BOOT, re.S):
        assert _statement_count(match.group(2)) <= 1, match.group(2)[:80]


def test_multi_statement_scripts_go_through_the_splitter():
    assert "async def _execute_script(conn, sql: str)" in BOOT
    assert BOOT.count("_execute_script(conn") >= 2


def test_optional_auth_lookups_run_in_a_savepoint():
    tree = ast.parse(SEC)
    for name in ("tokens_invalidated_before", "is_token_blacklisted"):
        body = ast.unparse(
            next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
        )
        assert "db.begin_nested()" in body, name
