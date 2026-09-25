"""
Router for School Asset, Equipment & Inventory Management System.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from pydantic import Field

from app.dependencies import CurrentUser, DbSession
from app.models.inventory import InventoryItem, StockTransaction
from app.utils.pagination import ListPageParams
from app.utils.permissions import expand_roles

#: Parents and students may look at nothing here and change nothing. Neither
#: was checked: any signed-in account could add items and move stock.
FAMILY = {"parent", "student"}


def _require_staff(user) -> None:
    roles = set(expand_roles(list(user.roles or [])))
    if not user.is_super_admin and not (roles - FAMILY):
        raise HTTPException(status_code=403, detail="Only school staff can manage the inventory.")


def _school(user) -> UUID:
    if not user.school_id:
        raise HTTPException(status_code=403, detail="No school context. Send the X-School-Id header.")
    return UUID(str(user.school_id))

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


class InventoryItemUpdateSchema(BaseModel):
    category_name: Optional[str] = Field(default=None, max_length=120)
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sku_barcode: Optional[str] = Field(default=None, max_length=120)
    min_reorder_threshold: Optional[int] = Field(default=None, ge=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    room_location: Optional[str] = Field(default=None, max_length=200)


class StockTransactionCreateSchema(BaseModel):
    item_id: UUID
    transaction_type: str = Field(pattern="^(issue|return|restock|writeoff)$")
    quantity: int = Field(gt=0)
    issued_to: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


@router.get("/items", response_model=List[InventoryItemResponseSchema])
async def list_inventory_items(
    db: DbSession,
    current_user: CurrentUser, page: ListPageParams,
):
    _require_staff(current_user)
    school_id = _school(current_user)
    stmt = select(InventoryItem).where(InventoryItem.school_id == school_id).order_by(InventoryItem.item_name)
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())


@router.get("/low-stock-alerts", response_model=List[InventoryItemResponseSchema])
async def list_low_stock_alerts(
    db: DbSession,
    current_user: CurrentUser, page: ListPageParams,
):
    _require_staff(current_user)
    school_id = _school(current_user)
    stmt = select(InventoryItem).where(
        InventoryItem.school_id == school_id,
        InventoryItem.available_quantity <= InventoryItem.min_reorder_threshold
    ).order_by(InventoryItem.available_quantity.asc())
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())



@router.post("/items", response_model=InventoryItemResponseSchema)
async def add_inventory_item(
    payload: InventoryItemCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    _require_staff(current_user)
    school_id = _school(current_user)
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
    _require_staff(current_user)
    school_id = _school(current_user)
    # This school's item only: the lookup had no school filter, so stock in
    # another school could be moved by id.
    stmt = select(InventoryItem).where(InventoryItem.id == payload.item_id, InventoryItem.school_id == school_id)
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


# NOTE: a duplicate GET /low-stock-alerts handler lived here, shadowed by the
# one registered earlier in this file. Removed.



@router.put("/items/{item_id}", response_model=InventoryItemResponseSchema)
async def update_inventory_item(
    item_id: UUID,
    payload: InventoryItemUpdateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    """Edit an item's details. Quantities move only through /transactions,
    so every change to the stock is recorded with who made it and why."""
    _require_staff(current_user)
    school_id = _school(current_user)
    res = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.school_id == school_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item
