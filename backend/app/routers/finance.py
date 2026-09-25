"""
Finance router: fee structures, vouchers, payments, financial reports.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, date

import logging

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
from app.utils.pagination import ListPageParams, PaginatedResponse
from app.utils.money import D, is_settled, money, percentage
from app.utils.tenant_guard import verify_resource_belongs_to_school
from app.utils.permissions import expand_roles, FINANCE_GOV
from app.utils.security import get_allowed_student_ids
from zoneinfo import ZoneInfo
import secrets

router = APIRouter(prefix="/finance", tags=["Finance"])


# ─── FEE STRUCTURES ──────────────────────────────────────────────────────────

@router.get("/structures", response_model=List[FeeStructureOut])
@cache_response(ttl=300, key_prefix="finance:structures")
async def list_structures(current_user: CurrentUser, db: DbSession, request: Request, page: ListPageParams):
    if not current_user.school_id:
        return []
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")
    result = await db.execute(
        page.apply(select(FeeStructure)
        .where(FeeStructure.school_id == current_user.school_id, FeeStructure.is_active == True)
        .order_by(FeeStructure.name))
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
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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
    if current_user.campus_id:
        try:
            query = query.where(FeeVoucher.campus_id == UUID(current_user.campus_id))
        except (ValueError, TypeError):
            pass
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

    # Invoice numbering.
    #
    # next_invoice_number() draws from a per-school sequence and is atomic, so
    # two invoices created at the same moment cannot receive the same number.
    #
    # The previous fallback generated a random six-digit suffix with no
    # collision check, against a constraint that was unique across ALL schools:
    # by 2,000 invoices platform-wide there was an 89% chance of a clash, and
    # each clash surfaced to an accountant as a failed invoice. There is no
    # fallback now — a number we cannot guarantee is unique is worse than an
    # error the caller can retry.
    if not data.get("invoice_number"):
        res = await db.execute(
            text("SELECT public.next_invoice_number(CAST(:school_id AS uuid))"),
            {"school_id": str(current_user.school_id)},
        )
        number = res.scalar()
        if not number:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not allocate an invoice number. Please retry.",
            )
        data["invoice_number"] = number

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
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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
async def cancel_voucher(
    voucher_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    reason: str = Query(..., min_length=3, description="Why this voucher is being cancelled"),
):
    """
    Cancel one voucher, with the reason kept on the invoice.

    Three things used to be missing: the id alone was enough, so any signed-in
    user of any school could cancel any invoice; no role was required; and a
    voucher money had already been received against could be cancelled without
    a word, leaving a payment attached to nothing. The reason is now recorded
    because the usual use of this endpoint is undoing a double billing, and
    the school's books have to show which copy went and why.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot cancel a voucher")

    result = await db.execute(
        select(FeeVoucher).where(
            FeeVoucher.id == voucher_id,
            FeeVoucher.school_id == current_user.school_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise NotFoundError("Voucher", str(voucher_id))

    if money(voucher.paid_amount) > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{voucher.invoice_number} has {money(voucher.paid_amount)} paid against it. "
                "Refund or move that payment first; cancelling would leave it attached to nothing."
            ),
        )

    stamp = datetime.now(_PK_TZ).strftime("%Y-%m-%d")
    voucher.notes = "\n".join(
        part for part in [voucher.notes, f"Cancelled {stamp} by {current_user.email or current_user.id}: {reason.strip()}"] if part
    )
    voucher.status = "cancelled"  # type: ignore[assignment]
    await db.flush()
    await db.refresh(voucher)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:finance-trend*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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

    # Every payment in the school went to any signed-in account. Finance
    # staff see the school's; a family sees its own children's.
    query = select(FeePayment).where(FeePayment.school_id == current_user.school_id)
    effective_roles = expand_roles(current_user.roles or [])
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        if set(effective_roles) - {"parent", "student"}:
            raise ForbiddenError("Payments are for the school's finance staff.")
        from app.utils.security import get_allowed_student_ids
        own = await get_allowed_student_ids(current_user, db) or []
        if not own:
            return PaginatedResponse.create([], 0, page, page_size)
        query = query.where(FeePayment.student_id.in_(own))
    if current_user.campus_id:
        try:
            query = query.where(FeePayment.campus_id == UUID(current_user.campus_id))
        except (ValueError, TypeError):
            pass
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

    # Apply the payment to the invoice.
    #
    # Two bugs lived here. The balance was never updated at all, and the status
    # was set to "paid" unconditionally — so a parent paying Rs 500 against a
    # Rs 5,000 invoice marked the whole thing settled.
    #
    # SELECT ... FOR UPDATE because this is a read-modify-write on money: two
    # payments arriving together would otherwise both read the same
    # paid_amount and the second would overwrite the first, losing a payment.
    if body.voucher_id:
        v_result = await db.execute(
            select(FeeVoucher)
            .where(FeeVoucher.id == body.voucher_id)
            .with_for_update()
        )
        voucher = v_result.scalar_one_or_none()
        if voucher:
            verify_resource_belongs_to_school(voucher, current_user, resource_name="invoice")
            paid = money(D(voucher.paid_amount) + D(body.amount))
            voucher.paid_amount = paid
            voucher.status = "paid" if is_settled(paid, voucher.total_amount) else "partial"

    await db.flush()
    await db.refresh(payment)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*finance:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:finance-trend*")
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["finance"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)

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
    effective_roles = expand_roles(current_user.roles or [])
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("The school's financial summary is for its finance staff.")

    if current_user.campus_id and not campus_id:
        try:
            campus_id = UUID(current_user.campus_id)
        except (ValueError, TypeError):
            pass

    params = {"school_id": current_user.school_id}
    conditions = "school_id = :school_id"
    if campus_id:
        conditions += " AND (campus_id = :campus_id OR student_id IN (SELECT id FROM students WHERE campus_id = :campus_id))"
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


# ─── COLLECTION BOARD ────────────────────────────────────────────────────────
#
# What the Fees Centre overview reads. ``/reports/summary`` could not answer it:
# it called an invoice "collected" when its status said paid, so a half-paid
# invoice counted as nothing and a fully paid one whose status was never
# updated counted as nothing either, and it returned floats. Here money comes
# from the payments that were actually received, arithmetic stays in NUMERIC,
# and every amount leaves as a string so no float ever touches it.

#: An invoice that was cancelled, or still a draft, is not money anyone owes.
LIVE_INVOICE_STATUSES = ("pending", "partial", "paid", "overdue")

#: Only a payment that succeeded is money in hand.
COLLECTED_PAYMENT_STATUS = "success"

#: Karachi is UTC+5 all year. Written as an interval rather than a named zone
#: because the embedded Postgres the tests run against carries no tzdata.
_PKT_SHIFT = "INTERVAL '5 hours'"


def _amount(value) -> str:
    """A money column as an exact string, never a float."""
    return str(money(value))


def _period_bounds(from_date: Optional[str], to_date: Optional[str]) -> tuple[date, date]:
    """The requested period, defaulting to the current month in Karachi time."""
    today = datetime.now(_PK_TZ).date()
    start = date(today.year, today.month, 1)
    try:
        if from_date:
            start = date.fromisoformat(from_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="from_date must be YYYY-MM-DD")
    end = today
    try:
        if to_date:
            end = date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="to_date must be YYYY-MM-DD")
    if end < start:
        raise HTTPException(status_code=400, detail="to_date cannot be before from_date")
    return start, end


#: How the reminder ladder steps up with the age of the debt. One place, so the
#: board a user reads and the notice the system raises cannot disagree.
ESCALATION_LADDER = (
    (90, 4, "suspension_warning"),
    (60, 3, "final_notice"),
    (30, 2, "warning"),
    (0, 1, "reminder"),
)


def _escalation_step(overdue_days: int) -> tuple[int, str]:
    """The level and kind of notice an invoice this old has earned."""
    for threshold, level, kind in ESCALATION_LADDER:
        if overdue_days > threshold:
            return level, kind
    return 1, "reminder"


def _aging_bucket(overdue_days: int) -> str:
    """The bucket the collection board shows this debt in."""
    if overdue_days <= 0:
        return "not_due"
    if overdue_days <= 30:
        return "0_30"
    if overdue_days <= 60:
        return "31_60"
    if overdue_days <= 90:
        return "61_90"
    return "90_plus"


@router.get("/collection-board")
async def collection_board(
    current_user: CurrentUser,
    db: DbSession,
    from_date: Optional[str] = Query(None, description="Period start, YYYY-MM-DD. Defaults to the 1st of this month."),
    to_date: Optional[str] = Query(None, description="Period end, YYYY-MM-DD. Defaults to today."),
    campus_id: Optional[UUID] = Query(None),
    limit_defaulters: int = Query(10, ge=1, le=100),
):
    """
    One read for the Fees Centre overview: what was billed for the period, what
    was actually collected in it, what is still owed as of today, how old that
    debt is, which classes are behind and which families owe the most.

    Amounts are strings of an exact NUMERIC. A percentage is null when there is
    nothing to divide by - not zero, because "no invoices" is not "0% collected".
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")

    if current_user.campus_id and not campus_id:
        try:
            campus_id = UUID(current_user.campus_id)
        except (ValueError, TypeError):
            pass

    start, end = _period_bounds(from_date, to_date)
    params: dict = {
        "sid": str(current_user.school_id),
        "start": start,
        "end": end,
        "live": list(LIVE_INVOICE_STATUSES),
        "paid_status": COLLECTED_PAYMENT_STATUS,
    }
    inv_campus = ""
    pay_campus = ""
    if campus_id:
        params["campus"] = str(campus_id)
        inv_campus = " AND i.campus_id = CAST(:campus AS UUID)"
        pay_campus = " AND p.campus_id = CAST(:campus AS UUID)"

    currency_row = (
        await db.execute(
            text("SELECT currency FROM fee_settings WHERE school_id = CAST(:sid AS UUID) LIMIT 1"),
            {"sid": params["sid"]},
        )
    ).fetchone()
    currency = (currency_row[0] if currency_row and currency_row[0] else "PKR")

    # ── Billed in the period, by invoice status ──────────────────────────────
    billed_row = (
        await db.execute(
            text(f"""
                SELECT
                    COUNT(*)                                             AS invoices,
                    COALESCE(SUM(i.total_amount), 0)                     AS billed,
                    COALESCE(SUM(i.discount_amount + i.sibling_discount_amount
                                 + i.merit_discount_amount + i.waiver), 0) AS concessions,
                    COUNT(*) FILTER (WHERE i.status = 'paid')            AS paid,
                    COUNT(*) FILTER (WHERE i.status = 'partial')         AS partial,
                    COUNT(*) FILTER (WHERE i.status = 'pending')         AS pending,
                    COUNT(*) FILTER (WHERE i.status = 'overdue')         AS overdue
                FROM fee_invoices i
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                  AND i.due_date BETWEEN :start AND :end
                  {inv_campus}
            """),
            params,
        )
    ).fetchone()

    # ── Collected in the period, from payments actually received ─────────────
    collected_row = (
        await db.execute(
            text(f"""
                SELECT COALESCE(SUM(p.amount), 0) AS collected, COUNT(*) AS payments
                FROM fee_payments p
                WHERE p.school_id = CAST(:sid AS UUID)
                  AND p.status = CAST(:paid_status AS fee_payment_status)
                  AND (p.paid_at AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date BETWEEN :start AND :end
                  {pay_campus}
            """),
            params,
        )
    ).fetchone()

    today_row = (
        await db.execute(
            text(f"""
                SELECT COALESCE(SUM(p.amount), 0)
                FROM fee_payments p
                WHERE p.school_id = CAST(:sid AS UUID)
                  AND p.status = CAST(:paid_status AS fee_payment_status)
                  AND (p.paid_at AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date
                      = (now() AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date
                  {pay_campus}
            """),
            params,
        )
    ).fetchone()

    method_rows = (
        await db.execute(
            text(f"""
                SELECT p.method::text, COALESCE(SUM(p.amount), 0), COUNT(*)
                FROM fee_payments p
                WHERE p.school_id = CAST(:sid AS UUID)
                  AND p.status = CAST(:paid_status AS fee_payment_status)
                  AND (p.paid_at AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date BETWEEN :start AND :end
                  {pay_campus}
                GROUP BY p.method
                ORDER BY 2 DESC
            """),
            params,
        )
    ).fetchall()

    daily_rows = (
        await db.execute(
            text(f"""
                SELECT (p.paid_at AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date AS day,
                       COALESCE(SUM(p.amount), 0)
                FROM fee_payments p
                WHERE p.school_id = CAST(:sid AS UUID)
                  AND p.status = CAST(:paid_status AS fee_payment_status)
                  AND (p.paid_at AT TIME ZONE 'UTC' + {_PKT_SHIFT})::date BETWEEN :start AND :end
                  {pay_campus}
                GROUP BY day
                ORDER BY day
            """),
            params,
        )
    ).fetchall()

    # ── The position as of today: what is still owed, and how old it is ──────
    aging_row = (
        await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0)), 0)   AS outstanding,
                    COALESCE(SUM(GREATEST(i.paid_amount - i.total_amount, 0)), 0)   AS advance,
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0))
                             FILTER (WHERE i.due_date >= CURRENT_DATE), 0)          AS not_due,
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0))
                             FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 0 AND 30), 0)  AS d30,
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0))
                             FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 31 AND 60), 0) AS d60,
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0))
                             FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 61 AND 90), 0) AS d90,
                    COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0))
                             FILTER (WHERE CURRENT_DATE - i.due_date > 90), 0)      AS d90plus,
                    COUNT(*) FILTER (WHERE i.total_amount > i.paid_amount
                                       AND i.due_date < CURRENT_DATE)               AS overdue_invoices
                FROM fee_invoices i
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                  {inv_campus}
            """),
            params,
        )
    ).fetchone()

    # ── Class by class, over the period ──────────────────────────────────────
    class_rows = (
        await db.execute(
            text(f"""
                SELECT c.id::text, c.name, cs.name,
                       COALESCE(SUM(i.total_amount), 0),
                       COALESCE(SUM(i.paid_amount), 0),
                       COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0)), 0),
                       COUNT(DISTINCT i.student_id)
                FROM fee_invoices i
                JOIN students s ON s.id = i.student_id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON cs.id = se.class_section_id
                LEFT JOIN academic_classes c ON c.id = cs.class_id
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                  AND i.due_date BETWEEN :start AND :end
                  {inv_campus}
                GROUP BY c.id, c.name, cs.name
                ORDER BY 6 DESC, c.name
            """),
            params,
        )
    ).fetchall()

    # ── Who owes the most, as of today ───────────────────────────────────────
    params["limit"] = limit_defaulters
    defaulter_rows = (
        await db.execute(
            text(f"""
                SELECT s.id::text,
                       TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))),
                       COALESCE(s.student_code, s.registration_number, s.roll_number),
                       c.name, cs.name,
                       COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0)), 0),
                       MIN(i.due_date) FILTER (WHERE i.total_amount > i.paid_amount),
                       COUNT(*) FILTER (WHERE i.total_amount > i.paid_amount)
                FROM fee_invoices i
                JOIN students s ON s.id = i.student_id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON cs.id = se.class_section_id
                LEFT JOIN academic_classes c ON c.id = cs.class_id
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                  AND i.total_amount > i.paid_amount
                  {inv_campus}
                GROUP BY s.id, s.first_name, s.last_name, s.student_code, s.registration_number, s.roll_number, c.name, cs.name
                HAVING SUM(GREATEST(i.total_amount - i.paid_amount, 0)) > 0
                ORDER BY 6 DESC
                LIMIT :limit
            """),
            params,
        )
    ).fetchall()

    billed = money(billed_row[1] if billed_row else 0)
    collected = money(collected_row[0] if collected_row else 0)
    today_pkt = datetime.now(_PK_TZ).date()

    return {
        "currency": currency,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "period": {"from": start.isoformat(), "to": end.isoformat()},
        "billed": _amount(billed),
        "concessions": _amount(billed_row[2] if billed_row else 0),
        "collected": _amount(collected),
        "collected_today": _amount(today_row[0] if today_row else 0),
        # Against what the period billed. None when nothing was billed - there
        # is no rate to state, and 0% would be a lie.
        "collection_rate": (str(percentage(collected, billed)) if billed > 0 else None),
        "payments": int(collected_row[1] if collected_row else 0),
        "invoices": {
            "total": int(billed_row[0] if billed_row else 0),
            "paid": int(billed_row[3] if billed_row else 0),
            "partial": int(billed_row[4] if billed_row else 0),
            "pending": int(billed_row[5] if billed_row else 0),
            "overdue": int(billed_row[6] if billed_row else 0),
        },
        "outstanding": _amount(aging_row[0] if aging_row else 0),
        "advance": _amount(aging_row[1] if aging_row else 0),
        "overdue_invoices": int(aging_row[7] if aging_row else 0),
        "aging": [
            {"bucket": "not_due", "label": "Not due yet", "amount": _amount(aging_row[2] if aging_row else 0)},
            {"bucket": "0_30", "label": "1-30 days", "amount": _amount(aging_row[3] if aging_row else 0)},
            {"bucket": "31_60", "label": "31-60 days", "amount": _amount(aging_row[4] if aging_row else 0)},
            {"bucket": "61_90", "label": "61-90 days", "amount": _amount(aging_row[5] if aging_row else 0)},
            {"bucket": "90_plus", "label": "Over 90 days", "amount": _amount(aging_row[6] if aging_row else 0)},
        ],
        "by_method": [
            {"method": r[0], "amount": _amount(r[1]), "count": int(r[2])} for r in method_rows
        ],
        "daily": [
            {"date": r[0].isoformat(), "collected": _amount(r[1])} for r in daily_rows
        ],
        "by_class": [
            {
                "class_id": r[0],
                "class_name": r[1],
                "section_name": r[2],
                "billed": _amount(r[3]),
                "collected": _amount(r[4]),
                "outstanding": _amount(r[5]),
                "students": int(r[6]),
                "collection_rate": (str(percentage(r[4], r[3])) if money(r[3]) > 0 else None),
            }
            for r in class_rows
        ],
        "top_defaulters": [
            {
                "student_id": r[0],
                "name": r[1] or "Unnamed student",
                "student_code": r[2],
                "class_name": r[3],
                "section_name": r[4],
                "outstanding": _amount(r[5]),
                "oldest_due_date": r[6].isoformat() if r[6] else None,
                "days_overdue": (today_pkt - r[6]).days if r[6] and r[6] < today_pkt else 0,
                "unpaid_invoices": int(r[7]),
            }
            for r in defaulter_rows
        ],
    }



@router.get("/defaulters")
async def list_defaulters(
    current_user: CurrentUser,
    db: DbSession,
    bucket: Optional[str] = Query(None, description="not_due | 0_30 | 31_60 | 61_90 | 90_plus"),
    class_section_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None, description="Name or student code"),
    min_amount: Optional[str] = Query(None, description="Only balances at or above this"),
    campus_id: Optional[UUID] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Every family that owes money, oldest debt first, with what the office needs
    to chase it: the balance, how old it is, how to reach the parent, when they
    last paid, and which notice has already gone out.

    One row per student, not per invoice - a parent with four unpaid months is
    one conversation, not four.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")

    if current_user.campus_id and not campus_id:
        try:
            campus_id = UUID(current_user.campus_id)
        except (ValueError, TypeError):
            pass

    if bucket and bucket not in {"not_due", "0_30", "31_60", "61_90", "90_plus"}:
        raise HTTPException(status_code=400, detail="Unknown aging bucket")

    params: dict = {
        "sid": str(current_user.school_id),
        "live": list(LIVE_INVOICE_STATUSES),
        "limit": limit,
        "offset": offset,
    }
    where = ""
    if campus_id:
        params["campus"] = str(campus_id)
        where += " AND i.campus_id = CAST(:campus AS UUID)"
    if class_section_id:
        params["section"] = str(class_section_id)
        where += " AND se.class_section_id = CAST(:section AS UUID)"
    if search:
        params["q"] = f"%{search.strip()}%"
        where += (
            " AND (s.first_name ILIKE :q OR s.last_name ILIKE :q"
            " OR s.student_code ILIKE :q OR s.registration_number ILIKE :q)"
        )

    having = ""
    if min_amount:
        try:
            params["min_amount"] = money(min_amount)
        except Exception:
            raise HTTPException(status_code=400, detail="min_amount must be a number")
        having = " AND SUM(GREATEST(i.total_amount - i.paid_amount, 0)) >= :min_amount"

    rows = (
        await db.execute(
            text(f"""
                SELECT s.id::text,
                       TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) AS name,
                       COALESCE(s.student_code, s.registration_number, s.roll_number) AS code,
                       c.name AS class_name, cs.name AS section_name,
                       s.parent_name, s.parent_phone, s.parent_email, s.phone,
                       COALESCE(SUM(GREATEST(i.total_amount - i.paid_amount, 0)), 0) AS outstanding,
                       COUNT(*) FILTER (WHERE i.total_amount > i.paid_amount) AS unpaid_invoices,
                       MIN(i.due_date) FILTER (WHERE i.total_amount > i.paid_amount) AS oldest_due,
                       -- Subqueries, not joins. Joining fee_payments multiplied
                       -- every invoice row by that student's payments, so the
                       -- balance came out two or three times too large.
                       (SELECT MAX(p.paid_at) FROM fee_payments p
                         WHERE p.student_id = s.id
                           AND p.school_id = CAST(:sid AS UUID)
                           AND p.status = 'success') AS last_payment_at,
                       (SELECT MAX(e.escalation_level) FROM fee_escalations e
                         WHERE e.student_id = s.id
                           AND e.school_id = CAST(:sid AS UUID)
                           AND e.resolved = FALSE) AS notice_level,
                       (SELECT MAX(e.created_at) FROM fee_escalations e
                         WHERE e.student_id = s.id
                           AND e.school_id = CAST(:sid AS UUID)
                           AND e.resolved = FALSE) AS notice_sent_at
                FROM fee_invoices i
                JOIN students s ON s.id = i.student_id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON cs.id = se.class_section_id
                LEFT JOIN academic_classes c ON c.id = cs.class_id
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                  AND i.total_amount > i.paid_amount
                  {where}
                GROUP BY s.id, s.first_name, s.last_name, s.student_code, s.registration_number,
                         s.roll_number, c.name, cs.name, s.parent_name, s.parent_phone,
                         s.parent_email, s.phone
                HAVING SUM(GREATEST(i.total_amount - i.paid_amount, 0)) > 0 {having}
                ORDER BY MIN(i.due_date) FILTER (WHERE i.total_amount > i.paid_amount) ASC NULLS LAST
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
    ).fetchall()

    today = datetime.now(_PK_TZ).date()
    out = []
    for r in rows:
        oldest = r[11]
        overdue_days = (today - oldest).days if oldest else 0
        row_bucket = _aging_bucket(overdue_days)
        if bucket and row_bucket != bucket:
            continue
        level, kind = _escalation_step(overdue_days) if overdue_days > 0 else (0, "none")
        out.append(
            {
                "student_id": r[0],
                "name": r[1] or "Unnamed student",
                "student_code": r[2],
                "class_name": r[3],
                "section_name": r[4],
                "parent_name": r[5],
                "parent_phone": r[6],
                "parent_email": r[7],
                "student_phone": r[8],
                "outstanding": str(money(r[9])),
                "unpaid_invoices": int(r[10]),
                "oldest_due_date": oldest.isoformat() if oldest else None,
                "days_overdue": max(0, overdue_days),
                "bucket": row_bucket,
                "last_payment_at": r[12].isoformat() if r[12] else None,
                # What the ladder says this debt has earned, and what has in
                # fact gone out. They differ when nobody ran the check.
                "due_level": level,
                "due_notice": kind,
                "notice_level": int(r[13]) if r[13] is not None else 0,
                "notice_sent_at": r[14].isoformat() if r[14] else None,
            }
        )

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
        "limit": limit,
        "offset": offset,
        "defaulters": out,
    }



@router.get("/duplicate-invoices")
async def list_duplicate_invoices(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
):
    """
    Periods a student was billed for more than once.

    Until the duplicate guard went in, re-running a class billing issued a
    second full invoice to everyone in it, and both copies counted as money
    owed. Nothing is cancelled here: which copy goes is the school's decision,
    so the office is shown the pairs and cancels one with a reason.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read finance data")

    rows = (
        await db.execute(
            text("""
                WITH duplicated AS (
                    SELECT student_id, fee_plan_id, COALESCE(period_label, '') AS period
                      FROM fee_invoices
                     WHERE school_id = CAST(:sid AS UUID)
                       AND status = ANY(CAST(:live AS fee_invoice_status[]))
                     GROUP BY student_id, fee_plan_id, COALESCE(period_label, '')
                    HAVING COUNT(*) > 1
                )
                SELECT i.id::text, i.invoice_number, i.student_id::text,
                       TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) AS student_name,
                       COALESCE(i.period_label, '') AS period,
                       i.fee_plan_id::text, fp.name AS plan_name,
                       i.due_date, i.total_amount, i.paid_amount, i.status::text, i.created_at
                  FROM fee_invoices i
                  JOIN duplicated d
                    ON d.student_id = i.student_id
                   AND d.fee_plan_id IS NOT DISTINCT FROM i.fee_plan_id
                   AND d.period = COALESCE(i.period_label, '')
                  JOIN students s ON s.id = i.student_id
             LEFT JOIN fee_plans fp ON fp.id = i.fee_plan_id
                 WHERE i.school_id = CAST(:sid AS UUID)
                   AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                 ORDER BY s.first_name, period, i.created_at
                 LIMIT :limit
            """),
            {"sid": str(current_user.school_id), "live": list(LIVE_INVOICE_STATUSES), "limit": limit * 4},
        )
    ).fetchall()

    groups: dict[tuple, dict] = {}
    for r in rows:
        key = (r[2], r[5], r[4])
        group = groups.setdefault(
            key,
            {
                "student_id": r[2],
                "student_name": r[3] or "Unnamed student",
                "period": r[4] or "(no period)",
                "plan_name": r[6],
                "invoices": [],
                "duplicated_amount": "0.00",
            },
        )
        group["invoices"].append(
            {
                "id": r[0],
                "invoice_number": r[1],
                "due_date": r[7].isoformat() if r[7] else None,
                "total_amount": str(money(r[8])),
                "paid_amount": str(money(r[9])),
                # The extra copies can only be cancelled while nothing has been
                # paid against them.
                "cancellable": money(r[9]) == 0,
                "status": r[10],
                "created_at": r[11].isoformat() if r[11] else None,
            }
        )

    out = []
    for group in list(groups.values())[:limit]:
        extra = sum(money(inv["total_amount"]) for inv in group["invoices"][1:])
        group["duplicated_amount"] = str(money(extra))
        out.append(group)

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
        "groups": out,
    }


from uuid import uuid4

# ─── SALARY BUDGET (the accountant's forecast) ───────────────────────────────
#
# These answered for whatever school the caller named, to any signed-in
# account, and deleted any target by id. When the database failed they
# served a JSON file shipped with the code (older figures than the database
# holds) or three invented salaries for made-up staff, and reported a save
# that never reached the database as done. Now: finance and HR staff of the
# school, their own school only, and a failure is reported as a failure.

SALARY_VIEWERS = {*FINANCE_GOV, "hr_manager"}


def _salary_school(current_user, school_id: Optional[UUID]) -> UUID:
    roles = expand_roles(current_user.roles or [])
    if not (current_user.is_super_admin or any(r in roles for r in SALARY_VIEWERS)):
        raise ForbiddenError("Salary budgets are for the school's finance and HR staff.")
    own = UUID(str(current_user.school_id)) if current_user.school_id else None
    if school_id and not current_user.is_super_admin and school_id != own:
        raise ForbiddenError("You can only see your own school's salary budget.")
    target = school_id or own
    if not target:
        raise ForbiddenError("No school context")
    return target


def _unavailable(what: str, e: Exception) -> HTTPException:
    logger.error(f"Salary budget: {what} failed: {e}")
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                         detail=f"Could not {what}. Nothing was changed; please try again.")


@router.get("/budget-targets")
async def get_budget_targets(
    current_user: CurrentUser,
    db: DbSession,
    school_id: Optional[UUID] = Query(None),
    year: Optional[int] = Query(None),
):
    target_sid = _salary_school(current_user, school_id)
    target_year = year or datetime.now(timezone.utc).year
    try:
        res = await db.execute(
            text("SELECT id, fiscal_year, department, role, budget_amount, notes FROM salary_budget_targets"
                 " WHERE school_id = :sid AND fiscal_year = :year ORDER BY role ASC"),
            {"sid": str(target_sid), "year": target_year},
        )
        rows = res.fetchall()
    except Exception as e:
        raise _unavailable("load the budget targets", e)
    return [
        {
            "id": str(r[0]),
            "fiscal_year": r[1],
            "department": r[2],
            "role": r[3],
            "budget_amount": float(money(r[4])) if r[4] is not None else None,
            "notes": r[5],
        }
        for r in rows
    ]


@router.post("/budget-targets")
async def create_or_update_budget_target(body: dict, current_user: CurrentUser, db: DbSession):
    raw_school = body.get("school_id")
    try:
        school_id = UUID(str(raw_school)) if raw_school else None
    except ValueError:
        raise HTTPException(status_code=400, detail="school_id is not a valid id")
    school_id = _salary_school(current_user, school_id)
    target_id = body.get("id")
    fiscal_year = body.get("fiscal_year")
    role = body.get("role") or None
    department = body.get("department") or None
    notes = body.get("notes") or None
    if not fiscal_year or body.get("budget_amount") in (None, ""):
        raise HTTPException(status_code=400, detail="Missing required budget parameters")
    try:
        amount = money(body.get("budget_amount"))
    except Exception:
        raise HTTPException(status_code=400, detail="budget_amount is not a number")
    if amount < 0:
        raise HTTPException(status_code=400, detail="budget_amount cannot be negative")

    params = {"id": str(target_id or uuid4()), "sid": str(school_id), "year": fiscal_year,
              "role": role, "dept": department, "amount": amount, "notes": notes}
    try:
        if target_id:
            res = await db.execute(
                text("UPDATE salary_budget_targets SET role = :role, department = :dept,"
                     " budget_amount = :amount, notes = :notes WHERE id = CAST(:id AS uuid) AND school_id = CAST(:sid AS uuid)"),
                params,
            )
            if not res.rowcount:
                raise NotFoundError("Budget target", str(target_id))
        else:
            await db.execute(
                text("INSERT INTO salary_budget_targets (id, school_id, fiscal_year, role, department, budget_amount, notes)"
                     " VALUES (CAST(:id AS uuid), CAST(:sid AS uuid), :year, :role, :dept, :amount, :notes)"),
                params,
            )
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise _unavailable("save the budget target", e)
    return {"id": params["id"], "school_id": str(school_id), "fiscal_year": fiscal_year, "role": role,
            "department": department, "budget_amount": float(amount), "notes": notes}


@router.delete("/budget-targets/{target_id}")
async def delete_budget_target(target_id: UUID, current_user: CurrentUser, db: DbSession):
    school_id = _salary_school(current_user, None)
    try:
        res = await db.execute(
            text("DELETE FROM salary_budget_targets WHERE id = :id AND school_id = CAST(:sid AS uuid)"),
            {"id": str(target_id), "sid": str(school_id)},
        )
        if not res.rowcount:
            raise NotFoundError("Budget target", str(target_id))
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise _unavailable("delete the budget target", e)
    return {"message": "Budget target deleted"}


@router.get("/salary-records")
async def get_salary_records(
    current_user: CurrentUser,
    db: DbSession,
    school_id: Optional[UUID] = Query(None),
):
    target_sid = _salary_school(current_user, school_id)
    sql = ("SELECT id, user_id, base_salary, allowances, deductions, is_active FROM hr_salary_records"
           " WHERE school_id = :sid AND is_active = true")
    params = {"sid": str(target_sid)}
    if current_user.campus_id:
        sql += " AND user_id IN (SELECT user_id FROM user_roles WHERE school_id = :sid AND campus_id = :campus_id)"
        params["campus_id"] = current_user.campus_id
    try:
        rows = (await db.execute(text(sql), params)).fetchall()
    except Exception as e:
        raise _unavailable("load the salary records", e)
    return [
        {
            "id": str(r[0]),
            "user_id": str(r[1]),
            "base_salary": float(money(r[2])) if r[2] is not None else None,
            "allowances": float(money(r[3])) if r[3] is not None else None,
            "deductions": float(money(r[4])) if r[4] is not None else None,
            "is_active": r[5],
        }
        for r in rows
    ]


@router.get("/staff-roles")
async def get_staff_roles(
    current_user: CurrentUser,
    db: DbSession,
    school_id: Optional[UUID] = Query(None),
):
    target_sid = _salary_school(current_user, school_id)
    sql = "SELECT user_id, role FROM user_roles WHERE school_id = :sid"
    params = {"sid": str(target_sid)}
    if current_user.campus_id:
        sql += " AND campus_id = :campus_id"
        params["campus_id"] = current_user.campus_id
    try:
        rows = (await db.execute(text(sql), params)).fetchall()
    except Exception as e:
        raise _unavailable("load the staff roles", e)
    return [{"user_id": str(r[0]), "role": r[1]} for r in rows]


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
async def list_sibling_discounts(current_user: CurrentUser, db: DbSession, page: ListPageParams):
    if not current_user.school_id:
        return []
    result = await db.execute(
        page.apply(select(SiblingDiscount)
        .where(SiblingDiscount.school_id == current_user.school_id)
        .order_by(SiblingDiscount.sibling_number))
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
    """
    Issue the annual certificate of fees paid for one student.

    A family can request one for their own child and the finance office for
    any student of the school. The fiscal year is Pakistan's, 1 July to 30
    June: "2025-2026" covers payments received from 1 July 2025 up to and
    including 30 June 2026. Only payments that succeeded count, and the total
    is summed exactly. Asking again for a year whose total has not changed
    returns the certificate already issued instead of a second one.
    """
    start_year, end_year = _fiscal_year_bounds(body.fiscal_year)
    await _require_student_fee_access(current_user, db, body.student_id)

    period_start = datetime(start_year, 7, 1, tzinfo=_PK_TZ)
    period_end = datetime(end_year, 7, 1, tzinfo=_PK_TZ)
    rows = (
        await db.execute(
            select(FeePayment, FeeVoucher.invoice_number, FeeVoucher.period_label)
            .join(FeeVoucher, FeeVoucher.id == FeePayment.invoice_id, isouter=True)
            .where(
                FeePayment.school_id == current_user.school_id,
                FeePayment.student_id == body.student_id,
                FeePayment.status.in_(PAID_PAYMENT_STATUSES),
                FeePayment.paid_at >= period_start,
                FeePayment.paid_at < period_end,
            )
            .order_by(FeePayment.paid_at, FeePayment.id)
        )
    ).all()

    total = money(0)
    details = []
    for payment, invoice_number, period_label in rows:
        amount = money(payment.amount)
        total += amount
        details.append({
            "date": payment.paid_at.astimezone(_PK_TZ).date().isoformat(),
            "amount": str(amount),
            "method": payment.method,
            "ref": payment.transaction_ref,
            "invoice_number": invoice_number,
            "period": period_label,
        })

    fiscal_year = f"{start_year}-{end_year}"
    existing = (
        await db.execute(
            select(TaxCertificate)
            .where(
                TaxCertificate.school_id == current_user.school_id,
                TaxCertificate.student_id == body.student_id,
                TaxCertificate.fiscal_year == fiscal_year,
            )
            .order_by(TaxCertificate.generated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None and money(existing.total_fees_paid) == total and len(existing.payment_details or []) == len(details):
        return existing

    # Only the finance office states the school's tax number; a family cannot.
    effective = expand_roles(current_user.roles)
    school_ntn = body.school_ntn if (current_user.is_super_admin or any(r in effective for r in FINANCE_GOV)) else None

    cert = TaxCertificate(
        school_id=current_user.school_id,
        student_id=body.student_id,
        parent_user_id=current_user.id,
        fiscal_year=fiscal_year,
        certificate_number=f"FTC-{start_year}{end_year % 100:02d}-{secrets.token_hex(3).upper()}",
        total_fees_paid=total,
        # Fee payments are not split by component, so no breakdown is claimed.
        total_tuition=total,
        total_other_charges=money(0),
        school_ntn=school_ntn or (existing.school_ntn if existing is not None else None),
        payment_details=details,
    )
    db.add(cert)
    await db.flush()
    await db.refresh(cert)
    return cert


@router.get("/tax-certificates/{student_id}", response_model=List[TaxCertificateOut])
async def get_tax_certificates(student_id: UUID, current_user: CurrentUser, db: DbSession, page: ListPageParams):
    await _require_student_fee_access(current_user, db, student_id)
    result = await db.execute(
        page.apply(select(TaxCertificate).where(
            TaxCertificate.school_id == current_user.school_id,
            TaxCertificate.student_id == student_id,
        ).order_by(TaxCertificate.fiscal_year.desc(), TaxCertificate.generated_at.desc()))
    )
    return result.scalars().all()


_PK_TZ = ZoneInfo("Asia/Karachi")
# Payment statuses that mean the money was received.
PAID_PAYMENT_STATUSES = ("success", "completed", "paid")


def _fiscal_year_bounds(value: str) -> tuple:
    """'2025-2026' -> (2025, 2026). Anything else is rejected, not guessed at."""
    parts = (value or "").strip().split("-")
    try:
        start, end = int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        raise HTTPException(status_code=422, detail="Fiscal year must look like 2025-2026")
    if len(parts) != 2 or end != start + 1 or not 2000 <= start <= 2100:
        raise HTTPException(status_code=422, detail="Fiscal year must look like 2025-2026")
    return start, end


async def _require_student_fee_access(current_user, db, student_id: UUID) -> None:
    """The finance office for any student of the school; a family for its own.

    Used by the tax certificate and by the student's fee ledger, which is why
    it is not named after either.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective for r in FINANCE_GOV)):
        allowed = await get_allowed_student_ids(current_user, db)
        if allowed is None or student_id not in {UUID(str(s)) for s in allowed}:
            raise ForbiddenError("You can only see certificates for your own children")
    found = await db.execute(
        text("SELECT 1 FROM students WHERE id = CAST(:sid AS UUID) AND school_id = CAST(:school AS UUID)"),
        {"sid": str(student_id), "school": str(current_user.school_id)},
    )
    if found.first() is None:
        raise NotFoundError("Student", str(student_id))


# ─── FEE ESCALATION ──────────────────────────────────────────────────────────

@router.post("/escalations/check", response_model=MessageResponse)
async def check_escalations(current_user: CurrentUser, db: DbSession):
    """
    Raise the reminder ladder for every invoice that is genuinely overdue, and
    close the ladder for any that has since been settled.

    It used to select ``status in ("unpaid", "partial")``. "unpaid" is not one
    of this column's values - the enum is draft/pending/partial/paid/overdue/
    cancelled - so Postgres rejected the query and the endpoint raised on every
    call. It then read ``v.amount``, which the model does not map. Nobody was
    ever chased, and the failure was invisible because nothing looked at the
    result.
    """
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot manage fee escalations")

    today = datetime.now(_PK_TZ).date()

    overdue = (
        await db.execute(
            select(FeeVoucher).where(
                FeeVoucher.school_id == current_user.school_id,
                FeeVoucher.status.in_(list(LIVE_INVOICE_STATUSES)),
                FeeVoucher.due_date < today,
                FeeVoucher.total_amount > FeeVoucher.paid_amount,
            )
        )
    ).scalars().all()

    created = 0
    for invoice in overdue:
        overdue_days = (today - invoice.due_date).days
        balance = money(invoice.total_amount) - money(invoice.paid_amount)
        if balance <= 0:
            continue

        level, etype = _escalation_step(overdue_days)

        already = await db.execute(
            select(FeeEscalation).where(
                FeeEscalation.invoice_id == invoice.id,
                FeeEscalation.escalation_level == level,
                FeeEscalation.resolved == False,  # noqa: E712 - SQL, not Python
            )
        )
        if already.scalar_one_or_none():
            continue

        db.add(
            FeeEscalation(
                school_id=current_user.school_id,
                invoice_id=invoice.id,
                student_id=invoice.student_id,
                escalation_level=level,
                escalation_type=etype,
                overdue_days=overdue_days,
                overdue_amount=balance,
                escalated_by=current_user.id,
            )
        )
        created += 1

    # An invoice that has been paid should stop generating notices.
    closed = await db.execute(
        text("""
            UPDATE fee_escalations e
               SET resolved = TRUE,
                   resolved_at = now(),
                   action_taken = COALESCE(e.action_taken, 'Invoice settled')
              FROM fee_invoices i
             WHERE e.invoice_id = i.id
               AND e.school_id = CAST(:sid AS UUID)
               AND e.resolved = FALSE
               AND (i.paid_amount >= i.total_amount OR i.status IN ('paid', 'cancelled'))
            RETURNING e.id
        """),
        {"sid": str(current_user.school_id)},
    )
    settled = len(closed.fetchall())

    await db.flush()
    return MessageResponse(
        message=f"Raised {created} notice(s); closed {settled} for invoices already settled"
    )


@router.get("/escalations", response_model=List[FeeEscalationOut])
async def list_escalations(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams, resolved: Optional[bool] = Query(False),
):
    if not current_user.school_id:
        return []
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot read fee escalations")
    query = select(FeeEscalation).where(FeeEscalation.school_id == current_user.school_id)
    if current_user.campus_id:
        from app.models.people import Student
        try:
            query = query.where(FeeEscalation.student_id.in_(
                select(Student.id).where(Student.campus_id == UUID(current_user.campus_id))
            ))
        except (ValueError, TypeError):
            pass
    if resolved is not None:
        query = query.where(FeeEscalation.resolved == resolved)
    result = await db.execute(page.apply(query.order_by(FeeEscalation.escalation_level.desc(), FeeEscalation.created_at.desc())))
    return result.scalars().all()


@router.patch("/escalations/{escalation_id}/resolve", response_model=MessageResponse)
async def resolve_escalation(escalation_id: UUID, current_user: CurrentUser, db: DbSession):
    from datetime import datetime as dt, timezone as tz

    # Scoped to the caller's school: the id alone used to be enough to resolve
    # another school's notice.
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in FINANCE_GOV)):
        raise ForbiddenError("Permission denied: cannot manage fee escalations")
    result = await db.execute(
        select(FeeEscalation).where(
            FeeEscalation.id == escalation_id,
            FeeEscalation.school_id == current_user.school_id,
        )
    )
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
async def list_gateway_configs(current_user: CurrentUser, db: DbSession, page: ListPageParams):
    if not current_user.school_id:
        return []
    result = await db.execute(
        page.apply(select(PaymentGatewayConfig)
        .where(PaymentGatewayConfig.school_id == current_user.school_id)
        .order_by(PaymentGatewayConfig.is_default.desc(), PaymentGatewayConfig.gateway_name))
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
            text("UPDATE payment_gateway_configs SET is_default = FALSE WHERE school_id = CAST(:sid AS UUID)"),
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
    """
    One student's fee ledger: what was billed, what was paid, what is left.

    It answers both the parent's own screen and the Fees Centre's Student
    Ledger tab.

    Every number it used to return was wrong or unreachable. It summed
    ``FeeVoucher.amount``, which the model does not map, so the request raised;
    it filtered invoices on ``status in ("unpaid", "partial")``, and "unpaid"
    is not a value of that enum; it counted payments with status "completed",
    while payments are recorded as "success"; and it compared a date column
    against a string. The parent screen caught the error and showed zeros.

    Access was school-wide, so any signed-in user of the school could read any
    child's balance. It now uses the same rule as the tax certificate: the
    finance office for any student of the school, a family for its own.
    """
    await _require_student_fee_access(current_user, db, student_id)

    params = {"sid": str(current_user.school_id), "student": str(student_id), "live": list(LIVE_INVOICE_STATUSES)}

    student_row = (
        await db.execute(
            text("""
                SELECT TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))),
                       COALESCE(s.student_code, s.registration_number, s.roll_number),
                       c.name, cs.name
                  FROM students s
             LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
             LEFT JOIN class_sections cs ON cs.id = se.class_section_id
             LEFT JOIN academic_classes c ON c.id = cs.class_id
                 WHERE s.id = CAST(:student AS UUID) AND s.school_id = CAST(:sid AS UUID)
            """),
            params,
        )
    ).fetchone()

    currency_row = (
        await db.execute(
            text("SELECT currency FROM fee_settings WHERE school_id = CAST(:sid AS UUID) LIMIT 1"),
            {"sid": params["sid"]},
        )
    ).fetchone()

    invoice_rows = (
        await db.execute(
            text("""
                SELECT i.id::text, i.invoice_number, i.period_label, i.due_date,
                       i.subtotal, i.discount_amount + i.sibling_discount_amount
                                 + i.merit_discount_amount + i.waiver AS concessions,
                       i.total_amount, i.paid_amount, i.status::text, i.created_at
                  FROM fee_invoices i
                 WHERE i.school_id = CAST(:sid AS UUID)
                   AND i.student_id = CAST(:student AS UUID)
                   AND i.status = ANY(CAST(:live AS fee_invoice_status[]))
                 ORDER BY i.due_date DESC, i.created_at DESC
            """),
            params,
        )
    ).fetchall()

    payment_rows = (
        await db.execute(
            text("""
                SELECT p.id::text, p.amount, p.method::text, p.status::text, p.paid_at,
                       p.transaction_ref, i.invoice_number, p.notes
                  FROM fee_payments p
             LEFT JOIN fee_invoices i ON i.id = p.invoice_id
                 WHERE p.school_id = CAST(:sid AS UUID)
                   AND p.student_id = CAST(:student AS UUID)
                 ORDER BY p.paid_at DESC
                 LIMIT 100
            """),
            params,
        )
    ).fetchall()

    plans = (
        await db.execute(
            select(InstallmentPlan).where(
                InstallmentPlan.school_id == current_user.school_id,
                InstallmentPlan.student_id == student_id,
                InstallmentPlan.status == "active",
            )
        )
    ).scalars().all()

    escalations = (
        await db.execute(
            select(FeeEscalation).where(
                FeeEscalation.school_id == current_user.school_id,
                FeeEscalation.student_id == student_id,
                FeeEscalation.resolved == False,  # noqa: E712 - SQL, not Python
            ).order_by(FeeEscalation.escalation_level.desc())
        )
    ).scalars().all()

    today = datetime.now(_PK_TZ).date()
    billed = money(0)
    collected = money(0)
    outstanding = money(0)
    advance = money(0)
    overdue = money(0)
    unpaid_count = 0
    overdue_count = 0
    invoices = []

    for r in invoice_rows:
        total = money(r[6])
        paid = money(r[7])
        balance = total - paid
        billed += total
        collected += paid
        if balance > 0:
            outstanding += balance
            unpaid_count += 1
            if r[3] and r[3] < today:
                overdue += balance
                overdue_count += 1
        elif balance < 0:
            advance += -balance
        invoices.append(
            {
                "id": r[0],
                "invoice_number": r[1],
                "period_label": r[2],
                "due_date": r[3].isoformat() if r[3] else None,
                "subtotal": str(money(r[4])),
                "concessions": str(money(r[5])),
                "total_amount": str(total),
                "paid_amount": str(paid),
                "balance": str(balance if balance > 0 else money(0)),
                "advance": str(-balance) if balance < 0 else "0.00",
                "status": r[8],
                "days_overdue": (today - r[3]).days if r[3] and r[3] < today and balance > 0 else 0,
                "created_at": r[9].isoformat() if r[9] else None,
            }
        )

    payments = [
        {
            "id": r[0],
            "amount": str(money(r[1])),
            "method": r[2],
            "status": r[3],
            # A payment that failed or was refunded is shown as what it is,
            # rather than quietly dropped from the family's history.
            "counted": r[3] in PAID_PAYMENT_STATUSES,
            "paid_at": r[4].isoformat() if r[4] else None,
            "transaction_ref": r[5],
            "invoice_number": r[6],
            "notes": r[7],
        }
        for r in payment_rows
    ]

    return {
        "currency": (currency_row[0] if currency_row and currency_row[0] else "PKR"),
        "as_of": datetime.now(timezone.utc).isoformat(),
        "student": {
            "id": str(student_id),
            "name": (student_row[0] if student_row else None) or "Unnamed student",
            "student_code": student_row[1] if student_row else None,
            "class_name": student_row[2] if student_row else None,
            "section_name": student_row[3] if student_row else None,
        },
        # The names the parent screen already reads, now carrying real numbers.
        "total_due": str(outstanding),
        "total_paid": str(collected),
        "overdue_amount": str(overdue),
        "active_installment_plans": len(plans),
        "active_escalations": len(escalations),
        "totals": {
            "billed": str(billed),
            "paid": str(collected),
            "outstanding": str(outstanding),
            "advance": str(advance),
            "overdue": str(overdue),
        },
        "counts": {
            "invoices": len(invoices),
            "unpaid": unpaid_count,
            "overdue": overdue_count,
        },
        "invoices": invoices,
        "payments": payments,
        "recent_payments": payments[:10],
        "upcoming_vouchers": [i for i in invoices if i["days_overdue"] == 0 and i["balance"] != "0.00"][:5],
        "escalation_details": [FeeEscalationOut.model_validate(e).model_dump() for e in escalations],
    }


# ─── ADMIN FEE PORTAL: DISCOUNTS, GATEWAYS & ESCALATIONS ──────────────────────

















from pydantic import BaseModel
from fastapi.responses import Response

logger = logging.getLogger("app.routers.finance")


class PaymentProofsExportPayload(BaseModel):
    schoolId: str
    status: Optional[str] = "pending"
    method: Optional[str] = "__all"
    fromDate: Optional[str] = ""
    toDate: Optional[str] = ""
    minAmount: Optional[float] = None
    maxAmount: Optional[float] = None
    search: Optional[str] = ""

@router.post("/export-payment-proofs")
async def export_payment_proofs(
    body: PaymentProofsExportPayload,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.is_super_admin and str(current_user.school_id) != body.schoolId:
        raise ForbiddenError("Access denied to this school's records")

    query_parts = ["SELECT id, school_id, invoice_id, student_id, file_name, amount, paid_at, method, note, status, rejection_reason, created_at FROM fee_payment_proofs WHERE school_id = :school_id"]
    params = {"school_id": UUID(body.schoolId)}

    if body.status and body.status != "__all__":
        query_parts.append("AND status = :status")
        params["status"] = body.status
    if body.method and body.method != "__all__":
        query_parts.append("AND method = :method")
        params["method"] = body.method
    if body.fromDate:
        query_parts.append("AND created_at >= :from_date")
        params["from_date"] = datetime.strptime(f"{body.fromDate} 00:00:00", "%Y-%m-%d %H:%M:%S")
    if body.toDate:
        query_parts.append("AND created_at <= :to_date")
        params["to_date"] = datetime.strptime(f"{body.toDate} 23:59:59", "%Y-%m-%d %H:%M:%S")
    if body.minAmount is not None and body.minAmount != "":
        query_parts.append("AND amount >= :min_amount")
        params["min_amount"] = float(body.minAmount)
    if body.maxAmount is not None and body.maxAmount != "":
        query_parts.append("AND amount <= :max_amount")
        params["max_amount"] = float(body.maxAmount)

    query_str = " ".join(query_parts) + " ORDER BY created_at DESC"
    result = await db.execute(text(query_str), params)
    proofs = [dict(row._mapping) for row in result.fetchall()]

    if not proofs:
        csv_header = "uploaded_at,student,roll_number,invoice_number,method,paid_at,amount,status,rejection_reason,note\n"
        return Response(
            content=csv_header,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=payment-proofs.csv",
                "X-Row-Count": "0",
            }
        )

    student_ids = list({p["student_id"] for p in proofs if p["student_id"]})
    invoice_ids = list({p["invoice_id"] for p in proofs if p["invoice_id"]})

    students = {}
    if student_ids:
        s_res = await db.execute(
            text("SELECT id, first_name, last_name, roll_number FROM students WHERE id IN :ids"),
            {"ids": tuple(student_ids)}
        )
        students = {row.id: row for row in s_res.fetchall()}

    invoices = {}
    if invoice_ids:
        i_res = await db.execute(
            text("SELECT id, invoice_number FROM fee_invoices WHERE id IN :ids"),
            {"ids": tuple(invoice_ids)}
        )
        invoices = {row.id: row for row in i_res.fetchall()}

    search_q = body.search.strip().lower() if body.search else ""
    filtered = []
    for p in proofs:
        s = students.get(p["student_id"])
        inv = invoices.get(p["invoice_id"])

        s_name = f"{s.first_name if s else ''} {s.last_name if s and s.last_name else ''}".strip()
        roll = s.roll_number if s and s.roll_number else ""
        inv_no = inv.invoice_number if inv and inv.invoice_number else ""

        if search_q:
            haystack = f"{s_name} {roll} {inv_no} {p['method'] or ''} {p['note'] or ''} {p['status'] or ''} {p['rejection_reason'] or ''}".lower()
            if search_q not in haystack:
                continue

        filtered.append((p, s_name, roll, inv_no))

    def csv_escape(val):
        s = "" if val is None else str(val)
        if any(c in s for c in ('\n', '\r', '"', ',')):
            escaped_s = s.replace('"', '""')
            return f'"{escaped_s}"'
        return s

    lines = ["uploaded_at,student,roll_number,invoice_number,method,paid_at,amount,status,rejection_reason,note"]
    for p, s_name, roll, inv_no in filtered:
        lines.append(",".join(map(csv_escape, [
            p["created_at"].isoformat() if p["created_at"] else "",
            s_name,
            roll,
            inv_no,
            p["method"] or "",
            p["paid_at"].isoformat() if isinstance(p["paid_at"], (datetime, date)) else (p["paid_at"] or ""),
            p["amount"],
            p["status"],
            p["rejection_reason"] or "",
            p["note"] or "",
        ])))

    csv_content = "\n".join(lines)
    filename = f"payment-proofs-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Row-Count": str(len(filtered)),
        }
    )

# NOTE: several handlers below this point were duplicates of routes already
# registered earlier in this file. FastAPI matches the first registration, so
# they were unreachable — and weaker than the live ones: untyped `body: dict`
# payloads, no FINANCE_GOV permission check, and broad `except: return []`.
# They have been removed so the file shows what actually runs.
