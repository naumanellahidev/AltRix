"""
WebSocket endpoints for real-time notifications and updates.
"""
import json
import logging
import secrets
import time
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import text

from app.cache import cache
from app.database import AsyncSessionLocal
from app.dependencies import CurrentUser
from app.utils.jwt import decode_supabase_token
from app.websocket_manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Realtime"])

# Close codes
_POLICY_VIOLATION = 1008

# ─── Connection tickets ───────────────────────────────────────────────────────
#
# Browsers cannot set headers on a WebSocket handshake, so the credential has to
# travel in the URL — and URLs end up in proxy access logs. Sending the access
# token that way means an hour-long credential sitting in plaintext in the logs
# of every hop.
#
# A ticket is a single-use, 30-second secret that is worthless once redeemed, so
# a log entry containing one is not a credential leak.
TICKET_TTL_SECONDS = 30
_TICKET_PREFIX = "ws:ticket:"

#: Fallback when Redis is unavailable. Fine because a ticket only has to survive
#: the few seconds between being issued and being redeemed, and the client
#: reconnects to the same worker it just called.
_local_tickets: Dict[str, Tuple[str, float]] = {}


def _prune_local_tickets() -> None:
    now = time.time()
    for key in [k for k, (_, exp) in _local_tickets.items() if exp < now]:
        _local_tickets.pop(key, None)


async def _issue_ticket(user_id: str) -> str:
    ticket = secrets.token_urlsafe(32)
    stored = await cache.set(f"{_TICKET_PREFIX}{ticket}", user_id, ttl=TICKET_TTL_SECONDS)
    if not stored:
        _prune_local_tickets()
        _local_tickets[ticket] = (user_id, time.time() + TICKET_TTL_SECONDS)
    return ticket


async def _redeem_ticket(ticket: str) -> Optional[str]:
    """Return the user id for a ticket and invalidate it. Single use."""
    key = f"{_TICKET_PREFIX}{ticket}"
    user_id = await cache.get(key)
    if user_id:
        await cache.delete(key)
        return str(user_id)

    _prune_local_tickets()
    entry = _local_tickets.pop(ticket, None)
    if entry:
        return entry[0]
    return None


@router.post("/realtime/ws-ticket")
async def create_ws_ticket(current_user: CurrentUser):
    """
    Exchange a bearer token for a short-lived WebSocket connection ticket.

    Called over normal HTTP, where the token travels in the Authorization
    header and is not logged.
    """
    return {
        "ticket": await _issue_ticket(current_user.id),
        "expires_in": TICKET_TTL_SECONDS,
    }


async def _family_views_for_user(user_id: str, school_rooms: List[str]) -> dict:
    """
    For each school where this user is only a parent and/or a student: their
    children (or their own student record) and the notices meant for them.
    Live changes to that school are filtered through it (ws_manager).
    """
    views: dict = {}
    schools = [r.split(":", 1)[1] for r in school_rooms]
    try:
        uid = UUID(str(user_id))
    except (ValueError, TypeError):
        return views
    async with AsyncSessionLocal() as db:
        try:
            staff = {r[0] for r in (await db.execute(
                text(
                    "SELECT school_id::text FROM public.user_roles WHERE user_id = :uid"
                    " AND role::text NOT IN ('parent', 'student')"
                    " AND (end_date IS NULL OR end_date >= CURRENT_DATE)"
                    " UNION SELECT school_id::text FROM public.school_owner_assignments WHERE owner_user_id = :uid"
                ),
                {"uid": uid},
            )).fetchall()}
            roles = {}
            for sid, role in (await db.execute(
                text("SELECT school_id::text, role::text FROM public.user_roles WHERE user_id = :uid"),
                {"uid": uid},
            )).fetchall():
                roles.setdefault(sid, set()).add(role)
            for school_id in schools:
                if school_id in staff:
                    continue
                kids = await db.execute(
                    text(
                        "SELECT g.student_id::text FROM public.student_guardians g"
                        " JOIN public.students s ON s.id = g.student_id"
                        " WHERE g.user_id = :uid AND s.school_id = CAST(:sid AS uuid)"
                        " UNION SELECT s.id::text FROM public.students s"
                        " WHERE s.profile_id = :uid AND s.school_id = CAST(:sid AS uuid)"
                    ),
                    {"uid": uid, "sid": school_id},
                )
                mine = roles.get(school_id, set())
                audiences = ["all"] + [a for r, a in (("parent", "parents"), ("student", "students")) if r in mine]
                views[school_id] = {"kids": {r[0] for r in kids.fetchall()}, "audiences": audiences}
        except Exception as e:
            # Unknown: nothing of anyone else's is pushed to them.
            logger.error(f"WebSocket: could not resolve family view for {user_id}: {e}")
            return {s: {"kids": set(), "audiences": ["all"]} for s in schools}
    return views


async def _rooms_for_user(user_id: str) -> List[str]:
    """
    Work out which broadcast rooms this user may join, from the database.

    The room used to come from ``user_metadata.school_id`` inside the token.
    That was wrong twice over: tokens this backend issues carry an empty
    ``user_metadata``, so the school room was never joined and presence never
    worked at all; and on Supabase a user can edit their own ``user_metadata``,
    so anyone could have named another school and subscribed to its event
    stream. Membership is authoritative only in the database.
    """
    rooms = [f"user:{user_id}"]

    try:
        uid: object = UUID(str(user_id))
    except (ValueError, TypeError):
        logger.warning(f"WebSocket: unusable subject {user_id!r}")
        return rooms

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                text(
                    """
                    SELECT DISTINCT school_id FROM public.user_roles
                    WHERE user_id = :uid AND school_id IS NOT NULL
                    UNION
                    SELECT DISTINCT school_id FROM public.school_owner_assignments
                    WHERE owner_user_id = :uid
                    """
                ),
                {"uid": uid},
            )
            for row in result.fetchall():
                if row[0]:
                    rooms.append(f"school:{row[0]}")
        except Exception as e:
            # Without a verified school list, the user still gets their own
            # private channel; they simply receive no school broadcasts.
            logger.error(f"WebSocket: could not resolve rooms for {user_id}: {e}")

    return rooms


async def _token_is_revoked(token: str, payload: dict) -> bool:
    """Reject tokens that logout or a password reset has already invalidated."""
    import hashlib
    from datetime import datetime, timezone

    from app.utils.security import is_token_blacklisted, tokens_invalidated_before

    jti = payload.get("jti") or hashlib.sha256(token.encode("utf-8")).hexdigest()
    async with AsyncSessionLocal() as db:
        try:
            if await is_token_blacklisted(db, jti):
                return True
            cutoff = await tokens_invalidated_before(db, str(payload.get("sub")))
            if cutoff is not None:
                issued_at = payload.get("iat")
                if issued_at is None:
                    return True
                if cutoff.tzinfo is None:
                    cutoff = cutoff.replace(tzinfo=timezone.utc)
                if datetime.fromtimestamp(int(issued_at), tz=timezone.utc) < cutoff:
                    return True
        except Exception as e:
            logger.warning(f"WebSocket: revocation check failed: {e}")
    return False


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(None, description="Single-use connection ticket"),
    token: Optional[str] = Query(None, description="Deprecated: access token"),
):
    """
    WebSocket connection endpoint.

    Prefers a ``ticket`` from POST /api/realtime/ws-ticket. Whatever is in this
    URL lands in proxy access logs, and a redeemed ticket is worthless, whereas
    an access token in the same place is a live credential.

    A raw ``token`` is still accepted so a backend deploy does not disconnect
    clients running the previous frontend. Remove that branch once the ticket
    path is everywhere.
    """
    user_id: Optional[str] = None

    if ticket:
        user_id = await _redeem_ticket(ticket)
        if not user_id:
            logger.warning("WebSocket: ticket was invalid, expired or already used")
            await websocket.close(code=_POLICY_VIOLATION)
            return

    elif token:
        logger.warning(
            "WebSocket: client connected with a raw access token in the query "
            "string (deprecated). It will be written to proxy access logs; "
            "switch this client to POST /api/realtime/ws-ticket."
        )
        try:
            payload = await decode_supabase_token(token)
        except JWTError as e:
            logger.warning(f"WebSocket authentication failed: {e}")
            await websocket.close(code=_POLICY_VIOLATION)
            return

        user_id = payload.get("sub")
        if not user_id:
            logger.warning("WebSocket: token has no subject")
            await websocket.close(code=_POLICY_VIOLATION)
            return

        # A refresh token lives for 30 days; it must not open a live data feed.
        if payload.get("token_type") == "refresh":
            logger.warning(f"WebSocket: refresh token offered as a credential by {user_id}")
            await websocket.close(code=_POLICY_VIOLATION)
            return

        if await _token_is_revoked(token, payload):
            logger.warning(f"WebSocket: revoked token offered by {user_id}")
            await websocket.close(code=_POLICY_VIOLATION)
            return

    else:
        await websocket.close(code=_POLICY_VIOLATION)
        return

    # 2. Rooms, from verified membership
    rooms = await _rooms_for_user(user_id)
    school_rooms = [r for r in rooms if r.startswith("school:")]

    # 3. Connect
    await ws_manager.connect(websocket, user_id, rooms)
    for school_id, view in (await _family_views_for_user(user_id, school_rooms)).items():
        ws_manager.set_family_view(user_id, school_id, view)

    async def _broadcast_presence(status: str) -> None:
        for room in school_rooms:
            try:
                await ws_manager.broadcast_to_school(
                    room.split(":", 1)[1],
                    {"type": "presence:update",
                     "data": {"user_id": user_id, "status": status}},
                )
            except Exception as e:
                logger.error(f"Error broadcasting {status} presence: {e}")

    await _broadcast_presence("online")

    try:
        # 4. Listen for client messages (keepalive only)
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception as exc:
                # Ignore malformed frames from clients.
                logger.warning("Optional step failed (%s): %s", "json.loads", exc, exc_info=True)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
    finally:
        await ws_manager.disconnect(websocket, user_id, rooms)
        await _broadcast_presence("offline")
