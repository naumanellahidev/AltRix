"""
Tenant Guard — Central multi-tenant isolation enforcement.

Every request touching tenant-scoped data MUST call require_tenant_access()
or use the TenantGuard dependency. This prevents cross-school data leakage
even if a user manipulates URL parameters or resource IDs.

Security Flow:
    Request → Auth (JWT) → TenantGuard → PermissionChecker → Cache → DB
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.dependencies import CurrentUser, AuthenticatedUser

logger = logging.getLogger("app.security.tenant")


# ─── Core Tenant Enforcement ──────────────────────────────────────────────────

def require_tenant_access(
    resource_school_id: Optional[UUID | str],
    user: AuthenticatedUser,
    *,
    allow_super_admin: bool = True,
    resource_description: str = "resource",
) -> None:
    """
    Enforce that the user belongs to the same school as the resource.
    Raises HTTP 403 on violation.

    Rules:
    - super_admin always passes (if allow_super_admin=True)
    - All other roles must have matching school_id
    - Missing user school_id context → deny access
    """
    if allow_super_admin and user.is_super_admin:
        return

    if not resource_school_id:
        # Global resource (no school) — allow
        return

    user_school = getattr(user, "school_id", None)
    if not user_school:
        logger.warning(
            f"Tenant access denied: user {user.id} has no school context "
            f"trying to access {resource_description}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No school context — cannot access {resource_description}. Send X-School-Id header.",
        )

    if str(user_school) != str(resource_school_id):
        logger.warning(
            f"TENANT BYPASS ATTEMPT: user={user.id} school={user_school} "
            f"tried to access {resource_description} from school={resource_school_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: resource belongs to a different organization",
        )


def safe_school_id(user: AuthenticatedUser) -> str:
    """
    Return the user's verified school_id as a string.
    Raises 403 if no school context is available.
    Use in every query to guarantee tenant isolation.
    """
    if not user.school_id:
        if user.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-School-Id header required for this operation",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No school context. Send X-School-Id header.",
        )
    return str(user.school_id)


def verify_resource_belongs_to_school(
    resource,
    user: AuthenticatedUser,
    school_id_attr: str = "school_id",
    resource_name: str = "resource",
) -> None:
    """
    After fetching a resource from DB, verify it belongs to the user's school.
    Prevents IDOR (Insecure Direct Object Reference) attacks where an attacker
    changes a UUID in the URL to access another tenant's data.

    Usage:
        student = await db.scalar(select(Student).where(Student.id == student_id))
        if not student:
            raise NotFoundError("Student", str(student_id))
        verify_resource_belongs_to_school(student, current_user, resource_name="student")
    """
    resource_school = getattr(resource, school_id_attr, None)
    require_tenant_access(resource_school, user, resource_description=resource_name)


# ─── FastAPI Dependency ────────────────────────────────────────────────────────

class TenantGuard:
    """
    FastAPI dependency that ensures the user has a valid school context.

    Usage:
        @router.get("")
        async def list(current_user: CurrentUser, _: None = Depends(TenantGuard())):
            ...
    """

    def __init__(self, require_school: bool = True):
        self.require_school = require_school

    async def __call__(self, current_user: CurrentUser) -> AuthenticatedUser:
        if self.require_school and not current_user.school_id and not current_user.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School context required. Send X-School-Id header.",
            )
        return current_user
