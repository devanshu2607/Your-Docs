import time
import uuid
from datetime import datetime

from fastapi import HTTPException

from Models.Block_Model import DocBlock
from Models.Collabration_Model import CollaborationSession
from Models.Docs_Model import Document
from Models.Participating_Model import SessionParticipant
from Models.User_Document import UserDocument
from Models.User_Model import User
from Utils.redis_client import redis_client


def resolve_doc(doc_ref, db):
    doc_ref = str(doc_ref).strip()
    doc = db.query(Document).filter(Document.join_code == doc_ref.upper()).first()
    if doc:
        return doc

    try:
        doc_uuid = uuid.UUID(doc_ref)
    except ValueError:
        raise HTTPException(404, detail="Doc not found")

    doc = db.query(Document).filter(Document.id == doc_uuid).first()
    if not doc:
        raise HTTPException(404, detail="Doc not found")
    return doc


def get_doc_blocks(docs_id, db):
    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == docs_id)
        .order_by(DocBlock.block_index)
        .all()
    )
    return [
        {"id": str(block.id), "index": block.block_index, "content": block.content}
        for block in blocks
    ]


def update_single_block(block_id, content, db):
    block = db.query(DocBlock).filter(DocBlock.id == block_id).first()
    if block:
        block.content = content
        db.commit()
    return block


def get_or_create_session(doc_id, user_id, db):
    # One session per doc FOREVER — find or create
    session = db.query(CollaborationSession).filter(
        CollaborationSession.doc_id == doc_id
    ).first()

    if session:
        if not session.is_active:
            session.is_active = True
            session.last_started = datetime.utcnow()
            db.commit()
        return session

    # First time ever — use Redis lock for race condition protection
    lock_key = f"collab_lock:{doc_id}"
    lock = redis_client.set(lock_key, "locked", nx=True, ex=5)

    if not lock:
        time.sleep(0.1)
        session = db.query(CollaborationSession).filter(
            CollaborationSession.doc_id == doc_id
        ).first()
        if session:
            session.is_active = True
            db.commit()
            return session

    try:
        session = db.query(CollaborationSession).filter(
            CollaborationSession.doc_id == doc_id
        ).first()
        if session:
            session.is_active = True
            db.commit()
            return session

        session = CollaborationSession(
            doc_id=doc_id,
            created_by=user_id,   # user_id NOT session_id
            is_active=True,
            last_started=datetime.utcnow(),
            token=str(uuid.uuid4())
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
    finally:
        redis_client.delete(lock_key)


def add_participant(session_id, user_id, login_session_id, db):
    participant = SessionParticipant(
        session_id=session_id,
        user_id=user_id,
        login_session_id=str(login_session_id)
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def user_disconnect(participant_id, db):
    participant = db.query(SessionParticipant).filter(SessionParticipant.id == participant_id).first()
    if participant:
        participant.disconnected_at = datetime.utcnow()
        db.commit()
    return participant


def end_session(session_id, doc_id, db):
    session = db.query(CollaborationSession).filter(
        CollaborationSession.id == session_id
    ).first()
    if session:
        session.is_active = False
        session.last_ended = datetime.utcnow()

    # Mark all participants disconnected
    db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None
    ).update({SessionParticipant.disconnected_at: datetime.utcnow()})

    db.commit()

    # Redis cleanup
    redis_client.delete(f"session_active:{doc_id}")
    return {"message": "Session Ended"}


def join_doc(docs_id, user, db):
    existing_rows = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == docs_id,
    ).all()

    active_row = next((row for row in existing_rows if not row.is_deleted), None)
    if active_row:
        return active_row

    reusable_row = next((row for row in existing_rows if row.role != "owner"), None)
    if reusable_row:
        reusable_row.is_deleted = False
        reusable_row.role = reusable_row.role or "editor"
    else:
        reusable_row = UserDocument(user_id=user.id, doc_id=docs_id, role="editor")
        db.add(reusable_row)

    db.commit()
    db.refresh(reusable_row)
    return reusable_row
