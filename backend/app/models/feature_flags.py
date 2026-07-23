"""
SQLAlchemy ORM model for School Feature Flags (Super Master Admin module controls).
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class SchoolFeatureFlag(Base):
    __tablename__ = "school_feature_flags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    
    transport_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    library_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    parent_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    document_cert_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_features_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
