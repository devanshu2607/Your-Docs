import sys
from pathlib import Path
from pydantic import BaseModel

from fastapi import Depends, FastAPI, Request, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import get_db
from Schemas.User_Schema import User_SignUp
from Utils.dependency import Jwt_Token_Checker, authoscheme
from service import (
    create_user,
    get_active_sessions,
    login_user,
    logout,
    refresh_token_handler,
    reset_password,
    revoke_all_sessions,
    trust_session,
)

app = FastAPI(title="Auth Service")


class RefreshTokenRequest(BaseModel):
    session_id: str
    refresh_token: str


class ResetPasswordRequest(BaseModel):
    user_id: str
    reset_token: str
    new_password: str


@app.get("/health")
def health():
    return {"service": "auth", "status": "ok"}


@app.post("/create_user")
def create_user_route(data: User_SignUp, db: Session = Depends(get_db)):
    return create_user(data, db)


@app.post("/login_user")
@app.post("/login")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user_agent = request.headers.get("user-agent", "Unknown")
    client_ip = request.client.host if request.client else "127.0.0.1"
    return login_user(form_data, db, user_agent_str=user_agent, ip_address=client_ip)


@app.post("/logout")
def user_logout(token: str = Depends(authoscheme), db: Session = Depends(get_db)):
    return logout(token, db)


@app.post("/refresh")
def refresh(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    return refresh_token_handler(data.session_id, data.refresh_token, db)


@app.get("/trust-session")
def trust(session_id: str = Query(...)):
    return trust_session(session_id)


@app.get("/revoke-all")
def revoke_all(user_id: str = Query(...), db: Session = Depends(get_db)):
    return revoke_all_sessions(user_id, db)


@app.post("/reset-password")
def reset_pwd(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    return reset_password(data.reset_token, data.new_password, data.user_id, db)


@app.get("/sessions")
def sessions(user=Depends(Jwt_Token_Checker)):
    return get_active_sessions(str(user.id))


@app.get("/verify_user")
def verify_user(user=Depends(Jwt_Token_Checker)):
    return {"id": str(user.id), "email": user.email, "name": user.name}
