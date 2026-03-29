from sqlalchemy import Column, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid
from datetime import datetime


class SessionParticipant(Base):
    __tablename__ = "Session_Participants_Table"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    session_id = Column(UUID(as_uuid=True), ForeignKey("Collab_Session_Table.id"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("User_Table.id"))

    connected_at = Column(DateTime, default=datetime.utcnow)
    disconnected_at = Column(DateTime, nullable=True)