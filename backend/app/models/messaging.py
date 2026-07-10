"""
Messaging models: admin messages (school-wide), chat channels, messages.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.ext.hybrid import hybrid_property

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    sender_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="normal")  # low, normal, high, urgent
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="sent")
    attachment_urls = Column(ARRAY(String), nullable=True)
    reply_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessageRecipient(Base):
    __tablename__ = "admin_message_recipients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    is_read: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessageReaction(Base):
    __tablename__ = "admin_message_reactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    emoji: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessagePin(Base):
    __tablename__ = "admin_message_pins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audience: Mapped[str] = mapped_column(String, nullable=False, default="all")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="normal")
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    publish_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return None

    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]):
        pass

    @property
    def content(self) -> Optional[str]:
        return self.body

    @content.setter
    def content(self, val: Optional[str]):
        self.body = val

    @property
    def notice_type(self) -> Optional[str]:
        return "general"

    @notice_type.setter
    def notice_type(self, val: Optional[str]):
        pass

    @property
    def target_roles(self) -> List[str]:
        return [self.audience] if self.audience else []

    @target_roles.setter
    def target_roles(self, val: Optional[List[str]]):
        if val:
            self.audience = val[0]
        else:
            self.audience = "all"

    @hybrid_property
    def is_published(self) -> bool:
        return self.publish_at is not None

    @is_published.setter
    def is_published(self, val: bool):
        if val:
            if not self.publish_at:
                self.publish_at = datetime.now(timezone.utc)
        else:
            self.publish_at = None

    @is_published.expression
    def is_published(cls):
        return cls.publish_at.isnot(None)

    @property
    def published_at(self) -> Optional[datetime]:
        return self.publish_at

    @published_at.setter
    def published_at(self, val: Optional[datetime]):
        self.publish_at = val
