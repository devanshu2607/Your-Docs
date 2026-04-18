from sqlalchemy import Column , String , ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from Database.DataBase import Base


class Document(Base):
    __tablename__ = "Docs_table"

    id = Column(UUID(as_uuid = True) , primary_key= True , default = uuid.uuid4)
    title = Column(String)
    content = Column(String)

    created_by = Column(UUID(as_uuid = True) , ForeignKey("User_Table.id"))