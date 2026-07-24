from sqlalchemy import Column, String, ForeignKey, DateTime, Enum as SQLAlchemyEnum
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
import enum
from datetime import datetime


class ProposedChangeStatus(str, enum.Enum):
    pending = "pending"
    merged = "merged"
    rejected = "rejected"


class ProposedChange(Base):
    __tablename__ = "Proposed_Change_Table"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"))
    proposed_by = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))
    original_content = Column(String, nullable=True)
    proposed_content = Column(String, nullable=True)
    status = Column(SQLAlchemyEnum(ProposedChangeStatus), default=ProposedChangeStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
