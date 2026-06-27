import random
import string
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from Models.Block_Model import DocBlock
from Models.Collabration_Model import CollaborationSession
from Models.Docs_Model import Document
from Models.Participating_Model import SessionParticipant
from Models.User_Document import UserDocument

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


def _get_active_user_doc(db: Session, user_id, docs_id):
    rows = (
        db.query(UserDocument)
        .filter(
            UserDocument.user_id == user_id,
            UserDocument.doc_id == docs_id,
            UserDocument.is_deleted == False,
        )
        .all()
    )
    for row in rows:
        if row.role == "owner":
            return row
    return rows[0] if rows else None


def creating_docs(data, db: Session, user):
    doc = Document(title=data.title, content="", created_by=user.id)
    db.add(doc)
    db.flush()
    _assign_unique_join_code(db, doc)

    db.add(UserDocument(user_id=user.id, doc_id=doc.id, role="owner"))
    db.add(DocBlock(doc_id=doc.id, block_index=0, content=""))

    db.commit()
    db.refresh(doc)
    return doc


def view_docs(docs_id, db: Session, user):
    doc = _resolve_doc(db, docs_id)
    _assign_unique_join_code(db, doc)

    user_doc = _get_active_user_doc(db, user.id, doc.id)
    if not user_doc:
        raise HTTPException(404, detail="No Access")

    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == doc.id)
        .order_by(DocBlock.block_index)
        .all()
    )
    db.commit()

    return {
        "id": str(doc.id),
        "join_code": doc.join_code,
        "title": doc.title,
        "role": user_doc.role,
        "blocks": [
            {"id": str(block.id), "index": block.block_index, "content": block.content}
            for block in blocks
        ],
    }


def docs(db: Session, user):
    rows = (
        db.query(Document)
        .join(UserDocument)
        .filter(UserDocument.user_id == user.id, UserDocument.is_deleted == False)
        .all()
    ) or []
    for doc in rows:
        _assign_unique_join_code(db, doc)
    if rows:
        db.commit()
    return [
        {
            "id": str(doc.id),
            "join_code": doc.join_code,
            "title": doc.title,
            "content": doc.content or "",
            "created_by": str(doc.created_by) if doc.created_by else None,
        }
        for doc in rows
    ]


def update_docs(docs_id, user, db: Session, data):
    existing_doc = _resolve_doc(db, docs_id)
    user_doc = _get_active_user_doc(db, user.id, existing_doc.id)
    if not user_doc:
        raise HTTPException(403, detail="No access")

    if data.title is not None:
        existing_doc.title = data.title

    if data.content is not None:
        existing_doc.content = data.content
        block_texts = _split_into_blocks(data.content)
        existing_blocks = (
            db.query(DocBlock)
            .filter(DocBlock.doc_id == existing_doc.id)
            .order_by(DocBlock.block_index)
            .all()
        )

        for i, text in enumerate(block_texts):
            if i < len(existing_blocks):
                existing_blocks[i].content = text
            else:
                db.add(DocBlock(doc_id=existing_doc.id, block_index=i, content=text))

        for extra in existing_blocks[len(block_texts):]:
            db.delete(extra)

    db.commit()
    db.refresh(existing_doc)
    return existing_doc


def delete_docs(docs_id, user, db: Session):
    existing_doc = _resolve_doc(db, docs_id)
    user_doc = _get_active_user_doc(db, user.id, existing_doc.id)

    is_owner = str(existing_doc.created_by) == str(user.id) or (user_doc and user_doc.role == "owner")
    if not is_owner:
        raise HTTPException(403, detail="Only the owner can delete this document")

    db.query(UserDocument).filter(
        UserDocument.doc_id == existing_doc.id,
        UserDocument.is_deleted == False,
    ).update({UserDocument.is_deleted: True}, synchronize_session=False)
    db.commit()
    return {"message": "Doc deleted successfully"}


def join_doc(docs_id, user, db: Session):
    doc = _resolve_doc(db, docs_id)
    _assign_unique_join_code(db, doc)

    existing_rows = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == doc.id,
    ).all()

    active_row = next((row for row in existing_rows if not row.is_deleted), None)
    if active_row:
        return active_row

    reusable_row = next((row for row in existing_rows if row.role != "owner"), None)
    if reusable_row:
        reusable_row.is_deleted = False
        reusable_row.role = reusable_row.role or "editor"
    else:
        reusable_row = UserDocument(user_id=user.id, doc_id=doc.id, role="editor")
        db.add(reusable_row)

    db.commit()
    db.refresh(reusable_row)
    return {
        "id": str(reusable_row.id),
        "doc_id": str(doc.id),
        "join_code": doc.join_code,
        "role": reusable_row.role,
    }
