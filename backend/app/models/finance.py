"""
Finance models: fee structures, allocations, invoices, payments.
"""
import uuid
from typing import Optional, List
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


class FeeStructure(Base):
    __tablename__ = "fee_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name = Column(String, nullable=False)
    currency = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    class_id = Column(UUID(as_uuid=True), nullable=True)
    description = Column(Text, nullable=True)
    billing_frequency = Column(String, nullable=False, default="monthly")
    school_year = Column(String, nullable=True)

    # Property wrappers for backward compatibility
    @property
    def campus_id(self) -> Optional[uuid.UUID]: return None
    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]): pass

    @property
    def academic_year(self) -> Optional[str]: return self.school_year
    @academic_year.setter
    def academic_year(self, val: Optional[str]): self.school_year = val

    @property
    def class_ids(self) -> Optional[list]:
        return [str(self.class_id)] if self.class_id else []
    @class_ids.setter
    def class_ids(self, val: Optional[list]):
        if val:
            try:
                self.class_id = uuid.UUID(val[0])
            except (ValueError, IndexError):
                pass

    @property
    def total_amount(self) -> Optional[float]: return 0.0
    @total_amount.setter
    def total_amount(self, val: Optional[float]): pass

    @property
    def created_by(self) -> Optional[uuid.UUID]: return None
    @created_by.setter
    def created_by(self, val: Optional[uuid.UUID]): pass


class FeeComponent(Base):
    __tablename__ = "fee_plan_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    fee_plan_id = Column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=False)
    label = Column(String, nullable=False)
    category = Column(String, nullable=False, default="tuition")
    amount = Column(Float, nullable=False)
    is_recurring = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def fee_structure_id(self) -> Optional[uuid.UUID]: return self.fee_plan_id
    @fee_structure_id.setter
    def fee_structure_id(self, val: Optional[uuid.UUID]): self.fee_plan_id = val

    @property
    def name(self) -> Optional[str]: return self.label
    @name.setter
    def name(self, val: Optional[str]): self.label = val or ""

    @property
    def frequency(self) -> Optional[str]:
        return "monthly" if self.is_recurring else "one-time"
    @frequency.setter
    def frequency(self, val: Optional[str]):
        self.is_recurring = (val != "one-time")

    @property
    def is_optional(self) -> Optional[bool]: return False
    @is_optional.setter
    def is_optional(self, val: Optional[bool]): pass


class FeeAllocation(Base):
    __tablename__ = "student_fee_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    fee_plan_id = Column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=False)
    discount_pct = Column(Float, default=0, nullable=False)
    scholarship_amount = Column(Float, default=0, nullable=False)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def fee_structure_id(self) -> Optional[uuid.UUID]: return self.fee_plan_id
    @fee_structure_id.setter
    def fee_structure_id(self, val: Optional[uuid.UUID]): self.fee_plan_id = val

    @property
    def discount_percent(self) -> Optional[float]: return self.discount_pct
    @discount_percent.setter
    def discount_percent(self, val: Optional[float]): self.discount_pct = val or 0.0

    @property
    def discount_amount(self) -> Optional[float]: return self.scholarship_amount
    @discount_amount.setter
    def discount_amount(self, val: Optional[float]): self.scholarship_amount = val or 0.0

    @property
    def discount_reason(self) -> Optional[str]: return self.notes
    @discount_reason.setter
    def discount_reason(self, val: Optional[str]): self.notes = val

    @property
    def custom_amount(self) -> Optional[float]: return None
    @custom_amount.setter
    def custom_amount(self, val: Optional[float]): pass

    @property
    def academic_year(self) -> Optional[str]: return None
    @academic_year.setter
    def academic_year(self, val: Optional[str]): pass

    @property
    def created_by(self) -> Optional[uuid.UUID]: return None
    @created_by.setter
    def created_by(self, val: Optional[uuid.UUID]): pass


class FeeVoucher(Base):
    __tablename__ = "fee_invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    fee_plan_id = Column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=True)
    invoice_number = Column(String, nullable=False, unique=True)
    period_label = Column(String, nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    due_date = Column(Date, nullable=False)
    subtotal = Column(Float, nullable=False)
    discount_amount = Column(Float, default=0, nullable=False)
    sibling_discount_amount = Column(Float, default=0, nullable=False)
    late_fee = Column(Float, default=0, nullable=False)
    total_amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending, paid, partial, overdue, cancelled
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    merit_discount_amount = Column(Float, default=0, nullable=False)
    merit_discount_reason = Column(Text, nullable=True)

    # Property wrappers for backward compatibility
    @property
    def voucher_number(self) -> Optional[str]: return self.invoice_number
    @voucher_number.setter
    def voucher_number(self, val: Optional[str]): self.invoice_number = val or ""

    @property
    def net_amount(self) -> Optional[float]: return self.total_amount
    @net_amount.setter
    def net_amount(self, val: Optional[float]): self.total_amount = val or 0.0

    @property
    def month(self) -> Optional[str]: return self.period_label
    @month.setter
    def month(self, val: Optional[str]): self.period_label = val

    @property
    def academic_year(self) -> Optional[str]:
        return str(self.fee_plan_id) if self.fee_plan_id else None
    @academic_year.setter
    def academic_year(self, val: Optional[str]):
        if val:
            try:
                self.fee_plan_id = uuid.UUID(val)
            except ValueError:
                pass

    @property
    def issue_date(self) -> Optional[str]:
        return self.period_start.strftime("%Y-%m-%d") if self.period_start else None
    @issue_date.setter
    def issue_date(self, val: Optional[str]):
        if val:
            try:
                from datetime import datetime as dt
                self.period_start = dt.strptime(val, "%Y-%m-%d").date()
            except ValueError:
                pass

    @property
    def created_by(self) -> Optional[uuid.UUID]: return None
    @created_by.setter
    def created_by(self, val: Optional[uuid.UUID]): pass


class FeePayment(Base):
    __tablename__ = "fee_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    amount = Column(Float, nullable=False)
    method = Column(String, nullable=False, default="cash")  # cash, bank, jazzcash, easypaisa, cheque
    status = Column(String, nullable=False, default="completed")  # completed, pending, failed, refunded
    transaction_ref = Column(String, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    recorded_by_user_id = Column(UUID(as_uuid=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def voucher_id(self) -> Optional[uuid.UUID]: return self.invoice_id
    @voucher_id.setter
    def voucher_id(self, val: Optional[uuid.UUID]): self.invoice_id = val

    @property
    def payment_date(self) -> Optional[str]:
        return self.paid_at.strftime("%Y-%m-%d") if self.paid_at else None
    @payment_date.setter
    def payment_date(self, val: Optional[str]):
        if val:
            try:
                from datetime import datetime as dt
                self.paid_at = dt.strptime(val, "%Y-%m-%d")
            except ValueError:
                pass

    @property
    def payment_method(self) -> Optional[str]: return self.method
    @payment_method.setter
    def payment_method(self, val: Optional[str]): self.method = val or "cash"

    @property
    def transaction_id(self) -> Optional[str]: return self.transaction_ref
    @transaction_id.setter
    def transaction_id(self, val: Optional[str]): self.transaction_ref = val

    @property
    def reference_number(self) -> Optional[str]: return self.transaction_ref
    @reference_number.setter
    def reference_number(self, val: Optional[str]): self.transaction_ref = val

    @property
    def received_by(self) -> Optional[uuid.UUID]: return self.recorded_by_user_id
    @received_by.setter
    def received_by(self, val: Optional[uuid.UUID]): self.recorded_by_user_id = val


class PaymentTransaction(Base):
    __tablename__ = "jazzcash_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    initiator_user_id = Column(UUID(as_uuid=True), nullable=True)
    txn_ref_no = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="pending")
    raw_request = Column(JSON, nullable=True)
    raw_response = Column(JSON, nullable=True)
    jc_response_code = Column(String, nullable=True)
    jc_response_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)

    # Property wrappers for backward compatibility
    @property
    def voucher_id(self) -> Optional[uuid.UUID]: return self.invoice_id
    @voucher_id.setter
    def voucher_id(self, val: Optional[uuid.UUID]): self.invoice_id = val

    @property
    def gateway_transaction_id(self) -> Optional[str]: return self.txn_ref_no
    @gateway_transaction_id.setter
    def gateway_transaction_id(self, val: Optional[str]): self.txn_ref_no = val or ""

    @property
    def gateway(self) -> str: return "jazzcash"
    @gateway.setter
    def gateway(self, val: str): pass

    @property
    def currency(self) -> str: return "PKR"
    @currency.setter
    def currency(self, val: str): pass

    @property
    def gateway_response(self) -> Optional[dict]: return self.raw_response
    @gateway_response.setter
    def gateway_response(self, val: Optional[dict]): self.raw_response = val
