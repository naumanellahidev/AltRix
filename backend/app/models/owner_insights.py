import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class OwnerAiInsight(Base):
    __tablename__ = "owner_ai_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    
    revenue_forecast: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    enrollment_forecast: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    teacher_risk_scores: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    parent_sentiments: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    benchmark_scores: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
