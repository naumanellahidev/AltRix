"""
Finance models: fee structures, allocations, invoices, payments.
"""
import uuid
from typing import Optional, List
from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY, ENUM
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class FeeStructure(Base):
    __tablename__ = "fee_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    currency: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    class_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    billing_frequency: Mapped[str] = mapped_column(String, nullable=False, default="monthly")
    school_year: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    fee_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, default="tuition")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    fee_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=False)
    discount_pct: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    scholarship_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    fee_plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_plans.id"), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    period_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    sibling_discount_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    late_fee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    status: Mapped[str] = mapped_column(ENUM("pending", "paid", "partial", "overdue", "cancelled", "draft", name="fee_invoice_status", create_type=False), nullable=False, default="pending")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    merit_discount_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    merit_discount_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False, default="cash")  # cash, bank, jazzcash, easypaisa, cheque
    status: Mapped[str] = mapped_column(String, nullable=False, default="success")  # success, pending, failed, refunded
    transaction_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    recorded_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)

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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    initiator_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    txn_ref_no: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    raw_request = Column(JSON, nullable=True)
    raw_response = Column(JSON, nullable=True)
    jc_response_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    jc_response_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=False)

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


class InstallmentPlan(Base):
    """Fee installment plan for splitting an invoice into multiple payments."""
    __tablename__ = "installment_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    total_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    installment_amount: Mapped[float] = mapped_column(Float, nullable=False)
    frequency: Mapped[str] = mapped_column(String, nullable=False, default="monthly")  # weekly, monthly, quarterly
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")  # active, completed, cancelled, defaulted
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class InstallmentPayment(Base):
    """Individual installment within a plan."""
    __tablename__ = "installment_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("installment_plans.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, paid, overdue, partial
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_payments.id"), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class SiblingDiscount(Base):
    """Automated sibling discount rules per school."""
    __tablename__ = "sibling_discounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)  # "2nd Child Discount", "3rd+ Child Discount"
    sibling_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 2 = 2nd child, 3 = 3rd child, etc.
    discount_type: Mapped[str] = mapped_column(String, nullable=False, default="percent")  # percent | fixed
    discount_value: Mapped[float] = mapped_column(Float, nullable=False)  # 10 (10%) or 5000 (PKR 5000)
    applies_to: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="tuition")  # tuition | all | specific
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class TaxCertificate(Base):
    """Annual tax certificate for fee payments."""
    __tablename__ = "tax_certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    parent_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    fiscal_year: Mapped[str] = mapped_column(String, nullable=False)  # "2025-2026"
    certificate_number: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    total_fees_paid: Mapped[float] = mapped_column(Float, nullable=False)
    total_tuition: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_other_charges: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    school_ntn: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # School's National Tax Number
    payment_details = Column(JSON, nullable=True)  # [{date, amount, method, ref}]
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class FeeEscalation(Base):
    """Overdue fee escalation workflow."""
    __tablename__ = "fee_escalations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fee_invoices.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    escalation_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1=reminder, 2=warning, 3=final notice, 4=admin action
    escalation_type: Mapped[str] = mapped_column(String, nullable=False, default="reminder")  # reminder, warning, final_notice, suspension_warning
    overdue_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overdue_amount: Mapped[float] = mapped_column(Float, nullable=False)
    action_taken: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class PaymentGatewayConfig(Base):
    """Multi-gateway payment configuration per school."""
    __tablename__ = "payment_gateway_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    gateway_name: Mapped[str] = mapped_column(String, nullable=False)  # jazzcash, easypaisa, payoneer, stripe, bank_transfer
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "JazzCash Mobile", "Bank Transfer"
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config = Column(JSON, nullable=True)  # Encrypted gateway-specific config
    supported_methods: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "mobile_wallet,card,bank"
    min_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    processing_fee_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # percent | fixed | none
    processing_fee_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
