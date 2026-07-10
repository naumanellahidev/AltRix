"""
Core SQLAlchemy models: schools, profiles, memberships, roles, branding.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class School(Base):
    __tablename__ = "schools"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    motto: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    altitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    campuses = relationship("Campus", back_populates="school")
    user_roles = relationship("UserRole", back_populates="school")

    # Property wrappers for backward compatibility with schema fields not in DB
    @property
    def tagline(self) -> Optional[str]:
        return None

    @tagline.setter
    def tagline(self, val: Optional[str]):
        pass

    @property
    def subscription_plan(self) -> Optional[str]:
        return None

    @subscription_plan.setter
    def subscription_plan(self, val: Optional[str]):
        pass

    @property
    def subscription_status(self) -> Optional[str]:
        return None

    @subscription_status.setter
    def subscription_status(self, val: Optional[str]):
        pass

    @property
    def trial_ends_at(self) -> Optional[datetime]:
        return None

    @trial_ends_at.setter
    def trial_ends_at(self, val: Optional[datetime]):
        pass

    @property
    def owner_user_id(self) -> Optional[uuid.UUID]:
        return None

    @owner_user_id.setter
    def owner_user_id(self, val: Optional[uuid.UUID]):
        pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)  # same as auth.users.id
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    @property
    def full_name(self) -> Optional[str]:
        return self.display_name

    @full_name.setter
    def full_name(self, value: Optional[str]):
        self.display_name = value


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = relationship("School", back_populates="user_roles")

    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return None

    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]):
        pass


class SchoolMembership(Base):
    __tablename__ = "school_memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="active")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    @property
    def joined_at(self) -> Optional[datetime]:
        return self.created_at

    @joined_at.setter
    def joined_at(self, value: Optional[datetime]):
        self.created_at = value


class SchoolBranding(Base):
    __tablename__ = "school_branding"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    accent_hue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accent_saturation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accent_lightness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    radius_scale: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for colors and other old UI details
    @property
    def primary_color(self) -> Optional[str]: return None
    @primary_color.setter
    def primary_color(self, val: Optional[str]): pass

    @property
    def secondary_color(self) -> Optional[str]: return None
    @secondary_color.setter
    def secondary_color(self, val: Optional[str]): pass

    @property
    def accent_color(self) -> Optional[str]: return None
    @accent_color.setter
    def accent_color(self, val: Optional[str]): pass

    @property
    def logo_url(self) -> Optional[str]: return None
    @logo_url.setter
    def logo_url(self, val: Optional[str]): pass

    @property
    def favicon_url(self) -> Optional[str]: return None
    @favicon_url.setter
    def favicon_url(self, val: Optional[str]): pass

    @property
    def banner_url(self) -> Optional[str]: return None
    @banner_url.setter
    def banner_url(self, val: Optional[str]): pass

    @property
    def font_family(self) -> Optional[str]: return None
    @font_family.setter
    def font_family(self, val: Optional[str]): pass


class PlatformSuperAdmin(Base):
    __tablename__ = "platform_super_admins"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class PlatformBillingPlan(Base):
    __tablename__ = "platform_billing_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    price_monthly: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    price_annual: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_students: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_campuses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    features = Column(JSON, nullable=True)
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
