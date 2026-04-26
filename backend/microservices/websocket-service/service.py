import uuid
from datetime import datetime

from Models.Block_Model import DocBlock
from Models.Collabration_Model import CollaborationSession
from Models.Participating_Model import SessionParticipant
from Models.User_Document import UserDocument


def get_doc_blocks(docs_id, db):
    blocks = (
        db.query(DocBlock)
        .filter(DocBlock.doc_id == str(docs_id))
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


def get_or_create_session(docs_id, user_id, db):
    session = db.query(CollaborationSession).filter(
        CollaborationSession.doc_id == str(docs_id),
        CollaborationSession.ended_at == None,
    ).first()
    if session:
        return session

    session = CollaborationSession(
        doc_id=str(docs_id),
        token=str(uuid.uuid4()),
        created_by=user_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def add_participant(session_id, user_id, db):
    participant = SessionParticipant(session_id=session_id, user_id=user_id)
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


def empty_session(session_id, db):
    active = db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None,
    ).count()
    if active == 0:
        session = db.query(CollaborationSession).filter(CollaborationSession.id == session_id).first()
        if session:
            session.ended_at = datetime.utcnow()
            db.commit()


def end_session(session_id, db):
    session = db.query(CollaborationSession).filter(CollaborationSession.id == session_id).first()
    if not session:
        return {"message": "Session not found"}

    session.ended_at = datetime.utcnow()
    db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None,
    ).update({SessionParticipant.disconnected_at: datetime.utcnow()})
    db.commit()
    return {"message": "Session Ended"}


def join_doc(docs_id, user, db):
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
