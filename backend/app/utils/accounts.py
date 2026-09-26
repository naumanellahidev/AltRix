"""
Accounts and who may change them.

Several paths created a login for an email address and, when an account with
that address already existed, overwrote its password: the bulk staff import,
the direct-password invite and the platform's create-school. Anyone who could
run one of them could take over any account on the platform (another school's
owner, the platform owner) by entering its email. And staff governance let a
principal or HR manager of any school set the password or email of any
account by id, or grant any role, including owner.

`ensure_account` creates an account or links to the existing one without
touching its password; `check_governance_target` decides whether a caller may
act on a member of their school.
"""
import json
import uuid
from typing import Iterable, Optional, Tuple

import bcrypt
from fastapi import HTTPException, status
from sqlalchemy import text

#: How far up a school's staff each role sits. A caller acts only on people
#: below them, and grants only roles below their own.
ROLE_RANK = {
    "super_admin": 9,
    "school_owner": 4,
    "principal": 3,
    "vice_principal": 3,
    "school_admin": 2,
    "hr_manager": 2,
}
#: Roles only the platform grants.
PLATFORM_GRANTED = {"super_admin", "school_owner"}


def rank_of(roles: Iterable[str]) -> int:
    return max((ROLE_RANK.get(r, 1) for r in roles), default=0)


async def is_platform_admin(db, user_id) -> bool:
    row = await db.execute(
        text("SELECT 1 FROM public.platform_super_admins WHERE user_id = CAST(:u AS uuid) LIMIT 1"),
        {"u": str(user_id)},
    )
    return row.first() is not None


async def school_roles(db, school_id, user_id) -> set:
    rows = await db.execute(
        text(
            "SELECT role::text FROM public.user_roles WHERE school_id = CAST(:s AS uuid) AND user_id = CAST(:u AS uuid) "
            "UNION SELECT 'school_owner' FROM public.school_owner_assignments "
            "WHERE school_id = CAST(:s AS uuid) AND owner_user_id = CAST(:u AS uuid)"
        ),
        {"s": str(school_id), "u": str(user_id)},
    )
    return {r[0] for r in rows.fetchall()}


async def is_member(db, school_id, user_id) -> bool:
    row = await db.execute(
        text(
            "SELECT 1 FROM public.user_roles WHERE school_id = CAST(:s AS uuid) AND user_id = CAST(:u AS uuid) "
            "UNION SELECT 1 FROM public.school_memberships WHERE school_id = CAST(:s AS uuid) AND user_id = CAST(:u AS uuid) "
            "UNION SELECT 1 FROM public.school_owner_assignments WHERE school_id = CAST(:s AS uuid) AND owner_user_id = CAST(:u AS uuid) "
            "LIMIT 1"
        ),
        {"s": str(school_id), "u": str(user_id)},
    )
    return row.first() is not None


async def belongs_elsewhere(db, school_id, user_id) -> bool:
    row = await db.execute(
        text(
            "SELECT 1 FROM public.user_roles WHERE user_id = CAST(:u AS uuid) AND school_id <> CAST(:s AS uuid) "
            "UNION SELECT 1 FROM public.school_owner_assignments WHERE owner_user_id = CAST(:u AS uuid) AND school_id <> CAST(:s AS uuid) "
            "LIMIT 1"
        ),
        {"s": str(school_id), "u": str(user_id)},
    )
    return row.first() is not None


def _deny(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)


async def check_governance_target(
    db, school_id, actor_id, target_id, action: str, new_roles: Optional[Iterable[str]] = None
) -> None:
    """Raise unless the caller may perform `action` on `target_id` in this school."""
    if await is_platform_admin(db, actor_id):
        return
    if await is_platform_admin(db, target_id):
        raise _deny("That account is managed by the platform.")
    if not await is_member(db, school_id, target_id):
        raise _deny("That person is not a member of this school.")

    caller_rank = rank_of(await school_roles(db, school_id, actor_id))
    target_rank = rank_of(await school_roles(db, school_id, target_id))
    if target_rank >= caller_rank:
        raise _deny("You can only manage people below your own role in this school.")

    if action == "set_roles":
        for r in new_roles or []:
            if r in PLATFORM_GRANTED:
                raise _deny(f"The '{r}' role is granted by the platform, not by a school.")
            if ROLE_RANK.get(r, 1) >= caller_rank:
                raise _deny(f"You cannot grant the '{r}' role: it is not below your own.")

    if action in ("set_password", "set_email") and await belongs_elsewhere(db, school_id, target_id):
        raise _deny(
            "This account also belongs to another school, so its password and email are not this "
            "school's to change. The person can change them themselves, or the platform can."
        )


async def ensure_account(
    db, email: str, password: Optional[str], display_name: Optional[str] = None
) -> Tuple[uuid.UUID, bool]:
    """
    The account for this email: created with `password` if there is none, or
    the existing one, whose password is never changed here. Returns
    (user_id, created).
    """
    clean = (email or "").strip().lower()
    row = (await db.execute(
        text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :e LIMIT 1"), {"e": clean}
    )).first()
    if row:
        if await is_platform_admin(db, row[0]):
            raise _deny("That email belongs to a platform account and cannot be added to a school.")
        return row[0], False

    if not password or len(password) < 8:
        raise HTTPException(status_code=400, detail="A password of at least 8 characters is needed for a new account.")
    uid = uuid.uuid4()
    name = (display_name or clean.split("@")[0]).strip()
    await db.execute(
        text(
            "INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, "
            "raw_user_meta_data, created_at, updated_at, aud, role) VALUES (:id, :e, :pw, NOW(), "
            "CAST(:app AS jsonb), CAST(:meta AS jsonb), NOW(), NOW(), 'authenticated', 'authenticated')"
        ),
        {
            "id": uid, "e": clean,
            "pw": bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8"),
            "app": json.dumps({"provider": "email", "providers": ["email"]}),
            "meta": json.dumps({"full_name": name, "name": name}),
        },
    )
    await db.execute(
        text(
            "INSERT INTO public.profiles (id, email, display_name, updated_at) VALUES (:id, :e, :n, NOW()) "
            "ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, "
            "display_name = COALESCE(profiles.display_name, EXCLUDED.display_name), updated_at = NOW()"
        ),
        {"id": uid, "e": clean, "n": name},
    )
    return uid, True


async def check_grantable(db, school_id, actor_id, roles: Iterable[str]) -> None:
    """Raise unless the caller may give these roles in this school."""
    if await is_platform_admin(db, actor_id):
        return
    caller_rank = rank_of(await school_roles(db, school_id, actor_id))
    for r in roles:
        if r in PLATFORM_GRANTED:
            raise _deny(f"The '{r}' role is granted by the platform, not by a school.")
        if ROLE_RANK.get(r, 1) >= caller_rank:
            raise _deny(f"You cannot give the '{r}' role: it is not below your own.")
