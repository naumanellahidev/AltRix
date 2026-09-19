# -*- coding: utf-8 -*-
"""
No list endpoint runs an unbounded SELECT.

Seventy-four GET endpoints fetched every matching row for the school and
serialised it into one JSON array. For a class list that is fine. For ten years
of attendance entries it is a response the worker builds in memory, the
container runs out of memory building, and the browser would not have rendered
anyway.

The fix keeps the response an array — switching to an envelope would have broken
every caller at once — and adds a ceiling plus optional ``limit``/``offset``.
These tests pin that: the bound exists, it is applied to the query rather than
merely accepted as a parameter, and the endpoints that are genuinely bounded by
their own subject say so where a reader will see it.
"""
import ast
import glob
import io

import pytest

from app.utils.pagination import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, ListPage

ROUTERS = sorted(glob.glob("app/routers/*.py"))

#: Bounded by their subject, not by a LIMIT: one user's roles in one school,
#: one teacher on one date, and live websocket presence, which never touches
#: the database. Each says so at the call site.
INHERENTLY_SMALL = {
    ("app/routers/auth.py", "get_user_school_roles"),
    ("app/routers/collaboration.py", "get_online_users"),
    ("app/routers/teachers.py", "get_teacher_presence"),
}


def _list_endpoints(path):
    tree = ast.parse(io.open(path, encoding="utf-8").read())
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        decorators = [ast.unparse(d) for d in node.decorator_list]
        if not any(".get(" in d for d in decorators):
            continue
        returns = ast.unparse(node.returns) if node.returns else ""
        if not ("List[" in returns or "list[" in returns
                or "response_model=List" in " ".join(decorators)):
            continue
        yield node


@pytest.mark.parametrize("path", ROUTERS, ids=lambda p: p.replace("\\", "/"))
def test_no_list_endpoint_runs_an_unbounded_select(path):
    norm = path.replace("\\", "/")
    unbounded = []
    for fn in _list_endpoints(path):
        if (norm, fn.name) in INHERENTLY_SMALL:
            continue
        names = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
        body = ast.unparse(fn)
        if {"limit", "offset", "page", "page_size", "cursor"} & names:
            continue
        if ".limit(" in body or "LIMIT " in body:
            continue
        unbounded.append(f"{norm}::{fn.name}")
    assert not unbounded, (
        "These fetch every matching row with no ceiling: " + ", ".join(unbounded)
    )


@pytest.mark.parametrize("path", ROUTERS, ids=lambda p: p.replace("\\", "/"))
def test_a_page_parameter_is_actually_applied_to_the_query(path):
    """
    Accepting ``page`` and then ignoring it is worse than not accepting it: the
    caller is told it can page and silently gets everything.
    """
    ignored = []
    for fn in _list_endpoints(path):
        # Only the ListPage dependency. An endpoint whose `page` is a page
        # *number* alongside its own `limit` is already paginating, differently.
        annotated = {a.arg for a in fn.args.args + fn.args.kwonlyargs
                     if a.annotation is not None
                     and "ListPageParams" in ast.unparse(a.annotation)}
        if "page" not in annotated:
            continue
        body = ast.unparse(fn)
        if "page.apply(" in body or "page.slice(" in body or "page.limit" in body:
            continue
        ignored.append(f"{path.replace(chr(92), '/')}::{fn.name}")
    assert not ignored, "These accept `page` and never use it: " + ", ".join(ignored)


# --- the bound itself ---------------------------------------------------------

class _Resp:
    def __init__(self):
        self.headers = {}


def test_the_default_ceiling_is_high_enough_not_to_truncate_real_lists():
    """
    A ceiling that clips ordinary data trades a crash for silent wrong answers.
    A class of 80, a staff list of 300 and a year group of 1,200 must all come
    back whole.
    """
    assert DEFAULT_LIST_LIMIT >= 2000
    assert MAX_LIST_LIMIT >= DEFAULT_LIST_LIMIT


def test_the_bound_is_advertised_so_a_caller_can_tell_a_full_page_from_the_end():
    response = _Resp()
    page = ListPage(response, limit=50, offset=100)
    assert response.headers["X-Result-Limit"] == "50"
    assert response.headers["X-Result-Offset"] == "100"


def test_apply_bounds_a_real_select():
    from sqlalchemy import select

    from app.models.core import School

    page = ListPage(_Resp(), limit=25, offset=50)
    compiled = str(page.apply(select(School)).compile(
        compile_kwargs={"literal_binds": True}))
    assert "LIMIT 25" in compiled
    assert "OFFSET 50" in compiled


def test_apply_does_not_explode_on_something_it_cannot_bound():
    """A helper that raises inside an endpoint is worse than one that logs."""
    page = ListPage(_Resp(), limit=10, offset=0)
    sentinel = object()
    assert page.apply(sentinel) is sentinel


def test_slice_bounds_an_already_materialised_sequence():
    page = ListPage(_Resp(), limit=3, offset=2)
    assert page.slice(range(10)) == [2, 3, 4]
