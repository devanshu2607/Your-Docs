import os
import sys
import time
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import get_db
from Utils.dependency import Jwt_Token_Checker
from Utils.redis_client import redis_client
from Models.Collabration_Model import CollaborationSession
from service import (
    approve_edit,
    create_doc,
    delete_doc,
    get_doc,
    get_my_docs,
    get_proposals,
    get_shared_docs,
    join_doc,
    merge_change,
    propose_change,
    reject_change,
    reject_edit,
    request_edit,
    save_doc_content,
    update_doc_title,
)

app = FastAPI(title="Docs Service")

def get_allowed_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)
    return origins or ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateDocSchema(BaseModel):
    title: str


class UpdateTitleSchema(BaseModel):
    title: str


class SaveContentSchema(BaseModel):
    content: str


class UpdateDocSchema(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ProposeChangeSchema(BaseModel):
    proposed_content: str


@app.get("/health")
def health():
    return {"service": "docs", "status": "ok"}


@app.get("/docs/my")
@app.get("/user_docs")
@app.post("/user_docs")
def my_docs(db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return get_my_docs(str(user.id), db)


@app.get("/docs/shared")
def shared_docs(db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return get_shared_docs(user.id, db)


@app.post("/docs/create")
@app.post("/create_docs")
def create_new_doc(data: CreateDocSchema, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return create_doc(data.title, user.id, db)


@app.get("/docs/{id}")
@app.post("/get_doc/{id}")
def view_doc(id: str, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return get_doc(id, user, db)


@app.put("/docs/{id}/title")
def update_title(id: str, data: UpdateTitleSchema, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return update_doc_title(id, data.title, user.id, db)


@app.put("/update_docs/{id}")
def update_doc(id: str, data: UpdateDocSchema, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    doc = None
    if data.title is not None:
        doc = update_doc_title(id, data.title, user.id, db)
    if data.content is not None:
        doc = save_doc_content(id, data.content, user, db)
    if doc is None:
        raise HTTPException(400, detail="No update fields provided")
    return doc


@app.patch("/docs/{id}/save")
def save_content(id: str, data: SaveContentSchema, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return save_doc_content(id, data.content, user, db)


@app.post("/docs/{id}/start-editing")
def start_editing(id: str, user=Depends(Jwt_Token_Checker)):
    redis_client.set(f"editing:{id}:{str(user.id)}", "true", ex=300)
    return {"message": "Editing status set"}


@app.post("/docs/{id}/stop-editing")
def stop_editing(id: str, user=Depends(Jwt_Token_Checker)):
    redis_client.delete(f"editing:{id}:{str(user.id)}")
    return {"message": "Editing status cleared"}


@app.delete("/docs/{id}")
@app.delete("/delete_docs/{id}")
def delete_document(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return delete_doc(id, user.id, db)


@app.post("/docs/{id}/join")
@app.post("/join_docs/{id}")
def join_document(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return join_doc(id, user, db)


# Collab Session Start / End Routes
@app.post("/docs/{id}/start-session")
def start_collab_session(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    # Check if doc exists & user is owner
    from service import _resolve_doc
    doc = _resolve_doc(db, id)
    if str(doc.created_by) != str(user.id):
        raise HTTPException(403, detail="Only owner can start session")

    doc_id_str = str(doc.id)
    session = db.query(CollaborationSession).filter(CollaborationSession.doc_id == doc.id).first()
    if not session:
        import uuid
        session = CollaborationSession(
            doc_id=doc.id,
            created_by=user.id,
            token=str(uuid.uuid4()),
            is_active=True,
            last_started=time.strftime('%Y-%m-%d %H:%M:%S')
        )
        db.add(session)
    else:
        session.is_active = True
        session.last_started = time.strftime('%Y-%m-%d %H:%M:%S')

    db.commit()
    db.refresh(session)

    redis_client.set(f"session_active:{doc_id_str}", "true", ex=86400)
    return {"message": "Collab session started", "session_token": session.token}


@app.post("/docs/{id}/end-session")
def end_collab_session(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    from service import _resolve_doc
    doc = _resolve_doc(db, id)
    if str(doc.created_by) != str(user.id):
        raise HTTPException(403, detail="Only owner can end session")

    doc_id_str = str(doc.id)
    session = db.query(CollaborationSession).filter(CollaborationSession.doc_id == doc.id).first()
    if session:
        session.is_active = False
        db.commit()

    redis_client.delete(f"session_active:{doc_id_str}")
    return {"message": "Collab session ended"}


# Edit Request & Proposed Change Routes
@app.post("/docs/{id}/request-edit")
def edit_request_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return request_edit(id, user.id, db)


@app.patch("/edit-request/{id}/approve")
def approve_edit_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return approve_edit(id, user.id, db)


@app.patch("/edit-request/{id}/reject")
def reject_edit_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return reject_edit(id, user.id, db)


@app.post("/docs/{id}/propose-change")
def propose_change_route(id: str, data: ProposeChangeSchema, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return propose_change(id, data.proposed_content, user.id, db)


@app.get("/docs/{id}/proposals")
def get_proposals_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return get_proposals(id, user.id, db)


@app.patch("/proposed-change/{id}/merge")
def merge_change_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return merge_change(id, user.id, db)


@app.patch("/proposed-change/{id}/reject")
def reject_change_route(id: str, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return reject_change(id, user.id, db)
