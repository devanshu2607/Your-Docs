from Models.Docs_Model import Document
from sqlalchemy.orm import Session
from fastapi import HTTPException , Depends
from Models.Collabration_Model import CollaborationSession
from Models.Participating_Model import SessionParticipant
import uuid
from datetime  import datetime
def creating_docs(data , db: Session , user):

    user_id = user.id
    doc = Document(
        title = data.title,
        content = data.content,
        user_id = user_id
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc

def view_docs(docs_id , db : Session , user):

    existing_doc = db.query(Document).filter(Document.id == docs_id,).first()

    if not existing_doc:
        return HTTPException(404 , detail="document not founded")
    
    return existing_doc

def docs(db : Session , user):
    user_id = user.id
    existing_doc = db.query(Document).filter(Document.user_id == user_id).all()

    if not existing_doc:
        return HTTPException(404 , detail="document not founded")
    
    return existing_doc or []



def update_Docs(docs_id , user , db : Session , data):
    user_id = user.id
    existing_docs = db.query(Document).filter(Document.id == docs_id,
                                              Document.user_id == user_id).first()

    if not existing_docs:
        raise HTTPException(401 ,detail= "docs not found")
    
    if data.title is not None:
        existing_docs.title = data.title

    if data.content is not None :
        existing_docs.content = data.content

    db.commit()
    db.refresh(existing_docs)

    return existing_docs


def delete_docs(docs_id , user , db:Session):
    user_id = user.id
    docs = db.query(Document).filter(Document.id == docs_id,
                                     Document.user_id == user_id).first()
    if not docs:
        raise HTTPException(404 , detail="no docs found")
    
    sessions = db.query(CollaborationSession).filter(
        CollaborationSession.doc_id == docs_id
    ).all()

    for session in sessions:
        # ✅ Pehle participants delete karo
        db.query(SessionParticipant).filter(
            SessionParticipant.session_id == session.id
        ).delete()

    # ✅ Phir sessions delete karo
    db.query(CollaborationSession).filter(
        CollaborationSession.doc_id == docs_id
    ).delete()
    
    db.delete(docs)
    db.commit()

    return {"message": "Doc deleted successfully"}

def get_or_create_session(docs_id , user_id , db : Session):
   
    session = db.query(CollaborationSession).filter(CollaborationSession.doc_id == docs_id,
                                                    CollaborationSession.ended_at == None).first()
    
    if session:
        return session
    
    new_session = CollaborationSession(
        doc_id = docs_id,
        token = str(uuid.uuid4()),
        created_by = user_id
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return new_session
    
def add_participant(session_id , user_id , db :Session):
    participant = SessionParticipant(
        session_id = session_id,
        user_id = user_id
    )

    db.add(participant)
    db.commit()
    db.refresh(participant)

    return participant

def user_disconnect(participant_id , db:Session ):
    check_participant = db.query(SessionParticipant).filter(
        SessionParticipant.id == participant_id).first()
    
    if check_participant:
        check_participant.disconnected_at = datetime.utcnow()
        db.commit()
    
    return check_participant

def empty_session(session_id , db : Session):
    active_user = db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,

        SessionParticipant.disconnected_at == None
    ).count()

    if active_user == 0:
        check_session = db.query(CollaborationSession).filter(
            CollaborationSession.id == session_id
        ).first()

        if check_session:
            check_session.ended_at = datetime.utcnow()
            db.commit()

def end_session(session_id , db : Session):
    existed_session = db.query(CollaborationSession).filter(CollaborationSession.id == session_id).first()

    if not existed_session:
        raise HTTPException(404 , detail = "Session not founded")
    
    existed_session.ended_at  = datetime.utcnow()

    db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.disconnected_at == None
    ).update({
        SessionParticipant.disconnected_at : datetime.utcnow()
    })

    db.commit()

    return {"message" : "Session Ended "}
