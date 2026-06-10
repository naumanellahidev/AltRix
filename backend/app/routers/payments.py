"""
JazzCash payment gateway integration router.
"""
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, status, HTTPException
from sqlalchemy import select

from app.config import settings
from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError
from app.models.finance import FeeVoucher, FeePayment, PaymentTransaction
from app.schemas import JazzCashPaymentRequest, PaymentCallbackData, MessageResponse

router = APIRouter(prefix="/payments", tags=["Payments"])


def generate_jazzcash_hash(data: dict, integrity_salt: str) -> str:
    """Generate HMAC-SHA256 secure hash for JazzCash."""
    sorted_values = "&".join(
        str(v) for k, v in sorted(data.items()) if k != "pp_SecureHash" and v
    )
    hash_str = f"{integrity_salt}&{sorted_values}"
    return hmac.new(
        integrity_salt.encode("utf-8"),
        hash_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()


@router.post("/jazzcash/initiate")
async def initiate_jazzcash_payment(
    body: JazzCashPaymentRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Initiate a JazzCash mobile payment (MWALLET)."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    if not settings.jazzcash_merchant_id:
        raise HTTPException(status_code=503, detail="JazzCash not configured")

    # Create a transaction record
    txn = PaymentTransaction(
        school_id=current_user.school_id,
        student_id=body.student_id,
        voucher_id=body.voucher_id,
        gateway="jazzcash",
        amount=body.amount,
        currency="PKR",
        status="pending",
    )
    db.add(txn)
    await db.flush()

    txn_ref = f"ALTRIX-{txn.id!s:.8}"
    now = datetime.now(timezone.utc)

    payload = {
        "pp_MerchantID": settings.jazzcash_merchant_id,
        "pp_Password": settings.jazzcash_password,
        "pp_TxnRefNo": txn_ref,
        "pp_Amount": str(int(body.amount * 100)),  # JazzCash uses paisas
        "pp_TxnCurrency": "PKR",
        "pp_TxnDateTime": now.strftime("%Y%m%d%H%M%S"),
        "pp_TxnExpiryDateTime": "",
        "pp_ReturnURL": settings.jazzcash_return_url,
        "pp_Description": body.description or f"Fee payment",
        "pp_MobileNumber": body.mobile_number,
        "pp_CNIC": "",
        "pp_Language": "EN",
        "pp_SubMerchantID": "",
        "pp_BillReference": str(body.voucher_id or ""),
    }

    payload["pp_SecureHash"] = generate_jazzcash_hash(payload, settings.jazzcash_integrity_salt)

    await db.refresh(txn)
    return {
        "transaction_id": str(txn.id),
        "gateway_url": settings.jazzcash_api_url,
        "payload": payload,
    }


@router.post("/jazzcash/callback")
async def jazzcash_callback(body: PaymentCallbackData, db: DbSession):
    """Handle JazzCash payment callback."""
    response_code = body.pp_ResponseCode
    txn_ref = body.pp_TxnRefNo

    # Parse transaction ID from ref
    txn_id = txn_ref.replace("ALTRIX-", "")

    result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.gateway_transaction_id == txn_ref
        )
    )
    txn = result.scalar_one_or_none()

    if txn:
        txn.status = "success" if response_code == "000" else "failed"
        txn.gateway_transaction_id = txn_ref
        txn.gateway_response = body.model_dump()

        # Record fee payment if successful
        if response_code == "000" and txn.voucher_id:
            payment = FeePayment(
                school_id=txn.school_id,
                student_id=txn.student_id,
                voucher_id=txn.voucher_id,
                amount=txn.amount,
                payment_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                payment_method="jazzcash",
                transaction_id=txn_ref,
                status="completed",
            )
            db.add(payment)

            # Update voucher status
            v_result = await db.execute(
                select(FeeVoucher).where(FeeVoucher.id == txn.voucher_id)
            )
            voucher = v_result.scalar_one_or_none()
            if voucher:
                voucher.status = "paid"

    return MessageResponse(message="Callback processed")


@router.get("/transactions")
async def list_transactions(
    current_user: CurrentUser,
    db: DbSession,
    student_id: Optional[UUID] = None,
    gateway: Optional[str] = None,
):
    """List payment transactions."""
    if not current_user.school_id:
        return []
    query = select(PaymentTransaction).where(
        PaymentTransaction.school_id == current_user.school_id
    )
    if student_id:
        query = query.where(PaymentTransaction.student_id == student_id)
    if gateway:
        query = query.where(PaymentTransaction.gateway == gateway)
    result = await db.execute(query.order_by(PaymentTransaction.created_at.desc()))
    return result.scalars().all()
