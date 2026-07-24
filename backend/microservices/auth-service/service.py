import time
import uuid
from datetime import datetime
from fastapi import HTTPException
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from user_agents import parse

from Models.Docs_Model import Document
from Models.User_Model import User
from Utils.hashing import hash_password, verify_password
from Utils.jwt import ALGORITHM, SECRET_KEY, create_jwt_handler
from Utils.redis_client import redis_client

LOGIN_LUA_SCRIPT = """
local key   = KEYS[1]
local sid   = ARGV[1]
local score = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local now   = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, now)
local count = redis.call('ZCARD', key)
if count >= limit then
    return 0
end
redis.call('ZADD', key, score, sid)
return 1
"""


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


def login_user(form_data, db: Session, user_agent_str: str = "Unknown", ip_address: str = "127.0.0.1"):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(404, detail="user Not registered")
    if not verify_password(form_data.password, user.password):
        raise HTTPException(402, detail="password doest not match")

    user_id_str = str(user.id)

    # Account locked check
    if redis_client.exists(f"account_locked:{user_id_str}"):
        raise HTTPException(423, detail="Account locked. Reset your password.")

    # User Agent Parsing
    ua = parse(user_agent_str)
    browser = f"{ua.browser.family} {ua.browser.version_string}".strip()
    os_info = f"{ua.os.family} {ua.os.version_string}".strip()
    device = ua.device.family or "Desktop"

    now = time.time()
    session_id = str(uuid.uuid4())
    expire_ts = now + 1800
    user_sessions_key = f"user_sessions:{user_id_str}"

    # Atomic Lua Script Execution for Session Limit Check (Max 3)
    result = redis_client.eval(
        LOGIN_LUA_SCRIPT,
        1,
        user_sessions_key,
        session_id,
        expire_ts,
        3,
        now
    )

    if result == 0 or result == "0":
        raise HTTPException(401, detail="User already login in more than three devices.")

    # IP Trust Check
    active_sids = redis_client.zrangebyscore(user_sessions_key, now, "+inf")
    known_ips = set()
    for sid in active_sids:
        if sid != session_id:
            s_ip = redis_client.hget(f"session:{sid}", "ip")
            if s_ip:
                known_ips.add(s_ip)

    is_trusted = True
    if known_ips and ip_address not in known_ips:
        is_trusted = False
        print(f"[SECURITY ALERT] New IP {ip_address} login for {user.email}. Trust link /trust-session?session_id={session_id}, Revoke link /revoke-all?user_id={user_id_str}")

    # HSET session metadata
    redis_client.hset(f"session:{session_id}", mapping={
        "user_id": user_id_str,
        "email": user.email,
        "browser": browser,
        "os": os_info,
        "device": device,
        "ip": ip_address,
        "trusted": "true" if is_trusted else "false",
        "created_at": datetime.utcnow().isoformat()
    })
    redis_client.expire(f"session:{session_id}", 1800)

    # Refresh Token (One per session)
    refresh_token_value = str(uuid.uuid4())
    redis_client.set(f"refresh:{session_id}", refresh_token_value, ex=3456000)

    # Pre-warm Docs Cache in Redis
    cache_key = f"user_docs:{user_id_str}"
    if not redis_client.exists(cache_key):
        docs = db.query(Document).filter(Document.created_by == user.id).all()
        for doc in docs:
            redis_client.sadd(cache_key, str(doc.id))
            redis_client.hset(f"doc:{str(doc.id)}", mapping={
                "title": doc.title or "",
                "join_code": doc.join_code or "",
                "created_by": user_id_str
            })

    # Issue JWT
    access_token = create_jwt_handler({
        "user_id": user_id_str,
        "session_id": session_id
    })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_value,
        "token_type": "bearer"
    }


def logout(token: str, db: Session):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        session_id = payload.get("session_id")
    except JWTError:
        raise HTTPException(401, detail="Invalid token")

    if user_id and session_id:
        redis_client.zrem(f"user_sessions:{user_id}", session_id)
        redis_client.delete(f"session:{session_id}")
        redis_client.delete(f"refresh:{session_id}")

    return {"message": "logout successfully"}


def refresh_token_handler(session_id: str, refresh_token_value: str, db: Session):
    stored_value = redis_client.get(f"refresh:{session_id}")
    if not stored_value:
        raise HTTPException(401, detail="Refresh token expired")

    if stored_value != refresh_token_value:
        raise HTTPException(401, detail="Invalid refresh token")

    session_data = redis_client.hgetall(f"session:{session_id}")
    user_id = session_data.get("user_id")
    if not user_id:
        raise HTTPException(401, detail="Session expired")

    new_expiry = time.time() + 1800
    redis_client.zadd(f"user_sessions:{user_id}", {session_id: new_expiry})
    redis_client.expire(f"session:{session_id}", 1800)

    new_jwt = create_jwt_handler({"user_id": user_id, "session_id": session_id})
    return {"access_token": new_jwt, "token_type": "bearer"}


def revoke_all_sessions(user_id: str, db: Session):
    sids = redis_client.zrange(f"user_sessions:{user_id}", 0, -1)
    for sid in sids:
        redis_client.delete(f"session:{sid}")
        redis_client.delete(f"refresh:{sid}")

    redis_client.delete(f"user_sessions:{user_id}")
    redis_client.set(f"account_locked:{user_id}", "true", ex=3600)

    reset_token = str(uuid.uuid4())
    print(f"[SECURITY RESET] Password reset token for {user_id}: {reset_token}")
    return {"message": "All sessions revoked. Account locked for 1 hour. Check email for password reset.", "reset_token": reset_token}


def trust_session(session_id: str):
    if not redis_client.exists(f"session:{session_id}"):
        raise HTTPException(404, detail="Session not found")
    redis_client.hset(f"session:{session_id}", "trusted", "true")
    return {"message": "Session marked as trusted"}


def reset_password(reset_token: str, new_password: str, user_id: str, db: Session):
    try:
        user_uuid = UUID(user_id)
    except Exception:
        raise HTTPException(400, detail="Invalid user ID")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(404, detail="User not found")

    user.password = hash_password(new_password)
    db.commit()

    redis_client.delete(f"account_locked:{user_id}")
    return {"message": "Password reset successfully. You can now login."}


def get_active_sessions(user_id: str):
    now = time.time()
    sids = redis_client.zrangebyscore(f"user_sessions:{user_id}", now, "+inf")
    sessions = []
    for sid in sids:
        data = redis_client.hgetall(f"session:{sid}")
        data["session_id"] = sid
        sessions.append(data)
    return sessions
