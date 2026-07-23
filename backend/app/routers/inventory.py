"""
Router for School Asset, Equipment & Inventory Management System.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.inventory import InventoryItem, StockTransaction

router = APIRouter(prefix="/inventory", tags=["Inventory Management"])


class InventoryItemCreateSchema(BaseModel):
    category_name: Optional[str] = "General"
    item_name: str
    sku_barcode: Optional[str] = None
    total_quantity: int = 1
    min_reorder_threshold: int = 5
    unit_price: Optional[float] = 0.0
    room_location: Optional[str] = "Main Store"


class InventoryItemResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    category_name: str
    item_name: str
    sku_barcode: Optional[str] = None
    total_quantity: int
    available_quantity: int
    min_reorder_threshold: int
    unit_price: Optional[float] = None
    room_location: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StockTransactionCreateSchema(BaseModel):
    item_id: UUID
    transaction_type: str  # issue, return, restock, writeoff
    quantity: int
    issued_to: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


@router.get("/items", response_model=List[InventoryItemResponseSchema])
async def list_inventory_items(
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    try:
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []


@router.post("/items", response_model=InventoryItemResponseSchema)
async def add_inventory_item(
    payload: InventoryItemCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    item = InventoryItem(
        school_id=school_id,
        category_name=payload.category_name or "General",
        item_name=payload.item_name,
        sku_barcode=payload.sku_barcode,
        total_quantity=payload.total_quantity,
        available_quantity=payload.total_quantity,
        min_reorder_threshold=payload.min_reorder_threshold,
        unit_price=payload.unit_price,
        room_location=payload.room_location,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/transactions")
async def record_stock_transaction(
    payload: StockTransactionCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(InventoryItem).where(InventoryItem.id == payload.item_id)
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if payload.transaction_type in ["issue", "writeoff"]:
        if item.available_quantity < payload.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock available")
        item.available_quantity -= payload.quantity
    elif payload.transaction_type in ["return", "restock"]:
        item.available_quantity += payload.quantity
        if payload.transaction_type == "restock":
            item.total_quantity += payload.quantity

    tx = StockTransaction(
        school_id=school_id,
        item_id=payload.item_id,
        transaction_type=payload.transaction_type,
        quantity=payload.quantity,
        issued_to=payload.issued_to,
        department=payload.department,
        notes=payload.notes,
    )
    db.add(tx)
    await db.commit()
    return {"message": "Stock transaction recorded", "available_quantity": item.available_quantity}


@router.get("/low-stock-alerts", response_model=List[InventoryItemResponseSchema])
async def get_low_stock_alerts(
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(InventoryItem).where(
        InventoryItem.school_id == school_id,
        InventoryItem.available_quantity <= InventoryItem.min_reorder_threshold
    )
    try:
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []
