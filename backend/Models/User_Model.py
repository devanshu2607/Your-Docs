from Database.DataBase import Base
from sqlalchemy import Integer , Column , String 
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Enum as SQLAlchemyEnum
import uuid
import enum


class user_gender(enum.Enum):
    male = "male" 
    female = "female"
    other = "other"


class User(Base):
    __tablename__ = "User_Table"

    id = Column(UUID(as_uuid=True) ,  primary_key= True , default=uuid.uuid4 , index= True)
    name = Column(String , index= True)
    gender = Column(SQLAlchemyEnum(user_gender))
    email = Column(String , unique=True , index= True , nullable = False)
    age = Column(Integer , index= True)
    address = Column(String , nullable= False )
    password = Column(String , index= True , nullable= True)



