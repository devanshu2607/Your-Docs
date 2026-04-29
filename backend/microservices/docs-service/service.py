import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from Models.Block_Model import DocBlock
from Models.Collabration_Model import CollaborationSession
from Models.Docs_Model import Document
from Models.Participating_Model import SessionParticipant
from Models.User_Document import UserDocument

LINES_PER_BLOCK = 5


def _split_into_blocks(content: str) -> list[str]:
    lines = content.split("\n")
    blocks = []
    for i in range(0, max(len(lines), 1), LINES_PER_BLOCK):
        blocks.append("\n".join(lines[i:i + LINES_PER_BLOCK]))
    return blocks


def _get_active_user_doc(db: Session, user_id, docs_id):
    docs_id = str(docs_id)
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

    db.add(UserDocument(user_id=user.id, doc_id=doc.id, role="owner"))
    db.add(DocBlock(doc_id=doc.id, block_index=0, content=""))

    db.commit()
    db.refresh(doc)
    return doc


def view_docs(docs_id, db: Session, user):
    user_doc = _get_active_user_doc(db, user.id, docs_id)
    if not user_doc:
        raise HTTPException(404, detail="No Access")

    doc = db.query(Document).filter(Document.id == str(docs_id)).first()
    if not doc:
        raise HTTPException(404, detail="Doc not found")

    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == str(docs_id))
        .order_by(DocBlock.block_index)
        .all()
    )

    return {
        "id": str(doc.id),
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
    return [
        {
            "id": str(doc.id),
            "title": doc.title,
            "content": doc.content or "",
            "created_by": str(doc.created_by) if doc.created_by else None,
        }
        for doc in rows
    ]


def update_docs(docs_id, user, db: Session, data):
    user_doc = _get_active_user_doc(db, user.id, docs_id)
    if not user_doc:
        raise HTTPException(403, detail="No access")

    existing_doc = db.query(Document).filter(Document.id == str(docs_id)).first()
    if not existing_doc:
        raise HTTPException(404, detail="Docs not found")

    if data.title is not None:
        existing_doc.title = data.title

    if data.content is not None:
        existing_doc.content = data.content
        block_texts = _split_into_blocks(data.content)
        existing_blocks = (
            db.query(DocBlock)
            .filter(DocBlock.doc_id == str(docs_id))
            .order_by(DocBlock.block_index)
            .all()
        )

        for i, text in enumerate(block_texts):
            if i < len(existing_blocks):
                existing_blocks[i].content = text
            else:
                db.add(DocBlock(doc_id=str(docs_id), block_index=i, content=text))

        for extra in existing_blocks[len(block_texts):]:
            db.delete(extra)

    db.commit()
    db.refresh(existing_doc)
    return existing_doc


def delete_docs(docs_id, user, db: Session):
    user_doc = _get_active_user_doc(db, user.id, docs_id)
    existing_doc = db.query(Document).filter(Document.id == str(docs_id)).first()
    if not existing_doc:
        raise HTTPException(404, detail="Doc not found")

    is_owner = str(existing_doc.created_by) == str(user.id) or (user_doc and user_doc.role == "owner")
    if not is_owner:
        raise HTTPException(403, detail="Only the owner can delete this document")

    db.query(UserDocument).filter(
        UserDocument.doc_id == str(docs_id),
        UserDocument.is_deleted == False,
    ).update({UserDocument.is_deleted: True}, synchronize_session=False)
    db.commit()
    return {"message": "Doc deleted successfully"}


def join_doc(docs_id, user, db: Session):
    existing_rows = db.query(UserDocument).filter(
        UserDocument.user_id == user.id,
        UserDocument.doc_id == str(docs_id),
    ).all()

    active_row = next((row for row in existing_rows if not row.is_deleted), None)
    if active_row:
        return active_row

    reusable_row = next((row for row in existing_rows if row.role != "owner"), None)
    if reusable_row:
        reusable_row.is_deleted = False
        reusable_row.role = reusable_row.role or "editor"
    else:
        reusable_row = UserDocument(user_id=user.id, doc_id=str(docs_id), role="editor")
        db.add(reusable_row)

    db.commit()
    db.refresh(reusable_row)
    return reusable_row
