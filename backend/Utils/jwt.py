from jose import jwt
from datetime import timedelta, datetime
from dotenv import load_dotenv
import os

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-minimum-32-chars")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
EXPIRY_TIME = 30


def create_jwt_handler(data: dict):
    Data = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=EXPIRY_TIME)
    Data.update({'exp': expire})
    jwt_handler = jwt.encode(Data, SECRET_KEY, algorithm=ALGORITHM)
    return jwt_handler
