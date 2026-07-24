import random
import string
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from Models.Block_Model import DocBlock
from Models.Collabration_Model import CollaborationSession
from Models.Docs_Model import Document
from Models.EditRequest_Model import EditRequest, RequestStatus
from Models.Participating_Model import SessionParticipant
from Models.ProposedChange_Model import ProposedChange, ProposedChangeStatus
from Models.User_Document import UserDocument
from Models.User_Model import User
from Utils.redis_client import redis_client

LINES_PER_BLOCK = 5
JOIN_CODE_LENGTH = 6
JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_join_code() -> str:
    return "".join(random.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def _assign_unique_join_code(db: Session, doc: Document) -> str:
    if doc.join_code:
        return doc.join_code

    for _ in range(30):
        code = _generate_join_code()
        exists = db.query(Document.id).filter(Document.join_code == code).first()
        if not exists:
            doc.join_code = code
            return code

    raise HTTPException(500, detail="Could not generate a unique join code")


def _resolve_doc(db: Session, doc_ref):
    doc_ref = str(doc_ref).strip()
    if not doc_ref:
        raise HTTPException(404, detail="Doc not found")

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


def _split_into_blocks(content: str) -> list[str]:
    lines = content.split("\n")
    blocks = []
    for i in range(0, max(len(lines), 1), LINES_PER_BLOCK):
        blocks.append("\n".join(lines[i:i + LINES_PER_BLOCK]))
    return blocks


def get_my_docs(user_id, db: Session):
    user_id_str = str(user_id)
    cache_key = f"user_docs:{user_id_str}"
    if redis_client.exists(cache_key):
        doc_ids = redis_client.smembers(cache_key)
        docs = []
        for doc_id in doc_ids:
            data = redis_client.hgetall(f"doc:{doc_id}")
            if data:
                data["id"] = doc_id
                docs.append(data)
        return docs

    # Fallback to DB
    docs = db.query(Document).filter(Document.created_by == user_id).all()
    for doc in docs:
        _assign_unique_join_code(db, doc)
        redis_client.sadd(cache_key, str(doc.id))
        redis_client.hset(f"doc:{str(doc.id)}", mapping={
            "title": doc.title or "",
            "join_code": doc.join_code or "",
            "created_by": user_id_str
        })
    if docs:
        db.commit()
    return [
        {
            "id": str(doc.id),
            "title": doc.title,
            "join_code": doc.join_code,
            "created_by": user_id_str
        }
        for doc in docs
    ]


def get_shared_docs(user_id, db: Session):
    rows = (
        db.query(Document)
        .join(UserDocument, UserDocument.doc_id == Document.id)
        .filter(
            UserDocument.user_id == user_id,
            UserDocument.is_deleted == False,
            Document.created_by != user_id
        )
        .all()
    )
    for doc in rows:
        _assign_unique_join_code(db, doc)
    if rows:
        db.commit()
    return [
        {
            "id": str(doc.id),
            "title": doc.title,
            "join_code": doc.join_code,
            "content": doc.content or "",
            "created_by": str(doc.created_by) if doc.created_by else None
        }
        for doc in rows
    ]


def create_doc(title: str, user_id, db: Session):
    user_id_str = str(user_id)
    doc = Document(title=title, content="", created_by=user_id)
    db.add(doc)
    db.flush()
    _assign_unique_join_code(db, doc)

    db.add(UserDocument(user_id=user_id, doc_id=doc.id, role="owner"))
    db.add(DocBlock(doc_id=doc.id, block_index=0, content=""))

    db.commit()
    db.refresh(doc)

    # Sync Redis
    cache_key = f"user_docs:{user_id_str}"
    redis_client.sadd(cache_key, str(doc.id))
    redis_client.hset(f"doc:{str(doc.id)}", mapping={
        "title": doc.title or "",
        "join_code": doc.join_code or "",
        "created_by": user_id_str
    })
    return doc


def get_doc(doc_id: str, current_user, db: Session):
    doc = _resolve_doc(db, doc_id)
    _assign_unique_join_code(db, doc)
    db.commit()

    user_id_str = str(current_user.id)
    doc_id_str = str(doc.id)

    is_editing = bool(redis_client.get(f"editing:{doc_id_str}:{user_id_str}"))
    is_session_active = bool(redis_client.get(f"session_active:{doc_id_str}"))

    cached_content = redis_client.get(f"doc_content:{doc_id_str}")

    return {
        "id": doc_id_str,
        "join_code": doc.join_code,
        "title": doc.title,
        "content": cached_content or doc.content or "",
        "created_by": str(doc.created_by),
        "same_user_already_editing": is_editing,
        "active_collab_session": is_session_active
    }


def update_doc_title(doc_id: str, new_title: str, user_id, db: Session):
    doc = _resolve_doc(db, doc_id)
    if str(doc.created_by) != str(user_id):
        raise HTTPException(403, detail="Only owner can update title")

    doc.title = new_title
    db.commit()
    db.refresh(doc)

    redis_client.hset(f"doc:{str(doc.id)}", "title", new_title)
    return doc


def save_doc_content(doc_id: str, content: str, user, db: Session):
    doc = _resolve_doc(db, doc_id)
    doc.content = content

    block_texts = _split_into_blocks(content)
    existing_blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == doc.id)
        .order_by(DocBlock.block_index)
        .all()
    )

    for i, text in enumerate(block_texts):
        if i < len(existing_blocks):
            existing_blocks[i].content = text
        else:
            db.add(DocBlock(doc_id=doc.id, block_index=i, content=text))

    for extra in existing_blocks[len(block_texts):]:
        db.delete(extra)

    db.commit()
    db.refresh(doc)

    # Sync Redis
    redis_client.set(f"doc_content:{str(doc.id)}", content, ex=86400)
    return doc


def delete_doc(doc_id: str, user_id, db: Session):
    doc = _resolve_doc(db, doc_id)
    doc_id_str = str(doc.id)
    user_id_str = str(user_id)

    if str(doc.created_by) != user_id_str:
        raise HTTPException(403, detail="Only owner can delete document")

    db.query(UserDocument).filter(UserDocument.doc_id == doc.id).update({UserDocument.is_deleted: True})
    db.commit()

    redis_client.srem(f"user_docs:{user_id_str}", doc_id_str)
    redis_client.delete(f"doc:{doc_id_str}")
    redis_client.delete(f"doc_content:{doc_id_str}")
    redis_client.delete(f"session_active:{doc_id_str}")
    return {"message": "Document deleted successfully"}


def join_doc(doc_id: str, user, db: Session):
    doc = _resolve_doc(db, doc_id)
    existing = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == doc.id
    ).first()

    if existing:
        if existing.is_deleted:
            existing.is_deleted = False
            db.commit()
        return existing

    user_doc = UserDocument(user_id=user.id, doc_id=doc.id, role="editor")
    db.add(user_doc)
    db.commit()
    db.refresh(user_doc)
    return user_doc


# PHASE 5 — EDIT REQUEST & PROPOSED CHANGES

def request_edit(doc_id: str, requester_id, db: Session):
    doc = _resolve_doc(db, doc_id)
    doc_id_str = str(doc.id)
    requester_id_str = str(requester_id)

    if redis_client.get(f"session_active:{doc_id_str}"):
        raise HTTPException(400, detail="Active collab session exists. Edit directly in session.")

    owner_id_str = str(doc.created_by)
    req = EditRequest(
        doc_id=doc.id,
        requester_id=requester_id,
        owner_id=doc.created_by,
        status=RequestStatus.pending
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Check if owner online
    owner_sessions = redis_client.zcard(f"user_sessions:{owner_id_str}")
    if owner_sessions > 0:
        print(f"[NOTIFICATION] Owner {owner_id_str} is online. Edit request {req.id} sent via WS/Notification.")
    else:
        print(f"[NOTIFICATION] Owner {owner_id_str} is offline. Email notification sent for edit request {req.id}.")

    return req


def approve_edit(request_id: str, approver_id, db: Session):
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(400, detail="Invalid request ID")

    req = db.query(EditRequest).filter(EditRequest.id == req_uuid).first()
    if not req:
        raise HTTPException(404, detail="Edit request not found")

    if str(req.owner_id) != str(approver_id):
        raise HTTPException(403, detail="Only owner can approve edit requests")

    req.status = RequestStatus.approved
    req.expires_at = datetime.utcnow()
    db.commit()

    redis_client.set(f"edit_permission:{str(req.doc_id)}:{str(req.requester_id)}", "true", ex=3600)
    return {"message": "Edit request approved", "request_id": str(req.id)}


def reject_edit(request_id: str, approver_id, db: Session):
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(400, detail="Invalid request ID")

    req = db.query(EditRequest).filter(EditRequest.id == req_uuid).first()
    if not req:
        raise HTTPException(404, detail="Edit request not found")

    if str(req.owner_id) != str(approver_id):
        raise HTTPException(403, detail="Only owner can reject edit requests")

    req.status = RequestStatus.rejected
    db.commit()
    return {"message": "Edit request rejected"}


def propose_change(doc_id: str, proposed_content: str, proposer_id, db: Session):
    doc = _resolve_doc(db, doc_id)
    doc_id_str = str(doc.id)
    proposer_id_str = str(proposer_id)

    permission = redis_client.get(f"edit_permission:{doc_id_str}:{proposer_id_str}")
    if not permission:
        raise HTTPException(403, detail="No edit permission granted by owner")

    prop = ProposedChange(
        doc_id=doc.id,
        proposed_by=proposer_id,
        original_content=doc.content,
        proposed_content=proposed_content,
        status=ProposedChangeStatus.pending
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)

    # Consume edit permission
    redis_client.delete(f"edit_permission:{doc_id_str}:{proposer_id_str}")

    print(f"[NOTIFICATION] Proposed change {prop.id} submitted for doc {doc_id_str}")
    return prop


def get_proposals(doc_id: str, owner_id, db: Session):
    doc = _resolve_doc(db, doc_id)
    if str(doc.created_by) != str(owner_id):
        raise HTTPException(403, detail="Only owner can view proposed changes")

    props = db.query(ProposedChange).filter(
        ProposedChange.doc_id == doc.id,
        ProposedChange.status == ProposedChangeStatus.pending
    ).all()
    return props


def merge_change(change_id: str, owner_id, db: Session):
    try:
        change_uuid = uuid.UUID(change_id)
    except ValueError:
        raise HTTPException(400, detail="Invalid change ID")

    prop = db.query(ProposedChange).filter(ProposedChange.id == change_uuid).first()
    if not prop:
        raise HTTPException(404, detail="Proposed change not found")

    doc = db.query(Document).filter(Document.id == prop.doc_id).first()
    if str(doc.created_by) != str(owner_id):
        raise HTTPException(403, detail="Only owner can merge changes")

    doc.content = prop.proposed_content
    prop.status = ProposedChangeStatus.merged
    prop.reviewed_at = datetime.utcnow()
    db.commit()

    redis_client.set(f"doc_content:{str(doc.id)}", prop.proposed_content, ex=86400)
    return {"message": "Change merged successfully", "doc_id": str(doc.id)}


def reject_change(change_id: str, owner_id, db: Session):
    try:
        change_uuid = uuid.UUID(change_id)
    except ValueError:
        raise HTTPException(400, detail="Invalid change ID")

    prop = db.query(ProposedChange).filter(ProposedChange.id == change_uuid).first()
    if not prop:
        raise HTTPException(404, detail="Proposed change not found")

    doc = db.query(Document).filter(Document.id == prop.doc_id).first()
    if str(doc.created_by) != str(owner_id):
        raise HTTPException(403, detail="Only owner can reject changes")

    prop.status = ProposedChangeStatus.rejected
    prop.reviewed_at = datetime.utcnow()
    db.commit()
    return {"message": "Change rejected"}
