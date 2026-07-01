"""
Permission Matrix — Declarative per-action, per-module RBAC.

Single source of truth for what each role can do.
Use can(action, module, roles) for fine-grained checks in any router.

Actions: read, create, update, delete, export, approve, moderate
Modules: students, teachers, finance, attendance, exams, admissions,
         hr, messaging, reports, settings, ai, storage, audit
"""
from typing import Set, List


# ─── Role Constants ───────────────────────────────────────────────────────────

SUPER_ADMIN = "super_admin"
SCHOOL_OWNER = "school_owner"
PRINCIPAL = "principal"
VICE_PRINCIPAL = "vice_principal"
SCHOOL_ADMIN = "school_admin"
ACADEMIC_COORDINATOR = "academic_coordinator"
HR_MANAGER = "hr_manager"
ACCOUNTANT = "accountant"
MARKETING_STAFF = "marketing_staff"
COUNSELOR = "counselor"
TEACHER = "teacher"
PARENT = "parent"
STUDENT = "student"

# Ordered hierarchy — higher index = less privilege
ROLE_HIERARCHY = [
    SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    ACADEMIC_COORDINATOR, HR_MANAGER, ACCOUNTANT, MARKETING_STAFF,
    COUNSELOR, TEACHER, PARENT, STUDENT,
]

# ─── Permission Matrix ────────────────────────────────────────────────────────
# Format: "module:action" → set of roles allowed
# Note: super_admin inherits all permissions globally

PERMISSION_MATRIX: dict[str, Set[str]] = {

    # === STUDENTS ===
    "students:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER, COUNSELOR, ACCOUNTANT,
    },
    "students:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR,
    },
    "students:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },
    "students:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },
    "students:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR,
    },
    "students:view_own": {STUDENT, PARENT},  # student sees own data, parent sees child

    # === TEACHERS / STAFF ===
    "teachers:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER,
    },
    "teachers:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN, HR_MANAGER,
    },
    "teachers:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN, HR_MANAGER,
    },
    "teachers:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },
    "teachers:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, HR_MANAGER,
    },

    # === FINANCE ===
    "finance:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, ACCOUNTANT,
    },
    "finance:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, ACCOUNTANT,
    },
    "finance:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, ACCOUNTANT,
    },
    "finance:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },
    "finance:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, ACCOUNTANT,
    },
    "finance:approve": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL,
    },

    # === ATTENDANCE ===
    "attendance:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER, HR_MANAGER,
    },
    "attendance:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },
    "attendance:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },
    "attendance:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },
    "attendance:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER,
    },
    "attendance:view_own": {STUDENT, PARENT},

    # === EXAMS ===
    "exams:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER, STUDENT, PARENT,
    },
    "exams:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },
    "exams:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },
    "exams:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR,
    },
    "exams:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR,
    },
    "exams:enter_results": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER,
    },

    # === ADMISSIONS ===
    "admissions:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, COUNSELOR, MARKETING_STAFF,
    },
    "admissions:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, COUNSELOR, MARKETING_STAFF,
    },
    "admissions:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, COUNSELOR,
    },
    "admissions:approve": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },
    "admissions:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },

    # === HR ===
    "hr:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN, HR_MANAGER,
    },
    "hr:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, HR_MANAGER,
    },
    "hr:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, HR_MANAGER,
    },
    "hr:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },
    "hr:approve": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, HR_MANAGER,
    },

    # === MESSAGING / NOTICES ===
    "messaging:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, TEACHER, PARENT, STUDENT, COUNSELOR,
    },
    "messaging:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, TEACHER, COUNSELOR,
    },
    "messaging:broadcast": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER,
    },
    "messaging:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },

    # === REPORTS ===
    "reports:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, ACCOUNTANT, HR_MANAGER,
    },
    "reports:export": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, ACCOUNTANT,
    },
    "reports:student": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, TEACHER, PARENT, STUDENT,
    },

    # === SETTINGS / SCHOOL CONFIG ===
    "settings:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },
    "settings:update": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },
    "settings:delete": {
        SUPER_ADMIN, SCHOOL_OWNER,
    },

    # === AI COPILOT ===
    "ai:access": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, ACCOUNTANT, TEACHER, COUNSELOR,
    },
    "ai:admin": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL,
    },

    # === STORAGE / FILES ===
    "storage:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, TEACHER, COUNSELOR,
    },
    "storage:upload": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, TEACHER, COUNSELOR,
    },
    "storage:delete": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },

    # === AUDIT LOG ===
    "audit:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL,
    },

    # === SECURITY MONITORING ===
    "security:monitor": {
        SUPER_ADMIN,
    },
    "security:manage": {
        SUPER_ADMIN,
    },

    # === COMPLAINTS ===
    "complaints:read": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },
    "complaints:moderate": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
    },
    "complaints:create": {
        SUPER_ADMIN, SCHOOL_OWNER, PRINCIPAL, VICE_PRINCIPAL, SCHOOL_ADMIN,
        ACADEMIC_COORDINATOR, HR_MANAGER, TEACHER, PARENT, STUDENT, COUNSELOR,
    },
}


# ─── Permission Check API ─────────────────────────────────────────────────────

def can(action: str, module: str, roles: List[str] | Set[str]) -> bool:
    """
    Check if any of the user's roles grant the requested action on the module.

    Usage:
        from app.utils.permissions_matrix import can
        from app.utils.permissions import expand_roles

        eff_roles = expand_roles(current_user.roles)
        if not can("export", "finance", eff_roles):
            raise ForbiddenError()
    """
    if not roles:
        return False

    role_set = set(roles)

    # super_admin bypasses all checks
    if SUPER_ADMIN in role_set:
        return True

    key = f"{module}:{action}"
    allowed = PERMISSION_MATRIX.get(key, set())
    return bool(role_set & allowed)


def assert_can(action: str, module: str, roles: List[str] | Set[str]) -> None:
    """
    Same as can() but raises HTTP 403 if denied.

    Usage:
        assert_can("delete", "finance", expand_roles(current_user.roles))
    """
    from fastapi import HTTPException, status as http_status
    if not can(action, module, roles):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: cannot perform '{action}' on '{module}'",
        )


def get_allowed_roles(module: str, action: str) -> Set[str]:
    """Return the set of roles allowed for the given module + action."""
    return PERMISSION_MATRIX.get(f"{module}:{action}", set())
