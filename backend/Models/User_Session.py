from sqlalchemy import Column , String , ForeignKey , DateTime
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
from datetime import datetime

class UserSession(Base):
    __tablename__ = "User_Session_Table"

    id = Column(UUID(as_uuid=True) , primary_key= True , default= uuid.uuid4)
    user_id = Column(UUID(as_uuid=True) , ForeignKey("User_Table.id"))
    token = Column(String)
    expire = Column(DateTime , default=datetime.utcnow)