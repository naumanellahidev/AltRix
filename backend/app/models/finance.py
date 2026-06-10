"""
Finance models: fee structures, allocations, invoices, payments.
"""
import uuid
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


class FeeStructure(Base):
    __tablename__ = "fee_structures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    academic_year = Column(String, nullable=True)
    class_ids = Column(ARRAY(String), nullable=True)  # applicable classes
    total_amount = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class FeeComponent(Base):
    __tablename__ = "fee_components"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    fee_structure_id = Column(UUID(as_uuid=True), ForeignKey("fee_structures.id"), nullable=False)
    name = Column(String, nullable=False)  # tuition, transport, library, etc.
    amount = Column(Float, nullable=False)
    frequency = Column(String, nullable=True, default="monthly")  # monthly, quarterly, annual, one-time
    is_optional = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class FeeAllocation(Base):
    __tablename__ = "fee_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    fee_structure_id = Column(UUID(as_uuid=True), ForeignKey("fee_structures.id"), nullable=False)
    discount_amount = Column(Float, nullable=True, default=0)
    discount_percent = Column(Float, nullable=True, default=0)
    discount_reason = Column(String, nullable=True)
    custom_amount = Column(Float, nullable=True)
    academic_year = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class FeeVoucher(Base):
    __tablename__ = "fee_vouchers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    voucher_number = Column(String, nullable=True, unique=True)
    issue_date = Column(String, nullable=True)
    due_date = Column(String, nullable=True)
    month = Column(String, nullable=True)
    academic_year = Column(String, nullable=True)
    total_amount = Column(Float, nullable=False)
    discount_amount = Column(Float, nullable=True, default=0)
    net_amount = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending, paid, partial, overdue, cancelled
    late_fee = Column(Float, nullable=True, default=0)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class FeePayment(Base):
    __tablename__ = "fee_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    voucher_id = Column(UUID(as_uuid=True), ForeignKey("fee_vouchers.id"), nullable=True)
    amount = Column(Float, nullable=False)
    payment_date = Column(String, nullable=False)
    payment_method = Column(String, nullable=True, default="cash")  # cash, bank, jazzcash, easypaisa, cheque
    transaction_id = Column(String, nullable=True)
    reference_number = Column(String, nullable=True)
    status = Column(String, nullable=False, default="completed")  # completed, pending, failed, refunded
    notes = Column(Text, nullable=True)
    received_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class PaymentTransaction(Base):
    """JazzCash / EasyPaisa gateway transactions."""
    __tablename__ = "payment_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    voucher_id = Column(UUID(as_uuid=True), ForeignKey("fee_vouchers.id"), nullable=True)
    gateway = Column(String, nullable=False)  # jazzcash, easypaisa
    gateway_transaction_id = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=True, default="PKR")
    status = Column(String, nullable=False, default="pending")  # pending, success, failed
    gateway_response = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
