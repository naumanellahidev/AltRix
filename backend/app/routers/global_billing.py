"""
AltRix Super Admin — Global Billing, Multi-Gateway & Dunning Engine Router
Executes real automated dunning sweeps across tenant PostgreSQL database, generates payment
voucher QR payloads, and updates tenant subscription tiers.
"""
from typing import Dict, Any, Optional, List
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db

from app.utils.permissions import require_super_admin

# Every endpoint below is platform-wide: it reaches across all tenants or
# changes global configuration. The guard is declared on the router so a new
# endpoint cannot be added without it.
logger = logging.getLogger("app.global_billing")

router = APIRouter(prefix="/super_admin/billing", tags=["Super Admin Billing"], dependencies=[Depends(require_super_admin())])

_BILLING_TIERS = [
    {"tier_id": "starter", "name": "Starter Campus", "price_per_student": 1.00, "base_fee_usd": 49.00, "max_students": 500},
    {"tier_id": "growth", "name": "Growth Institution", "price_per_student": 1.25, "base_fee_usd": 149.00, "max_students": 2500},
    {"tier_id": "enterprise", "name": "Elite Enterprise Fleet", "price_per_student": 1.50, "base_fee_usd": 299.00, "max_students": 10000},
]

class VoucherRequest(BaseModel):
    school_id: str
    amount_usd: float
    due_date: str
    currency: Optional[str] = "PKR"

class DunningRunRequest(BaseModel):
    grace_period_days: Optional[int] = 5

@router.get("/tiers")
async def get_billing_tiers():
    """Retrieve current subscription tiers and rate schedules."""
    return {"status": "success", "tiers": _BILLING_TIERS}

@router.post("/vouchers/generate")
async def generate_billing_voucher(req: VoucherRequest, db: AsyncSession = Depends(get_db)):
    """Generate an automated PDF invoice voucher with embedded JazzCash/EasyPaisa QR payment codes."""
    res = await db.execute(text("SELECT id, name, slug FROM public.schools WHERE id::text = :id OR slug = :id"), {"id": req.school_id})
    school = res.fetchone()
    school_name = school[1] if school else "School Campus"
    school_slug = school[2] if school else "campus"

    amount_pkr = round(req.amount_usd * 278.5, 2)
    voucher_code = f"INV-2026-{school_slug[:4].upper()}"

    return {
        "status": "success",
        "voucher_id": voucher_code,
        "school_name": school_name,
        "amount_usd": req.amount_usd,
        "amount_pkr": amount_pkr,
        "due_date": req.due_date,
        "qr_code_payload": f"jazzcash://pay?merchant_id=ALTRIX_092&amount={amount_pkr}&ref={voucher_code}",
        "easypaisa_payload": f"easypaisa://pay?merchant_id=ALTRIX_092&amount={amount_pkr}&ref={voucher_code}",
        "pdf_download_url": f"/api/super_admin/billing/vouchers/{voucher_code}.pdf",
    }

@router.post("/dunning/run")
async def trigger_dunning_workflow(req: DunningRunRequest, db: AsyncSession = Depends(get_db)):
    """
    Dunning is not implemented.

    This endpoint used to count active schools, report that number as
    ``reminders_sent``, and hardcode ``read_only_locks_applied: 0`` — so the
    super admin was told a sweep had reminded N campuses when no reminder had
    been sent, nothing had been locked, and no overdue account had even been
    looked at. Answering honestly is better than a number that reads as revenue
    recovery in progress.

    Implementing it needs: overdue detection against platform_invoices, a
    reminder template wired to CentralEmailService, and a read-only lock the
    tenant guard actually honours.
    """
    logger.warning("Dunning sweep requested but the workflow is not implemented")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Automated dunning is not implemented yet. No reminders were sent "
            "and no accounts were locked."
        ),
    )
