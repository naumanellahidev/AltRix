"""
Messaging models: admin messages (school-wide), chat channels, messages.
"""
import uuid
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    sender_user_id = Column(UUID(as_uuid=True), nullable=False)
    subject = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    priority = Column(String, nullable=True, default="normal")  # low, normal, high, urgent
    status = Column(String, nullable=True, default="sent")
    attachment_urls = Column(ARRAY(String), nullable=True)
    reply_to_id = Column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessageRecipient(Base):
    __tablename__ = "admin_message_recipients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    recipient_user_id = Column(UUID(as_uuid=True), nullable=False)
    is_read = Column(Boolean, default=False, nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessageReaction(Base):
    __tablename__ = "admin_message_reactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    message_id = Column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AdminMessagePin(Base):
    __tablename__ = "admin_message_pins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    message_id = Column(UUID(as_uuid=True), ForeignKey("admin_messages.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class Notice(Base):
    __tablename__ = "notices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    notice_type = Column(String, nullable=True, default="general")
    target_roles = Column(ARRAY(String), nullable=True)
    is_published = Column(Boolean, default=False, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
