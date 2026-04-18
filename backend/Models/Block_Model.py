from sqlalchemy import Column, String, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from Database.DataBase import Base
import uuid


class DocBlock(Base):
    __tablename__ = "Doc_Blocks"

    id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id  = Column(UUID(as_uuid=True), ForeignKey("Docs_table.id"), nullable=False)
    block_index = Column(Integer, nullable=False)   # 0-based order
    content = Column(Text, default="")              # up to 5 lines of rich-text JSON
