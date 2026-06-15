from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
import json
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from pydantic import BaseModel

from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError

router = APIRouter(prefix="/collaboration", tags=["Collaboration"])

current_dir = os.path.dirname(os.path.abspath(__file__))
STORE_FILE = os.path.abspath(os.path.join(current_dir, "..", "collaboration_store.json"))

def load_store():
    if not os.path.exists(STORE_FILE):
        return {"conversations": [], "messages": []}
    try:
        with open(STORE_FILE, "r") as f:
            return json.load(f)
    except:
        return {"conversations": [], "messages": []}

def save_store(data):
    try:
        os.makedirs(os.path.dirname(STORE_FILE), exist_ok=True)
        with open(STORE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print("Failed to save collaboration store:", e)

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
async def get_conversations(school_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    try:
        sql = """
            SELECT id, title, type, participants, created_at 
            FROM pt_conversations 
            WHERE school_id = :sid 
              AND (type = 'channel' OR CAST(:uid AS uuid) = ANY(participants)) 
            ORDER BY created_at DESC
        """
        res = await db.execute(text(sql), {"sid": str(school_id), "uid": str(current_user.id)})
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
    except Exception as e:
        print("DB error fetching conversations, using local store:", e)
        store = load_store()
        school_convos = [
            c for c in store["conversations"]
            if c.get("school_id") == str(school_id) and (
                c.get("type", "channel") == "channel" or
                str(current_user.id) in [str(p) for p in (c.get("participants") or [])]
            )
        ]
        if not school_convos:
            school_convos = [
                {
                    "id": "demo-convo-1",
                    "school_id": str(school_id),
                    "title": "General Parent-Teacher Discussion",
                    "type": "channel",
                    "participants": None,
                    "created_at": datetime.now().isoformat()
                },
                {
                    "id": "demo-convo-2",
                    "school_id": str(school_id),
                    "title": "Campus Development & Safety Updates",
                    "type": "channel",
                    "participants": None,
                    "created_at": datetime.now().isoformat()
                }
            ]
            store["conversations"].extend(school_convos)
            save_store(store)
        return school_convos

@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(body: dict, current_user: CurrentUser, db: DbSession):
    school_id = body.get("school_id")
    title = body.get("title")
    type_str = body.get("type", "channel")
    participants = body.get("participants") # list of user ID strings or None
    
    if not school_id or not title:
        raise HTTPException(status_code=400, detail="Missing school_id or title")
        
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
        print("DB error creating conversation, using local store:", e)
        store = load_store()
        convo = {
            "id": f"demo-convo-{int(datetime.now().timestamp())}",
            "school_id": str(school_id),
            "title": title,
            "type": type_str,
            "participants": participants,
            "created_at": created_at
        }
        store["conversations"].append(convo)
        save_store(store)
        
        # Broadcast via WebSockets
        from app.websocket_manager import ws_manager
        await ws_manager.broadcast_to_school(str(school_id), {
            "type": "collaboration:new_conversation",
            "data": convo
        })
        
        return convo

@router.get("/messages", response_model=List[MessageOut])
async def get_messages(convo_id: str, current_user: CurrentUser, db: DbSession):
    try:
        sql = "SELECT id, convo_id, sender_id, encrypted_body, created_at FROM pt_messages WHERE convo_id = :cid ORDER BY created_at ASC"
        res = await db.execute(text(sql), {"cid": convo_id})
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
    except Exception as e:
        print("DB error fetching messages, using local store:", e)
        store = load_store()
        convo_msgs = [
            m for m in store["messages"]
            if m.get("convo_id") == convo_id
        ]
        return convo_msgs

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
    
    try:
        # Resolve school_id and participants of the conversation
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
    except Exception as e:
        print("DB error creating message, using local store:", e)
        store = load_store()
        
        # Resolve school_id and participants from local store
        if not school_id:
            convo = next((c for c in store["conversations"] if c["id"] == convo_id), None)
            if convo:
                school_id = convo["school_id"]
                participants = convo.get("participants")
                
        msg = {
            "id": f"msg-{uuid4()}",
            "convo_id": convo_id,
            "sender_id": sender_id,
            "encrypted_body": encrypted_body,
            "created_at": created_at,
            "participants": participants
        }
        store["messages"].append(msg)
        save_store(store)
        
        # Broadcast via WebSockets
        if school_id:
            from app.websocket_manager import ws_manager
            await ws_manager.broadcast_to_school(school_id, {
                "type": "collaboration:new_message",
                "data": msg
            })
            
        return msg

@router.get("/online-users", response_model=List[str])
async def get_online_users(school_id: UUID, current_user: CurrentUser):
    try:
        from app.websocket_manager import ws_manager
        online = ws_manager.get_online_users(str(school_id))
        return list(online)
    except Exception as e:
        print("Error getting online users:", e)
        return []

