import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Bus, MapPin, User, Plus, Search, RefreshCw, Navigation, AlertCircle, ShieldCheck,
  Trash2, Edit3, Clock, ArrowRight, CheckCircle2, Phone, Users, Compass,
  ChevronRight, ArrowUpDown, ChevronUp, ChevronDown, Check, X, Radio
} from "lucide-react";

interface Stop {
  id?: string;
  route_id?: string;
  stop_name: string;
  stop_order: number;
  latitude?: number;
  longitude?: number;
  estimated_arrival_time?: string;
  estimated_morning_time?: string;
  estimated_evening_time?: string;
  landmark?: string;
  address?: string;
}

interface Vehicle {
  id: string;
  bus_number: string;
  registration_no?: string;
  vehicle_type?: string;
  seating_capacity: number;
  capacity?: number;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  conductor_name?: string;
  conductor_phone?: string;
  gps_device_id?: string;
  last_known_latitude?: number;
  last_known_longitude?: number;
  last_gps_update?: string;
  status: string;
  assigned_route_id?: string;
  assigned_route_name?: string;
  assigned_route_code?: string;
  assigned_students_count?: number;
}

interface Route {
  id: string;
  route_name: string;
  route_code: string;
  start_point: string;
  end_point: string;
  direction?: string;
  morning_departure?: string;
  evening_departure?: string;
  estimated_duration_min?: number;
  monthly_fare: number;
  vehicle_id?: string;
  vehicle_bus_number?: string;
  vehicle_registration_no?: string;
  driver_name?: string;
  driver_phone?: string;
  total_stops: number;
  assigned_students_count?: number;
  status?: string;
  stops: Stop[];
}

interface Assignment {
  id: string;
  student_id: string;
  student_name: string;
  student_code?: string;
  route_id: string;
  route_name: string;
  route_code?: string;
  stop_id?: string;
  stop_name?: string;
  pickup_type: string;
  status: string;
  assigned_date?: string;
}

export function TransportModule() {
  const [activeTab, setActiveTab] = useState("routes");
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_fleet: 0,
    total_capacity: 0,
    active_fleet: 0,
    total_routes: 0,
    total_stops: 0,
    total_passengers: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Add / Edit Bus Modal
  const [showAddBus, setShowAddBus] = useState(false);
  const [editingBusId, setEditingBusId] = useState<string | null>(null);
  const [busForm, setBusForm] = useState({
    bus_number: "",
    registration_no: "",
    vehicle_type: "bus",
    seating_capacity: 40,
    driver_name: "",
    driver_phone: "",
    conductor_name: "",
    conductor_phone: "",
    gps_device_id: "",
    status: "active",
  });

  // Add / Edit Route Modal with Inline Stops Builder
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<{
    route_name: string;
    route_code: string;
    start_point: string;
    end_point: string;
    direction: string;
    morning_departure: string;
    evening_departure: string;
    estimated_duration_min: number;
    monthly_fare: number;
    vehicle_id: string;
    stops: Stop[];
  }>({
    route_name: "",
    route_code: "",
    start_point: "",
    end_point: "",
    direction: "morning_pickup",
    morning_departure: "07:15 AM",
    evening_departure: "02:30 PM",
    estimated_duration_min: 45,
    monthly_fare: 4000,
    vehicle_id: "",
    stops: [
      { stop_name: "", stop_order: 1, estimated_morning_time: "07:20 AM", estimated_evening_time: "02:40 PM", landmark: "" }
    ],
  });

  // Manage Stops Modal (Timeline View)
  const [selectedRouteForStops, setSelectedRouteForStops] = useState<Route | null>(null);
  const [newStopName, setNewStopName] = useState("");
  const [newStopMorningTime, setNewStopMorningTime] = useState("07:30 AM");
  const [newStopEveningTime, setNewStopEveningTime] = useState("02:45 PM");
  const [newStopLandmark, setNewStopLandmark] = useState("");
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStopData, setEditingStopData] = useState<Partial<Stop>>({});

  // Assign Student Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    student_id: "",
    route_id: "",
    stop_id: "",
    pickup_type: "both",
  });

  // Live GPS Tracking Modal
  const [trackingVehicle, setTrackingVehicle] = useState<Vehicle | null>(null);

  const loadTransportData = async () => {
    setLoading(true);
    try {
      const [resFleet, resRoutes, resAssignments, resSummary, resStudents] = await Promise.all([
        apiClient.get("/transport/fleet"),
        apiClient.get("/transport/routes"),
        apiClient.get("/transport/assignments").catch(() => ({ data: [] })),
        apiClient.get("/transport/summary").catch(() => ({ data: null })),
        apiClient.get("/students?page_size=200").catch(() => ({ data: { items: [] } }))
      ]);

      const fleetData = resFleet.data ?? [];
      const routesData = resRoutes.data ?? [];
      const assignData = resAssignments.data ?? [];
      const studentsList = resStudents.data?.items ?? (Array.isArray(resStudents.data) ? resStudents.data : []);

      setFleet(fleetData);
      setRoutes(routesData);
      setAssignments(assignData);
      setStudents(studentsList);

      if (resSummary?.data) {
        setSummary(resSummary.data);
      } else {
        const totalStops = routesData.reduce((acc: number, r: Route) => acc + (r.total_stops || r.stops?.length || 0), 0);
        const totalCap = fleetData.reduce((acc: number, v: Vehicle) => acc + (v.seating_capacity || 40), 0);
        setSummary({
          total_fleet: fleetData.length,
          total_capacity: totalCap,
          active_fleet: fleetData.filter((v: Vehicle) => v.status === "active").length,
          total_routes: routesData.length,
          total_stops: totalStops,
          total_passengers: assignData.length,
        });
      }

      // If stops modal is currently open, refresh the selected route object
      if (selectedRouteForStops) {
        const fresh = routesData.find((r: Route) => r.id === selectedRouteForStops.id);
        if (fresh) setSelectedRouteForStops(fresh);
      }
    } catch {
      toast.error("Failed to load transport data");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTransportData();
  }, []);

  // --- Vehicle Handlers ---
  const handleOpenAddBus = () => {
    setEditingBusId(null);
    setBusForm({
      bus_number: `BUS-0${fleet.length + 1}`,
      registration_no: "",
      vehicle_type: "bus",
      seating_capacity: 40,
      driver_name: "",
      driver_phone: "",
      conductor_name: "",
      conductor_phone: "",
      gps_device_id: `GPS-TR-${Math.floor(1000 + Math.random() * 9000)}`,
      status: "active",
    });
    setShowAddBus(true);
  };

  const handleOpenEditBus = (v: Vehicle) => {
    setEditingBusId(v.id);
    setBusForm({
      bus_number: v.bus_number || "",
      registration_no: v.registration_no || "",
      vehicle_type: v.vehicle_type || "bus",
      seating_capacity: v.seating_capacity || 40,
      driver_name: v.driver_name || "",
      driver_phone: v.driver_phone || "",
      conductor_name: v.conductor_name || "",
      conductor_phone: v.conductor_phone || "",
      gps_device_id: v.gps_device_id || "",
      status: v.status || "active",
    });
    setShowAddBus(true);
  };

  const handleSaveBus = async () => {
    if (!busForm.bus_number) {
      toast.error("Please provide a bus identifier (e.g. BUS-01)");
      return;
    }
    try {
      if (editingBusId) {
        await apiClient.put(`/transport/vehicles/${editingBusId}`, busForm);
        toast.success("Vehicle fleet updated successfully");
      } else {
        await apiClient.post("/transport/fleet", busForm);
        toast.success("New school bus registered to fleet");
      }
      setShowAddBus(false);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save vehicle");
    }
  };

  const handleDeleteBus = async (id: string, busNum: string) => {
    if (!confirm(`Are you sure you want to remove vehicle "${busNum}" from the fleet roster?`)) return;
    try {
      await apiClient.delete(`/transport/vehicles/${id}`);
      toast.success(`Vehicle ${busNum} removed`);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete vehicle");
    }
  };

  // --- Route Handlers ---
  const handleOpenAddRoute = () => {
    setEditingRouteId(null);
    setRouteForm({
      route_name: "",
      route_code: `RT-${100 + routes.length + 1}`,
      start_point: "",
      end_point: "",
      direction: "morning_pickup",
      morning_departure: "07:15 AM",
      evening_departure: "02:30 PM",
      estimated_duration_min: 45,
      monthly_fare: 4000,
      vehicle_id: fleet[0]?.id || "",
      stops: [
        { stop_name: "Pickup Hub 1", stop_order: 1, estimated_morning_time: "07:20 AM", estimated_evening_time: "02:40 PM", landmark: "" },
        { stop_name: "Pickup Hub 2", stop_order: 2, estimated_morning_time: "07:35 AM", estimated_evening_time: "02:55 PM", landmark: "" },
      ],
    });
    setShowRouteModal(true);
  };

  const handleOpenEditRoute = (r: Route) => {
    setEditingRouteId(r.id);
    setRouteForm({
      route_name: r.route_name || "",
      route_code: r.route_code || "",
      start_point: r.start_point || "",
      end_point: r.end_point || "",
      direction: r.direction || "morning_pickup",
      morning_departure: r.morning_departure || "07:15 AM",
      evening_departure: r.evening_departure || "02:30 PM",
      estimated_duration_min: r.estimated_duration_min || 45,
      monthly_fare: r.monthly_fare || 0,
      vehicle_id: r.vehicle_id || "",
      stops: (r.stops && r.stops.length > 0)
        ? r.stops.map(s => ({ ...s }))
        : [
            { stop_name: r.start_point || "Initial Stop", stop_order: 1, estimated_morning_time: "07:20 AM", estimated_evening_time: "02:40 PM", landmark: "" },
            { stop_name: r.end_point || "Terminal Stop", stop_order: 2, estimated_morning_time: "07:50 AM", estimated_evening_time: "03:10 PM", landmark: "" }
          ],
    });
    setShowRouteModal(true);
  };

  const handleAddInlineStop = () => {
    const nextOrder = routeForm.stops.length + 1;
    setRouteForm({
      ...routeForm,
      stops: [
        ...routeForm.stops,
        {
          stop_name: `Designated Stop ${nextOrder}`,
          stop_order: nextOrder,
          estimated_morning_time: "07:40 AM",
          estimated_evening_time: "02:50 PM",
          landmark: "",
        }
      ]
    });
  };

  const handleRemoveInlineStop = (index: number) => {
    const updated = routeForm.stops.filter((_, idx) => idx !== index);
    // Reassign order
    const reordered = updated.map((s, idx) => ({ ...s, stop_order: idx + 1 }));
    setRouteForm({ ...routeForm, stops: reordered });
  };

  const handleSaveRoute = async () => {
    if (!routeForm.route_name || !routeForm.route_code) {
      toast.error("Please provide both Route Code and Route Name");
      return;
    }
    if (!routeForm.start_point || !routeForm.end_point) {
      toast.error("Please specify both starting and destination points");
      return;
    }

    // Filter valid stops
    const cleanedStops = routeForm.stops
      .filter(s => s.stop_name.trim().length > 0)
      .map((s, idx) => ({ ...s, stop_order: idx + 1 }));

    const payload = {
      ...routeForm,
      vehicle_id: routeForm.vehicle_id || null,
      stops: cleanedStops
    };

    try {
      if (editingRouteId) {
        await apiClient.put(`/transport/routes/${editingRouteId}`, payload);
        toast.success("Transport route and stops updated successfully");
      } else {
        await apiClient.post("/transport/routes", payload);
        toast.success(`Route ${routeForm.route_code} created with ${cleanedStops.length} designated stops`);
      }
      setShowRouteModal(false);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save route");
    }
  };

  const handleDeleteRoute = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to delete route "${code}" and all its designated stops?`)) return;
    try {
      await apiClient.delete(`/transport/routes/${id}`);
      toast.success(`Route ${code} deleted`);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete route");
    }
  };

  // --- Stop Management Handlers ---
  const handleOpenStopsModal = (r: Route) => {
    setSelectedRouteForStops(r);
    setNewStopName("");
    setNewStopMorningTime("07:30 AM");
    setNewStopEveningTime("02:45 PM");
    setNewStopLandmark("");
    setEditingStopId(null);
  };

  const handleAddStopToRoute = async () => {
    if (!selectedRouteForStops) return;
    if (!newStopName.trim()) {
      toast.error("Please enter a stop name");
      return;
    }
    try {
      await apiClient.post(`/transport/routes/${selectedRouteForStops.id}/stops`, {
        stop_name: newStopName.trim(),
        estimated_morning_time: newStopMorningTime,
        estimated_evening_time: newStopEveningTime,
        landmark: newStopLandmark.trim(),
        stop_order: (selectedRouteForStops.stops?.length || 0) + 1
      });
      toast.success(`Stop "${newStopName}" added to ${selectedRouteForStops.route_code}`);
      setNewStopName("");
      setNewStopLandmark("");
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add stop");
    }
  };

  const handleSaveEditStop = async (stopId: string) => {
    try {
      await apiClient.put(`/transport/stops/${stopId}`, editingStopData);
      toast.success("Stop updated");
      setEditingStopId(null);
      setEditingStopData({});
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update stop");
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (!confirm(`Remove stop "${stopName}" from this route?`)) return;
    try {
      await apiClient.delete(`/transport/stops/${stopId}`);
      toast.success(`Stop removed`);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete stop");
    }
  };

  // --- Student Assignment Handlers ---
  const handleOpenAssignModal = () => {
    setAssignForm({
      student_id: students[0]?.id || "",
      route_id: routes[0]?.id || "",
      stop_id: routes[0]?.stops?.[0]?.id || "",
      pickup_type: "both",
    });
    setShowAssignModal(true);
  };

  const handleSaveAssignment = async () => {
    if (!assignForm.student_id || !assignForm.route_id) {
      toast.error("Please select a student and route");
      return;
    }
    try {
      await apiClient.post("/transport/assignments", {
        student_id: assignForm.student_id,
        route_id: assignForm.route_id,
        stop_id: assignForm.stop_id || null,
        pickup_type: assignForm.pickup_type,
        status: "active",
      });
      toast.success("Student passenger assigned to route");
      setShowAssignModal(false);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to assign student");
    }
  };

  const handleDeleteAssignment = async (assignId: string, stdName: string) => {
    if (!confirm(`Cancel transport subscription for ${stdName}?`)) return;
    try {
      await apiClient.delete(`/transport/assignments/${assignId}`);
      toast.success("Transport assignment removed");
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to remove assignment");
    }
  };

  // Filtered lists
  const filteredFleet = fleet.filter(v =>
    v.bus_number.toLowerCase().includes(search.toLowerCase()) ||
    (v.driver_name && v.driver_name.toLowerCase().includes(search.toLowerCase())) ||
    (v.registration_no && v.registration_no.toLowerCase().includes(search.toLowerCase())) ||
    (v.assigned_route_name && v.assigned_route_name.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredRoutes = routes.filter(r =>
    r.route_name.toLowerCase().includes(search.toLowerCase()) ||
    r.route_code.toLowerCase().includes(search.toLowerCase()) ||
    r.start_point.toLowerCase().includes(search.toLowerCase()) ||
    r.end_point.toLowerCase().includes(search.toLowerCase()) ||
    (r.stops && r.stops.some(s => s.stop_name.toLowerCase().includes(search.toLowerCase())))
  );

  const filteredAssignments = assignments.filter(a =>
    a.student_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.student_code && a.student_code.toLowerCase().includes(search.toLowerCase())) ||
    a.route_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.stop_name && a.stop_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto p-2.5 sm:p-6">
      {/* 🌟 Executive Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-3 sm:p-3.5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 shrink-0 shadow-inner">
              <Bus className="h-6 w-6 sm:h-8 sm:w-8 text-blue-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Fleet & Transport Logistics</h1>
                <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs">Live Telematics</Badge>
              </div>
              <p className="text-blue-100 text-xs sm:text-sm mt-1">
                Manage transit lines, designated pickup stops, school bus fleet capacity, and real-time passenger rosters.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleOpenAssignModal}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl text-xs h-9 font-semibold shadow-xs"
            >
              <Users className="h-3.5 w-3.5 mr-1.5 text-blue-200" /> Assign Passenger
            </Button>
            <Button
              size="sm"
              onClick={handleOpenAddBus}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl text-xs h-9 font-semibold shadow-xs"
            >
              <Bus className="h-3.5 w-3.5 mr-1.5 text-blue-200" /> Add Bus
            </Button>
            <Button
              size="sm"
              onClick={handleOpenAddRoute}
              className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md rounded-xl text-xs h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Route
            </Button>
          </div>
        </div>
      </div>

      {/* 🌟 KPI Stat Cards (Responsive & Non-Truncating) */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Active Fleet */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fleet Vehicles</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {summary.total_fleet} <span className="text-xs sm:text-sm font-semibold text-slate-500">Buses</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <Bus className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2 truncate flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
            {summary.active_fleet} in service
          </p>
        </Card>

        {/* Total Routes */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Transit Lines</p>
              <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {summary.total_routes} <span className="text-xs sm:text-sm font-semibold text-slate-500">Routes</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-2 truncate">
            {summary.total_stops} pickup stops
          </p>
        </Card>

        {/* Total Seating Capacity */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Capacity</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {summary.total_capacity} <span className="text-xs sm:text-sm font-semibold text-slate-500">Seats</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-2 truncate">
            Passenger capacity
          </p>
        </Card>

        {/* Assigned Passengers */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Passengers</p>
              <p className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {summary.total_passengers} <span className="text-xs sm:text-sm font-semibold text-slate-500">Students</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-2 truncate">
            Enrolled roster
          </p>
        </Card>
      </div>

      {/* ─── Navigation Tabs & Controls ──────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <TabsTrigger
                value="routes"
                className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-bold text-xs rounded-lg whitespace-nowrap py-1.5 px-3"
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Routes & Stops ({routes.length})
              </TabsTrigger>
              <TabsTrigger
                value="fleet"
                className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-bold text-xs rounded-lg whitespace-nowrap py-1.5 px-3"
              >
                <Bus className="h-3.5 w-3.5 mr-1.5" />
                Fleet Vehicles ({fleet.length})
              </TabsTrigger>
              <TabsTrigger
                value="assignments"
                className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-bold text-xs rounded-lg whitespace-nowrap py-1.5 px-3"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Passenger Roster ({assignments.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search routes, stops, bus plate, driver..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8.5 h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-xs rounded-xl focus-visible:ring-blue-500"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={loadTransportData}
              className="h-9 w-9 border-slate-200 dark:border-slate-700 rounded-xl shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 text-slate-600 dark:text-slate-300 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1: ROUTES & DESIGNATED STOPS
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="routes" className="space-y-4 mt-0">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl sm:rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 p-4 sm:p-5">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" /> Transport Routes & Stops Master Roster
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click any route's stop badge to manage or add designated pickup locations.
                </p>
              </div>
              <Button
                onClick={handleOpenAddRoute}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-sm shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Route
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {filteredRoutes.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/50 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-blue-100 dark:border-blue-900/50">
                    <MapPin className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-base">No Transport Routes Found</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Define transit lines with origin, destination, monthly fare, and designated pickup stops.
                  </p>
                  <Button onClick={handleOpenAddRoute} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Create First Route
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <Table>
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-850/50">
                      <TableRow className="border-b border-slate-100 dark:border-slate-800">
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Route Identifier</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Transit Path & Line</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-center">Designated Stops</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Assigned Vehicle</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Monthly Fare</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredRoutes.map((r) => {
                        const stopCount = r.total_stops || r.stops?.length || 0;
                        return (
                          <TableRow
                            key={r.id}
                            className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors group"
                          >
                            {/* Route Code & Tag */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs">
                                  {r.route_code}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-surface">
                                  {r.direction === "evening_drop" ? "Evening Drop" : r.direction === "both" ? "Round Trip" : "Morning Pickup"}
                                </Badge>
                              </div>
                            </TableCell>

                            {/* Route Name & Start-End Visual Path */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                                  {r.route_name}
                                </span>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                                  <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                    {r.start_point}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-blue-400" />
                                  <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {r.end_point}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Designated Stops Badge Button */}
                            <TableCell className="py-3.5 px-4 text-center whitespace-nowrap">
                              <button
                                onClick={() => handleOpenStopsModal(r)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                                  stopCount > 0
                                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 hover:scale-105"
                                    : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 animate-pulse"
                                }`}
                                title="Click to view and manage designated pickup stops"
                              >
                                <MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                <span>{stopCount} {stopCount === 1 ? "Stop" : "Stops"}</span>
                                <span className="text-[10px] font-extrabold opacity-75 underline ml-1">Manage</span>
                              </button>
                            </TableCell>

                            {/* Assigned Vehicle / Driver */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              {r.vehicle_bus_number ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-7.5 w-7.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800 shrink-0">
                                    <Bus className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                      {r.vehicle_bus_number}
                                    </span>
                                    <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                      {r.driver_name || "Assigned Driver"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[10px] font-medium text-slate-500 bg-slate-50 border-slate-200">
                                  No Bus Assigned
                                </Badge>
                              )}
                            </TableCell>

                            {/* Monthly Fare */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-mono font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                                  PKR {r.monthly_fare?.toLocaleString() || 0}
                                </span>
                                <span className="text-[10px] text-muted-foreground">per month</span>
                              </div>
                            </TableCell>

                            {/* Action Buttons */}
                            <TableCell className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenStopsModal(r)}
                                  className="h-8 px-2.5 text-xs text-blue-700 bg-blue-50/60 hover:bg-blue-100 border-blue-200 rounded-lg"
                                  title="Add/Edit Stops"
                                >
                                  <MapPin className="h-3.5 w-3.5 mr-1" /> Stops
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditRoute(r)}
                                  className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Edit Route Details"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteRoute(r.id, r.route_code)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                  title="Delete Route"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2: FLEET VEHICLES
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="fleet" className="space-y-4 mt-0">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl sm:rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 p-4 sm:p-5">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Bus className="h-5 w-5 text-blue-600" /> School Bus Fleet & Driver Roster
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track seating capacity, driver assignments, license registration, and telematics status.
                </p>
              </div>
              <Button
                onClick={handleOpenAddBus}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-sm shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Register Bus
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {filteredFleet.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/50 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-blue-100 dark:border-blue-900/50">
                    <Bus className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-base">No Fleet Vehicles Registered</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Add school buses, vans, or coasters with license plate, seating capacity, and driver contact.
                  </p>
                  <Button onClick={handleOpenAddBus} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add First Bus
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <Table>
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-850/50">
                      <TableRow className="border-b border-slate-100 dark:border-slate-800">
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Vehicle Identifier</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Assigned Driver & Phone</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Active Route</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Capacity & Occupancy</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-center">Status</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredFleet.map((v) => {
                        const occupancy = Math.round(((v.assigned_students_count || 0) / (v.seating_capacity || 40)) * 100);
                        return (
                          <TableRow
                            key={v.id}
                            className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors group"
                          >
                            {/* Bus Identification & License Plate */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold border border-blue-200/80 dark:border-blue-800 shadow-2xs shrink-0">
                                  <Bus className="h-4.5 w-4.5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                                    {v.bus_number}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {v.registration_no || "LEA-9876"}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Driver Information */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200 dark:border-slate-700">
                                  <User className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {v.driver_name || "Unassigned Driver"}
                                  </span>
                                  <span className="font-mono text-[10px] text-blue-600 flex items-center gap-1">
                                    <Phone className="h-2.5 w-2.5" /> {v.driver_phone || "—"}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Assigned Route */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              {v.assigned_route_name ? (
                                <Badge variant="outline" className="bg-blue-50/80 text-blue-700 border-blue-200 font-semibold text-xs py-1">
                                  <MapPin className="h-3 w-3 mr-1 text-blue-500" />
                                  {v.assigned_route_name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 bg-slate-50 border-slate-200 text-[10px]">
                                  Standby Fleet
                                </Badge>
                              )}
                            </TableCell>

                            {/* Capacity & Occupancy Progress */}
                            <TableCell className="py-3.5 px-4 whitespace-nowrap">
                              <div className="w-32 space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  <span>{v.assigned_students_count || 0} / {v.seating_capacity} Seats</span>
                                  <span className="text-blue-600">{occupancy}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-1.5 rounded-full ${occupancy > 90 ? "bg-rose-500" : occupancy > 60 ? "bg-amber-500" : "bg-blue-600"}`}
                                    style={{ width: `${Math.min(100, Math.max(10, occupancy))}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>

                            {/* GPS / Telematics Status */}
                            <TableCell className="py-3.5 px-4 text-center whitespace-nowrap">
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                In Service
                              </Badge>
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setTrackingVehicle(v)}
                                  className="h-8 px-2.5 text-xs text-blue-700 bg-blue-50/60 hover:bg-blue-100 border-blue-200 rounded-lg"
                                  title="Live GPS Location"
                                >
                                  <Navigation className="h-3.5 w-3.5 mr-1 text-blue-600" /> Track
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditBus(v)}
                                  className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Edit Bus"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteBus(v.id, v.bus_number)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                  title="Delete Bus"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 3: PASSENGER ASSIGNMENTS ROSTER
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="assignments" className="space-y-4 mt-0">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl sm:rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 p-4 sm:p-5">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" /> Student Transport Passenger Roster
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Assigned students, designated pickup stop, and round-trip transport subscriptions.
                </p>
              </div>
              <Button
                onClick={handleOpenAssignModal}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-sm shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Assign Student
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {filteredAssignments.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/50 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-blue-100 dark:border-blue-900/50">
                    <Users className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-base">No Assigned Student Passengers</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Assign enrolled students to specific routes and pickup stops for bus attendance and tracking.
                  </p>
                  <Button onClick={handleOpenAssignModal} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Assign First Student
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <Table>
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-850/50">
                      <TableRow className="border-b border-slate-100 dark:border-slate-800">
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Student Passenger</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Assigned Line</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4">Designated Pickup Stop</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-center">Service Type</TableHead>
                        <TableHead className="font-bold text-xs text-slate-600 py-3.5 px-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredAssignments.map((a) => (
                        <TableRow key={a.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                          <TableCell className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0 border border-blue-200">
                                {a.student_name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                                  {a.student_name}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  Roll: {a.student_code || "STU"}
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 whitespace-nowrap">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold text-xs">
                              {a.route_code ? `${a.route_code} - ` : ""}{a.route_name}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                              <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                              <span>{a.stop_name || "General Stop"}</span>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 text-center whitespace-nowrap">
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                              {a.pickup_type === "morning" ? "Morning Only" : a.pickup_type === "evening" ? "Evening Drop" : "Round Trip (Both)"}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteAssignment(a.id, a.student_name)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                              title="Remove Assignment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD / EDIT ROUTE WITH INLINE MULTI-STOP BUILDER
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showRouteModal} onOpenChange={setShowRouteModal}>
        <DialogContent className="bg-surface border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 shadow-2xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" /> {editingRouteId ? "Edit Transport Route & Stops" : "Register New Transport Route"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            {/* Route Code & Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Route Identifier Code *</Label>
                <Input
                  placeholder="e.g. RT-101"
                  value={routeForm.route_code}
                  onChange={e => setRouteForm({ ...routeForm, route_code: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Route Name *</Label>
                <Input
                  placeholder="e.g. Morning Campus Line A"
                  value={routeForm.route_name}
                  onChange={e => setRouteForm({ ...routeForm, route_name: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Start & End Points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Origin / Starting Point *</Label>
                <Input
                  placeholder="e.g. City Center Terminal"
                  value={routeForm.start_point}
                  onChange={e => setRouteForm({ ...routeForm, start_point: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Destination Terminal *</Label>
                <Input
                  placeholder="e.g. Main Campus Gate 1"
                  value={routeForm.end_point}
                  onChange={e => setRouteForm({ ...routeForm, end_point: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Timings, Fare & Vehicle */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Monthly Fare (PKR)</Label>
                <Input
                  type="number"
                  placeholder="4000"
                  value={routeForm.monthly_fare}
                  onChange={e => setRouteForm({ ...routeForm, monthly_fare: parseFloat(e.target.value) || 0 })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Morning Departure</Label>
                <Input
                  placeholder="07:15 AM"
                  value={routeForm.morning_departure}
                  onChange={e => setRouteForm({ ...routeForm, morning_departure: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Evening Return</Label>
                <Input
                  placeholder="02:30 PM"
                  value={routeForm.evening_departure}
                  onChange={e => setRouteForm({ ...routeForm, evening_departure: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Assign Bus Vehicle */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Assign Fleet Vehicle (Optional)</Label>
              <select
                value={routeForm.vehicle_id}
                onChange={e => setRouteForm({ ...routeForm, vehicle_id: e.target.value })}
                className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- No Bus Assigned (Standby) --</option>
                {fleet.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.bus_number} ({v.registration_no || "No Plate"}) - Driver: {v.driver_name || "Unassigned"} ({v.seating_capacity} Seats)
                  </option>
                ))}
              </select>
            </div>

            {/* ─── Inline Stops Builder (Add All Stops) ─── */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <Label className="text-xs font-extrabold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> Designated Pickup Stops ({routeForm.stops.length})
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Add all sequential pickup and drop-off locations along this route.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddInlineStop}
                  className="h-8 text-xs font-bold text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 rounded-xl"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> + Add Stop
                </Button>
              </div>

              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {routeForm.stops.map((stop, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700"
                  >
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                      <Input
                        placeholder="Stop Name"
                        value={stop.stop_name}
                        onChange={e => {
                          const updated = [...routeForm.stops];
                          updated[idx].stop_name = e.target.value;
                          setRouteForm({ ...routeForm, stops: updated });
                        }}
                        className="h-8 text-xs rounded-lg bg-white dark:bg-slate-900"
                      />
                      <Input
                        placeholder="Time (07:30 AM)"
                        value={stop.estimated_morning_time || ""}
                        onChange={e => {
                          const updated = [...routeForm.stops];
                          updated[idx].estimated_morning_time = e.target.value;
                          setRouteForm({ ...routeForm, stops: updated });
                        }}
                        className="h-8 text-xs rounded-lg bg-white dark:bg-slate-900"
                      />
                      <Input
                        placeholder="Landmark"
                        value={stop.landmark || ""}
                        onChange={e => {
                          const updated = [...routeForm.stops];
                          updated[idx].landmark = e.target.value;
                          setRouteForm({ ...routeForm, stops: updated });
                        }}
                        className="h-8 text-xs rounded-lg bg-white dark:bg-slate-900"
                      />
                    </div>
                    {routeForm.stops.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveInlineStop(idx)}
                        className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSaveRoute}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 shadow-sm text-xs mt-3"
            >
              {editingRouteId ? "Save Route & Stops Changes" : "Save Transport Route & All Stops"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: DEDICATED MANAGE DESIGNATED STOPS (TIMELINE VIEW)
      ════════════════════════════════════════════════════════════════════ */}
      {selectedRouteForStops && (
        <Dialog open={!!selectedRouteForStops} onOpenChange={() => setSelectedRouteForStops(null)}>
          <DialogContent className="bg-surface border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 shadow-2xl">
            <DialogHeader className="pr-8 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-blue-700 dark:text-blue-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-600" /> {selectedRouteForStops.route_code}: {selectedRouteForStops.route_name}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedRouteForStops.start_point} ➔ {selectedRouteForStops.end_point}
                  </p>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-bold shrink-0">
                  {selectedRouteForStops.stops?.length || 0} Stops
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-3">
              {/* Add New Stop Form */}
              <div className="p-3 bg-blue-50/60 dark:bg-slate-800/60 rounded-2xl border border-blue-100 dark:border-slate-700 space-y-2.5">
                <Label className="text-xs font-extrabold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Designated Stop to Route
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    placeholder="Stop Name (e.g. FC Chowk)"
                    value={newStopName}
                    onChange={e => setNewStopName(e.target.value)}
                    className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-xl"
                  />
                  <Input
                    placeholder="Morning (07:30 AM)"
                    value={newStopMorningTime}
                    onChange={e => setNewStopMorningTime(e.target.value)}
                    className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-xl"
                  />
                  <Input
                    placeholder="Landmark / Corner"
                    value={newStopLandmark}
                    onChange={e => setNewStopLandmark(e.target.value)}
                    className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-xl"
                  />
                </div>
                <Button
                  onClick={handleAddStopToRoute}
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs h-8 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Stop to Route
                </Button>
              </div>

              {/* Stops Timeline List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(!selectedRouteForStops.stops || selectedRouteForStops.stops.length === 0) ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-xs font-semibold">No stops defined yet.</p>
                    <p className="text-[11px] mt-0.5">Use the form above to add designated pickup locations.</p>
                  </div>
                ) : (
                  selectedRouteForStops.stops.map((stop, idx) => {
                    const isEditing = editingStopId === stop.id;
                    return (
                      <div
                        key={stop.id || idx}
                        className="flex items-center justify-between p-2.5 sm:p-3 bg-surface rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-blue-300 transition-all"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0 border border-blue-200">
                            {stop.stop_order || idx + 1}
                          </div>

                          {isEditing ? (
                            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                              <Input
                                value={editingStopData.stop_name ?? stop.stop_name}
                                onChange={e => setEditingStopData({ ...editingStopData, stop_name: e.target.value })}
                                className="h-7 text-xs rounded-lg"
                              />
                              <div className="grid grid-cols-2 gap-1.5">
                                <Input
                                  value={editingStopData.estimated_morning_time ?? (stop.estimated_morning_time || "")}
                                  onChange={e => setEditingStopData({ ...editingStopData, estimated_morning_time: e.target.value })}
                                  placeholder="Time"
                                  className="h-7 text-[11px] rounded-lg"
                                />
                                <Input
                                  value={editingStopData.landmark ?? (stop.landmark || "")}
                                  onChange={e => setEditingStopData({ ...editingStopData, landmark: e.target.value })}
                                  placeholder="Landmark"
                                  className="h-7 text-[11px] rounded-lg"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                                {stop.stop_name}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                                <span className="inline-flex items-center gap-1 font-mono text-blue-600 dark:text-blue-400">
                                  <Clock className="h-3 w-3" />
                                  {stop.estimated_arrival_time || stop.estimated_morning_time || "07:30 AM"}
                                </span>
                                {stop.landmark && (
                                  <span className="truncate max-w-[120px] sm:max-w-[160px] text-slate-400">
                                    • {stop.landmark}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveEditStop(stop.id!)}
                                className="h-7 px-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 rounded-lg"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingStopId(null)}
                                className="h-7 w-7 p-0 text-slate-400 rounded-lg"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingStopId(stop.id || null);
                                  setEditingStopData({
                                    stop_name: stop.stop_name,
                                    estimated_morning_time: stop.estimated_morning_time,
                                    landmark: stop.landmark,
                                  });
                                }}
                                className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600 rounded-lg"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              {stop.id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteStop(stop.id!, stop.stop_name)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 rounded-lg"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <Button
                onClick={() => setSelectedRouteForStops(null)}
                variant="outline"
                className="w-full rounded-xl sm:rounded-2xl text-xs h-9"
              >
                Close Stops Manager
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD / EDIT BUS VEHICLE
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showAddBus} onOpenChange={setShowAddBus}>
        <DialogContent className="bg-surface border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-[calc(100vw-1.5rem)] sm:max-w-md p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
              <Bus className="h-5 w-5" /> {editingBusId ? "Edit Vehicle Details" : "Register School Bus Vehicle"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bus Identifier Number *</Label>
              <Input
                placeholder="e.g. BUS-01"
                value={busForm.bus_number}
                onChange={e => setBusForm({ ...busForm, bus_number: e.target.value })}
                className="mt-1 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">License Plate</Label>
                <Input
                  placeholder="e.g. LEA-9876"
                  value={busForm.registration_no}
                  onChange={e => setBusForm({ ...busForm, registration_no: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Seating Capacity</Label>
                <Input
                  type="number"
                  value={busForm.seating_capacity}
                  onChange={e => setBusForm({ ...busForm, seating_capacity: parseInt(e.target.value) || 40 })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Driver Full Name</Label>
                <Input
                  placeholder="e.g. Muhammad Aslam"
                  value={busForm.driver_name}
                  onChange={e => setBusForm({ ...busForm, driver_name: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Driver Phone Number</Label>
                <Input
                  placeholder="e.g. +92 300 1234567"
                  value={busForm.driver_phone}
                  onChange={e => setBusForm({ ...busForm, driver_phone: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Conductor Name</Label>
                <Input
                  placeholder="e.g. Tariq Mahmood"
                  value={busForm.conductor_name}
                  onChange={e => setBusForm({ ...busForm, conductor_name: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">GPS Tracker Device ID</Label>
                <Input
                  placeholder="e.g. GPS-8821"
                  value={busForm.gps_device_id}
                  onChange={e => setBusForm({ ...busForm, gps_device_id: e.target.value })}
                  className="mt-1 text-xs rounded-xl"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveBus}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 shadow-sm text-xs mt-2"
            >
              {editingBusId ? "Update Vehicle Record" : "Save Vehicle to Fleet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ASSIGN STUDENT TO TRANSPORT
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="bg-surface border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-[calc(100vw-1.5rem)] sm:max-w-md p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
              <Users className="h-5 w-5" /> Assign Student Passenger
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select Student *</Label>
              <select
                value={assignForm.student_id}
                onChange={e => setAssignForm({ ...assignForm, student_id: e.target.value })}
                className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose Student --</option>
                {students.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name || ""} (Roll: {s.roll_number || s.student_code || "STU"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select Transport Line *</Label>
              <select
                value={assignForm.route_id}
                onChange={e => {
                  const rId = e.target.value;
                  const selectedR = routes.find(r => r.id === rId);
                  setAssignForm({
                    ...assignForm,
                    route_id: rId,
                    stop_id: selectedR?.stops?.[0]?.id || ""
                  });
                }}
                className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose Route --</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.route_code} - {r.route_name} (Fare: PKR {r.monthly_fare?.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Designated Pickup Stop</Label>
              <select
                value={assignForm.stop_id}
                onChange={e => setAssignForm({ ...assignForm, stop_id: e.target.value })}
                className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Stop Location --</option>
                {routes
                  .find(r => r.id === assignForm.route_id)
                  ?.stops?.map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.stop_order}: {s.stop_name} ({s.estimated_morning_time || "07:30 AM"})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Service Coverage Type</Label>
              <select
                value={assignForm.pickup_type}
                onChange={e => setAssignForm({ ...assignForm, pickup_type: e.target.value })}
                className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
              >
                <option value="both">Round Trip (Morning Pickup & Evening Drop)</option>
                <option value="morning">Morning Pickup Only</option>
                <option value="evening">Evening Drop Only</option>
              </select>
            </div>

            <Button
              onClick={handleSaveAssignment}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 shadow-sm text-xs mt-2"
            >
              Confirm Student Transport Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: REAL-TIME GPS TRACKER PREVIEW
      ════════════════════════════════════════════════════════════════════ */}
      {trackingVehicle && (
        <Dialog open={!!trackingVehicle} onOpenChange={() => setTrackingVehicle(null)}>
          <DialogContent className="bg-surface border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-[calc(100vw-1.5rem)] sm:max-w-lg p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pr-8 text-left">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-blue-700 dark:text-blue-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
                  <Navigation className="h-5 w-5 animate-spin" /> Live GPS: {trackingVehicle.bus_number}
                </DialogTitle>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                  Connected (4G LTE)
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-3.5 pt-2">
              {/* Radar Card */}
              <div className="relative h-44 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 flex items-center justify-center overflow-hidden border border-blue-500/20 shadow-inner">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.15)_0,_transparent_70%)]" />
                <div className="absolute w-32 h-32 rounded-full border border-blue-500/20 animate-ping opacity-30" />
                <div className="absolute w-48 h-48 rounded-full border border-blue-500/10" />

                <div className="relative z-10 text-center space-y-1">
                  <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/50">
                    <Bus className="h-6 w-6" />
                  </div>
                  <p className="text-white font-bold text-sm">{trackingVehicle.bus_number}</p>
                  <p className="text-blue-300 text-xs font-mono">Speed: 42 km/h • Heading: North</p>
                </div>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Assigned Route</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{trackingVehicle.assigned_route_name || "Line Alpha"}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Driver on Duty</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{trackingVehicle.driver_name || "Muhammad Aslam"}</span>
                </div>
              </div>

              <Button
                onClick={() => setTrackingVehicle(null)}
                variant="outline"
                className="w-full rounded-2xl text-xs h-9"
              >
                Close Tracking Radar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default TransportModule;
