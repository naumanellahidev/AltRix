# -*- coding: utf-8 -*-
"""
Functions the app calls must exist, and must keep each caller in their place.

Six functions on the data proxy's allowlist were called by the screens but
had never been created, so the Directory search, CRM lead creation, the
website enquiry form, a parent's list of their child's teachers, message
search and the schema viewer all failed. They are defined in one migration;
these tests hold that migration to what the callers send and to the scoping
the callers rely on. The website enquiry form also needed endpoints that do
not require a login.
"""
import io
import re

import pytest

MIGRATION = io.open("sql_migrations/20261031000200_missing_rpc_functions.sql", encoding="utf-8").read()
HIDE = io.open("sql_migrations/20261031000000_hide_platform_owner.sql", encoding="utf-8").read()
PROXY = io.open("app/routers/vps_db.py", encoding="utf-8").read()


def _function(name: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{name}\((.*?)\n\$\$;", MIGRATION, re.S)
    assert m, f"{name} is not defined"
    return m.group(0)


@pytest.mark.parametrize("name,params", [
    ("directory_search", ["_school_id", "_entity", "_q", "_status", "_limit", "_offset"]),
    ("ensure_default_crm_pipeline", ["_school_id"]),
    ("create_public_lead", ["_school_slug", "_full_name", "_email", "_phone", "_notes", "_source"]),
    ("get_child_teachers_detailed", ["_school_id", "_student_id"]),
    ("search_messages", ["_school_id", "_user_id", "_query", "_limit"]),
    ("export_table_schema", []),
])
def test_each_called_function_is_defined_with_the_parameters_its_callers_send(name, params):
    body = _function(name)
    signature = body.split(")", 1)[0]
    for p in params:
        assert p in signature, (name, p)
    assert f'"{name}"' in PROXY  # and the proxy lets it through


def test_the_directory_returns_what_the_screen_reads():
    body = _function("directory_search")
    for col in ("entity text", "id uuid", "title text", "subtitle text", "status text",
                "created_at timestamptz", "total_count bigint"):
        assert col in body
    assert "is_school_member(auth.uid(), _school_id)" in body
    assert "NOT is_platform_owner(ur.user_id)" in body


def test_a_parent_sees_only_their_own_childs_teachers():
    body = _function("get_child_teachers_detailed")
    assert "g.user_id = auth.uid()" in body
    assert "s.profile_id = auth.uid()" in body


def test_message_search_is_the_callers_own_mail_whatever_user_id_is_sent():
    body = _function("search_messages")
    assert "auth.uid()" in body
    # The caller-supplied _user_id is never used to choose whose mail is read.
    after_signature = body.split("RETURNS", 1)[1]
    assert not re.search(r"(?<![a-z])_user_id\b", after_signature)


def test_only_the_platform_owner_reads_the_schema():
    assert "is_platform_owner(auth.uid())" in _function("export_table_schema")


def test_one_default_pipeline_per_school():
    assert "uq_crm_default_pipeline_per_school" in MIGRATION
    assert "WHERE is_default" in MIGRATION
    assert "DELETE" not in MIGRATION.upper().replace("DELETED", "")


def test_the_public_enquiry_needs_no_login_and_is_rate_limited():
    router = io.open("app/routers/public_inquiries.py", encoding="utf-8").read()
    assert "CurrentUser" not in router
    assert '@limiter.limit("5/minute")' in router
    assert "create_public_lead(" in router
    main = io.open("app/main.py", encoding="utf-8").read()
    assert "public_inquiries_router" in main
    page = io.open("../src/pages/tenant/PublicInquiryPage.tsx", encoding="utf-8").read()
    assert "/public-inquiries/" in page
    assert "api.from(" not in page and "api.rpc(" not in page


def test_the_platform_owner_is_left_out_of_every_people_list():
    assert "CREATE OR REPLACE FUNCTION public.is_platform_owner" in HIDE
    for fn in ("get_school_user_directory", "list_school_user_profiles", "get_school_staff_directory"):
        block = HIDE[HIDE.index(f"FUNCTION public.{fn}"):]
        block = block[: block.index("$function$;")]
        assert "is_platform_owner(sm.user_id)" in block, fn
    assert "platform_super_admins" in HIDE[HIDE.index("VIEW public.school_user_directory"):]
    schools = io.open("app/routers/schools.py", encoding="utf-8").read()
    assert "platform_super_admins psa WHERE psa.user_id = r.user_id" in schools
