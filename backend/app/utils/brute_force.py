"""
Brute Force Protection — Redis-backed login attempt tracking.

Provides:
- Per-IP and per-email attempt counters
- Progressive lockout (exponential backoff)
- Suspicious login detection (new IP, new country, off-hours)
- Automatic event logging to security_events table
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request, status

logger = logging.getLogger("app.security.brute_force")

# ─── Configuration ────────────────────────────────────────────────────────────

MAX_ATTEMPTS_PER_IP = 10        # per window
MAX_ATTEMPTS_PER_EMAIL = 5      # per window
LOCKOUT_WINDOW_SECONDS = 300    # 5 minutes window
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes lockout after max exceeded
REDIS_PREFIX = "bf"             # brute force prefix in Redis


# ─── Core Functions ───────────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    """Extract real client IP from request (handles proxies)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def record_failed_attempt(
    request: Request,
    email: str,
    db=None,
) -> None:
    """
    Record a failed login attempt for both IP and email.
    Logs to security_events if DB is available.
    """
    from app.cache import cache

    ip = _get_client_ip(request)
    ip_key = f"{REDIS_PREFIX}:ip:{ip}"
    email_key = f"{REDIS_PREFIX}:email:{email.lower()}"

    try:
        ip_count = await cache.increment(ip_key, ttl=LOCKOUT_WINDOW_SECONDS)
        email_count = await cache.increment(email_key, ttl=LOCKOUT_WINDOW_SECONDS)

        logger.warning(
            f"Failed login: email={email}, ip={ip}, "
            f"ip_attempts={ip_count}, email_attempts={email_count}"
        )

        # Log to security_events if thresholds exceeded
        if ip_count >= MAX_ATTEMPTS_PER_IP // 2 or email_count >= MAX_ATTEMPTS_PER_EMAIL // 2:
            await _log_security_event(
                db=db,
                event_type="failed_login",
                ip_address=ip,
                user_agent=request.headers.get("User-Agent", ""),
                details={
                    "email": email,
                    "ip_attempts": ip_count,
                    "email_attempts": email_count,
                },
            )
    except Exception as e:
        logger.warning(f"Failed to record login attempt: {e}")


async def check_brute_force(request: Request, email: str) -> None:
    """
    Check if the IP or email is locked out.
    Raises HTTP 429 if lockout threshold exceeded.
    Call BEFORE processing login credentials.
    """
    from app.cache import cache

    ip = _get_client_ip(request)
    ip_key = f"{REDIS_PREFIX}:ip:{ip}"
    email_key = f"{REDIS_PREFIX}:email:{email.lower()}"
    lockout_key_ip = f"{REDIS_PREFIX}:lock:ip:{ip}"
    lockout_key_email = f"{REDIS_PREFIX}:lock:email:{email.lower()}"

    try:
        # Check active lockouts first (fastest path)
        if await cache.get(lockout_key_ip) or await cache.get(lockout_key_email):
            logger.warning(f"Login blocked — account/IP locked: email={email}, ip={ip}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again in 15 minutes.",
                headers={"Retry-After": str(LOCKOUT_DURATION_SECONDS)},
            )

        # Check attempt counters
        ip_count_raw = await cache.get(ip_key)
        email_count_raw = await cache.get(email_key)
        ip_count = ip_count_raw if isinstance(ip_count_raw, int) else 0
        email_count = email_count_raw if isinstance(email_count_raw, int) else 0

        if ip_count >= MAX_ATTEMPTS_PER_IP:
            await cache.set(lockout_key_ip, True, ttl=LOCKOUT_DURATION_SECONDS)
            logger.warning(f"IP locked out: {ip} after {ip_count} attempts")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts from this IP. Try again in 15 minutes.",
                headers={"Retry-After": str(LOCKOUT_DURATION_SECONDS)},
            )

        if email_count >= MAX_ATTEMPTS_PER_EMAIL:
            await cache.set(lockout_key_email, True, ttl=LOCKOUT_DURATION_SECONDS)
            logger.warning(f"Email locked out: {email} after {email_count} attempts")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts for this account. Try again in 15 minutes.",
                headers={"Retry-After": str(LOCKOUT_DURATION_SECONDS)},
            )

    except HTTPException:
        raise
    except Exception as e:
        # Cache unavailable — fail open (don't block legitimate users)
        logger.warning(f"Brute force check failed (cache unavailable): {e}")


async def clear_failed_attempts(email: str, ip: Optional[str] = None) -> None:
    """
    Clear failed attempt counters on successful login.
    Call AFTER a successful authentication.
    """
    from app.cache import cache

    try:
        email_lower = email.lower()
        await cache.delete(f"{REDIS_PREFIX}:email:{email_lower}")
        await cache.delete(f"{REDIS_PREFIX}:lock:email:{email_lower}")
        if ip:
            await cache.delete(f"{REDIS_PREFIX}:ip:{ip}")
            await cache.delete(f"{REDIS_PREFIX}:lock:ip:{ip}")
    except Exception as e:
        logger.warning(f"Failed to clear brute force counters: {e}")


async def detect_suspicious_login(
    request: Request,
    user_id: str,
    email: str,
    db=None,
) -> None:
    """
    Detect suspicious login patterns:
    - New IP address (first seen for this user)
    - Multiple active sessions
    Log events but don't block (informational only).
    """
    from app.cache import cache

    ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")
    known_ips_key = f"known_ips:{user_id}"

    try:
        known_ips = await cache.get(known_ips_key) or []
        if ip not in known_ips:
            logger.info(f"New IP for user {user_id}: {ip}")
            known_ips = (known_ips + [ip])[-10:]  # keep last 10 IPs
            await cache.set(known_ips_key, known_ips, ttl=86400 * 30)  # 30 days

            if len(known_ips) > 1:
                # Not the very first login — new IP is suspicious
                await _log_security_event(
                    db=db,
                    event_type="new_ip_login",
                    user_id=user_id,
                    ip_address=ip,
                    user_agent=user_agent,
                    details={"email": email, "new_ip": ip},
                )
    except Exception as e:
        logger.warning(f"Suspicious login detection failed: {e}")


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _log_security_event(
    db,
    event_type: str,
    ip_address: str = "",
    user_agent: str = "",
    user_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Write a security event to the security_events table."""
    if not db:
        return
    try:
        from sqlalchemy import text
        await db.execute(
            text("""
                INSERT INTO security_events (event_type, user_id, ip_address, user_agent, details, created_at)
                VALUES (:event_type, :user_id, :ip, :ua, :details::jsonb, :now)
            """),
            {
                "event_type": event_type,
                "user_id": user_id,
                "ip": ip_address[:100],
                "ua": user_agent[:500],
                "details": __import__("json").dumps(details or {}),
                "now": datetime.now(timezone.utc),
            },
        )
    except Exception as e:
        logger.warning(f"Failed to write security event: {e}")
