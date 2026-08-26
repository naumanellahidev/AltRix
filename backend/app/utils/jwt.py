"""
JWT utilities for local authentication.
Generates and validates HS256 JWTs mimicking the Supabase format.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid

from jose import JWTError, jwt

from app.config import settings


def create_access_token(user_id: str, email: str, role: str = "authenticated") -> str:
    """Create a new local JWT access token."""
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    
    payload = {
        "aud": "authenticated",
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(tz=timezone.utc).timestamp()),
        "sub": str(user_id),
        "email": email,
        "phone": "",
        "app_metadata": {
            "provider": "email",
            "providers": ["email"]
        },
        "user_metadata": {},
        "role": role,
        "session_id": str(uuid.uuid4())
    }
    
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def create_refresh_token(user_id: str, email: str, role: str = "authenticated") -> str:
    """Create a new local JWT refresh token with long-lived lifetime (e.g. 30 days)."""
    expire = datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    
    payload = {
        "aud": "authenticated",
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(tz=timezone.utc).timestamp()),
        "sub": str(user_id),
        "email": email,
        "phone": "",
        "token_type": "refresh",
        "role": role,
        "session_id": str(uuid.uuid4())
    }
    
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


async def decode_supabase_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a local or existing Supabase JWT.
    Uses cryptographic validation via HS256 secret.
    Returns the payload dict if valid, raises JWTError on failure.
    """
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
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
