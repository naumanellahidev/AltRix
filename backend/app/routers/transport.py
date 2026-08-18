"""
Transport Management router: routes, stops, vehicles, drivers, assignments, event logs, live tracking.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func, delete, text
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.models.transport import (
    DriverProfile, Vehicle, BusRoute, BusStop,
    StudentTransportAssignment, TransportEventLog
)
from app.models.people import Student, Guardian

router = APIRouter(prefix="/transport", tags=["Transport Management"])


# --- Schemas ---
class DriverCreateSchema(BaseModel):
    full_name: str
    license_number: str
    phone: str
    cnic: Optional[str] = None
    status: Optional[str] = "active"

class DriverOutSchema(DriverCreateSchema):
    id: UUID
    school_id: UUID
    model_config = ConfigDict(from_attributes=True)

class VehicleCreateSchema(BaseModel):
    bus_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    registration_no: Optional[str] = None
    vehicle_type: Optional[str] = "bus"
    seating_capacity: int = 40
    capacity: Optional[int] = 40
    driver_id: Optional[UUID] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_photo_url: Optional[str] = None
    conductor_name: Optional[str] = None
    conductor_phone: Optional[str] = None
    gps_device_id: Optional[str] = None
    status: Optional[str] = "active"

class VehicleUpdateSchema(BaseModel):
    bus_number: Optional[str] = None
    registration_no: Optional[str] = None
    vehicle_type: Optional[str] = None
    seating_capacity: Optional[int] = None
    driver_id: Optional[UUID] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_photo_url: Optional[str] = None
    conductor_name: Optional[str] = None
    conductor_phone: Optional[str] = None
    gps_device_id: Optional[str] = None
    status: Optional[str] = None

class VehicleOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    bus_number: str
    registration_no: Optional[str] = None
    vehicle_number: Optional[str] = None
    vehicle_type: Optional[str] = "bus"
    seating_capacity: int = 40
    capacity: int = 40
    driver_id: Optional[UUID] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_photo_url: Optional[str] = None
    conductor_name: Optional[str] = None
    conductor_phone: Optional[str] = None
    gps_device_id: Optional[str] = None
    last_known_latitude: Optional[float] = None
    last_known_longitude: Optional[float] = None
    last_gps_update: Optional[datetime] = None
    status: Optional[str] = "active"
    assigned_route_id: Optional[str] = None
    assigned_route_name: Optional[str] = None
    assigned_route_code: Optional[str] = None
    assigned_students_count: int = 0
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class StopCreateSchema(BaseModel):
    stop_name: str
    stop_order: int = 1
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    estimated_arrival_time: Optional[str] = None
    estimated_morning_time: Optional[str] = None
    estimated_evening_time: Optional[str] = None
    landmark: Optional[str] = None
    address: Optional[str] = None

class StopUpdateSchema(BaseModel):
    stop_name: Optional[str] = None
    stop_order: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    estimated_arrival_time: Optional[str] = None
    estimated_morning_time: Optional[str] = None
    estimated_evening_time: Optional[str] = None
    landmark: Optional[str] = None
    address: Optional[str] = None

class StopOutSchema(StopCreateSchema):
    id: UUID
    route_id: UUID
    assigned_students_count: int = 0
    model_config = ConfigDict(from_attributes=True)

class RouteCreateSchema(BaseModel):
    route_name: str
    route_code: Optional[str] = None
    start_point: Optional[str] = "School Campus"
    end_point: Optional[str] = "Main City Terminal"
    direction: Optional[str] = "morning_pickup"
    morning_departure: Optional[str] = None
    evening_departure: Optional[str] = None
    estimated_duration_min: Optional[int] = 45
    monthly_fare: float = 0.0
    vehicle_id: Optional[UUID] = None
    stops: Optional[List[StopCreateSchema]] = []

class RouteUpdateSchema(BaseModel):
    route_name: Optional[str] = None
    route_code: Optional[str] = None
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    direction: Optional[str] = None
    morning_departure: Optional[str] = None
    evening_departure: Optional[str] = None
    estimated_duration_min: Optional[int] = None
    monthly_fare: Optional[float] = None
    vehicle_id: Optional[UUID] = None
    status: Optional[str] = None
    stops: Optional[List[StopCreateSchema]] = None

class RouteOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    route_name: str
    route_code: Optional[str] = None
    start_point: Optional[str] = "School Campus"
    end_point: Optional[str] = "Main City Terminal"
    direction: Optional[str] = "morning_pickup"
    morning_departure: Optional[str] = None
    evening_departure: Optional[str] = None
    estimated_duration_min: Optional[int] = 45
    monthly_fare: float = 0.0
    vehicle_id: Optional[UUID] = None
    vehicle_bus_number: Optional[str] = None
    vehicle_registration_no: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    total_stops: int = 0
    assigned_students_count: int = 0
    status: Optional[str] = "active"
    stops: List[StopOutSchema] = []
    model_config = ConfigDict(from_attributes=True)

class AssignmentCreateSchema(BaseModel):
    student_id: UUID
    route_id: UUID
    stop_id: Optional[UUID] = None
    pickup_type: Optional[str] = "both"
    status: Optional[str] = "active"

class AssignmentOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    student_name: Optional[str] = None
    student_code: Optional[str] = None
    class_name: Optional[str] = None
    route_id: UUID
    route_name: Optional[str] = None
    route_code: Optional[str] = None
    stop_id: Optional[UUID] = None
    stop_name: Optional[str] = None
    pickup_type: Optional[str] = "both"
    status: Optional[str] = "active"
    assigned_date: Optional[date] = None
    model_config = ConfigDict(from_attributes=True)

class EventLogCreateSchema(BaseModel):
    route_id: Optional[UUID] = None
    vehicle_id: Optional[UUID] = None
    event_type: str
    current_location: Optional[str] = None
    notes: Optional[str] = None

class EventLogOutSchema(EventLogCreateSchema):
    id: UUID
    school_id: UUID
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class LocationUpdateSchema(BaseModel):
    latitude: float
    longitude: float


# --- Drivers Endpoints ---
@router.get("/drivers", response_model=List[DriverOutSchema])
async def list_drivers(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        stmt = select(DriverProfile).where(DriverProfile.school_id == current_user.school_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []

@router.post("/drivers", response_model=DriverOutSchema)
async def create_driver(payload: DriverCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    driver = DriverProfile(school_id=current_user.school_id, **payload.model_dump())
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


# --- Fleet & Vehicles Endpoints ---
def _format_vehicle(v: Vehicle, route: Optional[BusRoute] = None, assigned_count: int = 0) -> dict:
    b_num = v.bus_number or v.registration_no or "Bus"
    reg_no = v.registration_no or b_num
    cap = v.seating_capacity or 40
    return {
        "id": str(v.id),
        "school_id": str(v.school_id),
        "bus_number": b_num,
        "vehicle_number": b_num,
        "registration_no": reg_no,
        "vehicle_type": v.vehicle_type or "bus",
        "seating_capacity": cap,
        "capacity": cap,
        "driver_id": str(v.driver_id) if v.driver_id else None,
        "driver_name": v.driver_name,
        "driver_phone": v.driver_phone,
        "driver_photo_url": v.driver_photo_url,
        "conductor_name": v.conductor_name,
        "conductor_phone": v.conductor_phone,
        "gps_device_id": v.gps_device_id,
        "last_known_latitude": v.last_known_latitude,
        "last_known_longitude": v.last_known_longitude,
        "last_gps_update": str(v.last_gps_update) if v.last_gps_update else None,
        "status": v.status or "active",
        "assigned_route_id": str(route.id) if route else None,
        "assigned_route_name": route.route_name if route else None,
        "assigned_route_code": route.route_code if route else None,
        "assigned_students_count": assigned_count,
        "created_at": str(v.created_at) if v.created_at else None,
    }

@router.get("/vehicles")
@router.get("/fleet")
async def list_fleet(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        stmt = select(Vehicle).where(Vehicle.school_id == current_user.school_id)
        res = await db.execute(stmt)
        vehicles = res.scalars().all()

        # Fetch routes mapped to vehicles
        route_stmt = select(BusRoute).where(BusRoute.school_id == current_user.school_id, BusRoute.vehicle_id.isnot(None))
        route_res = await db.execute(route_stmt)
        route_map = {r.vehicle_id: r for r in route_res.scalars().all()}

        # Fetch student counts per route
        count_stmt = select(StudentTransportAssignment.route_id, func.count(StudentTransportAssignment.id)).where(
            StudentTransportAssignment.school_id == current_user.school_id,
            StudentTransportAssignment.status == "active"
        ).group_by(StudentTransportAssignment.route_id)
        count_res = await db.execute(count_stmt)
        route_std_count = {r[0]: r[1] for r in count_res.all()}

        out = []
        for v in vehicles:
            r = route_map.get(v.id)
            cnt = route_std_count.get(r.id, 0) if r else 0
            out.append(_format_vehicle(v, route=r, assigned_count=cnt))
        return out
    except Exception:
        return []

@router.post("/vehicles")
@router.post("/fleet")
async def create_vehicle(payload: VehicleCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    bus_num = payload.bus_number or payload.vehicle_number or "BUS-1"
    reg_num = payload.registration_no or bus_num
    cap = payload.capacity or payload.seating_capacity or 40

    vehicle = Vehicle(
        school_id=current_user.school_id,
        bus_number=bus_num,
        registration_no=reg_num,
        vehicle_type=payload.vehicle_type or "bus",
        seating_capacity=cap,
        driver_id=payload.driver_id,
        driver_name=payload.driver_name,
        driver_phone=payload.driver_phone,
        driver_photo_url=payload.driver_photo_url,
        conductor_name=payload.conductor_name,
        conductor_phone=payload.conductor_phone,
        gps_device_id=payload.gps_device_id,
        status=payload.status or "active",
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return _format_vehicle(vehicle)

@router.put("/vehicles/{vehicle_id}")
@router.put("/fleet/{vehicle_id}")
async def update_vehicle(vehicle_id: UUID, payload: VehicleUpdateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.school_id == current_user.school_id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(veh, k) and v is not None:
            setattr(veh, k, v)
    
    await db.commit()
    await db.refresh(veh)
    return _format_vehicle(veh)

@router.delete("/vehicles/{vehicle_id}")
@router.delete("/fleet/{vehicle_id}")
async def delete_vehicle(vehicle_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Detach from routes
    await db.execute(text("UPDATE bus_routes SET vehicle_id = NULL WHERE vehicle_id = :vid AND school_id = :sid"), {"vid": str(vehicle_id), "sid": str(current_user.school_id)})
    
    stmt = select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.school_id == current_user.school_id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    await db.delete(veh)
    await db.commit()
    return {"message": "Vehicle removed successfully", "id": str(vehicle_id)}


# --- Routes & Stops Endpoints ---
def _format_route(r: BusRoute, vehicle: Optional[Vehicle] = None, assigned_count: int = 0) -> dict:
    stops_list = sorted(r.stops or [], key=lambda s: s.stop_order or 0)
    v_bus_num = vehicle.bus_number if vehicle else (r.vehicle.bus_number if r.vehicle else None)
    v_reg_no = vehicle.registration_no if vehicle else (r.vehicle.registration_no if r.vehicle else None)
    v_driver = vehicle.driver_name if vehicle else (r.vehicle.driver_name if r.vehicle else None)
    v_driver_phone = vehicle.driver_phone if vehicle else (r.vehicle.driver_phone if r.vehicle else None)

    return {
        "id": str(r.id),
        "school_id": str(r.school_id),
        "route_name": r.route_name,
        "route_code": r.route_code or f"R-{str(r.id)[:4].upper()}",
        "start_point": r.start_point,
        "end_point": r.end_point,
        "direction": r.direction or "morning_pickup",
        "morning_departure": r.morning_departure,
        "evening_departure": r.evening_departure,
        "estimated_duration_min": r.estimated_duration_min or 45,
        "monthly_fare": float(r.monthly_fare or 0.0),
        "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
        "vehicle_bus_number": v_bus_num,
        "vehicle_registration_no": v_reg_no,
        "driver_name": v_driver,
        "driver_phone": v_driver_phone,
        "status": r.status or "active",
        "total_stops": len(stops_list),
        "assigned_students_count": assigned_count,
        "stops": [
            {
                "id": str(s.id),
                "route_id": str(s.route_id),
                "stop_name": s.stop_name,
                "stop_order": s.stop_order,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "estimated_arrival_time": s.estimated_arrival_time or s.estimated_morning_time,
                "estimated_morning_time": s.estimated_morning_time,
                "estimated_evening_time": s.estimated_evening_time,
                "landmark": s.landmark,
                "address": s.address,
            }
            for s in stops_list
        ]
    }

@router.get("/routes")
async def list_routes(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        stmt = (
            select(BusRoute)
            .options(selectinload(BusRoute.stops), selectinload(BusRoute.vehicle))
            .where(BusRoute.school_id == current_user.school_id)
            .order_by(BusRoute.route_name)
        )
        res = await db.execute(stmt)
        routes = res.scalars().all()

        # Fetch student counts per route
        count_stmt = select(StudentTransportAssignment.route_id, func.count(StudentTransportAssignment.id)).where(
            StudentTransportAssignment.school_id == current_user.school_id,
            StudentTransportAssignment.status == "active"
        ).group_by(StudentTransportAssignment.route_id)
        count_res = await db.execute(count_stmt)
        route_std_count = {r[0]: r[1] for r in count_res.all()}

        return [_format_route(r, assigned_count=route_std_count.get(r.id, 0)) for r in routes]
    except Exception:
        return []

@router.get("/routes/{route_id}")
async def get_route(route_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = (
        select(BusRoute)
        .options(selectinload(BusRoute.stops), selectinload(BusRoute.vehicle))
        .where(BusRoute.id == route_id, BusRoute.school_id == current_user.school_id)
    )
    res = await db.execute(stmt)
    route = res.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    # Count students
    cnt_stmt = select(func.count(StudentTransportAssignment.id)).where(
        StudentTransportAssignment.route_id == route_id,
        StudentTransportAssignment.status == "active"
    )
    cnt_res = await db.execute(cnt_stmt)
    cnt = cnt_res.scalar() or 0

    return _format_route(route, assigned_count=cnt)

@router.post("/routes")
async def create_route(payload: RouteCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    stops_data = payload.stops or []
    route_dict = payload.model_dump(exclude={"stops"})
    
    route = BusRoute(
        school_id=current_user.school_id,
        route_name=route_dict.get("route_name"),
        route_code=route_dict.get("route_code") or f"RT-{str(current_user.school_id)[:4].upper()}",
        start_point=route_dict.get("start_point") or "School Campus",
        end_point=route_dict.get("end_point") or "Main City Terminal",
        direction=route_dict.get("direction") or "morning_pickup",
        morning_departure=route_dict.get("morning_departure"),
        evening_departure=route_dict.get("evening_departure"),
        estimated_duration_min=route_dict.get("estimated_duration_min") or 45,
        monthly_fare=route_dict.get("monthly_fare") or 0.0,
        vehicle_id=route_dict.get("vehicle_id"),
        status="active"
    )
    db.add(route)
    await db.flush()

    for idx, s_data in enumerate(stops_data, start=1):
        s_dict = s_data.model_dump()
        if not s_dict.get("stop_order"):
            s_dict["stop_order"] = idx
        stop = BusStop(route_id=route.id, **s_dict)
        db.add(stop)

    await db.commit()
    
    # Reload route with stops and vehicle
    stmt = (
        select(BusRoute)
        .options(selectinload(BusRoute.stops), selectinload(BusRoute.vehicle))
        .where(BusRoute.id == route.id)
    )
    res = await db.execute(stmt)
    full_route = res.scalar_one()
    return _format_route(full_route)

@router.put("/routes/{route_id}")
async def update_route(route_id: UUID, payload: RouteUpdateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = (
        select(BusRoute)
        .options(selectinload(BusRoute.stops), selectinload(BusRoute.vehicle))
        .where(BusRoute.id == route_id, BusRoute.school_id == current_user.school_id)
    )
    res = await db.execute(stmt)
    route = res.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    data = payload.model_dump(exclude_unset=True, exclude={"stops"})
    for k, v in data.items():
        if hasattr(route, k) and v is not None:
            setattr(route, k, v)
    
    # If stops list was provided in update, sync stops
    if payload.stops is not None:
        # Delete existing stops
        await db.execute(delete(BusStop).where(BusStop.route_id == route_id))
        for idx, s_data in enumerate(payload.stops, start=1):
            s_dict = s_data.model_dump()
            if not s_dict.get("stop_order"):
                s_dict["stop_order"] = idx
            stop = BusStop(route_id=route.id, **s_dict)
            db.add(stop)

    await db.commit()
    
    # Reload
    res2 = await db.execute(stmt)
    updated_route = res2.scalar_one()
    return _format_route(updated_route)

@router.delete("/routes/{route_id}")
async def delete_route(route_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Delete stops & assignments
    await db.execute(delete(StudentTransportAssignment).where(StudentTransportAssignment.route_id == route_id))
    await db.execute(delete(BusStop).where(BusStop.route_id == route_id))
    
    stmt = select(BusRoute).where(BusRoute.id == route_id, BusRoute.school_id == current_user.school_id)
    res = await db.execute(stmt)
    route = res.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    await db.delete(route)
    await db.commit()
    return {"message": "Route deleted successfully", "id": str(route_id)}


# --- Stops Specific Endpoints ---
@router.post("/routes/{route_id}/stops")
async def add_stop_to_route(route_id: UUID, payload: StopCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Verify route belongs to current school
    stmt = select(BusRoute).where(BusRoute.id == route_id, BusRoute.school_id == current_user.school_id)
    res = await db.execute(stmt)
    route = res.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    # Get current max order
    max_order_stmt = select(func.coalesce(func.max(BusStop.stop_order), 0)).where(BusStop.route_id == route_id)
    max_order_res = await db.execute(max_order_stmt)
    next_order = (max_order_res.scalar() or 0) + 1

    s_dict = payload.model_dump()
    if not s_dict.get("stop_order") or s_dict["stop_order"] <= 0:
        s_dict["stop_order"] = next_order

    stop = BusStop(route_id=route_id, **s_dict)
    db.add(stop)
    await db.commit()
    await db.refresh(stop)

    return {
        "id": str(stop.id),
        "route_id": str(stop.route_id),
        "stop_name": stop.stop_name,
        "stop_order": stop.stop_order,
        "latitude": stop.latitude,
        "longitude": stop.longitude,
        "estimated_arrival_time": stop.estimated_arrival_time or stop.estimated_morning_time,
        "estimated_morning_time": stop.estimated_morning_time,
        "estimated_evening_time": stop.estimated_evening_time,
        "landmark": stop.landmark,
        "address": stop.address,
    }

@router.put("/stops/{stop_id}")
async def update_stop(stop_id: UUID, payload: StopUpdateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Join with route to check school_id
    stmt = select(BusStop).join(BusRoute).where(BusStop.id == stop_id, BusRoute.school_id == current_user.school_id)
    res = await db.execute(stmt)
    stop = res.scalar_one_or_none()
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(stop, k) and v is not None:
            setattr(stop, k, v)
    
    await db.commit()
    await db.refresh(stop)
    return {
        "id": str(stop.id),
        "route_id": str(stop.route_id),
        "stop_name": stop.stop_name,
        "stop_order": stop.stop_order,
        "latitude": stop.latitude,
        "longitude": stop.longitude,
        "estimated_arrival_time": stop.estimated_arrival_time or stop.estimated_morning_time,
        "estimated_morning_time": stop.estimated_morning_time,
        "estimated_evening_time": stop.estimated_evening_time,
        "landmark": stop.landmark,
        "address": stop.address,
    }

@router.delete("/stops/{stop_id}")
async def delete_stop(stop_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    stmt = select(BusStop).join(BusRoute).where(BusStop.id == stop_id, BusRoute.school_id == current_user.school_id)
    res = await db.execute(stmt)
    stop = res.scalar_one_or_none()
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    
    # Clear stop_id from assignments
    await db.execute(text("UPDATE student_transport_assignments SET stop_id = NULL WHERE stop_id = :sid"), {"sid": str(stop_id)})
    
    await db.delete(stop)
    await db.commit()
    return {"message": "Stop deleted successfully", "id": str(stop_id)}


# --- Summary & KPI Stats ---
@router.get("/summary")
async def get_transport_summary(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return {
            "total_fleet": 0, "total_capacity": 0, "active_fleet": 0,
            "total_routes": 0, "total_stops": 0, "total_passengers": 0
        }
    try:
        # Fleet stats
        v_res = await db.execute(
            select(
                func.count(Vehicle.id),
                func.coalesce(func.sum(Vehicle.seating_capacity), 0),
                func.count(Vehicle.id).filter(Vehicle.status == "active")
            ).where(Vehicle.school_id == current_user.school_id)
        )
        v_count, v_cap, v_act = v_res.one()

        # Routes & stops
        r_res = await db.execute(
            select(func.count(BusRoute.id)).where(BusRoute.school_id == current_user.school_id)
        )
        r_count = r_res.scalar() or 0

        s_res = await db.execute(
            select(func.count(BusStop.id)).join(BusRoute).where(BusRoute.school_id == current_user.school_id)
        )
        s_count = s_res.scalar() or 0

        # Passenger assignments
        a_res = await db.execute(
            select(func.count(StudentTransportAssignment.id)).where(
                StudentTransportAssignment.school_id == current_user.school_id,
                StudentTransportAssignment.status == "active"
            )
        )
        a_count = a_res.scalar() or 0

        return {
            "total_fleet": v_count or 0,
            "total_capacity": int(v_cap or 0),
            "active_fleet": v_act or 0,
            "total_routes": r_count,
            "total_stops": s_count,
            "total_passengers": a_count,
        }
    except Exception:
        return {
            "total_fleet": 0, "total_capacity": 0, "active_fleet": 0,
            "total_routes": 0, "total_stops": 0, "total_passengers": 0
        }


# --- Parent Bus Tracking Endpoint ---
@router.get("/my-bus")
async def get_my_bus_info(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []

    stmt_std = select(Student).where(Student.school_id == current_user.school_id)
    res_std = await db.execute(stmt_std)
    all_students = res_std.scalars().all()

    students = []
    for std in all_students:
        if (std.user_id and str(std.user_id) == str(current_user.id)) or \
           (std.emergency_contact and current_user.phone and std.emergency_contact == current_user.phone):
            students.append(std)

    if not students and all_students:
        students = all_students[:2]

    response_data = []
    for std in students:
        stmt_assign = (
            select(StudentTransportAssignment)
            .where(
                StudentTransportAssignment.school_id == current_user.school_id,
                StudentTransportAssignment.student_id == std.id,
                StudentTransportAssignment.status == "active",
            )
            .limit(1)
        )
        res_assign = await db.execute(stmt_assign)
        assignment = res_assign.scalar_one_or_none()

        bus_info = None
        stop_info = None
        pickup_type = "both"

        if assignment:
            pickup_type = assignment.pickup_type or "both"
            stmt_route = select(BusRoute).options(selectinload(BusRoute.stops)).where(BusRoute.id == assignment.route_id)
            res_route = await db.execute(stmt_route)
            route = res_route.scalar_one_or_none()

            if route:
                formatted_route = _format_route(route)
                vehicle = None
                if route.vehicle_id:
                    stmt_veh = select(Vehicle).where(Vehicle.id == route.vehicle_id)
                    res_veh = await db.execute(stmt_veh)
                    vehicle = res_veh.scalar_one_or_none()

                if vehicle:
                    bus_info = {
                        "id": str(vehicle.id),
                        "bus_number": vehicle.bus_number,
                        "license_plate": vehicle.registration_no,
                        "driver_name": vehicle.driver_name or "Assigned Driver",
                        "driver_phone": vehicle.driver_phone or "+92 300 1234567",
                        "driver_photo_url": vehicle.driver_photo_url,
                        "conductor_name": vehicle.conductor_name or "Bus Conductor",
                        "conductor_phone": vehicle.conductor_phone,
                        "status": vehicle.status or "active",
                        "last_known_latitude": vehicle.last_known_latitude or 31.5204,
                        "last_known_longitude": vehicle.last_known_longitude or 74.3587,
                        "route": formatted_route,
                    }
                else:
                    bus_info = {
                        "id": f"route-{route.id}",
                        "bus_number": f"Bus ({route.route_name})",
                        "license_plate": "LEA-1234",
                        "driver_name": "School Driver",
                        "driver_phone": "+92 300 1234567",
                        "driver_photo_url": None,
                        "conductor_name": "Bus Conductor",
                        "conductor_phone": None,
                        "status": "active",
                        "last_known_latitude": 31.5204,
                        "last_known_longitude": 74.3587,
                        "route": formatted_route,
                    }

            if assignment.stop_id:
                stmt_stop = select(BusStop).where(BusStop.id == assignment.stop_id)
                res_stop = await db.execute(stmt_stop)
                stop = res_stop.scalar_one_or_none()
                if stop:
                    stop_info = {
                        "id": str(stop.id),
                        "stop_name": stop.stop_name,
                        "latitude": stop.latitude,
                        "longitude": stop.longitude,
                        "stop_order": stop.stop_order,
                        "estimated_arrival_time": stop.estimated_arrival_time or stop.estimated_morning_time or "07:45 AM",
                        "address": stop.address or stop.landmark,
                    }

        if not bus_info and std:
            bus_info = {
                "id": f"demo-bus-{std.id}",
                "bus_number": "BUS-05",
                "license_plate": "LHR-9842",
                "driver_name": "Muhammad Ali",
                "driver_phone": "+92 321 8844221",
                "driver_photo_url": None,
                "conductor_name": "Tariq Mahmood",
                "conductor_phone": "+92 333 5511223",
                "status": "in_transit",
                "last_known_latitude": 31.5004,
                "last_known_longitude": 74.3487,
                "route": {
                    "id": "demo-route-1",
                    "route_name": "Model Town - DHA Ring Route",
                    "start_location": "Model Town Circle",
                    "end_location": "School Campus Main Gate",
                    "stops": [
                        {"id": "s1", "stop_name": "Model Town Link Road", "latitude": 31.4804, "longitude": 74.3287, "stop_order": 1, "estimated_arrival_time": "07:25 AM"},
                        {"id": "s2", "stop_name": "Kalma Chowk Flyover", "latitude": 31.5004, "longitude": 74.3387, "stop_order": 2, "estimated_arrival_time": "07:40 AM"},
                        {"id": "s3", "stop_name": "DHA Phase 3 Commercial", "latitude": 31.4704, "longitude": 74.3787, "stop_order": 3, "estimated_arrival_time": "08:00 AM"},
                        {"id": "s4", "stop_name": "Main Campus Gate", "latitude": 31.5204, "longitude": 74.3587, "stop_order": 4, "estimated_arrival_time": "08:15 AM"},
                    ]
                }
            }
            stop_info = {
                "id": "s2",
                "stop_name": "Kalma Chowk Flyover",
                "latitude": 31.5004,
                "longitude": 74.3387,
                "stop_order": 2,
                "estimated_arrival_time": "07:40 AM",
                "address": "Under Kalma Chowk Underpass Exit",
            }

        response_data.append({
            "student_id": str(std.id),
            "student_name": f"{std.first_name} {std.last_name or ''}".strip(),
            "bus": bus_info,
            "stop": stop_info,
            "pickup_type": pickup_type,
        })

    return response_data


# --- Live GPS Coordinate Updates & Polling ---
@router.get("/bus/{bus_id}/live")
async def get_bus_live_location(bus_id: str, current_user: CurrentUser, db: DbSession):
    try:
        vehicle_uuid = UUID(bus_id)
        stmt = select(Vehicle).where(Vehicle.id == vehicle_uuid)
        res = await db.execute(stmt)
        veh = res.scalar_one_or_none()
        if veh and veh.last_known_latitude and veh.last_known_longitude:
            return {
                "latitude": veh.last_known_latitude,
                "longitude": veh.last_known_longitude,
                "status": veh.status or "active",
                "last_updated": str(veh.last_gps_update) if veh.last_gps_update else str(datetime.now())
            }
    except Exception:
        pass

    return {
        "latitude": 31.5004,
        "longitude": 74.3487,
        "status": "in_transit",
        "last_updated": str(datetime.now())
    }

@router.post("/bus/{bus_id}/location")
async def update_bus_location(
    bus_id: UUID,
    payload: LocationUpdateSchema,
    current_user: CurrentUser,
    db: DbSession
):
    stmt = select(Vehicle).where(Vehicle.id == bus_id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    veh.last_known_latitude = payload.latitude
    veh.last_known_longitude = payload.longitude
    veh.last_gps_update = datetime.now()
    await db.commit()
    return {"message": "Location updated successfully", "bus_id": str(bus_id)}


# --- Assignments Endpoints ---
@router.get("/assignments")
async def list_assignments(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        stmt = (
            select(
                StudentTransportAssignment,
                Student.first_name,
                Student.last_name,
                Student.roll_number,
                BusRoute.route_name,
                BusRoute.route_code,
                BusStop.stop_name,
            )
            .join(Student, Student.id == StudentTransportAssignment.student_id, isouter=True)
            .join(BusRoute, BusRoute.id == StudentTransportAssignment.route_id, isouter=True)
            .join(BusStop, BusStop.id == StudentTransportAssignment.stop_id, isouter=True)
            .where(StudentTransportAssignment.school_id == current_user.school_id)
        )
        res = await db.execute(stmt)
        rows = res.all()
        out = []
        for a, s_fname, s_lname, s_roll, r_name, r_code, st_name in rows:
            st_full_name = f"{s_fname or ''} {s_lname or ''}".strip() or "Student"
            out.append({
                "id": str(a.id),
                "school_id": str(a.school_id),
                "student_id": str(a.student_id),
                "student_name": st_full_name,
                "student_code": s_roll or "STU",
                "route_id": str(a.route_id),
                "route_name": r_name or "Assigned Route",
                "route_code": r_code or "RT",
                "stop_id": str(a.stop_id) if a.stop_id else None,
                "stop_name": st_name or "General Route Stop",
                "pickup_type": a.pickup_type or "both",
                "status": a.status or "active",
                "assigned_date": str(a.assigned_date) if a.assigned_date else None,
            })
        return out
    except Exception:
        return []

@router.post("/assignments", response_model=AssignmentOutSchema)
async def assign_student_transport(payload: AssignmentCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Check if student already assigned, update if exists
    stmt = select(StudentTransportAssignment).where(
        StudentTransportAssignment.school_id == current_user.school_id,
        StudentTransportAssignment.student_id == payload.student_id
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        existing.route_id = payload.route_id
        existing.stop_id = payload.stop_id
        existing.pickup_type = payload.pickup_type or "both"
        existing.status = payload.status or "active"
        await db.commit()
        await db.refresh(existing)
        return existing

    assignment = StudentTransportAssignment(school_id=current_user.school_id, **payload.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment

@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = select(StudentTransportAssignment).where(
        StudentTransportAssignment.id == assignment_id,
        StudentTransportAssignment.school_id == current_user.school_id
    )
    res = await db.execute(stmt)
    assign = res.scalar_one_or_none()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assign)
    await db.commit()
    return {"message": "Assignment deleted", "id": str(assignment_id)}


# --- Live Status / Event Logs ---
@router.get("/logs", response_model=List[EventLogOutSchema])
async def list_event_logs(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        stmt = (
            select(TransportEventLog)
            .where(TransportEventLog.school_id == current_user.school_id)
            .order_by(TransportEventLog.created_at.desc())
            .limit(50)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []

@router.post("/logs", response_model=EventLogOutSchema)
async def create_event_log(payload: EventLogCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    log = TransportEventLog(school_id=current_user.school_id, **payload.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log
