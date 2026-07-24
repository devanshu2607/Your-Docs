import os
import time
from uuid import UUID
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from Database.DataBase import get_db
from Models.User_Model import User
from Utils.jwt import ALGORITHM, SECRET_KEY, create_jwt_handler
from Utils.redis_client import redis_client

load_dotenv()

authoscheme = OAuth2PasswordBearer(tokenUrl='login_user')


def Jwt_Token_Checker(request: Request, token: str = Depends(authoscheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, detail="Session expired. Please log in again.")

    user_id = payload.get("user_id")
    session_id = payload.get("session_id")

    if not user_id or not session_id:
        raise HTTPException(401, detail="Invalid token payload")

    # 1. Account locked check
    if redis_client.exists(f"account_locked:{user_id}"):
        raise HTTPException(423, detail="Account locked. Reset your password.")

    # 2. Session valid check
    score = redis_client.zscore(f"user_sessions:{user_id}", session_id)
    if score is None or float(score) < time.time():
        raise HTTPException(401, detail="Session expired. Please login again.")

    # 3. Slide session (extend expiry)
    new_expiry = time.time() + 1800
    redis_client.zadd(f"user_sessions:{user_id}", {session_id: new_expiry})
    redis_client.expire(f"session:{session_id}", 1800)

    # 4. Issue refreshed JWT in header
    new_token = create_jwt_handler({"user_id": str(user_id), "session_id": str(session_id)})
    request.state.new_token = new_token

    try:
        user_uuid = UUID(str(user_id))
    except Exception:
        raise HTTPException(401, detail="User not matched")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(401, detail="User not matched")
    return user


def verify_user_token(token: str, db: Session):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise Exception("Invalid or expired token")

    user_id = payload.get("user_id")
    session_id = payload.get("session_id")

    if not user_id or not session_id:
        raise Exception("Invalid token payload")

    if redis_client.exists(f"account_locked:{user_id}"):
        raise Exception("Account locked")

    score = redis_client.zscore(f"user_sessions:{user_id}", session_id)
    if score is None or float(score) < time.time():
        raise Exception("Session expired")

    new_expiry = time.time() + 1800
    redis_client.zadd(f"user_sessions:{user_id}", {session_id: new_expiry})
    redis_client.expire(f"session:{session_id}", 1800)

    try:
        user_uuid = UUID(str(user_id))
    except Exception:
        raise Exception("Invalid user ID")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise Exception("User not found")

    return user
