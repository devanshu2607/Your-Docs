from sqlalchemy import create_engine 
from sqlalchemy.ext.declarative import declarative_base 
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

import os
load_dotenv()

DATABASE_URL = os.getenv("SQL_DATABASE_URL")

Engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autoflush= False , autocommit = False , bind = Engine)

Base = declarative_base()



def get_db():
    db = SessionLocal()
    try : 
        yield db 
    finally:
        db.close()
