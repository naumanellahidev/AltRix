"""
Role-assignment tests.

Granting a role is the act that decides everyone else's authority, so the rule
under test is narrow: a caller may only grant roles strictly below their own
level, and never a role name the system does not know.
"""
import pytest
from fastapi import HTTPException

from app.utils.permissions import (
    assignable_roles,
    assert_can_assign_role,
    expand_roles,
)


def _can_assign(caller_roles, target, is_super_admin=False):
    try:
        assert_can_assign_role(expand_roles(list(caller_roles)), is_super_admin, target)
        return True
    except HTTPException:
        return False


# --- Escalation must be impossible ------------------------------------------

@pytest.mark.parametrize(
    "caller,target",
    [
        ({"principal"}, "super_admin"),
        ({"principal"}, "school_owner"),
        ({"principal"}, "principal"),          # no sideways promotion
        ({"vice_principal"}, "principal"),
        ({"vice_principal"}, "vice_principal"),
        ({"school_admin"}, "principal"),
        ({"school_admin"}, "hr_manager"),
        ({"school_owner"}, "super_admin"),
        ({"school_owner"}, "school_owner"),
        ({"teacher"}, "teacher"),
        ({"teacher"}, "student"),
        ({"student"}, "student"),
        (set(), "teacher"),
    ],
)
def test_cannot_escalate(caller, target):
    assert _can_assign(caller, target) is False


def test_unknown_role_is_rejected():
    with pytest.raises(HTTPException) as exc:
        assert_can_assign_role({"super_admin"}, True, "root")
    assert exc.value.status_code == 400


def test_role_inheritance_does_not_grant_assignment_power():
    """
    expand_roles() gives a principal the *capabilities* of a teacher, but it
    must not let a teacher inherit a principal's power to hand out roles.
    """
    assert _can_assign({"teacher"}, "student") is False


# --- Legitimate delegation must still work ----------------------------------

@pytest.mark.parametrize(
    "caller,target",
    [
        ({"school_owner"}, "principal"),
        ({"school_owner"}, "accountant"),
        ({"principal"}, "vice_principal"),
        ({"principal"}, "teacher"),
        ({"principal"}, "accountant"),
        ({"vice_principal"}, "school_admin"),
        ({"vice_principal"}, "teacher"),
        ({"school_admin"}, "teacher"),
        ({"school_admin"}, "student"),
        ({"school_admin"}, "parent"),
    ],
)
def test_delegation_allowed(caller, target):
    assert _can_assign(caller, target) is True


def test_super_admin_may_assign_anything():
    for role in ("super_admin", "school_owner", "principal", "teacher", "parent"):
        assert _can_assign({"super_admin"}, role, is_super_admin=True) is True


def test_assignable_set_shrinks_down_the_hierarchy():
    owner = assignable_roles({"school_owner"})
    principal = assignable_roles({"principal"})
    vice = assignable_roles({"vice_principal"})
    assert principal < owner
    assert vice < principal
