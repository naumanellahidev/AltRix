"""
Transport router: bus routes, stops, buses, student assignments, live location.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.models.transport import BusRoute, BusStop, Bus, BusStudentAssignment, BusLiveLocation
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/transport", tags=["Transport"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class BusStopOut(BaseModel):
    id: str
    stop_name: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    stop_order: int = 0
    estimated_arrival_time: Optional[str] = None

    class Config:
        from_attributes = True

class BusRouteOut(BaseModel):
    id: str
    route_name: str
    route_code: Optional[str] = None
    description: Optional[str] = None
    start_location: Optional[str] = None
    end_location: Optional[str] = None
    estimated_duration_mins: Optional[int] = None
    morning_departure: Optional[str] = None
    afternoon_departure: Optional[str] = None
    is_active: bool = True
    stops: List[BusStopOut] = []

    class Config:
        from_attributes = True

class BusOut(BaseModel):
    id: str
    bus_number: str
    license_plate: Optional[str] = None
    capacity: Optional[int] = None
    make_model: Optional[str] = None
    color: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_photo_url: Optional[str] = None
    conductor_name: Optional[str] = None
    conductor_phone: Optional[str] = None
    is_active: bool = True
    is_gps_enabled: bool = False
    status: Optional[str] = "parked"
    last_known_latitude: Optional[float] = None
    last_known_longitude: Optional[float] = None
    last_location_at: Optional[str] = None
    route: Optional[BusRouteOut] = None

    class Config:
        from_attributes = True

class MyBusInfo(BaseModel):
    bus: Optional[BusOut] = None
    stop: Optional[BusStopOut] = None
    pickup_type: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None

class BusLocationPing(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None

class BusLocationOut(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    recorded_at: str

    class Config:
        from_attributes = True

class BusRouteCreate(BaseModel):
    route_name: str
    route_code: Optional[str] = None
    description: Optional[str] = None
    start_location: Optional[str] = None
    end_location: Optional[str] = None
    estimated_duration_mins: Optional[int] = None
    morning_departure: Optional[str] = None
    afternoon_departure: Optional[str] = None

class BusStopCreate(BaseModel):
    stop_name: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    stop_order: int = 0
    estimated_arrival_time: Optional[str] = None

class BusCreate(BaseModel):
    bus_number: str
    route_id: Optional[str] = None
    license_plate: Optional[str] = None
    capacity: Optional[int] = None
    make_model: Optional[str] = None
    color: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_photo_url: Optional[str] = None
    conductor_name: Optional[str] = None
    conductor_phone: Optional[str] = None
    is_gps_enabled: bool = False

class BusAssignmentCreate(BaseModel):
    student_id: str
    bus_id: str
    stop_id: Optional[str] = None
    pickup_type: str = "both"


# ── Parent Endpoints ─────────────────────────────────────────────────────────

@router.get("/my-bus", response_model=List[MyBusInfo])
async def get_my_bus(current_user: CurrentUser, db: DbSession):
    """Get bus information for the current parent's children."""
    if not current_user.school_id:
        return []

    # Find students linked to this parent
    from sqlalchemy import text
    res = await db.execute(
        text("SELECT id, first_name, last_name FROM students WHERE school_id = :sid AND id IN "
             "(SELECT student_id FROM student_guardians WHERE user_id = :uid)"),
        {"sid": current_user.school_id, "uid": current_user.user_id}
    )
    students = res.fetchall()

    results = []
    for student in students:
        student_id, first_name, last_name = student
        # Find bus assignment
        assign_q = (
            select(BusStudentAssignment)
            .where(
                BusStudentAssignment.school_id == current_user.school_id,
                BusStudentAssignment.student_id == student_id,
                BusStudentAssignment.is_active == True,
            )
        )
        assign_res = await db.execute(assign_q)
        assignment = assign_res.scalar_one_or_none()

        if assignment:
            # Load bus with route and stops
            bus_q = (
                select(Bus)
                .options(selectinload(Bus.route).selectinload(BusRoute.stops))
                .where(Bus.id == assignment.bus_id)
            )
            bus_res = await db.execute(bus_q)
            bus = bus_res.scalar_one_or_none()

            # Load stop
            stop = None
            if assignment.stop_id:
                stop_res = await db.execute(select(BusStop).where(BusStop.id == assignment.stop_id))
                stop = stop_res.scalar_one_or_none()

            results.append(MyBusInfo(
                bus=BusOut.model_validate(bus) if bus else None,
                stop=BusStopOut.model_validate(stop) if stop else None,
                pickup_type=assignment.pickup_type,
                student_id=str(student_id),
                student_name=f"{first_name or ''} {last_name or ''}".strip(),
            ))
        else:
            results.append(MyBusInfo(
                bus=None, stop=None, pickup_type=None,
                student_id=str(student_id),
                student_name=f"{first_name or ''} {last_name or ''}".strip(),
            ))

    return results


@router.get("/bus/{bus_id}/live", response_model=Optional[BusLocationOut])
async def get_bus_live_location(bus_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get latest GPS location of a bus."""
    q = (
        select(BusLiveLocation)
        .where(BusLiveLocation.bus_id == bus_id)
        .order_by(BusLiveLocation.recorded_at.desc())
        .limit(1)
    )
    res = await db.execute(q)
    loc = res.scalar_one_or_none()
    if not loc:
        return None
    return BusLocationOut(
        latitude=loc.latitude, longitude=loc.longitude,
        speed=loc.speed, heading=loc.heading,
        recorded_at=loc.recorded_at.isoformat() if loc.recorded_at else "",
    )


@router.get("/bus/{bus_id}/route", response_model=Optional[BusRouteOut])
async def get_bus_route(bus_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get full route details with stops for a bus."""
    bus_res = await db.execute(select(Bus).where(Bus.id == bus_id))
    bus = bus_res.scalar_one_or_none()
    if not bus or not bus.route_id:
        return None

    route_q = (
        select(BusRoute)
        .options(selectinload(BusRoute.stops))
        .where(BusRoute.id == bus.route_id)
    )
    route_res = await db.execute(route_q)
    route = route_res.scalar_one_or_none()
    return BusRouteOut.model_validate(route) if route else None


# ── GPS Location Posting (driver/device) ──────────────────────────────────

@router.post("/bus/{bus_id}/location", status_code=status.HTTP_201_CREATED)
async def post_bus_location(bus_id: UUID, ping: BusLocationPing, current_user: CurrentUser, db: DbSession):
    """Post a GPS location ping for a bus (used by driver app or GPS device)."""
    # Verify bus exists
    bus_res = await db.execute(select(Bus).where(Bus.id == bus_id))
    bus = bus_res.scalar_one_or_none()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")

    # Save location ping
    loc = BusLiveLocation(
        bus_id=bus_id,
        latitude=ping.latitude,
        longitude=ping.longitude,
        speed=ping.speed,
        heading=ping.heading,
        accuracy=ping.accuracy,
    )
    db.add(loc)

    # Update bus last known position
    bus.last_known_latitude = ping.latitude
    bus.last_known_longitude = ping.longitude
    bus.last_location_at = datetime.utcnow()

    await db.commit()
    return {"status": "ok"}


# ── Admin Endpoints ──────────────────────────────────────────────────────────

@router.get("/routes", response_model=List[BusRouteOut])
async def list_routes(current_user: CurrentUser, db: DbSession):
    """List all bus routes for the school."""
    if not current_user.school_id:
        return []
    q = (
        select(BusRoute)
        .options(selectinload(BusRoute.stops))
        .where(BusRoute.school_id == current_user.school_id)
        .order_by(BusRoute.route_name)
    )
    res = await db.execute(q)
    routes = res.scalars().all()
    return [BusRouteOut.model_validate(r) for r in routes]


@router.post("/routes", response_model=BusRouteOut, status_code=status.HTTP_201_CREATED)
async def create_route(body: BusRouteCreate, current_user: CurrentUser, db: DbSession):
    """Create a new bus route."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    route = BusRoute(school_id=current_user.school_id, **body.model_dump())
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return BusRouteOut.model_validate(route)


@router.post("/routes/{route_id}/stops", response_model=BusStopOut, status_code=status.HTTP_201_CREATED)
async def add_stop_to_route(route_id: UUID, body: BusStopCreate, current_user: CurrentUser, db: DbSession):
    """Add a stop to a bus route."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    stop = BusStop(school_id=current_user.school_id, route_id=route_id, **body.model_dump())
    db.add(stop)
    await db.commit()
    await db.refresh(stop)
    return BusStopOut.model_validate(stop)


@router.get("/buses", response_model=List[BusOut])
async def list_buses(current_user: CurrentUser, db: DbSession):
    """List all buses for the school."""
    if not current_user.school_id:
        return []
    q = (
        select(Bus)
        .options(selectinload(Bus.route).selectinload(BusRoute.stops))
        .where(Bus.school_id == current_user.school_id)
        .order_by(Bus.bus_number)
    )
    res = await db.execute(q)
    buses = res.scalars().all()
    return [BusOut.model_validate(b) for b in buses]


@router.post("/buses", response_model=BusOut, status_code=status.HTTP_201_CREATED)
async def create_bus(body: BusCreate, current_user: CurrentUser, db: DbSession):
    """Create a new bus."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    data = body.model_dump()
    if data.get("route_id"):
        data["route_id"] = UUID(data["route_id"])
    else:
        data.pop("route_id", None)
    bus = Bus(school_id=current_user.school_id, **data)
    db.add(bus)
    await db.commit()
    await db.refresh(bus)
    return BusOut.model_validate(bus)


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def assign_student_to_bus(body: BusAssignmentCreate, current_user: CurrentUser, db: DbSession):
    """Assign a student to a bus."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    assignment = BusStudentAssignment(
        school_id=current_user.school_id,
        student_id=UUID(body.student_id),
        bus_id=UUID(body.bus_id),
        stop_id=UUID(body.stop_id) if body.stop_id else None,
        pickup_type=body.pickup_type,
    )
    db.add(assignment)
    await db.commit()
    return {"status": "assigned"}
