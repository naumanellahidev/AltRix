# -*- coding: utf-8 -*-
"""
A database error must not arrive as an empty list.

Forty-three endpoints wrapped their query in ``try/except Exception: return []``.
A school with nine hundred students whose database hiccuped rendered "No
students found" — a successful-looking 200 with no data. The user cannot tell
that apart from an empty school, so nobody reports it and nobody fixes it.

These tests pin the rule rather than any one endpoint: a read path lets its
errors out, and the optional work around it stays optional but stops being
silent.
"""
import ast
import glob
import io
import re

import pytest

DATA = re.compile(r"db\.execute|db\.scalar|db\.stream|await db\.get|session\.execute", re.I)
OPTIONAL = re.compile(
    r"cache|invalidate|rollback|notif|broadcast|publish|audit|emit|websocket|"
    r"\bsend_|email|telemetry|sentry", re.I
)

SOURCES = sorted(glob.glob("app/routers/*.py")) + sorted(glob.glob("app/utils/*.py"))

#: The one place a query error is deliberately absorbed, with the reason stated
#: at the call site. Narrow exception types, not ``except Exception``.
ALLOWED = {("app/routers/auth.py", "ValueError")}


def _swallowing_handlers(path):
    """(lineno, handler, try-body source) for handlers whose whole body discards."""
    tree = ast.parse(io.open(path, encoding="utf-8").read())
    for node in ast.walk(tree):
        if not isinstance(node, ast.Try):
            continue
        body_src = "\n".join(ast.unparse(b) for b in node.body)
        for handler in node.handlers:
            body = [b for b in handler.body
                    if not (isinstance(b, ast.Expr) and isinstance(b.value, ast.Constant))]
            if len(body) != 1:
                continue
            only = body[0]
            discards = (
                isinstance(only, (ast.Pass, ast.Continue))
                or (isinstance(only, ast.Return)
                    and (only.value is None
                         or isinstance(only.value, (ast.List, ast.Dict, ast.Constant))))
            )
            # Returning the exception to the caller is reporting it, not
            # hiding it: a health check that answers {"status": "unhealthy",
            # "error": ...} is doing exactly its job.
            if discards and handler.name and isinstance(only, ast.Return)                     and handler.name in ast.unparse(only):
                continue
            if discards:
                yield handler.lineno, handler, body_src


def _names(handler):
    if handler.type is None:
        return {"BaseException"}
    if isinstance(handler.type, ast.Name):
        return {handler.type.id}
    if isinstance(handler.type, ast.Tuple):
        return {e.id for e in handler.type.elts if isinstance(e, ast.Name)}
    return {ast.unparse(handler.type)}


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.replace("\\", "/"))
def test_a_query_failure_is_never_returned_as_empty_data(path):
    norm = path.replace("\\", "/")
    offenders = []
    for lineno, handler, body_src in _swallowing_handlers(path):
        if not DATA.search(body_src) or OPTIONAL.search(body_src):
            continue
        if any((norm, n) in ALLOWED for n in _names(handler)):
            continue
        offenders.append(f"{norm}:{lineno}")
    assert not offenders, (
        "These read the database and then discard the error, so a failure "
        "reaches the user as an empty result: " + ", ".join(offenders)
    )


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.replace("\\", "/"))
def test_optional_work_fails_loudly_enough_to_notice(path):
    """
    Cache invalidation may fail without failing the request. It may not fail
    without leaving a trace — that is how a Redis stays down for a week.
    """
    src = io.open(path, encoding="utf-8").read()
    lines = src.splitlines()
    silent = []
    for lineno, handler, body_src in _swallowing_handlers(path):
        if not OPTIONAL.search(body_src):
            continue
        window = "\n".join(lines[handler.lineno - 1:handler.end_lineno])
        if "logger." in window or "best_effort" in window:
            continue
        silent.append(f"{path.replace(chr(92), '/')}:{lineno}")
    assert not silent, "Optional failures swallowed without a log line: " + ", ".join(silent)


@pytest.mark.asyncio
async def test_the_helper_swallows_but_leaves_a_record(caplog):
    """best_effort() is allowed to absorb the failure. It is not allowed to hide it."""
    import logging

    from app.utils.best_effort import best_effort

    with caplog.at_level(logging.WARNING):
        async with best_effort("invalidating the finance cache"):
            raise RuntimeError("redis is down")

    logged = chr(10).join(r.getMessage() for r in caplog.records)
    assert "invalidating the finance cache" in logged
    assert "redis is down" in logged
