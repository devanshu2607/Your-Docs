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

def docs(db : Session , user):
    user_id = user.id
    existing_doc = db.query(Document).filter(Document.user_id == user_id).all()

    if not existing_doc:
        return HTTPException(404 , detail="document not founded")
    
    return existing_doc

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
    
    db.delete(docs)
    db.commit()

    return {"message": "Doc deleted successfully"}