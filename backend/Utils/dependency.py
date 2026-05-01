from jose import jwt 
from Models.User_Model import User
from fastapi import HTTPException , Depends
from fastapi.security import OAuth2PasswordBearer
from Database.DataBase import get_db
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os 
from uuid import UUID


load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALOGORITHM = "HS256"

authoscheme = OAuth2PasswordBearer(tokenUrl='login_user')

def Jwt_Token_Checker(token : Session = Depends(authoscheme) , db : Session = Depends(get_db)):
    payload = jwt.decode(token , SECRET_KEY , algorithms=[ALOGORITHM])
    user_id = payload.get("user_id")
    try:
        user_uuid = UUID(str(user_id))
    except Exception:
        raise HTTPException(401, detail="user not matched ")

    user = db.query(User).filter(User.id == user_uuid).first()

    if not user :
        raise HTTPException(401 , detail="user not matched ")
    return user 

def verify_user_token(token: str, db: Session):
    # decode token
    payload = jwt.decode(token,SECRET_KEY , algorithms=[ALOGORITHM])   # jo bhi tera logic hai
    user_id = payload.get("user_id")
    try:
        user_uuid = UUID(str(user_id))
    except Exception:
        raise Exception("Invalid user")

    user = db.query(User).filter(User.id == user_uuid).first()

    if not user:
        raise Exception("Invalid user")

    return user
