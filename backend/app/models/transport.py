"""
SQLAlchemy ORM models for Transport Management System.
"""
import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    license_number: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    cnic: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), default="active", nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    bus_number: Mapped[str] = mapped_column(String(50), nullable=False)
    registration_no: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_type: Mapped[Optional[str]] = mapped_column(String(50), default="bus", nullable=True)
    seating_capacity: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("driver_profiles.id"), nullable=True)
    driver_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    driver_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    driver_photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    conductor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    conductor_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gps_device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_known_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_known_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_gps_update: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), default="active", nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    driver = relationship("DriverProfile")


class BusRoute(Base):
    __tablename__ = "bus_routes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    route_name: Mapped[str] = mapped_column(String(255), nullable=False)
    route_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    start_point: Mapped[str] = mapped_column(String(255), nullable=False, default="School Campus")
    end_point: Mapped[str] = mapped_column(String(255), nullable=False, default="Main City Terminal")
    direction: Mapped[Optional[str]] = mapped_column(String(50), default="morning_pickup", nullable=True)
    morning_departure: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    evening_departure: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    estimated_duration_min: Mapped[Optional[int]] = mapped_column(Integer, default=45, nullable=True)
    monthly_fare: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), default="active", nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    vehicle = relationship("Vehicle")
    stops = relationship("BusStop", back_populates="route", cascade="all, delete-orphan")


class BusStop(Base):
    __tablename__ = "bus_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_routes.id"), nullable=False)
    stop_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stop_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimated_arrival_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    estimated_morning_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    estimated_evening_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    route = relationship("BusRoute", back_populates="stops")


class StudentTransportAssignment(Base):
    __tablename__ = "student_transport_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_routes.id"), nullable=False)
    stop_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_stops.id"), nullable=True)
    pickup_type: Mapped[Optional[str]] = mapped_column(String(50), default="both", nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), default="active", nullable=True)
    assigned_date: Mapped[Optional[date]] = mapped_column(Date, server_default=func.current_date(), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    route = relationship("BusRoute")
    stop = relationship("BusStop")


class TransportEventLog(Base):
    __tablename__ = "transport_event_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    route_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_routes.id"), nullable=True)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    current_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    route = relationship("BusRoute")
    vehicle = relationship("Vehicle")

