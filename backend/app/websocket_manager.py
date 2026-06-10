"""
WebSocket connection manager for real-time features:
- In-app notifications
- Messaging
- Live attendance updates
- Timetable changes
"""
import asyncio
import json
import logging
from collections import defaultdict
from typing import Dict, List, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections per user and per room.
    Supports broadcasting to:
    - A specific user (by user_id)
    - A school (all users in school_id)
    - A room (any arbitrary room key, e.g. 'school:{id}:notifications')
    """

    def __init__(self):
        # user_id → list of active WebSocket connections
        self._user_connections: Dict[str, List[WebSocket]] = defaultdict(list)
        # room_key → set of user_ids in that room
        self._rooms: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        user_id: str,
        rooms: Optional[List[str]] = None,
    ) -> None:
        """Accept a new WebSocket connection and register it."""
        await websocket.accept()
        async with self._lock:
            self._user_connections[user_id].append(websocket)
            for room in rooms or []:
                self._rooms[room].add(user_id)
        logger.info(f"WebSocket connected: user={user_id} rooms={rooms}")

    async def disconnect(
        self,
        websocket: WebSocket,
        user_id: str,
        rooms: Optional[List[str]] = None,
    ) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            connections = self._user_connections.get(user_id, [])
            if websocket in connections:
                connections.remove(websocket)
            if not connections:
                self._user_connections.pop(user_id, None)
            for room in rooms or []:
                room_users = self._rooms.get(room, set())
                room_users.discard(user_id)
                if not room_users:
                    self._rooms.pop(room, None)
        logger.info(f"WebSocket disconnected: user={user_id}")

    async def send_to_user(self, user_id: str, data: dict) -> None:
        """Send a message to all connections of a specific user."""
        connections = self._user_connections.get(user_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        async with self._lock:
            for ws in dead:
                if ws in self._user_connections.get(user_id, []):
                    self._user_connections[user_id].remove(ws)

    async def broadcast_to_room(self, room: str, data: dict) -> None:
        """Broadcast a message to all users in a room."""
        user_ids = list(self._rooms.get(room, set()))
        await asyncio.gather(
            *[self.send_to_user(uid, data) for uid in user_ids],
            return_exceptions=True,
        )

    async def broadcast_to_school(self, school_id: str, data: dict) -> None:
        """Broadcast to all connected users in a school."""
        await self.broadcast_to_room(f"school:{school_id}", data)

    async def notify_user(
        self,
        user_id: str,
        title: str,
        body: str,
        type: str = "info",
        entity_id: Optional[str] = None,
        entity_type: Optional[str] = None,
    ) -> None:
        """Send a structured notification to a user."""
        await self.send_to_user(
            user_id,
            {
                "event": "notification",
                "data": {
                    "title": title,
                    "body": body,
                    "type": type,
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                },
            },
        )

    def get_online_users(self, school_id: str) -> Set[str]:
        """Return the set of user IDs currently online in a school."""
        return self._rooms.get(f"school:{school_id}", set())


# Singleton instance
ws_manager = ConnectionManager()
