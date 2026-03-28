from fastapi import FastAPI , HTTPException , Depends
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from Database.DataBase import get_db , Base ,Engine
from Schemas.Docs_Schema import Create_Docs , Update_Docs
from Schemas.User_Schema import User_Login , User_SignUp
from Services.Docs import creating_docs , view_docs , docs , update_Docs , delete_docs
from Services.User import create_user , login_user
from uuid import UUID
from Utils.dependency import Jwt_Token_Checker
from fastapi.middleware.cors import CORSMiddleware


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

@app.post('/create_docs')
def create(data : Create_Docs , db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return creating_docs(data , db , user)

@app.get('/docs/{docs_id}')
def view_single(docs_id : UUID , db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return view_docs(docs_id , db , user)

@app.post('/create_user')
def create(data : User_SignUp , db : Session = Depends(get_db)):
    return create_user(data , db)

@app.post('/login_user')
def login(form_data : OAuth2PasswordRequestForm = Depends() , db : Session = Depends(get_db)):
    return login_user(form_data , db)

@app.get('/user_docs')
def user_docs(db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return docs(db , user)

@app.put("/update_docs/{docs_id}")
def update_docs(docs_id : UUID , data : Update_Docs , user = Depends(Jwt_Token_Checker) , db: Session = Depends(get_db) ):
    return update_Docs(docs_id  , user , db , data)

@app.delete("/delete_docs/{docs_id}")
def delete(docs_id : UUID , user = Depends(Jwt_Token_Checker) , db:Session=Depends(get_db)):
    return delete_docs(docs_id , user , db)