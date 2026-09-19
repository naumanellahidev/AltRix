from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from pydantic import BaseModel

from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError
from app.utils.tenant_guard import require_tenant_access, safe_school_id
from app.utils.pagination import ListPageParams

# There is no local fallback store here, deliberately.
#
# Reads used to fall back to a JSON file on disk when the database errored,
# and writes used to append to it and then broadcast over the websocket. A
# parent whose message hit a database blip saw it appear in the thread and
# believed it was sent; it was never in the database and the teacher never
# received it. Stale reads had the same shape: last week's thread served as
# though it were current.
#
# A database error is now a database error. The caller is told, and nothing
# claims to have been delivered that was not.

router = APIRouter(prefix="/collaboration", tags=["Collaboration"])

logger = logging.getLogger("app.collaboration")




class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str
    type: Optional[str] = "channel"
    participants: Optional[List[str]] = None

class MessageOut(BaseModel):
    id: str
    convo_id: str
    sender_id: str
    encrypted_body: dict
    created_at: str

# src/components/principal/CollaborationHub.tsx
@router.get("/conversations", response_model=List[ConversationOut])
async def get_conversations(school_id: UUID, current_user: CurrentUser, db: DbSession, page: ListPageParams):
    # The school_id in the query string is caller-supplied. Verifying only that
    # the caller *has* a school let anyone read another tenant's conversations.
    require_tenant_access(school_id, current_user, resource_description="conversations")

    sql = """
        SELECT id, title, type, participants, created_at 
        FROM pt_conversations 
        WHERE school_id = :sid 
          AND (type = 'channel' OR CAST(:uid AS uuid) = ANY(participants)) 
        ORDER BY created_at DESC
        LIMIT :lim OFFSET :off
    """
    res = await db.execute(text(sql), {"sid": str(school_id), "uid": str(current_user.id),
                                       "lim": page.limit, "off": page.offset})
    rows = res.fetchall()
    return [
        {
            "id": str(r[0]),
            "title": r[1],
            "type": r[2],
            "participants": [str(p) for p in r[3]] if r[3] else None,
            "created_at": r[4].isoformat() if r[4] else datetime.now().isoformat()
        }
        for r in rows
    ]

@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(body: dict, current_user: CurrentUser, db: DbSession):
    school_id = body.get("school_id")
    title = body.get("title")
    type_str = body.get("type", "channel")
    participants = body.get("participants") # list of user ID strings or None
    
    if not title:
        raise HTTPException(status_code=400, detail="Missing title")

    # Never trust a school_id from the body: pin the conversation to the
    # caller's verified tenant so it cannot be planted in another school.
    school_id = safe_school_id(current_user) if not school_id else school_id
    require_tenant_access(school_id, current_user, resource_description="conversation")

    convo_id = str(uuid4())
    created_at = datetime.now().isoformat()
    
    try:
        sql = "INSERT INTO pt_conversations (id, school_id, title, type, participants) VALUES (:id, :sid, :title, :type, :participants)"
        await db.execute(text(sql), {
            "id": convo_id,
            "sid": str(school_id),
            "title": title,
            "type": type_str,
            "participants": participants
        })
        await db.commit()
        
        convo_data = {
            "id": convo_id,
            "title": title,
            "type": type_str,
            "participants": participants,
            "created_at": created_at
        }
        
        # Broadcast via WebSockets
        from app.websocket_manager import ws_manager
        await ws_manager.broadcast_to_school(str(school_id), {
            "type": "collaboration:new_conversation",
            "data": convo_data
        })
        
        return convo_data
    except Exception as e:
        # Falling back to the on-disk store here told the caller their
        # conversation was created when it existed only in one container's JSON
        # file — invisible to other workers and gone on the next deploy.
        logger.error(f"DB error creating conversation: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not create the conversation. Please retry.",
        )


@router.get("/messages", response_model=List[MessageOut])
async def get_messages(convo_id: str, current_user: CurrentUser, db: DbSession, page: ListPageParams):
    sql = (
        "SELECT id, convo_id, sender_id, encrypted_body, created_at "
        "FROM pt_messages WHERE convo_id = :cid "
        "ORDER BY created_at ASC LIMIT :lim OFFSET :off"
    )
    res = await db.execute(text(sql), {"cid": convo_id,
                                       "lim": page.limit, "off": page.offset})
    rows = res.fetchall()
    return [
        {
            "id": str(r[0]),
            "convo_id": str(r[1]),
            "sender_id": str(r[2]),
            "encrypted_body": json.loads(r[3]) if isinstance(r[3], str) else r[3],
            "created_at": r[4].isoformat() if r[4] else datetime.now().isoformat()
        }
        for r in rows
    ]

@router.post("/messages", response_model=MessageOut)
async def create_message(body: dict, current_user: CurrentUser, db: DbSession):
    convo_id = body.get("convo_id")
    sender_id = body.get("sender_id")
    encrypted_body = body.get("encrypted_body")
    
    if not convo_id or not sender_id or not encrypted_body:
        raise HTTPException(status_code=400, detail="Missing required message parameters")
        
    msg_id = str(uuid4())
    created_at = datetime.now().isoformat()
    school_id = None
    participants = None
    
    convo_res = await db.execute(
        text("SELECT school_id, participants FROM pt_conversations WHERE id = :cid"),
        {"cid": convo_id}
    )
    convo_row = convo_res.fetchone()
    if convo_row:
        school_id = str(convo_row[0])
        participants = [str(p) for p in convo_row[1]] if convo_row[1] else None
        
    sql = "INSERT INTO pt_messages (id, convo_id, sender_id, encrypted_body) VALUES (:id, :cid, :sid, :body)"
    await db.execute(text(sql), {
        "id": msg_id,
        "cid": convo_id,
        "sid": sender_id,
        "body": json.dumps(encrypted_body)
    })
    await db.commit()
    
    msg_data = {
        "id": msg_id,
        "convo_id": convo_id,
        "sender_id": sender_id,
        "encrypted_body": encrypted_body,
        "created_at": created_at,
        "participants": participants
    }
    
    # Broadcast via WebSockets
    if school_id:
        from app.websocket_manager import ws_manager
        await ws_manager.broadcast_to_school(school_id, {
            "type": "collaboration:new_message",
            "data": msg_data
        })
        
    return msg_data

@router.get("/online-users", response_model=List[str])
async def get_online_users(school_id: UUID, current_user: CurrentUser):
    require_tenant_access(school_id, current_user, resource_description="presence")
    # Not paginated on purpose: this reads in-memory websocket presence for
    # one school, bounded by the number of live connections, and never the
    # database.
    try:
        from app.websocket_manager import ws_manager
        online = ws_manager.get_online_users(str(school_id))
        return list(online)
    except Exception as e:
        logger.warning(f"Error getting online users: {e}")
        return []

