from passlib.context import CryptContext
import hashlib

cry = CryptContext(schemes=['bcrypt'],deprecated = "auto")

def hash_password(password : str):
    return cry.hash(password[:72])

def verify_password(plain_password :str , hashed_password : str):
    return cry.verify(plain_password , hashed_password)