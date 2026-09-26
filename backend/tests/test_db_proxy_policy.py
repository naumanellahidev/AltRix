"""
Authorization tests for the generic database proxy (/api/vps-db).

The proxy can reach every table in the database, so these tests pin down both
halves of the contract: the escalation paths stay closed, and the traffic the
frontend actually issues keeps working.
"""
import pytest
from fastapi import HTTPException

from app.utils.db_proxy_policy import authorize_proxy_request


def _authorize(**kwargs):
    kwargs.setdefault("payload_roles", set())
    kwargs.setdefault("has_user_filter", True)
    kwargs.setdefault("is_super_admin", False)
    return authorize_proxy_request(**kwargs)


STUDENT = {"student"}
PARENT = {"parent"}
TEACHER = {"teacher"}
ACCOUNTANT = {"accountant"}
PRINCIPAL = {"principal", "vice_principal", "school_admin"}
OWNER = {"school_owner", "principal", "teacher"}
SUPER = {"super_admin"}


# --- Escalation paths that must stay closed ---------------------------------

@pytest.mark.parametrize(
    "label,kwargs",
    [
        (
            "a student cannot make themselves a platform super admin",
            dict(table="platform_super_admins", action="insert", roles=STUDENT,
                 has_school_id=False, has_user_filter=False),
        ),
        (
            "a student cannot read plaintext password reset tokens",
            dict(table="password_resets", action="select", roles=STUDENT,
                 has_school_id=False, has_user_filter=False),
        ),
        (
            "not even a super admin reads credential tables via the proxy",
            dict(table="password_resets", action="select", roles=SUPER,
                 is_super_admin=True, has_school_id=False),
        ),
        (
            "session tables are unreachable",
            dict(table="active_sessions", action="select", roles=TEACHER,
                 has_school_id=True),
        ),
        (
            "sender identities are unreachable (email spoofing)",
            dict(table="email_sender_identities", action="update", roles=OWNER,
                 has_school_id=False),
        ),
        (
            "a student cannot grant themselves a role",
            dict(table="user_roles", action="insert", roles=STUDENT,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "a principal cannot hand out school_owner through the proxy",
            dict(table="user_roles", action="insert", roles=PRINCIPAL,
                 has_school_id=True, has_user_filter=False,
                 payload_roles={"school_owner"}),
        ),
        (
            "a teacher cannot rewrite tenant configuration",
            dict(table="schools", action="update", roles=TEACHER,
                 has_school_id=False),
        ),
        (
            "a teacher cannot write payment gateway credentials",
            dict(table="jazzcash_settings", action="insert", roles=TEACHER,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "a student cannot mark their own fees paid",
            dict(table="fee_payments", action="update", roles=STUDENT,
                 has_school_id=True),
        ),
        (
            "a parent cannot change exam results",
            dict(table="exam_results", action="update", roles=PARENT,
                 has_school_id=True),
        ),
        (
            "an unfiltered delete is refused for tenant users",
            dict(table="students", action="delete", roles=STUDENT,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "an unfiltered delete is refused for super admins too",
            dict(table="students", action="delete", roles=SUPER,
                 is_super_admin=True, has_school_id=True, has_user_filter=False),
        ),
        (
            "non-tenant tables are not writable by tenant users",
            dict(table="platform_billing_plans", action="update", roles=OWNER,
                 has_school_id=False),
        ),
        (
            "unknown non-tenant tables are not readable by tenant users",
            dict(table="some_internal_table", action="select", roles=TEACHER,
                 has_school_id=False),
        ),
    ],
)
def test_denied(label, kwargs):
    with pytest.raises(HTTPException) as exc:
        _authorize(**kwargs)
    assert exc.value.status_code == 403, label


# --- Traffic the application actually issues --------------------------------

@pytest.mark.parametrize(
    "label,kwargs",
    [
        (
            "students read their assignments",
            dict(table="assignments", action="select", roles=STUDENT,
                 has_school_id=True),
        ),
        (
            "students submit assignments",
            dict(table="assignment_submissions", action="insert", roles=STUDENT,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "the frontend checks super admin membership on login",
            dict(table="platform_super_admins", action="select", roles=TEACHER,
                 has_school_id=False),
        ),
        (
            "the frontend reads roles to resolve permissions",
            dict(table="user_roles", action="select", roles=STUDENT,
                 has_school_id=True),
        ),
        (
            "any member reads the schools table",
            dict(table="schools", action="select", roles=PARENT,
                 has_school_id=False),
        ),
        (
            "teachers mark attendance",
            dict(table="attendance_entries", action="insert", roles=TEACHER,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "teachers enter exam results",
            dict(table="exam_results", action="update", roles=TEACHER,
                 has_school_id=True),
        ),
        (
            "accountants record fee payments",
            dict(table="fee_payments", action="insert", roles=ACCOUNTANT,
                 has_school_id=True, has_user_filter=False),
        ),
        (
            "principals assign ordinary staff roles",
            dict(table="user_roles", action="insert", roles=PRINCIPAL,
                 has_school_id=True, has_user_filter=False,
                 payload_roles={"teacher"}),
        ),
        (
            "owners update their school branding",
            dict(table="school_branding", action="update", roles=OWNER,
                 has_school_id=True),
        ),
        (
            "a parent deletes their own message with a filter",
            dict(table="parent_messages", action="delete", roles=PARENT,
                 has_school_id=True),
        ),
        (
            "super admins update schools with a filter",
            dict(table="schools", action="update", roles=SUPER,
                 is_super_admin=True, has_school_id=False),
        ),
        (
            "super admins may assign school_owner",
            dict(table="user_roles", action="insert", roles=SUPER,
                 is_super_admin=True, has_school_id=True,
                 has_user_filter=False, payload_roles={"school_owner"}),
        ),
    ],
)
def test_allowed(label, kwargs):
    _authorize(**kwargs)  # must not raise


# --- The platform's own records -----------------------------------------------

@pytest.mark.parametrize("action", ["select", "insert", "update", "delete"])
@pytest.mark.parametrize("roles", [OWNER, PRINCIPAL, ACCOUNTANT])
def test_a_school_can_neither_read_nor_change_its_platform_invoices(action, roles):
    # platform_invoices sat among the school's own config tables, so a school
    # owner could mark their own invoice Paid.
    with pytest.raises(HTTPException) as err:
        _authorize(table="platform_invoices", action=action, roles=roles, has_school_id=True)
    assert err.value.status_code == 403


def test_the_platform_owner_keeps_the_platform_invoices():
    _authorize(table="platform_invoices", action="update", roles=SUPER, is_super_admin=True,
               has_school_id=True)


def test_readable_tables_without_a_school_are_confined_to_the_callers_school():
    # They used to be served whole: every school's marks, seating, message
    # recipients and bus stops, every user's profile and every school's record.
    import io
    proxy = io.open("app/routers/vps_db.py", encoding="utf-8").read()
    block = proxy[proxy.index("CROSS_TENANT_SCOPES = {"):]
    block = block[: block.index("}")]
    for table in ("schools", "profiles", "report_card_subject_entries", "co_curricular_grades",
                  "exam_seat_assignments", "exam_invigilators", "admin_message_recipients", "bus_stops",
                  "staff_campus_assignments"):
        assert f'"{table}"' in block, table
    assert "table_key in CROSS_TENANT_SCOPES" in proxy
    assert "psa.user_id = profiles.id" in proxy  # nor the platform owner's profile
