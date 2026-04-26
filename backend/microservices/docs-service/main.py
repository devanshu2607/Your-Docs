import os
import sys
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import get_db
from Schemas.Docs_Schema import Create_Docs, Update_Docs
from Utils.dependency import Jwt_Token_Checker
from service import creating_docs, delete_docs, docs, join_doc, update_docs as update_docs_record, view_docs


def get_allowed_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)
    return origins or ["http://localhost:3000"]


app = FastAPI(title="Docs Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"service": "docs", "status": "ok"}


@app.post("/create_docs")
def create(data: Create_Docs, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return creating_docs(data, db, user)


@app.post("/user_docs")
def user_docs(db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return docs(db, user)


@app.post("/get_doc/{docs_id}")
def view_single(docs_id: UUID, db: Session = Depends(get_db), user=Depends(Jwt_Token_Checker)):
    return view_docs(docs_id, db, user)


@app.put("/update_docs/{docs_id}")
def update_docs_route(
    docs_id: UUID,
    data: Update_Docs,
    user=Depends(Jwt_Token_Checker),
    db: Session = Depends(get_db),
):
    return update_docs_record(docs_id, user, db, data)


@app.delete("/delete_docs/{docs_id}")
def delete(docs_id: UUID, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return delete_docs(docs_id, user, db)


@app.post("/join_docs/{doc_id}")
def join_document(doc_id: UUID, user=Depends(Jwt_Token_Checker), db: Session = Depends(get_db)):
    return join_doc(doc_id, user, db)
