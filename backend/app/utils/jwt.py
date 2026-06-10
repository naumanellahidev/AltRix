"""
JWT utilities for validating Supabase-issued tokens.
Supabase issues HS256 JWTs signed with the project JWT secret.
We validate them here instead of issuing our own tokens — this
preserves all existing user sessions without any data migration.
"""
import httpx
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt

from app.config import settings


async def decode_supabase_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a Supabase JWT.
    First tries local cryptographic validation using HS256 secret.
    Falls back to verifying against Supabase Auth API over HTTPS.
    Returns the payload dict if valid, raises JWTError on failure.
    """
    # 1. Try local verification
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase includes "authenticated" audience
        )
        return payload
    except JWTError:
        pass

    # 2. Try Supabase HTTP API verification
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
                timeout=10.0
            )
        if resp.status_code == 200:
            user_data = resp.json()
            return {
                "sub": user_data.get("id"),
                "email": user_data.get("email"),
                "user_metadata": user_data.get("user_metadata", {}),
            }
        else:
            raise JWTError(f"Supabase API validation failed with status {resp.status_code}")
    except Exception as exc:
        raise JWTError(f"Token validation failed: {exc}") from exc


async def get_user_id_from_token(token: str) -> Optional[str]:
    """Extract the user UUID (sub claim) from a Supabase JWT."""
    try:
        payload = await decode_supabase_token(token)
        return payload.get("sub")
    except JWTError:
        return None


async def get_token_expiry(token: str) -> Optional[datetime]:
    """Return the expiry datetime of the token, or None if invalid."""
    try:
        payload = await decode_supabase_token(token)
        exp = payload.get("exp")
        if exp:
            return datetime.fromtimestamp(exp, tz=timezone.utc)
        return None
    except JWTError:
        return None


async def is_token_expired(token: str) -> bool:
    """Return True if the token has expired."""
    expiry = await get_token_expiry(token)
    if not expiry:
        return True
    return datetime.now(tz=timezone.utc) > expiry
