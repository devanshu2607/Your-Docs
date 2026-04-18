from sqlalchemy import Column , String , ForeignKey , Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
from Database.DataBase import Base

class UserDocument(Base):
    __tablename__ = "User_Docs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    doc_id = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"))

    is_deleted = Column(Boolean, default=False)
    role = Column(String, default="editor")  # owner/editor/viewer