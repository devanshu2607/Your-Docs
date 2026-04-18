from Models.Docs_Model import Document
from Models.Block_Model import DocBlock
from sqlalchemy.orm import Session
from fastapi import HTTPException
from Models.Collabration_Model import CollaborationSession
from Models.Participating_Model import SessionParticipant
from Models.User_Document import UserDocument
import uuid
from datetime import datetime

LINES_PER_BLOCK = 5  # each block stores max 5 lines


# ── helpers ──────────────────────────────────────────────────────────────────

def _split_into_blocks(content: str) -> list[str]:
    """
    Split plain-text content into chunks of LINES_PER_BLOCK lines.
    For Lexical JSON we treat the whole state as one logical unit per save,
    but we still shard it into 5-line logical blocks for DB storage.
    Returns list of block strings (may be empty strings for padding).
    """
    lines = content.split("\n")
    blocks = []
    for i in range(0, max(len(lines), 1), LINES_PER_BLOCK):
        chunk = "\n".join(lines[i: i + LINES_PER_BLOCK])
        blocks.append(chunk)
    return blocks


# ── CRUD ─────────────────────────────────────────────────────────────────────

def creating_docs(data, db: Session, user):
    user_id = user.id
    doc = Document(title=data.title, content="", created_by=user_id)
    db.add(doc)
    db.flush()  # get doc.id before referencing it

    # owner link
    user_doc = UserDocument(user_id=user.id, doc_id=doc.id, role="owner")
    db.add(user_doc)

    # create initial 1 empty block (more get added as user types)
    first_block = DocBlock(doc_id=doc.id, block_index=0, content="")
    db.add(first_block)

    db.commit()
    db.refresh(doc)
    return doc


def view_docs(docs_id, db: Session, user):
    docs_id = str(docs_id) 
    user_doc = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == docs_id,
        UserDocument.is_deleted == False
    ).first()

    if not user_doc:
        raise HTTPException(404, detail="No Access")

    doc = db.query(Document).filter(Document.id == docs_id).first()
    if not doc:
        raise HTTPException(404, detail="Doc not found")

    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == docs_id)
        .order_by(DocBlock.block_index)
        .all()
    )

    return {
        "id":     str(doc.id),
        "title":  doc.title,
        "role":   user_doc.role,          # ← frontend uses this for delete permission
        "blocks": [
            {"id": str(b.id), "index": b.block_index, "content": b.content}
            for b in blocks
        ],
    }


def docs(db: Session, user):

    user_id = user.id
    existing_doc = (
        db.query(Document)
        .join(UserDocument)
        .filter(UserDocument.user_id == user_id, UserDocument.is_deleted == False)
        .all()
    )
    return existing_doc or []


def update_Docs(docs_id, user, db: Session, data):
    """
    Save full document: syncs blocks from content split.
    Called on 'Save Changes' (not live WS path).
    """
    docs_id = str(docs_id)
    user_id = user.id
    user_doc = db.query(UserDocument).filter(
        UserDocument.user_id == user_id,
        UserDocument.doc_id == docs_id,
        UserDocument.is_deleted == False
    ).first()

    if not user_doc:
        raise HTTPException(403, detail="No access")

    existing_docs = db.query(Document).filter(Document.id == docs_id).first()
    if not existing_docs:
        raise HTTPException(404, detail="Docs not found")

    if data.title is not None:
        existing_docs.title = data.title

    if data.content is not None:
        existing_docs.content = data.content

        # Re-sync blocks
        block_texts = _split_into_blocks(data.content)

        # Fetch existing blocks
        existing_blocks = (
            db.query(DocBlock)
            .filter(DocBlock.doc_id == docs_id)
            .order_by(DocBlock.block_index)
            .all()
        )

        for i, text in enumerate(block_texts):
            if i < len(existing_blocks):
                existing_blocks[i].content = text
            else:
                db.add(DocBlock(doc_id=docs_id, block_index=i, content=text))

        # Remove extra blocks if content shrank
        for extra in existing_blocks[len(block_texts):]:
            db.delete(extra)

    db.commit()
    db.refresh(existing_docs)
    return existing_docs


def update_single_block(block_id, content, db: Session):
    """Called from WebSocket BLOCK_UPDATE — updates one block in DB."""

    block = db.query(DocBlock).filter(DocBlock.id == block_id).first()
    if block:
        block.content = content
        db.commit()
    return block


def get_doc_blocks(docs_id, db: Session):
    """Return the current ordered block snapshot for websocket initialization."""
    docs_id = str(docs_id)
    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == docs_id)
        .order_by(DocBlock.block_index)
        .all()
    )
    return [
        {"id": str(b.id), "index": b.block_index, "content": b.content}
        for b in blocks
    ]


def delete_docs(docs_id, user, db: Session):
    docs_id = str(docs_id)
    user_doc = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == docs_id
    ).first()

    if not user_doc:
        raise HTTPException(404, detail="Doc not found")

    # ✅ Only owner can delete
    if user_doc.role != "owner":
        raise HTTPException(403, detail="Only the owner can delete this document")

    user_doc.is_deleted = True
    db.commit()
    return {"message": "Doc deleted successfully"}


# ── Collaboration helpers ─────────────────────────────────────────────────────

def get_or_create_session(docs_id, user_id, db: Session):
    docs_id = str(docs_id)
    session = db.query(CollaborationSession).filter(
        CollaborationSession.doc_id == docs_id,
        CollaborationSession.ended_at == None
    ).first()

    if session:
        return session

    new_session = CollaborationSession(
        doc_id=docs_id,
        token=str(uuid.uuid4()),
        created_by=user_id
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


def add_participant(session_id, user_id, db: Session):
    participant = SessionParticipant(session_id=session_id, user_id=user_id)
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def user_disconnect(participant_id, db: Session):
    p = db.query(SessionParticipant).filter(SessionParticipant.id == participant_id).first()
    if p:
        p.disconnected_at = datetime.utcnow()
        db.commit()
    return p


def empty_session(session_id, db: Session):
    active = db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None
    ).count()

    if active == 0:
        s = db.query(CollaborationSession).filter(CollaborationSession.id == session_id).first()
        if s:
            s.ended_at = datetime.utcnow()
            db.commit()


def end_session(session_id, db: Session):
    s = db.query(CollaborationSession).filter(CollaborationSession.id == session_id).first()
    if not s:
        raise HTTPException(404, detail="Session not found")

    s.ended_at = datetime.utcnow()
    db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None
    ).update({SessionParticipant.disconnected_at: datetime.utcnow()})
    db.commit()
    return {"message": "Session Ended"}


def join_doc(docs_id, user, db: Session):
    docs_id = str(docs_id)
    exists = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == docs_id
    ).first()

    if not exists:
        db.add(UserDocument(user_id=user.id, doc_id=docs_id, role="editor"))
        db.commit()
