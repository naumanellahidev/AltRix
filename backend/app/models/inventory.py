"""
SQLAlchemy ORM models for School Inventory & Asset Management.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class InventoryCategory(Base):
    __tablename__ = "inventory_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    category_name: Mapped[str] = mapped_column(String(100), default="General", nullable=False)

    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku_barcode: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    total_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    min_reorder_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    unit_price: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    room_location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)

    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False)  # issue, return, restock, writeoff
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    issued_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
