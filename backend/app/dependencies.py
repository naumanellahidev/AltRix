"""
FastAPI dependency injection definitions.
Handles auth validation, current user resolution, DB sessions.
"""
from typing import Annotated, List, Optional
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Header, status
from jose import JWTError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.jwt import decode_supabase_token
from app.cache import cache, TTL_USER_ROLES


@dataclass
class AuthenticatedUser:
    """Represents the currently authenticated user extracted from the JWT."""
    id: str
    email: str
    roles: List[str] = field(default_factory=list)
    school_id: Optional[str] = None
    campus_id: Optional[str] = None
    is_super_admin: bool = False


async def get_current_user(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedUser:
    """
    Extract and validate the Bearer token from the Authorization header.
    Look up the user's roles from the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not authorization:
        raise credentials_exception

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise credentials_exception

    try:
        payload = await decode_supabase_token(token)
    except JWTError:
        raise credentials_exception

    # Check token blacklist (by JTI or token hash)
    import hashlib
    from app.utils.security import is_token_blacklisted
    jti = payload.get("jti") or hashlib.sha256(token.encode("utf-8")).hexdigest()
    if await is_token_blacklisted(db, jti):
        raise credentials_exception

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise credentials_exception

    email: str = payload.get("email", "") or ""

    import uuid
    # Convert string user_id to UUID object for native asyncpg parameter binding
    try:
        uid_obj = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except ValueError:
        uid_obj = user_id

    # Check if super admin — FAIL CLOSED: never grant super_admin on DB error
    try:
        result = await db.execute(
            text("SELECT user_id FROM platform_super_admins WHERE user_id = :uid LIMIT 1"),
            {"uid": uid_obj},
        )
        is_super = result.fetchone() is not None
    except Exception as e:
        import logging
        logging.getLogger("app.dependencies").warning(f"DB exception checking super admin for {user_id}: {e}")
        is_super = False  # SECURITY: fail closed — DB error must NOT grant super admin

    return AuthenticatedUser(
        id=user_id,
        email=email,
        is_super_admin=is_super,
        roles=[],  # roles are resolved per-request with school context
    )


async def get_current_user_with_roles(
    authorization: Annotated[Optional[str], Header()] = None,
    x_school_id: Annotated[Optional[str], Header()] = None,
    x_campus_id: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedUser:
    """
    Full dependency: validates token + loads roles for the given school.
    Frontend should send X-School-Id header for all tenant-scoped requests.
    """
    user = await get_current_user(authorization=authorization, db=db)

    import uuid
    try:
        uid_obj = uuid.UUID(user.id) if isinstance(user.id, str) else user.id
    except ValueError:
        uid_obj = user.id

    if not x_school_id:
        try:
            res_ur = await db.execute(
                text("SELECT school_id FROM user_roles WHERE user_id = :uid AND school_id IS NOT NULL LIMIT 1"),
                {"uid": uid_obj}
            )
            row_ur = res_ur.fetchone()
            if row_ur and row_ur[0]:
                x_school_id = str(row_ur[0])
            else:
                res_oa = await db.execute(
                    text("SELECT school_id FROM school_owner_assignments WHERE owner_user_id = :uid LIMIT 1"),
                    {"uid": uid_obj}
                )
                row_oa = res_oa.fetchone()
                if row_oa and row_oa[0]:
                    x_school_id = str(row_oa[0])
        except Exception as e:
            import logging
            logging.getLogger("app.dependencies").warning(f"Error resolving fallback school_id: {e}")

    if x_school_id:
        sid_obj = None
        sid_str = str(x_school_id).strip()
        try:
            sid_obj = uuid.UUID(sid_str)
            sid_str = str(sid_obj)
        except (ValueError, TypeError):
            # Not a UUID -> query schools table by slug
            try:
                res_slug = await db.execute(
                    text("SELECT id FROM schools WHERE slug = :slug OR id::text = :slug LIMIT 1"),
                    {"slug": sid_str}
                )
                row_slug = res_slug.fetchone()
                if row_slug and row_slug[0]:
                    sid_obj = row_slug[0]
                    sid_str = str(row_slug[0])
            except Exception as e:
                import logging
                logging.getLogger("app.dependencies").warning(f"Error resolving school slug {x_school_id}: {e}")

        # Resolve campus parameter
        resolved_campus_id = None
        if x_campus_id:
            resolved_campus_id = str(x_campus_id).strip()

        # Load roles from user_roles and school_owner_assignments tables scoped to school
        if sid_obj:
            try:
                cache_key = cache.build_key(
                    school_id=sid_str,
                    base_key=f"auth:roles:{user.id}"
                )
                cached_data = await cache.get(cache_key)
                if cached_data:
                    if isinstance(cached_data, dict):
                        user.roles = cached_data.get("roles", [])
                        db_campus_id = cached_data.get("campus_id")
                    else:
                        user.roles = cached_data
                        db_campus_id = None
                    user.school_id = sid_str
                else:
                    result = await db.execute(
                        text(
                            """
                            SELECT role, campus_id FROM user_roles
                            WHERE user_id = :uid AND (school_id = :sid OR school_id IS NULL)
                            UNION
                            SELECT 'school_owner', NULL FROM school_owner_assignments
                            WHERE owner_user_id = :uid AND school_id = :sid
                            """
                        ),
                        {"uid": uid_obj, "sid": sid_obj},
                    )
                    rows = result.fetchall()
                    roles = [row[0] for row in rows]
                    
                    # Find any non-null campus_id assigned in user_roles
                    db_campus_ids = [row[1] for row in rows if row[1]]
                    db_campus_id = str(db_campus_ids[0]) if db_campus_ids else None
                    
                    if roles:
                        user.roles = roles
                        user.school_id = sid_str
                        await cache.set(cache_key, {"roles": roles, "campus_id": db_campus_id}, ttl=TTL_USER_ROLES)
                    else:
                        # Fallback check if user has roles under any school
                        res_any = await db.execute(
                            text("SELECT role, school_id, campus_id FROM user_roles WHERE user_id = :uid LIMIT 5"),
                            {"uid": uid_obj}
                        )
                        any_rows = res_any.fetchall()
                        if any_rows:
                            user.roles = [r[0] for r in any_rows]
                            user.school_id = str(any_rows[0][1]) if any_rows[0][1] else sid_str
                            db_campus_id = str(any_rows[0][2]) if any_rows[0][2] else None
                        else:
                            user.roles = []
                            user.school_id = sid_str
                            db_campus_id = None

                # Determine active campus
                if resolved_campus_id:
                    user.campus_id = resolved_campus_id
                else:
                    owner_campus_id = None
                    if "school_owner" in user.roles or user.is_super_admin:
                        try:
                            res_context = await db.execute(
                                text("SELECT active_campus_id FROM owner_active_context WHERE user_id = :uid AND active_school_id = :sid"),
                                {"uid": uid_obj, "sid": sid_obj}
                            )
                            row_context = res_context.fetchone()
                            if row_context and row_context[0]:
                                owner_campus_id = str(row_context[0])
                        except Exception as e_ctx:
                            import logging
                            logging.getLogger("app.dependencies").warning(f"Error resolving owner active context: {e_ctx}")
                    
                    if owner_campus_id:
                        user.campus_id = owner_campus_id
                    elif db_campus_id:
                        user.campus_id = db_campus_id

            except Exception as e:
                import logging
                logging.getLogger("app.dependencies").warning(f"DB exception loading roles for school {x_school_id}: {e}")
                user.roles = []
                user.school_id = sid_str
        else:
            user.roles = []
            user.school_id = sid_str

        # Enforce multi-tenant membership check
        if not user.is_super_admin and not user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you are not a member of this school",
            )

    if user.is_super_admin and "super_admin" not in user.roles:
        user.roles.insert(0, "super_admin")

    return user


# Annotated type aliases for clean dependency injection
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
