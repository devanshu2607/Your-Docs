from sqlalchemy import Column, ForeignKey, DateTime, Enum as SQLAlchemyEnum
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
import enum
from datetime import datetime


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class EditRequest(Base):
    __tablename__ = "Edit_Request_Table"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"))
    requester_id = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    owner_id = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    status = Column(SQLAlchemyEnum(RequestStatus), default=RequestStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
