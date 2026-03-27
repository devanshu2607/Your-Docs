from Models.Docs_Model import Document
from sqlalchemy.orm import Session
from fastapi import HTTPException , Depends

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
    user_id = user.id
    existing_doc = db.query(Document).filter(Document.id == docs_id,
                                             Document.user_id == user_id).first()

    if not existing_doc:
        return HTTPException(404 , detail="document not founded")
    
    return existing_doc