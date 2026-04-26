import json
import sys
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import SessionLocal
from service import (
    add_participant,
    empty_session,
    end_session,
    get_doc_blocks,
    get_or_create_session,
    join_doc,
    update_single_block,
    user_disconnect,
)
from Utils.dependency import verify_user_token

app = FastAPI(title="WebSocket Service")


class ConnectionManager:
    def __init__(self):
        self.room: dict = {}

    async def connect(self, doc_id, websocket: WebSocket):
        await websocket.accept()
        self.room.setdefault(doc_id, []).append(websocket)

    def disconnect(self, doc_id, websocket: WebSocket):
        conns = self.room.get(doc_id)
        if not conns:
            return
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.room.pop(doc_id, None)

    async def broadcast(self, doc_id, message: str, exclude: WebSocket = None):
        conns = self.room.get(doc_id, [])
        stale = []
        for conn in list(conns):
            if conn is exclude:
                continue
            try:
                await conn.send_text(message)
            except Exception:
                stale.append(conn)
        for conn in stale:
            if conn in conns:
                conns.remove(conn)
        if doc_id in self.room and not self.room[doc_id]:
            self.room.pop(doc_id, None)


manager = ConnectionManager()


@app.get("/health")
def health():
    return {"service": "websocket", "status": "ok"}


@app.websocket("/ws/{doc_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: UUID, token: str):
    db = SessionLocal()
    participant = None
    session = None

    try:
        user = verify_user_token(token, db)
        join_doc(doc_id, user, db)
        session = get_or_create_session(doc_id, user.id, db)
        participant = add_participant(session.id, user.id, db)
        await manager.connect(doc_id, websocket)
        await websocket.send_text(json.dumps({
            "type": "INIT_BLOCKS",
            "blocks": get_doc_blocks(doc_id, db),
        }))

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {}

            msg_type = msg.get("type")
            if msg_type == "END_SESSION":
                end_session(session.id, db)
                for conn in list(manager.room.get(doc_id, [])):
                    try:
                        await conn.close(code=1000, reason="Session ended by host")
                    except Exception:
                        pass
                manager.room[doc_id] = []
                break

            if msg_type == "BLOCK_UPDATE":
                block_id = msg.get("block_id")
                content = msg.get("content", "")
                update_single_block(block_id, content, db)
                await manager.broadcast(doc_id, json.dumps({
                    "type": "BLOCK_UPDATE",
                    "block_id": block_id,
                    "content": content,
                }), exclude=websocket)
                continue

            await manager.broadcast(doc_id, raw, exclude=websocket)

    except WebSocketDisconnect:
        if participant:
            user_disconnect(participant.id, db)
        if session:
            empty_session(session.id, db)
        manager.disconnect(doc_id, websocket)
    except Exception as exc:
        print("WS error:", exc)
    finally:
        db.close()
