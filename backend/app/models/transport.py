"""
Transport models: bus routes, stops, buses, student assignments, live GPS pings.
"""
import uuid
from datetime import datetime, time, date
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class BusRoute(Base):
    __tablename__ = "bus_routes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    route_name: Mapped[str] = mapped_column(String, nullable=False)
    route_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    end_location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    estimated_duration_mins: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    morning_departure: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "07:00"
    afternoon_departure: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "14:00"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    stops = orm_relationship("BusStop", back_populates="route", cascade="all, delete-orphan", order_by="BusStop.stop_order")
    buses = orm_relationship("Bus", back_populates="route")


class BusStop(Base):
    __tablename__ = "bus_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_routes.id", ondelete="CASCADE"), nullable=False)
    stop_name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stop_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_arrival_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "07:15"
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    route = orm_relationship("BusRoute", back_populates="stops")


class Bus(Base):
    __tablename__ = "buses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    route_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_routes.id"), nullable=True)
    bus_number: Mapped[str] = mapped_column(String, nullable=False)
    license_plate: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    make_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    driver_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    driver_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    driver_photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    driver_cnic: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conductor_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conductor_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_gps_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_known_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_known_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_location_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="parked")  # parked, en_route_pickup, en_route_dropoff, at_school
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    route = orm_relationship("BusRoute", back_populates="buses")
    student_assignments = orm_relationship("BusStudentAssignment", back_populates="bus", cascade="all, delete-orphan")


class BusStudentAssignment(Base):
    __tablename__ = "bus_student_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    bus_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    stop_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("bus_stops.id"), nullable=True)
    pickup_type: Mapped[str] = mapped_column(String, nullable=False, default="both")  # pickup, dropoff, both
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    bus = orm_relationship("Bus", back_populates="student_assignments")


class BusLiveLocation(Base):
    __tablename__ = "bus_live_locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bus_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # km/h
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # degrees 0-360
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # meters
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
