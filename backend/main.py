from fastapi import FastAPI , HTTPException , Depends , WebSocket , WebSocketException , WebSocketDisconnect
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm 
from Database.DataBase import get_db , Base ,Engine , SessionLocal
import json
from Schemas.Docs_Schema import Create_Docs , Update_Docs
from Schemas.User_Schema import User_Login , User_SignUp
from Services.Docs import creating_docs , view_docs , docs , update_Docs , delete_docs ,end_session
from Services.User import create_user , login_user , logout
from uuid import UUID
from Utils.dependency import Jwt_Token_Checker , verify_user_token , authoscheme
from fastapi.middleware.cors import CORSMiddleware
from Services.Docs import (add_participant , user_disconnect , get_or_create_session , empty_session)
from Models.Docs_Model import Document
app = FastAPI()

Base.metadata.create_all(bind = Engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins = [
    "http://localhost:3000"
] ,
    allow_credentials = True ,
    allow_methods = ['*'],
    allow_headers = ['*'],
)

class container_manger:
    def __init__(self):
        self.room = {}

    async def connect(self , doc_id , websocket):
        await websocket.accept()

        if doc_id not in self.room:
            self.room[doc_id] = []
        
        self.room[doc_id].append(websocket)

    def disconnet(self , doc_id , websocket):
        if doc_id in self.room:
            self.room[doc_id].remove(websocket)

    async def BroadCast(self, doc_id, message):
         for connection in self.room.get(doc_id, []).copy():
            try:
                await connection.send_text(message)
            except Exception:
                 self.room[doc_id].remove(connection)

manager = container_manger()


@app.post('/create_docs')
def create(data : Create_Docs , db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return creating_docs(data , db , user)

@app.get('/get_doc/{docs_id}')
def view_single(docs_id : UUID , db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return view_docs(docs_id , db , user)

@app.post('/create_user')
def create(data : User_SignUp , db : Session = Depends(get_db)):
    return create_user(data , db)

@app.post('/login_user')
def login(form_data : OAuth2PasswordRequestForm = Depends() , db : Session = Depends(get_db)):
    return login_user(form_data , db)

@app.post('/logout')
def user_logout(token : str = Depends(authoscheme) , db : Session = Depends(get_db)):
    return logout(token , db)

@app.get('/user_docs')
def user_docs(db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return docs(db , user)

@app.put("/update_docs/{docs_id}")
def update_docs(docs_id : UUID , data : Update_Docs , user = Depends(Jwt_Token_Checker) , db: Session = Depends(get_db) ):
    return update_Docs(docs_id  , user , db , data)


@app.delete("/delete_docs/{docs_id}")
def delete(docs_id : UUID , user = Depends(Jwt_Token_Checker) , db:Session=Depends(get_db)):
    return delete_docs(docs_id , user , db)

@app.websocket('/ws/{doc_id}')
async def webscoket_endpoint(websocket : WebSocket , doc_id : UUID , token : str ):
    db = SessionLocal()
    participant = None
    session = None

    try:
        user = verify_user_token(token , db)
        user_id = user.id

        session = get_or_create_session(doc_id , user_id , db)

        participant = add_participant(session.id , user_id , db)

        await manager.connect(doc_id , websocket)

        while True:
            data = await websocket.receive_text()

            # Try to parse as JSON (control messages like END_SESSION)
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                msg = {}  # Not JSON = it's raw HTML content, treat as regular update

            if msg.get("type") == "END_SESSION":
                end_session(session.id, db)
                for conn in manager.room.get(doc_id, []).copy():
                    await conn.close(code=1000, reason="Session ended by host")
                manager.room[doc_id] = []
                break
            
            # Regular content update — broadcast and save to DB
            await manager.BroadCast(doc_id, data)

            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.content = data
                db.commit()

    except WebSocketDisconnect:
        user_disconnect(participant.id , db)
        empty_session(session.id , db)
        manager.disconnect(doc_id, websocket)

    finally:
        db.close()
