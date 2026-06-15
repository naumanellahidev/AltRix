"""
WebSocket endpoints for real-time notifications and updates.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
import logging
import json

from app.websocket_manager import ws_manager
from app.utils.jwt import decode_supabase_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Realtime"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="Supabase access token for authentication")
):
    """
    WebSocket connection endpoint.
    Expects a valid Supabase JWT token passed in the query parameters.
    """
    # 1. Authenticate connection
    try:
        payload = await decode_supabase_token(token)
        user_id = payload.get("sub")
        email = payload.get("email", "")
        if not user_id:
            logger.warning("WebSocket connection attempt failed: missing sub claim in token")
            await websocket.close(code=1008)  # Policy Violation
            return
    except JWTError as e:
        logger.warning(f"WebSocket authentication failed: {e}")
        await websocket.close(code=1008)  # Policy Violation
        return

    # 2. Join rooms
    # We can default to joining their own user channel and school channel if claims are present.
    # Supabase JWT payloads sometimes have user metadata.
    user_metadata = payload.get("user_metadata", {})
    school_id = user_metadata.get("school_id")
    
    rooms = [f"user:{user_id}"]
    if school_id:
        rooms.append(f"school:{school_id}")

    # 3. Connect to the WebSocket manager
    await ws_manager.connect(websocket, user_id, rooms)

    # Broadcast online presence
    if school_id:
        await ws_manager.broadcast_to_school(school_id, {
            "type": "presence:update",
            "data": {
                "user_id": user_id,
                "status": "online"
            }
        })

    try:
        # 4. Listen for messages from client (e.g. ping/pong)
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                # Keepalive / ping handling
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                # Ignore invalid formatting from clients
                pass
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
    finally:
        await ws_manager.disconnect(websocket, user_id, rooms)
        # Broadcast offline presence
        if school_id:
            try:
                await ws_manager.broadcast_to_school(school_id, {
                    "type": "presence:update",
                    "data": {
                        "user_id": user_id,
                        "status": "offline"
                    }
                })
            except Exception as e:
                logger.error(f"Error broadcasting offline presence: {e}")

