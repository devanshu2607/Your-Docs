import json
import sys
import time
import traceback
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from jose import jwt, JWTError

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import SessionLocal
from Models.Docs_Model import Document
from Models.User_Document import UserDocument
from Models.User_Model import User
from Models.Collabration_Model import CollaborationSession
from service import (
    add_participant,
    end_session,
    get_doc_blocks,
    get_or_create_session,
    join_doc,
    resolve_doc,
    update_single_block,
    user_disconnect,
)
from Utils.jwt import ALGORITHM, SECRET_KEY
from Utils.redis_client import redis_client

app = FastAPI(title="WebSocket Service")


class ConnectionManager:
    def __init__(self):
        self.room: dict = {}      # doc_id -> [websockets]
        self.ws_user: dict = {}   # websocket -> user_id

    async def connect(self, doc_id: str, websocket: WebSocket, user_id: str):
        self.room.setdefault(doc_id, []).append(websocket)
        self.ws_user[websocket] = user_id

    def disconnect(self, doc_id: str, websocket: WebSocket):
        conns = self.room.get(doc_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.room.pop(doc_id, None)
        self.ws_user.pop(websocket, None)

    def is_owner_in_room(self, doc_id: str, owner_user_id: str) -> bool:
        for ws in self.room.get(doc_id, []):
            if self.ws_user.get(ws) == str(owner_user_id):
                return True
        return False

    async def broadcast(self, doc_id: str, message: str, exclude: WebSocket = None):
        conns = list(self.room.get(doc_id, []))
        stale = []
        for conn in conns:
            if conn is exclude:
                continue
            try:
                await conn.send_text(message)
            except Exception:
                stale.append(conn)
        for conn in stale:
            self.disconnect(doc_id, conn)

    async def close_room(self, doc_id: str, code: int = 1000, reason: str = ""):
        conns = list(self.room.get(doc_id, []))
        for conn in conns:
            try:
                await conn.close(code=code, reason=reason)
            except Exception:
                pass
            self.ws_user.pop(conn, None)
        self.room.pop(doc_id, None)


manager = ConnectionManager()


@app.get("/health")
def health():
    return {"service": "websocket", "status": "ok"}


@app.websocket("/ws/{doc_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: str, token: str):
    db = SessionLocal()
    participant = None
    session = None
    doc = None
    room_key: Optional[str] = None
    user_id_str: Optional[str] = None

    try:
        await websocket.accept()

        # 1. JWT Decode & Redis Auth
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id_str = payload.get("user_id")
            session_id = payload.get("session_id")

            if not user_id_str or not session_id:
                await websocket.close(code=4401, reason="Invalid token payload")
                return

            score = redis_client.zscore(f"user_sessions:{user_id_str}", session_id)
            if score is None or float(score) < time.time():
                await websocket.close(code=4401, reason="Login session expired")
                return

            # Slide session
            new_expiry = time.time() + 1800
            redis_client.zadd(f"user_sessions:{user_id_str}", {session_id: new_expiry})
            redis_client.expire(f"session:{session_id}", 1800)

            user = db.query(User).filter(User.id == user_id_str).first()
            if not user:
                await websocket.close(code=4401, reason="User not found")
                return
        except JWTError:
            await websocket.close(code=4401, reason="Invalid token")
            return

        # 2. Resolve document
        try:
            doc = resolve_doc(doc_id, db)
            room_key = str(doc.id)
        except Exception as exc:
            await websocket.close(code=4404, reason="Document not found")
            return

        is_owner = (str(user.id) == str(doc.created_by))

        # 3. OWNER vs COLLABORATOR Connection Logic
        if is_owner:
            # Owner connects automatically -> get or create permanent collab session
            session = get_or_create_session(doc.id, user.id, db)
            participant = add_participant(session.id, user.id, session_id, db)
            await manager.connect(room_key, websocket, str(user.id))

            # Set editing awareness in Redis
            redis_client.set(f"editing:{room_key}:{str(user.id)}", "true", ex=300)
            redis_client.set(f"session_active:{room_key}", "true", ex=86400)
        else:
            # Collaborator must check session_active in Redis
            if not redis_client.get(f"session_active:{room_key}"):
                await websocket.close(code=4403, reason="No active session")
                return

            # Must have UserDocument access
            access = db.query(UserDocument).filter(
                UserDocument.user_id == user.id,
                UserDocument.doc_id == doc.id,
                UserDocument.is_deleted == False
            ).first()

            if not access:
                await websocket.close(code=4403, reason="No access to this document")
                return

            session = db.query(CollaborationSession).filter(
                CollaborationSession.doc_id == doc.id
            ).first()

            if not session:
                await websocket.close(code=4403, reason="No session record found")
                return

            participant = add_participant(session.id, user.id, session_id, db)
            await manager.connect(room_key, websocket, str(user.id))

        # 4. Send Initial Content
        cached_content = redis_client.get(f"doc_content:{room_key}")
        await websocket.send_text(json.dumps({
            "type": "INIT",
            "content": cached_content or doc.content or "",
            "blocks": get_doc_blocks(doc.id, db),
            "session_token": session.token,
            "is_owner": is_owner
        }))

        # 5. Message Loop
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "BLOCK_UPDATE":
                # Real-time broadcast (NO DB, NO Redis on each keystroke — instant nanosecond sync)
                block_id = msg.get("block_id")
                content = msg.get("content", "")
                await manager.broadcast(room_key, json.dumps({
                    "type": "BLOCK_UPDATE",
                    "block_id": block_id,
                    "content": content,
                    "user_id": str(user.id)
                }), exclude=websocket)

            elif msg_type == "CACHE_UPDATE":
                # Every 5 seconds — save latest draft to Redis (not DB)
                content = msg.get("content", "")
                redis_client.set(f"doc_content:{room_key}", content, ex=86400)
                # Extend editing awareness TTL
                if is_owner:
                    redis_client.expire(f"editing:{room_key}:{str(user.id)}", 300)

            elif msg_type == "END_SESSION":
                if not is_owner:
                    await websocket.send_text(json.dumps({
                        "type": "ERROR",
                        "message": "Only owner can end session"
                    }))
                    continue

                end_session(session.id, room_key, db)
                await manager.broadcast(room_key, json.dumps({
                    "type": "SESSION_ENDED",
                    "reason": "Owner ended the session"
                }))
                await manager.close_room(room_key, code=1000, reason="Session ended by host")
                break

            elif msg_type == "LEAVE":
                await websocket.close(1000, "User left")
                break

    except WebSocketDisconnect:
        if participant:
            user_disconnect(participant.id, db)
        if room_key:
            manager.disconnect(room_key, websocket)
            if user_id_str:
                redis_client.delete(f"editing:{room_key}:{user_id_str}")

            if doc and not manager.is_owner_in_room(room_key, str(doc.created_by)):
                if session:
                    end_session(session.id, room_key, db)
                await manager.broadcast(room_key, json.dumps({
                    "type": "SESSION_ENDED",
                    "reason": "Owner disconnected"
                }))
                await manager.close_room(room_key, code=1000, reason="Owner disconnected")
            elif user_id_str:
                await manager.broadcast(room_key, json.dumps({
                    "type": "USER_LEFT",
                    "user_id": user_id_str
                }), exclude=websocket)
    except Exception as exc:
        print("WS error:", exc)
        traceback.print_exc()
        try:
            await websocket.close(code=1011, reason="WebSocket error")
        except Exception:
            pass
    finally:
        if participant:
            try:
                user_disconnect(participant.id, db)
            except Exception:
                pass
        if room_key:
            manager.disconnect(room_key, websocket)
        db.close()
