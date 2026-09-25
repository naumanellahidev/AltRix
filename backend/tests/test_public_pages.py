# -*- coding: utf-8 -*-
"""
Pages for people who are not signed in must not depend on signing in.

The website enquiry form and the hall-ticket check both called the
signed-in data proxy, which answers 401 to a visitor, so neither worked for
the people it was built for. Each public page talks only to endpoints that
need no login, and those endpoints are rate-limited.
"""
import io
import re

import pytest

PUBLIC_PAGES = [
    "../src/pages/tenant/PublicInquiryPage.tsx",
    "../src/pages/tenant/PublicHallTicketVerification.tsx",
    "../src/pages/tenant/PublicVisitorRegisterPage.tsx",
    "../src/pages/public/VerifyDocumentPage.tsx",
]


def code(path: str) -> str:
    body = io.open(path, encoding="utf-8").read()
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", body)


@pytest.mark.parametrize("path", PUBLIC_PAGES)
def test_a_public_page_never_uses_the_signed_in_proxy(path):
    body = code(path)
    assert "api.from(" not in body, path
    assert "api.rpc(" not in body, path


@pytest.mark.parametrize("router,limit", [
    ("app/routers/public_inquiries.py", '@limiter.limit("5/minute")'),
    ("app/routers/public_verify.py", '@limiter.limit("30/minute")'),
])
def test_public_endpoints_need_no_login_and_are_rate_limited(router, limit):
    body = io.open(router, encoding="utf-8").read()
    assert "CurrentUser" not in body
    assert limit in body


def test_a_hall_ticket_is_only_valid_for_its_students_school():
    sql = io.open("sql_migrations/20261031000400_hall_ticket_same_school.sql", encoding="utf-8").read()
    assert "WHERE id = _exam_id AND school_id = v_student.school_id" in sql
