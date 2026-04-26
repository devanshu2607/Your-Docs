import sys
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import get_db
from Schemas.User_Schema import User_SignUp
from Utils.dependency import Jwt_Token_Checker, authoscheme
from service import create_user, login_user, logout

app = FastAPI(title="Auth Service")


@app.get("/health")
def health():
    return {"service": "auth", "status": "ok"}


@app.post("/create_user")
def create_user_route(data: User_SignUp, db: Session = Depends(get_db)):
    return create_user(data, db)


@app.post("/login_user")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return login_user(form_data, db)


@app.post("/logout")
def user_logout(token: str = Depends(authoscheme), db: Session = Depends(get_db)):
    return logout(token, db)


@app.get("/verify_user")
def verify_user(user=Depends(Jwt_Token_Checker)):
    return {"id": str(user.id), "email": user.email, "name": user.name}
