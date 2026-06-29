from sqlalchemy import create_engine 
from sqlalchemy.ext.declarative import declarative_base 
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

import os
load_dotenv()

DATABASE_URL = os.getenv("SQL_DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("SQL_DATABASE_URL is not set")

Engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autoflush= False , autocommit = False , bind = Engine)

Base = declarative_base()

SCHEMA_NAME = os.getenv("DB_SCHEMA", "").strip()

if SCHEMA_NAME:
    from sqlalchemy import event

    @event.listens_for(Engine, "connect")
    def set_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET search_path TO "{SCHEMA_NAME}"')
        cursor.close()




def get_db():
    db = SessionLocal()
    try : 
        yield db 
    finally:
        db.close()
