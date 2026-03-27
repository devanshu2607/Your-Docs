from fastapi import FastAPI , HTTPException , Depends
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from Database.DataBase import get_db , Base ,Engine
from Schemas.Docs_Schema import Create_Docs
from Schemas.User_Schema import User_Login , User_SignUp
from Services.Docs import creating_docs , view_docs
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

@app.get('/view_docs')
def view_single(docs_id : UUID , db : Session = Depends(get_db) , user = Depends(Jwt_Token_Checker)):
    return view_docs(docs_id , db , user)

@app.post('/create_user')
def create(data : User_SignUp , db : Session = Depends(get_db)):
    return create_user(data , db)

@app.post('/login_user')
def login(form_data : OAuth2PasswordRequestForm = Depends() , db : Session = Depends(get_db)):
    return login_user(form_data , db)