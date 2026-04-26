from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from Models.User_Model import User
from Models.User_Session import UserSession
from Utils.hashing import hash_password, verify_password
from Utils.jwt import create_jwt_handler


def create_user(data, db: Session):
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(401, detail="User already exist")

    user = User(
        name=data.name,
        gender=data.gender,
        email=data.email,
        age=data.age,
        address=data.address,
        password=hash_password(data.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(form_data, db: Session):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(404, detail="user Not registered")
    if not verify_password(form_data.password, user.password):
        raise HTTPException(402, detail="password doest not match")

    active_session = db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.expire > datetime.utcnow(),
    ).count()
    if active_session >= 3:
        raise HTTPException(401, detail="User already login in more than three devices .")

    access_token = create_jwt_handler({"user_id": str(user.id)})
    db.add(UserSession(
        user_id=user.id,
        token=access_token,
        expire=datetime.utcnow() + timedelta(minutes=30),
    ))
    db.commit()

    return {"access_token": access_token, "token_type": "bearer"}


def logout(token, db: Session):
    db.query(UserSession).filter(UserSession.token == token).delete()
    db.commit()
    return {"message": "logout successfully "}
