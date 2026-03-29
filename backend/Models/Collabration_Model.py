from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
from datetime import datetime


class CollaborationSession(Base):
    __tablename__ = "Collab_Session_Table"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    doc_id = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"))
    token = Column(String, unique=True, nullable=False)

    created_by = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True) 