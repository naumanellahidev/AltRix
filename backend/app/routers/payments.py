"""
JazzCash payment gateway integration router.

Notes on the two things this file has to get right:

*Authenticity.* The callback is a public, unauthenticated endpoint — it has to
be, because JazzCash calls it server-to-server. The only thing separating a
genuine payment notification from a forged one is ``pp_SecureHash``. It is
therefore verified before anything is read from the payload, and a missing
integrity salt fails closed rather than skipping the check.

*Idempotency.* Gateways retry callbacks, and a user can be bounced through the
return URL more than once. Every step is written so that processing the same
``pp_TxnRefNo`` twice settles the invoice once.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, status, HTTPException
from sqlalchemy import select

from app.config import settings
from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError, NotFoundError
from app.models.finance import FeeVoucher, FeePayment, PaymentTransaction
from app.schemas import JazzCashPaymentRequest, PaymentCallbackData, MessageResponse
from app.utils.money import D, is_settled, money
from app.utils.tenant_guard import require_tenant_access, safe_school_id

logger = logging.getLogger("app.payments")

router = APIRouter(prefix="/payments", tags=["Payments"])

#: Amounts are compared in paisa, so a rounding difference of one unit is the
#: smallest meaningful discrepancy. Anything larger is treated as a mismatch.
_AMOUNT_TOLERANCE_PAISA = 1


def _to_paisa(amount) -> int:
    """JazzCash works in paisa. Convert via Decimal to avoid float drift."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1")))


def generate_jazzcash_hash(data: dict, integrity_salt: str) -> str:
    """
    Compute the JazzCash HMAC-SHA256 secure hash.

    Per the gateway's specification the message is the integrity salt followed
    by every non-empty ``pp_*`` value in key order, ampersand-separated, and the
    salt is also the HMAC key. The salt genuinely appears in both places.
    """
    sorted_values = "&".join(
        str(v) for k, v in sorted(data.items()) if k != "pp_SecureHash" and v
    )
    hash_str = f"{integrity_salt}&{sorted_values}"
    return hmac.new(
        integrity_salt.encode("utf-8"),
        hash_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()


def _new_txn_ref() -> str:
    """
    A unique, gateway-safe transaction reference.

    The previous scheme truncated a UUID to eight characters, which collides in
    practice once a few thousand payments exist and would let one school's
    callback settle another's invoice. The date keeps it readable in the
    gateway's portal; twelve random base-36 characters (62 bits) keep it
    unique — the six hex digits used before collided about one time in eight
    when two thousand payments started in the same second. 19 characters,
    within JazzCash's 20-character limit.
    """
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return f"T{datetime.now(timezone.utc):%y%m%d}" + "".join(secrets.choice(alphabet) for _ in range(12))


@router.post("/jazzcash/initiate")
async def initiate_jazzcash_payment(
    body: JazzCashPaymentRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Initiate a JazzCash mobile payment (MWALLET)."""
    school_id = safe_school_id(current_user)

    if not settings.jazzcash_merchant_id or not settings.jazzcash_integrity_salt:
        raise HTTPException(status_code=503, detail="JazzCash is not configured")

    # The invoice is mandatory: jazzcash_transactions.invoice_id is NOT NULL, so
    # omitting it used to fail at flush time with a database error.
    if not body.voucher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="voucher_id is required to start a payment",
        )

    voucher = await db.scalar(
        select(FeeVoucher).where(FeeVoucher.id == body.voucher_id)
    )
    if not voucher:
        raise NotFoundError("Fee voucher", str(body.voucher_id))

    # Confirm the invoice is ours and belongs to the student being charged.
    require_tenant_access(voucher.school_id, current_user, resource_description="fee voucher")
    if str(voucher.student_id) != str(body.student_id):
        raise ForbiddenError("This voucher does not belong to that student")

    if voucher.status in ("paid", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This voucher is already {voucher.status}",
        )

    # Take the amount from the invoice, never from the request body: a client
    # supplied figure would let the payer choose what the fee costs.
    outstanding = Decimal(str(voucher.total_amount)) - Decimal(str(voucher.paid_amount or 0))
    if outstanding <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This voucher has nothing left to pay",
        )

    requested = Decimal(str(body.amount)) if body.amount is not None else outstanding
    if requested <= 0 or requested > outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount must be between 0 and the outstanding balance ({outstanding})",
        )

    now = datetime.now(timezone.utc)
    txn_ref = _new_txn_ref()

    payload = {
        "pp_Version": "1.1",
        "pp_TxnType": "MWALLET",
        "pp_Language": "EN",
        "pp_MerchantID": settings.jazzcash_merchant_id,
        "pp_Password": settings.jazzcash_password,
        "pp_TxnRefNo": txn_ref,
        "pp_Amount": str(_to_paisa(requested)),
        "pp_TxnCurrency": "PKR",
        "pp_TxnDateTime": now.strftime("%Y%m%d%H%M%S"),
        "pp_TxnExpiryDateTime": "",
        "pp_BillReference": str(voucher.invoice_number or voucher.id),
        "pp_Description": body.description or f"Fee payment {voucher.invoice_number}",
        "pp_ReturnURL": settings.jazzcash_return_url,
        "pp_MobileNumber": body.mobile_number,
        "pp_CNIC": "",
        "pp_SubMerchantID": "",
    }
    payload["pp_SecureHash"] = generate_jazzcash_hash(
        payload, settings.jazzcash_integrity_salt
    )

    txn = PaymentTransaction(
        school_id=UUID(school_id) if isinstance(school_id, str) else school_id,
        student_id=body.student_id,
        voucher_id=voucher.id,
        initiator_user_id=UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id,
        # Must be set before the flush: the column is NOT NULL, and assigning it
        # afterwards (as this used to) makes every initiate fail with an
        # IntegrityError.
        gateway_transaction_id=txn_ref,
        amount=float(requested),
        status="pending",
    )
    # Keep the merchant password out of anything we persist.
    txn.raw_request = {k: v for k, v in payload.items() if k != "pp_Password"}
    db.add(txn)
    await db.flush()
    await db.refresh(txn)

    logger.info(
        f"JazzCash payment initiated: txn_ref={txn_ref} invoice={voucher.id} "
        f"amount={requested}"
    )

    return {
        "transaction_id": str(txn.id),
        "txn_ref_no": txn_ref,
        "gateway_url": settings.jazzcash_api_url,
        # pp_Password is a merchant credential and is deliberately not returned:
        # this response is rendered into the payer's browser.
        "payload": {k: v for k, v in payload.items() if k != "pp_Password"},
    }


def _verify_callback_signature(raw: dict) -> bool:
    """
    Check the gateway's signature over the callback payload.

    Fails closed when no integrity salt is configured — an unverifiable callback
    is indistinguishable from a forged one, and accepting it would mean anyone
    who can reach this URL can mark invoices paid.
    """
    salt = settings.jazzcash_integrity_salt
    if not salt:
        logger.error("JAZZCASH_INTEGRITY_SALT is not configured; rejecting callback")
        return False

    received = (raw.get("pp_SecureHash") or "").strip().upper()
    if not received:
        return False

    signed_fields = {
        k: v for k, v in raw.items()
        if (k.startswith("pp_") or k.startswith("ppmpf_")) and k != "pp_SecureHash"
        and v is not None
    }
    expected = generate_jazzcash_hash(signed_fields, salt)
    return hmac.compare_digest(expected, received)


@router.post("/jazzcash/callback")
async def jazzcash_callback(body: PaymentCallbackData, request: Request, db: DbSession):
    """
    Handle a JazzCash payment callback.

    Public by necessity, so authenticity rests entirely on the secure hash.
    """
    raw = body.model_dump()

    if not _verify_callback_signature(raw):
        logger.warning(
            "Rejected JazzCash callback with an invalid signature: "
            f"txn_ref={raw.get('pp_TxnRefNo')!r} "
            f"ip={request.client.host if request.client else 'unknown'}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payment signature",
        )

    txn_ref = (body.pp_TxnRefNo or "").strip()

    # Look up on the mapped column. This used to filter on
    # PaymentTransaction.gateway_transaction_id, which is a plain Python
    # property rather than a column, so the comparison evaluated to False in
    # Python and the query matched nothing — every genuine payment was silently
    # dropped while the endpoint still answered 200.
    txn = await db.scalar(
        select(PaymentTransaction).where(PaymentTransaction.txn_ref_no == txn_ref)
    )
    if not txn:
        logger.warning(f"JazzCash callback for unknown transaction {txn_ref!r}")
        raise HTTPException(status_code=404, detail="Unknown transaction reference")

    # Idempotency: gateways retry. Settle a given reference exactly once.
    if txn.status in ("success", "failed"):
        logger.info(f"Ignoring repeat JazzCash callback for {txn_ref} (already {txn.status})")
        return MessageResponse(message="Callback already processed")

    succeeded = body.pp_ResponseCode == "000"

    # The amount is part of the signed payload, but compare it to what we
    # actually asked for so a replayed-but-valid message for a different sum
    # cannot settle this invoice.
    if succeeded:
        try:
            callback_paisa = int(str(body.pp_Amount).strip())
        except (TypeError, ValueError):
            callback_paisa = -1
        expected_paisa = _to_paisa(txn.amount)
        if abs(callback_paisa - expected_paisa) > _AMOUNT_TOLERANCE_PAISA:
            logger.error(
                f"JazzCash amount mismatch on {txn_ref}: "
                f"expected {expected_paisa} paisa, callback said {callback_paisa}"
            )
            txn.status = "failed"
            txn.jc_response_code = body.pp_ResponseCode
            txn.jc_response_message = "Amount mismatch"
            txn.gateway_response = raw
            await db.commit()
            raise HTTPException(status_code=400, detail="Payment amount mismatch")

    txn.status = "success" if succeeded else "failed"
    txn.jc_response_code = body.pp_ResponseCode
    txn.jc_response_message = body.pp_ResponseMessage
    txn.gateway_response = raw

    if succeeded:
        # Guard against a duplicate ledger entry even if the transaction row was
        # somehow left pending by an earlier partial run.
        already = await db.scalar(
            select(FeePayment).where(FeePayment.transaction_ref == txn_ref)
        )
        if not already:
            db.add(FeePayment(
                school_id=txn.school_id,
                student_id=txn.student_id,
                voucher_id=txn.invoice_id,
                amount=txn.amount,
                method="jazzcash",
                status="success",
                transaction_id=txn_ref,
                paid_at=datetime.now(timezone.utc),
            ))

            # Locked for the same reason as the manual path: a gateway callback
            # and a cash payment can land at the same instant, and without this
            # one silently overwrites the other's balance.
            voucher = await db.scalar(
                select(FeeVoucher)
                .where(FeeVoucher.id == txn.invoice_id)
                .with_for_update()
            )
            if voucher:
                paid = money(D(voucher.paid_amount) + D(txn.amount))
                voucher.paid_amount = paid
                # A part payment must not mark the invoice settled.
                voucher.status = "paid" if is_settled(paid, voucher.total_amount) else "partial"

    await db.commit()
    logger.info(f"JazzCash callback processed: {txn_ref} -> {txn.status}")
    return MessageResponse(message="Callback processed")


@router.get("/transactions")
async def list_transactions(
    current_user: CurrentUser,
    db: DbSession,
    student_id: Optional[UUID] = None,
    gateway: Optional[str] = None,
):
    """List payment transactions for the caller's school."""
    school_id = safe_school_id(current_user)

    query = select(PaymentTransaction).where(
        PaymentTransaction.school_id == school_id
    )
    if student_id:
        query = query.where(PaymentTransaction.student_id == student_id)
    if gateway and gateway != "jazzcash":
        # Only JazzCash lives in this table; anything else matches nothing.
        return []
    result = await db.execute(query.order_by(PaymentTransaction.created_at.desc()))
    return result.scalars().all()
