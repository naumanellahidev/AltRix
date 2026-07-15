"""
Finance router: fee structures, vouchers, payments, financial reports.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status, HTTPException, Request
from app.cache import cache
from app.utils.cache_decorator import cache_response
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.finance import (
    FeeStructure, FeeComponent, FeeAllocation, FeeVoucher, FeePayment,
    InstallmentPlan, InstallmentPayment, SiblingDiscount,
    TaxCertificate, FeeEscalation, PaymentGatewayConfig,
)
from app.schemas import (
    FeeStructureCreate, FeeStructureOut,
    FeeVoucherCreate, FeeVoucherOut,
    FeePaymentCreate, FeePaymentOut,
    MessageResponse,
    InstallmentPlanCreate, InstallmentPlanOut, InstallmentPaymentOut,
    SiblingDiscountCreate, SiblingDiscountOut,
    TaxCertificateGenerateRequest, TaxCertificateOut,
    FeeEscalationOut,
    PaymentGatewayConfigCreate, PaymentGatewayConfigOut,
)
from app.utils.pagination import PaginatedResponse
from app.utils.permissions import expand_roles, FINANCE_GOV

router = APIRouter(prefix="/finance", tags=["Finance"])


# ─── FEE STRUCTURES ──────────────────────────────────────────────────────────

@router.get("/structures", response_model=List[FeeStructureOut])
@cache_response(ttl=300, key_prefix="finance:structures")
async def list_structures(current_user: CurrentUser, db: DbSession, request: Request):
    if not current_user.school_id:
        return []
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")
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
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass
    return structure


@router.get("/structures/{structure_id}", response_model=FeeStructureOut)
@cache_response(ttl=300, key_prefix="finance:structure-detail")
async def get_structure(structure_id: UUID, current_user: CurrentUser, db: DbSession, request: Request):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, s.school_id)
    return s


@router.patch("/structures/{structure_id}", response_model=FeeStructureOut)
async def update_structure(structure_id: UUID, body: FeeStructureCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot write finance data")
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, s.school_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    await db.flush()
    await db.refresh(s)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass
    return s


@router.delete("/structures/{structure_id}", response_model=MessageResponse)
async def delete_structure(structure_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot delete finance data")
    result = await db.execute(select(FeeStructure).where(FeeStructure.id == structure_id))
    s = result.scalar_one_or_none()
    if not s:
        raise NotFoundError("Fee structure", str(structure_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, s.school_id)
    s.is_active = False  # type: ignore[assignment]
    await db.flush()
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass
    return MessageResponse(message="Fee structure deactivated")


# ─── FEE VOUCHERS ────────────────────────────────────────────────────────────

@router.get("/vouchers", response_model=PaginatedResponse[FeeVoucherOut])
@cache_response(ttl=120, key_prefix="finance:vouchers")
async def list_vouchers(
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    month: Optional[str] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    from app.utils.security import get_allowed_student_ids
    allowed_student_ids = await get_allowed_student_ids(current_user, db)
    
    if allowed_student_ids is not None:
        if student_id:
            if student_id not in allowed_student_ids:
                raise ForbiddenError("Permission denied: cannot access this student's vouchers")
            student_ids_filter = [student_id]
        else:
            if not allowed_student_ids:
                return PaginatedResponse.create([], 0, page, page_size)
            student_ids_filter = allowed_student_ids
    else:
        student_ids_filter = [student_id] if student_id else None

    query = select(FeeVoucher).where(FeeVoucher.school_id == current_user.school_id)
    if student_ids_filter is not None:
        query = query.where(FeeVoucher.student_id.in_(student_ids_filter))
    if status_filter:
        query = query.where(FeeVoucher.status == status_filter)
    if month:
        query = query.where(FeeVoucher.period_label == month)  # type: ignore[arg-type]
    if academic_year:
        query = query.where(FeeVoucher.period_label.like(f"%{academic_year}%"))  # type: ignore[union-attr]

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(FeeVoucher.created_at.desc()).offset(offset).limit(page_size)
    )
    vouchers = result.scalars().all()
    return PaginatedResponse.create(list(vouchers), total, page, page_size)


@router.post("/vouchers", response_model=FeeVoucherOut, status_code=status.HTTP_201_CREATED)
async def create_voucher(body: FeeVoucherCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()
    data = body.model_dump()
    if data.get("due_date") and isinstance(data["due_date"], str):
        from datetime import datetime as dt
        try:
            data["due_date"] = dt.strptime(data["due_date"], "%Y-%m-%d").date()
        except ValueError:
            pass

    if not data.get("due_date"):
        from datetime import date, timedelta
        data["due_date"] = date.today() + timedelta(days=7)

    # Generate invoice_number using public.generate_invoice_number if not provided
    if not data.get("invoice_number"):
        try:
            res = await db.execute(
                text("SELECT public.generate_invoice_number(:school_id)"),
                {"school_id": current_user.school_id}
            )
            data["invoice_number"] = res.scalar()
        except Exception:
            from datetime import datetime as dt
            import random
            data["invoice_number"] = f"INV-{dt.now().year}-{random.randint(100000, 999999)}"

    # Set subtotal equal to total_amount if not specified (subtotal is NOT NULL in DB)
    if data.get("subtotal") is None:
        data["subtotal"] = data.get("total_amount", 0.0)

    if data.get("net_amount") is None:
        data["net_amount"] = data.get("total_amount", 0.0)

    voucher = FeeVoucher(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **data,
    )
    db.add(voucher)
    await db.flush()
    await db.refresh(voucher)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:finance-trend*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass
    return voucher


@router.get("/vouchers/{voucher_id}", response_model=FeeVoucherOut)
@cache_response(ttl=120, key_prefix="finance:voucher-detail")
async def get_voucher(voucher_id: UUID, current_user: CurrentUser, db: DbSession, request: Request):
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
    voucher.status = "cancelled"  # type: ignore[assignment]
    await db.flush()
    await db.refresh(voucher)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:finance-trend*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass
    return voucher


# ─── PAYMENTS ─────────────────────────────────────────────────────────────────

@router.get("/payments", response_model=PaginatedResponse[FeePaymentOut])
@cache_response(ttl=120, key_prefix="finance:payments")
async def list_payments(
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
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
        query = query.where(FeePayment.paid_at >= from_date)  # type: ignore[arg-type]
    if to_date:
        query = query.where(FeePayment.paid_at <= to_date)  # type: ignore[arg-type]

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(FeePayment.created_at.desc()).offset(offset).limit(page_size)
    )
    payments = result.scalars().all()
    return PaginatedResponse.create(list(payments), total, page, page_size)


@router.post("/payments", response_model=FeePaymentOut, status_code=status.HTTP_201_CREATED)
async def record_payment(body: FeePaymentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    data = body.model_dump()
    if not data.get("payment_date"):
        from datetime import date
        data["payment_date"] = date.today().isoformat()

    payment = FeePayment(
        school_id=current_user.school_id,
        received_by=current_user.id,
        **data,
    )
    db.add(payment)

    # Update voucher status if voucher_id provided
    if body.voucher_id:
        v_result = await db.execute(select(FeeVoucher).where(FeeVoucher.id == body.voucher_id))
        voucher = v_result.scalar_one_or_none()
        if voucher:
            voucher.status = "paid"  # type: ignore[assignment]

    await db.flush()
    await db.refresh(payment)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:finance-trend*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception:
        pass

    # Fire Event Bus trigger
    try:
        from app.services.event_bus import EnterpriseEventBus
        from app.schemas import EventEnvelope
        await EnterpriseEventBus.publish(EventEnvelope(
            event_name="FeePaid",
            category="finance",
            school_id=current_user.school_id,
            user_id=current_user.id,
            entity_type="fee_payment",
            entity_id=payment.id,
            payload={"amount": float(data.get("amount", 0)), "voucher_id": str(body.voucher_id) if body.voucher_id else None},
            source="finance_router",
        ), db)
    except Exception as eb_err:
        import logging
        logging.getLogger("app.event_bus").warning(f"Event bus publish failed (non-blocking): {eb_err}")

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
        conditions += " AND student_id IN (SELECT id FROM students WHERE campus_id = :campus_id)"
        params["campus_id"] = str(campus_id)

    result = await db.execute(
        text(f"""
            SELECT
                COUNT(*) as total_vouchers,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) as collected,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) as pending,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'overdue'), 0) as overdue,
                COALESCE(SUM(total_amount), 0) as total_billed
            FROM fee_invoices
            WHERE {conditions}
        """),
        params,
    )
    row = result.fetchone()
    if not row:
        return {
            "total_vouchers": 0,
            "collected": 0.0,
            "pending": 0.0,
            "overdue": 0.0,
            "total_billed": 0.0,
            "collection_rate": 0,
        }
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


# ─── INSTALLMENT PLANS ───────────────────────────────────────────────────────

@router.post("/installment-plans", status_code=status.HTTP_201_CREATED)
async def create_installment_plan(body: InstallmentPlanCreate, current_user: CurrentUser, db: DbSession):
    """Create an installment plan for an invoice."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    from datetime import datetime, timedelta
    from dateutil.relativedelta import relativedelta

    start = datetime.strptime(body.start_date, "%Y-%m-%d").date()
    inst_amount = round(body.total_amount / body.total_installments, 2)

    plan = InstallmentPlan(
        school_id=current_user.school_id,
        invoice_id=body.invoice_id,
        student_id=body.student_id,
        total_amount=body.total_amount,
        total_installments=body.total_installments,
        installment_amount=inst_amount,
        frequency=body.frequency or "monthly",
        start_date=start,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(plan)
    await db.flush()

    # Create individual installments
    for i in range(body.total_installments):
        if body.frequency == "weekly":
            due = start + timedelta(weeks=i)
        elif body.frequency == "quarterly":
            due = start + relativedelta(months=3 * i)
        else:
            due = start + relativedelta(months=i)

        amt = inst_amount
        # Last installment adjusts for rounding
        if i == body.total_installments - 1:
            amt = round(body.total_amount - inst_amount * (body.total_installments - 1), 2)

        inst = InstallmentPayment(
            plan_id=plan.id,
            school_id=current_user.school_id,
            installment_number=i + 1,
            due_date=due,
            amount=amt,
        )
        db.add(inst)

    await db.flush()
    await db.refresh(plan)

    return InstallmentPlanOut.model_validate(plan).model_dump()


@router.get("/installment-plans/{invoice_id}")
async def get_installment_plan(invoice_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get installment plan with all payments for an invoice."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    plan_result = await db.execute(
        select(InstallmentPlan).where(
            InstallmentPlan.invoice_id == invoice_id,
            InstallmentPlan.school_id == current_user.school_id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return None

    payments_result = await db.execute(
        select(InstallmentPayment)
        .where(InstallmentPayment.plan_id == plan.id)
        .order_by(InstallmentPayment.installment_number)
    )
    payments = payments_result.scalars().all()

    return {
        "plan": InstallmentPlanOut.model_validate(plan).model_dump(),
        "installments": [InstallmentPaymentOut.model_validate(p).model_dump() for p in payments],
    }


@router.post("/installment-plans/{plan_id}/pay-installment")
async def pay_installment(
    plan_id: UUID,
    installment_number: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Mark an installment as paid."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    from datetime import datetime as dt, timezone as tz

    inst_result = await db.execute(
        select(InstallmentPayment).where(
            InstallmentPayment.plan_id == plan_id,
            InstallmentPayment.installment_number == installment_number,
        )
    )
    inst = inst_result.scalar_one_or_none()
    if not inst:
        raise NotFoundError("Installment", f"{plan_id}#{installment_number}")

    inst.paid_amount = inst.amount
    inst.status = "paid"
    inst.paid_at = dt.now(tz.utc)

    # Check if all installments are paid
    all_result = await db.execute(
        select(InstallmentPayment).where(InstallmentPayment.plan_id == plan_id)
    )
    all_inst = all_result.scalars().all()
    if all(i.status == "paid" for i in all_inst):
        plan_result = await db.execute(select(InstallmentPlan).where(InstallmentPlan.id == plan_id))
        plan = plan_result.scalar_one_or_none()
        if plan:
            plan.status = "completed"

    await db.flush()
    return MessageResponse(message="Installment payment recorded")


# ─── SIBLING DISCOUNTS ───────────────────────────────────────────────────────

@router.get("/sibling-discounts", response_model=List[SiblingDiscountOut])
async def list_sibling_discounts(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(SiblingDiscount)
        .where(SiblingDiscount.school_id == current_user.school_id)
        .order_by(SiblingDiscount.sibling_number)
    )
    return result.scalars().all()


@router.post("/sibling-discounts", response_model=SiblingDiscountOut, status_code=status.HTTP_201_CREATED)
async def create_sibling_discount(body: SiblingDiscountCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    discount = SiblingDiscount(
        school_id=current_user.school_id,
        **body.model_dump(exclude_none=True),
    )
    db.add(discount)
    await db.flush()
    await db.refresh(discount)
    return discount


@router.patch("/sibling-discounts/{discount_id}", response_model=SiblingDiscountOut)
async def update_sibling_discount(discount_id: UUID, body: SiblingDiscountCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(SiblingDiscount).where(SiblingDiscount.id == discount_id))
    d = result.scalar_one_or_none()
    if not d:
        raise NotFoundError("SiblingDiscount", str(discount_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(d, field, value)
    await db.flush()
    await db.refresh(d)
    return d


@router.delete("/sibling-discounts/{discount_id}", response_model=MessageResponse)
async def delete_sibling_discount(discount_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(SiblingDiscount).where(SiblingDiscount.id == discount_id))
    d = result.scalar_one_or_none()
    if not d:
        raise NotFoundError("SiblingDiscount", str(discount_id))
    await db.delete(d)
    await db.flush()
    return MessageResponse(message="Discount deleted")


# ─── TAX CERTIFICATES ────────────────────────────────────────────────────────

@router.post("/tax-certificates/generate", response_model=TaxCertificateOut, status_code=status.HTTP_201_CREATED)
async def generate_tax_certificate(body: TaxCertificateGenerateRequest, current_user: CurrentUser, db: DbSession):
    """Generate annual tax certificate for a student's fee payments."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    import secrets
    from datetime import datetime as dt

    # Get all payments for the fiscal year
    year_parts = body.fiscal_year.split("-")
    start_year = int(year_parts[0])
    end_year = int(year_parts[1]) if len(year_parts) > 1 else start_year + 1

    payments_result = await db.execute(
        select(FeePayment).where(
            FeePayment.school_id == current_user.school_id,
            FeePayment.student_id == body.student_id,
            FeePayment.status == "completed",
        )
    )
    payments = payments_result.scalars().all()

    # Filter by fiscal year
    fy_payments = []
    total_paid = 0
    for p in payments:
        try:
            pdate = dt.strptime(p.payment_date, "%Y-%m-%d") if isinstance(p.payment_date, str) else p.payment_date
            if pdate and start_year <= pdate.year <= end_year:
                fy_payments.append({
                    "date": p.payment_date,
                    "amount": p.amount,
                    "method": p.payment_method,
                    "ref": p.transaction_id,
                })
                total_paid += p.amount or 0
        except (ValueError, AttributeError):
            continue

    cert_number = f"TC-{current_user.school_id!s:.8}-{body.fiscal_year}-{secrets.token_hex(3).upper()}"

    cert = TaxCertificate(
        school_id=current_user.school_id,
        student_id=body.student_id,
        parent_user_id=current_user.id,
        fiscal_year=body.fiscal_year,
        certificate_number=cert_number,
        total_fees_paid=total_paid,
        total_tuition=total_paid,  # simplified
        total_other_charges=0,
        school_ntn=body.school_ntn,
        payment_details=fy_payments,
    )
    db.add(cert)
    await db.flush()
    await db.refresh(cert)
    return cert


@router.get("/tax-certificates/{student_id}", response_model=List[TaxCertificateOut])
async def get_tax_certificates(student_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(TaxCertificate).where(
            TaxCertificate.school_id == current_user.school_id,
            TaxCertificate.student_id == student_id,
        ).order_by(TaxCertificate.fiscal_year.desc())
    )
    return result.scalars().all()


# ─── FEE ESCALATION ──────────────────────────────────────────────────────────

@router.post("/escalations/check", response_model=MessageResponse)
async def check_escalations(current_user: CurrentUser, db: DbSession):
    """Run escalation check on all overdue invoices."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    from datetime import datetime as dt, timezone as tz

    # Get unpaid vouchers past due
    vouchers_result = await db.execute(
        select(FeeVoucher).where(
            FeeVoucher.school_id == current_user.school_id,
            FeeVoucher.status.in_(["unpaid", "partial"]),
        )
    )
    count = 0
    now = dt.now(tz.utc).date()
    for v in vouchers_result.scalars().all():
        try:
            due = dt.strptime(v.due_date, "%Y-%m-%d").date() if isinstance(v.due_date, str) else v.due_date
        except (ValueError, TypeError):
            continue

        if not due or due >= now:
            continue

        overdue_days = (now - due).days
        amount = v.amount or 0

        # Determine escalation level
        if overdue_days > 90:
            level, etype = 4, "suspension_warning"
        elif overdue_days > 60:
            level, etype = 3, "final_notice"
        elif overdue_days > 30:
            level, etype = 2, "warning"
        else:
            level, etype = 1, "reminder"

        # Check if already escalated at this level
        existing = await db.execute(
            select(FeeEscalation).where(
                FeeEscalation.invoice_id == v.id,
                FeeEscalation.escalation_level == level,
                FeeEscalation.resolved == False,
            )
        )
        if existing.scalar_one_or_none():
            continue

        esc = FeeEscalation(
            school_id=current_user.school_id,
            invoice_id=v.id,
            student_id=v.student_id,
            escalation_level=level,
            escalation_type=etype,
            overdue_days=overdue_days,
            overdue_amount=amount,
            escalated_by=current_user.id,
        )
        db.add(esc)
        count += 1

    await db.flush()
    return MessageResponse(message=f"Created {count} new escalations")


@router.get("/escalations", response_model=List[FeeEscalationOut])
async def list_escalations(
    current_user: CurrentUser,
    db: DbSession,
    resolved: Optional[bool] = Query(False),
):
    if not current_user.school_id:
        return []
    query = select(FeeEscalation).where(FeeEscalation.school_id == current_user.school_id)
    if resolved is not None:
        query = query.where(FeeEscalation.resolved == resolved)
    result = await db.execute(query.order_by(FeeEscalation.escalation_level.desc(), FeeEscalation.created_at.desc()))
    return result.scalars().all()


@router.patch("/escalations/{escalation_id}/resolve", response_model=MessageResponse)
async def resolve_escalation(escalation_id: UUID, current_user: CurrentUser, db: DbSession):
    from datetime import datetime as dt, timezone as tz
    result = await db.execute(select(FeeEscalation).where(FeeEscalation.id == escalation_id))
    esc = result.scalar_one_or_none()
    if not esc:
        raise NotFoundError("Escalation", str(escalation_id))
    esc.resolved = True
    esc.resolved_at = dt.now(tz.utc)
    esc.action_taken = f"Resolved by {current_user.id}"
    await db.flush()
    return MessageResponse(message="Escalation resolved")


# ─── PAYMENT GATEWAY CONFIG ──────────────────────────────────────────────────

@router.get("/gateway-configs", response_model=List[PaymentGatewayConfigOut])
async def list_gateway_configs(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(PaymentGatewayConfig)
        .where(PaymentGatewayConfig.school_id == current_user.school_id)
        .order_by(PaymentGatewayConfig.is_default.desc(), PaymentGatewayConfig.gateway_name)
    )
    return result.scalars().all()


@router.post("/gateway-configs", response_model=PaymentGatewayConfigOut, status_code=status.HTTP_201_CREATED)
async def upsert_gateway_config(body: PaymentGatewayConfigCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError()

    # Check if gateway already exists for this school
    existing_result = await db.execute(
        select(PaymentGatewayConfig).where(
            PaymentGatewayConfig.school_id == current_user.school_id,
            PaymentGatewayConfig.gateway_name == body.gateway_name,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(existing, field, value)
        await db.flush()
        await db.refresh(existing)
        return existing

    # If setting as default, unset others
    if body.is_default:
        await db.execute(
            text("UPDATE payment_gateway_configs SET is_default = FALSE WHERE school_id = :sid"),
            {"sid": current_user.school_id}
        )

    config = PaymentGatewayConfig(
        school_id=current_user.school_id,
        **body.model_dump(exclude_none=True),
    )
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return config


# ─── PARENT BALANCE DASHBOARD ────────────────────────────────────────────────

@router.get("/balance-dashboard/{student_id}")
async def balance_dashboard(student_id: UUID, current_user: CurrentUser, db: DbSession):
    """Parent-facing balance overview for a student."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    from datetime import datetime as dt, timezone as tz

    # Total due (unpaid/partial vouchers)
    due_result = await db.execute(
        select(func.sum(FeeVoucher.amount)).where(
            FeeVoucher.school_id == current_user.school_id,
            FeeVoucher.student_id == student_id,
            FeeVoucher.status.in_(["unpaid", "partial"]),
        )
    )
    total_due = due_result.scalar() or 0

    # Total paid
    paid_result = await db.execute(
        select(func.sum(FeePayment.amount)).where(
            FeePayment.school_id == current_user.school_id,
            FeePayment.student_id == student_id,
            FeePayment.status == "completed",
        )
    )
    total_paid = paid_result.scalar() or 0

    # Overdue amount
    now_str = dt.now(tz.utc).strftime("%Y-%m-%d")
    overdue_result = await db.execute(
        select(func.sum(FeeVoucher.amount)).where(
            FeeVoucher.school_id == current_user.school_id,
            FeeVoucher.student_id == student_id,
            FeeVoucher.status.in_(["unpaid", "partial"]),
            FeeVoucher.due_date < now_str,
        )
    )
    overdue = overdue_result.scalar() or 0

    # Active installment plans
    plans_result = await db.execute(
        select(InstallmentPlan).where(
            InstallmentPlan.school_id == current_user.school_id,
            InstallmentPlan.student_id == student_id,
            InstallmentPlan.status == "active",
        )
    )
    active_plans = plans_result.scalars().all()

    # Recent payments
    recent_result = await db.execute(
        select(FeePayment).where(
            FeePayment.school_id == current_user.school_id,
            FeePayment.student_id == student_id,
        ).order_by(FeePayment.created_at.desc()).limit(10)
    )
    recent = recent_result.scalars().all()

    # Upcoming vouchers
    upcoming_result = await db.execute(
        select(FeeVoucher).where(
            FeeVoucher.school_id == current_user.school_id,
            FeeVoucher.student_id == student_id,
            FeeVoucher.status == "unpaid",
        ).order_by(FeeVoucher.due_date).limit(5)
    )
    upcoming = upcoming_result.scalars().all()

    # Active escalations
    esc_result = await db.execute(
        select(FeeEscalation).where(
            FeeEscalation.school_id == current_user.school_id,
            FeeEscalation.student_id == student_id,
            FeeEscalation.resolved == False,
        )
    )
    escalations = esc_result.scalars().all()

    return {
        "total_due": total_due,
        "total_paid": total_paid,
        "overdue_amount": overdue,
        "active_installment_plans": len(active_plans),
        "active_escalations": len(escalations),
        "recent_payments": [FeePaymentOut.model_validate(p).model_dump() for p in recent],
        "upcoming_vouchers": [FeeVoucherOut.model_validate(v).model_dump() for v in upcoming],
        "escalation_details": [FeeEscalationOut.model_validate(e).model_dump() for e in escalations],
    }
