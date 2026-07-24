from sqlalchemy import Column, String, ForeignKey, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
from datetime import datetime


class CollaborationSession(Base):
    __tablename__ = "Collab_Session_Table"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"), unique=True)
    token = Column(String, unique=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=False)
    last_started = Column(DateTime, nullable=True)
    last_ended = Column(DateTime, nullable=True)