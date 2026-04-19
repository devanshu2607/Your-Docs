from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from Database.DataBase import get_db, Base, Engine, SessionLocal
import json
import os

from Schemas.Docs_Schema import Create_Docs, Update_Docs
from Schemas.User_Schema import User_SignUp
from Services.Docs import (
    creating_docs, view_docs, docs, update_Docs, delete_docs, end_session,
    add_participant, user_disconnect, get_or_create_session, empty_session,
    join_doc, update_single_block, get_doc_blocks
)
from Services.User import create_user, login_user, logout
from uuid import UUID
from Utils.dependency import Jwt_Token_Checker, verify_user_token, authoscheme
from fastapi.middleware.cors import CORSMiddleware

import pickle
import numpy as np
from dotenv import load_dotenv

load_dotenv()

try:
    import tensorflow as tf
except Exception:
    tf = None


def get_allowed_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)

    if not origins:
        origins = ["http://localhost:3000"]

    return origins

model = None
tokenizer = None
if tf is not None:
    try:
        model = tf.keras.models.load_model("lstm_model.h5")
        with open("lstm_tokenizer.pkl", "rb") as f:
            tokenizer = pickle.load(f)
    except Exception as exc:
        print("Prediction model unavailable:", exc)
max_len = 20

app = FastAPI()
Base.metadata.create_all(bind=Engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket connection manager ──────────────────────────────────────────────

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


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.post("/create_docs")
def create(data: Create_Docs, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return creating_docs(data, db, user)


@app.get("/get_doc/{docs_id}")
def view_single(docs_id: UUID, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return view_docs(docs_id, db, user)


@app.post("/create_user")
def create_user_route(data: User_SignUp, db: Session = Depends(get_db)):
    return create_user(data, db)


@app.post("/login_user")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return login_user(form_data, db)


@app.post("/logout")
def user_logout(token: str = Depends(authoscheme), db: Session = Depends(get_db)):
    return logout(token, db)


@app.get("/user_docs")
def user_docs(db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return docs(db, user)


@app.put("/update_docs/{docs_id}")
def update_docs(docs_id: UUID, data: Update_Docs,
                user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return update_Docs(docs_id, user, db, data)


@app.delete("/delete_docs/{docs_id}")
def delete(docs_id: UUID, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return delete_docs(docs_id, user, db)


@app.post("/join_docs/{doc_id}")
def join_document(doc_id: UUID, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return join_doc(doc_id, user, db)


@app.get("/predict")
def predict(text: str):
    if model is None or tokenizer is None or tf is None:
        return {"word": ""}

    seq = tokenizer.texts_to_sequences([text])[0]
    seq = tf.keras.preprocessing.sequence.pad_sequences([seq], maxlen=max_len - 1, padding="pre")
    pred = model.predict(seq, verbose=0)
    index = int(np.argmax(pred))

    # Prefer direct reverse lookup; if the model's output index is off by one
    # relative to tokenizer indices, fall back to index + 1.
    word = tokenizer.index_word.get(index) or tokenizer.index_word.get(index + 1, "")
    if word:
        return {"word": word}

    # Final fallback: scan top predictions for the first mapped token.
    for candidate in np.argsort(pred[0])[::-1]:
        candidate = int(candidate)
        word = tokenizer.index_word.get(candidate) or tokenizer.index_word.get(candidate + 1, "")
        if word:
            return {"word": word}

    return {"word": ""}


# ── WebSocket ─────────────────────────────────────────────────────────────────

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

            # ── End session (host only action) ──
            if msg_type == "END_SESSION":
                end_session(session.id, db)
                for conn in list(manager.room.get(doc_id, [])):
                    try:
                        await conn.close(code=1000, reason="Session ended by host")
                    except Exception:
                        pass
                manager.room[doc_id] = []
                break

            # ── Block-level live update ──
            elif msg_type == "BLOCK_UPDATE":
                block_id  = msg.get("block_id")
                content   = msg.get("content", "")

                # Save to DB
                update_single_block(block_id, content, db)

                # Broadcast to every other client in the room
                await manager.broadcast(doc_id, json.dumps({
                    "type":     "BLOCK_UPDATE",
                    "block_id": block_id,
                    "content":  content,
                }), exclude=websocket)

            # ── Legacy plain-HTML fallback (backward compat) ──
            else:
                await manager.broadcast(doc_id, raw, exclude=websocket)

    except WebSocketDisconnect:
        if participant:
            user_disconnect(participant.id, db)
        if session:
            empty_session(session.id, db)
        manager.disconnect(doc_id, websocket)
    except Exception as e:
        print("WS error:", e)
    finally:
        db.close()
