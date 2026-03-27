from fastapi import HTTPException , Depends
from sqlalchemy.orm import Session
from Schemas.User_Schema import User_Login , User_SignUp
from Utils.dependency import Jwt_Token_Checker
from Utils.hashing import hash_password , verify_password
from Utils.jwt import create_jwt_handler
from Models.User_Model import User
from Models.User_Session import UserSession
from datetime import datetime , timedelta

def create_user(data, db : Session):
    existing_user = db.query(User).filter(User.email == data.email).first()

    if existing_user:
        raise HTTPException(401 , detail= "User already exist")
    
    hashed_password = hash_password(data.password)

    user = User(
        name = data.name,
        gender = data.gender,
        email = data.email,
        age = data.age,
        address = data.address,
        password = hashed_password
    ) 

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

def login_user(form_data , db : Session):
    user1 = db.query(User).filter(User.email == form_data.username).first()

    if not user1:
        raise HTTPException(404 , detail="user Not registered")
    
    if not verify_password(form_data.password , user1.password):
        raise HTTPException(402 , detail="password doest not match")
    
    active_sesseion = db.query(UserSession).filter(UserSession.user_id == user1.id , 
                                                   UserSession.expire > datetime.utcnow()).count()
    
    if active_sesseion >= 3 :
        raise HTTPException(401 , detail="User already login in more than three devices .")
    
    access_token = create_jwt_handler({"user_id":str(user1.id)})

    user_login = UserSession(
        user_id = user1.id,
        token = access_token, 
        expire = datetime.utcnow() + timedelta(minutes=30)
    )

    db.add(user_login)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }