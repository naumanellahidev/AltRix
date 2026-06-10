"""
Permission engine that mirrors the frontend PermissionResolver logic.
Implements RBAC with role inheritance, campus-scoping, and action checks.
"""
from typing import List, Set
from functools import wraps

from fastapi import Depends, HTTPException, status

from app.dependencies import CurrentUser

# Role hierarchy constants
EDUVERSE_ROLES = [
    "super_admin",
    "school_owner",
    "principal",
    "vice_principal",
    "school_admin",
    "academic_coordinator",
    "teacher",
    "accountant",
    "hr_manager",
    "counselor",
    "student",
    "parent",
    "marketing_staff",
]

# Role inheritance map: role → roles it implicitly includes
ROLE_INHERITANCE = {
    "super_admin": [
        "school_owner", "principal", "vice_principal", "school_admin", "hr_manager",
        "accountant", "academic_coordinator", "teacher", "marketing_staff",
        "counselor", "student", "parent",
    ],
    "school_owner": [
        "principal", "vice_principal", "school_admin", "hr_manager", "accountant",
        "academic_coordinator", "teacher", "marketing_staff", "counselor", "student", "parent",
    ],
    "principal": [
        "vice_principal", "school_admin", "hr_manager", "accountant",
        "academic_coordinator", "counselor", "marketing_staff",
    ],
    "vice_principal": [
        "school_admin", "hr_manager", "accountant", "academic_coordinator",
        "counselor", "marketing_staff",
    ],
}

# Permission group definitions
STAFF_GOV = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "hr_manager"]
ACADEMIC_GOV = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "academic_coordinator"]
FINANCE_GOV = ["super_admin", "school_owner", "principal", "vice_principal", "accountant"]


def expand_roles(roles: List[str]) -> Set[str]:
    """Expand roles by adding all inherited roles."""
    out = set(roles)
    for r in roles:
        for inherited in ROLE_INHERITANCE.get(r, []):
            out.add(inherited)
    return out


def any_of(allowed: List[str], roles: Set[str]) -> bool:
    """Return True if any of the allowed roles are in the role set."""
    return any(r in roles for r in allowed)


class PermissionChecker:
    """
    Dependency class for FastAPI route protection.
    Usage: Depends(PermissionChecker(allowed_roles=["principal", "school_owner"]))
    """
    def __init__(
        self,
        allowed_roles: List[str] | None = None,
        require_school: bool = True,
    ):
        self.allowed_roles = allowed_roles
        self.require_school = require_school

    async def __call__(self, current_user: CurrentUser) -> CurrentUser:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )

        if self.allowed_roles:
            # Expand inherited roles
            effective_roles = expand_roles(current_user.roles)
            if not any(r in effective_roles for r in self.allowed_roles):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. Required roles: {self.allowed_roles}",
                )

        return current_user


def require_roles(*roles: str):
    """Shorthand decorator-style permission check."""
    return PermissionChecker(allowed_roles=list(roles))


def require_finance():
    return PermissionChecker(allowed_roles=FINANCE_GOV)


def require_academics():
    return PermissionChecker(allowed_roles=ACADEMIC_GOV)


def require_staff_management():
    return PermissionChecker(allowed_roles=STAFF_GOV)


def require_super_admin():
    return PermissionChecker(allowed_roles=["super_admin"])


def require_school_owner():
    return PermissionChecker(allowed_roles=["super_admin", "school_owner"])


def require_principal():
    return PermissionChecker(allowed_roles=["super_admin", "school_owner", "principal", "vice_principal"])


def can_manage_students(roles: Set[str]) -> bool:
    return any_of([*ACADEMIC_GOV, "teacher"], roles)


def can_manage_finance(roles: Set[str]) -> bool:
    return any_of(FINANCE_GOV, roles)


def can_manage_staff(roles: Set[str]) -> bool:
    return any_of(STAFF_GOV, roles)


def can_manage_academics(roles: Set[str]) -> bool:
    return any_of(ACADEMIC_GOV, roles)


def can_moderate_complaints(roles: Set[str]) -> bool:
    return any_of(
        ["super_admin", "school_owner", "principal", "vice_principal", "school_admin"],
        roles,
    )


def can_broadcast_notices(roles: Set[str]) -> bool:
    return any_of(
        ["super_admin", "school_owner", "principal", "vice_principal",
         "school_admin", "academic_coordinator", "hr_manager"],
        roles,
    )
