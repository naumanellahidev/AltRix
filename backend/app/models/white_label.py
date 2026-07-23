"""
SQLAlchemy ORM models for Full White-Label & Custom Domain System.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class WhiteLabelSettings(Base):
    __tablename__ = "white_label_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)

    custom_domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_smtp_host: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_smtp_port: Mapped[Optional[int]] = mapped_column(Integer, default=587, nullable=True)
    custom_smtp_user: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    custom_primary_color: Mapped[Optional[str]] = mapped_column(String(50), default="#0284c7", nullable=True)
    hide_altrix_branding: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
