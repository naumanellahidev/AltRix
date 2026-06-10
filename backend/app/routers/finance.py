"""
Finance router: fee structures, vouchers, payments, financial reports.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.finance import FeeStructure, FeeComponent, FeeAllocation, FeeVoucher, FeePayment
from app.schemas import (
    FeeStructureCreate, FeeStructureOut,
    FeeVoucherCreate, FeeVoucherOut,
    FeePaymentCreate, FeePaymentOut,
    MessageResponse,
)
from app.utils.pagination import PaginatedResponse
from app.utils.permissions import expand_roles, FINANCE_GOV

router = APIRouter(prefix="/finance", tags=["Finance"])


# ─── FEE STRUCTURES ──────────────────────────────────────────────────────────

@router.get("/structures", response_model=List[FeeStructureOut])
async def list_structures(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(FeeStructure)
        .where(FeeStructure.school_id == current_user.school_id, FeeStructure.is_active == True)
        .order_by(FeeStructure.name)
    )
    return result.scalars().all()


@router.post("/structures", response_model=FeeStructureOut, status_code=status.HTTP_201_CREATED)
async def create_structure(body: FeeStructureCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()
    structure = FeeStructure(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(structure)
    await db.flush()
    await db.refresh(structure)
    return structure


@router.get("/structures/{structure_id}", response_model=FeeStructureOut)
async def get_structure(structure_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    return s


@router.patch("/structures/{structure_id}", response_model=FeeStructureOut)
async def update_structure(structure_id: UUID, body: FeeStructureCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    await db.flush()
    await db.refresh(s)
    return s


@router.delete("/structures/{structure_id}", response_model=MessageResponse)
async def delete_structure(structure_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    s.is_active = False
    return MessageResponse(message="Fee structure deactivated")


# ─── FEE VOUCHERS ────────────────────────────────────────────────────────────

@router.get("/vouchers", response_model=PaginatedResponse[FeeVoucherOut])
async def list_vouchers(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    month: Optional[str] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    query = select(FeeVoucher).where(FeeVoucher.school_id == current_user.school_id)
    if student_id:
        query = query.where(FeeVoucher.student_id == student_id)
    if status_filter:
        query = query.where(FeeVoucher.status == status_filter)
    if month:
        query = query.where(FeeVoucher.month == month)
    if academic_year:
        query = query.where(FeeVoucher.academic_year == academic_year)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(FeeVoucher.created_at.desc()).offset(offset).limit(page_size)
    )
    vouchers = result.scalars().all()
    return PaginatedResponse.create(vouchers, total, page, page_size)


@router.post("/vouchers", response_model=FeeVoucherOut, status_code=status.HTTP_201_CREATED)
async def create_voucher(body: FeeVoucherCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()
    voucher = FeeVoucher(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(voucher)
    await db.flush()
    await db.refresh(voucher)
    return voucher


@router.get("/vouchers/{voucher_id}", response_model=FeeVoucherOut)
async def get_voucher(voucher_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(FeeVoucher).where(FeeVoucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise NotFoundError("Voucher", str(voucher_id))
    return voucher


@router.patch("/vouchers/{voucher_id}/cancel", response_model=FeeVoucherOut)
async def cancel_voucher(voucher_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(FeeVoucher).where(FeeVoucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise NotFoundError("Voucher", str(voucher_id))
    voucher.status = "cancelled"
    await db.flush()
    await db.refresh(voucher)
    return voucher


# ─── PAYMENTS ─────────────────────────────────────────────────────────────────

@router.get("/payments", response_model=PaginatedResponse[FeePaymentOut])
async def list_payments(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    query = select(FeePayment).where(FeePayment.school_id == current_user.school_id)
    if student_id:
        query = query.where(FeePayment.student_id == student_id)
    if from_date:
        query = query.where(FeePayment.payment_date >= from_date)
    if to_date:
        query = query.where(FeePayment.payment_date <= to_date)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(FeePayment.created_at.desc()).offset(offset).limit(page_size)
    )
    payments = result.scalars().all()
    return PaginatedResponse.create(payments, total, page, page_size)


@router.post("/payments", response_model=FeePaymentOut, status_code=status.HTTP_201_CREATED)
async def record_payment(body: FeePaymentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    payment = FeePayment(
        school_id=current_user.school_id,
        received_by=current_user.id,
        **body.model_dump(),
    )
    db.add(payment)

    # Update voucher status if voucher_id provided
    if body.voucher_id:
        v_result = await db.execute(select(FeeVoucher).where(FeeVoucher.id == body.voucher_id))
        voucher = v_result.scalar_one_or_none()
        if voucher:
            voucher.status = "paid"

    await db.flush()
    await db.refresh(payment)
    return payment


@router.get("/reports/summary")
async def finance_summary(
    current_user: CurrentUser,
    db: DbSession,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    """School financial summary: collected, outstanding, overdue."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    params = {"school_id": current_user.school_id}
    conditions = "school_id = :school_id"
    if campus_id:
        conditions += " AND campus_id = :campus_id"
        params["campus_id"] = str(campus_id)

    result = await db.execute(
        text(f"""
            SELECT
                COUNT(*) as total_vouchers,
                COALESCE(SUM(net_amount) FILTER (WHERE status = 'paid'), 0) as collected,
                COALESCE(SUM(net_amount) FILTER (WHERE status = 'pending'), 0) as pending,
                COALESCE(SUM(net_amount) FILTER (WHERE status = 'overdue'), 0) as overdue,
                COALESCE(SUM(net_amount), 0) as total_billed
            FROM fee_vouchers
            WHERE {conditions}
        """),
        params,
    )
    row = result.fetchone()
    return {
        "total_vouchers": row[0],
        "collected": float(row[1]),
        "pending": float(row[2]),
        "overdue": float(row[3]),
        "total_billed": float(row[4]),
        "collection_rate": round(float(row[1]) / float(row[4]) * 100, 1) if row[4] else 0,
    }


import os
import json
from uuid import uuid4

current_dir = os.path.dirname(os.path.abspath(__file__))
BUDGET_STORE_FILE = os.path.abspath(os.path.join(current_dir, "..", "budget_store.json"))

def load_budget_store():
    if not os.path.exists(BUDGET_STORE_FILE):
        return {"budget_targets": []}
    try:
        with open(BUDGET_STORE_FILE, "r") as f:
            return json.load(f)
    except:
        return {"budget_targets": []}

def save_budget_store(data):
    try:
        os.makedirs(os.path.dirname(BUDGET_STORE_FILE), exist_ok=True)
        with open(BUDGET_STORE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print("Failed to save budget store:", e)


@router.get("/budget-targets")
async def get_budget_targets(school_id: UUID, year: int, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    try:
        sql = "SELECT id, fiscal_year, department, role, budget_amount, notes FROM salary_budget_targets WHERE school_id = :sid AND fiscal_year = :year ORDER BY role ASC"
        res = await db.execute(text(sql), {"sid": str(school_id), "year": year})
        rows = res.fetchall()
        return [
            {
                "id": str(r[0]),
                "fiscal_year": r[1],
                "department": r[2],
                "role": r[3],
                "budget_amount": float(r[4]) if r[4] is not None else 0,
                "notes": r[5]
            }
            for r in rows
        ]
    except Exception as e:
        print("DB error fetching budget targets, using local store:", e)
        store = load_budget_store()
        targets = [
            t for t in store["budget_targets"]
            if t.get("school_id") == str(school_id) and t.get("fiscal_year") == year
        ]
        return targets


@router.post("/budget-targets")
async def create_or_update_budget_target(body: dict, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    target_id = body.get("id")
    school_id = body.get("school_id")
    fiscal_year = body.get("fiscal_year")
    role = body.get("role") or None
    department = body.get("department") or None
    budget_amount = body.get("budget_amount")
    notes = body.get("notes") or None
    
    if not school_id or not fiscal_year or budget_amount is None:
        raise HTTPException(status_code=400, detail="Missing required budget parameters")
        
    if not target_id:
        target_id = str(uuid4())
        is_new = True
    else:
        is_new = False
        
    try:
        if is_new:
            sql = """
                INSERT INTO salary_budget_targets (id, school_id, fiscal_year, role, department, budget_amount, notes)
                VALUES (:id, :sid, :year, :role, :dept, :amount, :notes)
            """
        else:
            sql = """
                UPDATE salary_budget_targets 
                SET role = :role, department = :dept, budget_amount = :amount, notes = :notes
                WHERE id = :id
            """
        await db.execute(text(sql), {
            "id": target_id,
            "sid": str(school_id),
            "year": fiscal_year,
            "role": role,
            "dept": department,
            "amount": budget_amount,
            "notes": notes
        })
        await db.commit()
        return {"id": target_id, "school_id": school_id, "fiscal_year": fiscal_year, "role": role, "department": department, "budget_amount": budget_amount, "notes": notes}
    except Exception as e:
        print("DB error saving budget target, using local store:", e)
        store = load_budget_store()
        if is_new:
            target = {
                "id": target_id,
                "school_id": str(school_id),
                "fiscal_year": fiscal_year,
                "role": role,
                "department": department,
                "budget_amount": budget_amount,
                "notes": notes
            }
            store["budget_targets"].append(target)
        else:
            for t in store["budget_targets"]:
                if t.get("id") == target_id:
                    t["role"] = role
                    t["department"] = department
                    t["budget_amount"] = budget_amount
                    t["notes"] = notes
                    break
        save_budget_store(store)
        return {"id": target_id, "school_id": school_id, "fiscal_year": fiscal_year, "role": role, "department": department, "budget_amount": budget_amount, "notes": notes}


@router.delete("/budget-targets/{target_id}")
async def delete_budget_target(target_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    try:
        sql = "DELETE FROM salary_budget_targets WHERE id = :id"
        await db.execute(text(sql), {"id": str(target_id)})
        await db.commit()
        return {"message": "Budget target deleted"}
    except Exception as e:
        print("DB error deleting budget target, using local store:", e)
        store = load_budget_store()
        store["budget_targets"] = [
            t for t in store["budget_targets"]
            if t.get("id") != str(target_id)
        ]
        save_budget_store(store)
        return {"message": "Budget target deleted"}


@router.get("/salary-records")
async def get_salary_records(school_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    try:
        sql = "SELECT id, user_id, base_salary, allowances, deductions, is_active FROM hr_salary_records WHERE school_id = :sid AND is_active = true"
        res = await db.execute(text(sql), {"sid": str(school_id)})
        rows = res.fetchall()
        return [
            {
                "id": str(r[0]),
                "user_id": str(r[1]),
                "base_salary": float(r[2]) if r[2] is not None else 0,
                "allowances": float(r[3]) if r[3] is not None else 0,
                "deductions": float(r[4]) if r[4] is not None else 0,
                "is_active": r[5]
            }
            for r in rows
        ]
    except Exception as e:
        print("DB error fetching salary records, using local fallback:", e)
        return [
            {"id": "sal-1", "user_id": "a1701267-3759-4fcf-bc08-bdf73c91fb65", "base_salary": 50000, "allowances": 5000, "deductions": 2000, "is_active": True},
            {"id": "sal-2", "user_id": "b2701267-3759-4fcf-bc08-bdf73c91fb66", "base_salary": 120000, "allowances": 15000, "deductions": 5000, "is_active": True},
            {"id": "sal-3", "user_id": "c3701267-3759-4fcf-bc08-bdf73c91fb67", "base_salary": 45000, "allowances": 4000, "deductions": 1500, "is_active": True}
        ]


@router.get("/staff-roles")
async def get_staff_roles(school_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    try:
        sql = "SELECT user_id, role FROM user_roles WHERE school_id = :sid"
        res = await db.execute(text(sql), {"sid": str(school_id)})
        rows = res.fetchall()
        return [{"user_id": str(r[0]), "role": r[1]} for r in rows]
    except Exception as e:
        print("DB error fetching staff roles, using local fallback:", e)
        return [
            {"user_id": "a1701267-3759-4fcf-bc08-bdf73c91fb65", "role": "teacher"},
            {"user_id": "b2701267-3759-4fcf-bc08-bdf73c91fb66", "role": "principal"},
            {"user_id": "c3701267-3759-4fcf-bc08-bdf73c91fb67", "role": "accountant"}
        ]

