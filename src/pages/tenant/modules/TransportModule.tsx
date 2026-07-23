import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Bus, Route, MapPin, Users, Plus, Search, RefreshCw, Navigation,
  Clock, Shield, AlertTriangle, CheckCircle, Fuel, Wrench, Calendar,
  Phone, User, ArrowRight, Activity,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────── */
interface BusVehicle {
  id: string;
  vehicle_number: string;
  vehicle_type: string;
  capacity: number;
  driver_name?: string;
  driver_phone?: string;
  status: string;
  gps_device_id?: string;
}

interface BusRoute {
  id: string;
  route_name: string;
  route_code: string;
  direction: string;
  total_stops: number;
  estimated_duration_min?: number;
  status: string;
}

interface RouteStop {
  id: string;
  stop_name: string;
  sequence_order: number;
  pickup_time?: string;
  dropoff_time?: string;
  latitude?: number;
  longitude?: number;
}

interface TransportAssignment {
  id: string;
  student_name?: string;
  route_name?: string;
  stop_name?: string;
  pickup_time?: string;
}

interface TransportLog {
  id: string;
  event_type: string;
  notes?: string;
  current_location?: string;
  created_at: string;
}

/* ─── Stats Card ─────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card className="bg-zinc-950 border-zinc-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl border ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">{label}</p>
          <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Module ────────────────────────────────────────────────────── */
export function TransportModule() {
  const [activeTab, setActiveTab] = useState("fleet");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Fleet state
  const [vehicles, setVehicles] = useState<BusVehicle[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicle_number: "", vehicle_type: "bus", capacity: 40,
    driver_name: "", driver_phone: "", gps_device_id: "",
  });

  // Routes state
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({
    route_name: "", route_code: "", direction: "morning_pickup",
    estimated_duration_min: 45,
  });

  // Transport logs
  const [logs, setLogs] = useState<TransportLog[]>([]);

  const loadFleet = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/transport/fleet");
      setVehicles(res.data ?? []);
    } catch { setVehicles([]); }
    setLoading(false);
  };

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/transport/routes");
      setRoutes(res.data ?? []);
    } catch { setRoutes([]); }
    setLoading(false);
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/transport/logs");
      setLogs(res.data ?? []);
    } catch { setLogs([]); }
    setLoading(false);
  };

  useEffect(() => {
    loadFleet();
    loadRoutes();
    loadLogs();
  }, []);

  const handleAddVehicle = async () => {
    try {
      await apiClient.post("/transport/fleet", newVehicle);
      toast.success("Vehicle added to fleet");
      setShowAddVehicle(false);
      setNewVehicle({ vehicle_number: "", vehicle_type: "bus", capacity: 40, driver_name: "", driver_phone: "", gps_device_id: "" });
      loadFleet();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add vehicle");
    }
  };

  const handleAddRoute = async () => {
    try {
      await apiClient.post("/transport/routes", newRoute);
      toast.success("Route created successfully");
      setShowAddRoute(false);
      setNewRoute({ route_name: "", route_code: "", direction: "morning_pickup", estimated_duration_min: 45 });
      loadRoutes();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create route");
    }
  };

  const activeVehicles = vehicles.filter(v => v.status === "active").length;
  const maintenanceVehicles = vehicles.filter(v => v.status === "maintenance").length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "border-emerald-500/20 text-emerald-400 bg-emerald-500/5",
      maintenance: "border-amber-500/20 text-amber-400 bg-amber-500/5",
      inactive: "border-zinc-700 text-zinc-500 bg-zinc-900/50",
      retired: "border-red-500/20 text-red-400 bg-red-500/5",
    };
    return (
      <Badge variant="outline" className={`text-[10px] ${map[status] || map.inactive}`}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Bus} label="Total Vehicles" value={vehicles.length} color="border-cyan-500/30 bg-cyan-500/5 text-cyan-400" />
        <StatCard icon={CheckCircle} label="Active" value={activeVehicles} color="border-emerald-500/30 bg-emerald-500/5 text-emerald-400" />
        <StatCard icon={Route} label="Routes" value={routes.length} color="border-violet-500/30 bg-violet-500/5 text-violet-400" />
        <StatCard icon={Wrench} label="In Maintenance" value={maintenanceVehicles} color="border-amber-500/30 bg-amber-500/5 text-amber-400" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="fleet" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <Bus className="h-4 w-4 mr-2" /> Fleet
            </TabsTrigger>
            <TabsTrigger value="routes" className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400">
              <Route className="h-4 w-4 mr-2" /> Routes
            </TabsTrigger>
            <TabsTrigger value="tracking" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">
              <Navigation className="h-4 w-4 mr-2" /> Live Tracking
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400">
              <Activity className="h-4 w-4 mr-2" /> Event Log
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-cyan-500/30"
              />
            </div>
            <Button variant="outline" onClick={() => { loadFleet(); loadRoutes(); loadLogs(); }}
              className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-cyan-500/10 hover:text-cyan-300">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Fleet Tab ────────────────────────────────────── */}
        <TabsContent value="fleet">
          <Card className="bg-zinc-950 border-zinc-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Bus className="h-5 w-5 text-cyan-400" /> Fleet Management
              </CardTitle>
              <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-zinc-950 font-bold shadow-md shadow-cyan-500/10">
                    <Plus className="h-4 w-4 mr-2" /> Add Vehicle
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add New Vehicle</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400 text-xs">Vehicle Number</Label>
                        <Input value={newVehicle.vehicle_number} onChange={e => setNewVehicle(p => ({ ...p, vehicle_number: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" placeholder="ABC-1234" />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Vehicle Type</Label>
                        <Select value={newVehicle.vehicle_type} onValueChange={v => setNewVehicle(p => ({ ...p, vehicle_type: v }))}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bus">Bus</SelectItem>
                            <SelectItem value="van">Van</SelectItem>
                            <SelectItem value="minibus">Mini Bus</SelectItem>
                            <SelectItem value="coaster">Coaster</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400 text-xs">Capacity</Label>
                        <Input type="number" value={newVehicle.capacity} onChange={e => setNewVehicle(p => ({ ...p, capacity: parseInt(e.target.value) || 0 }))}
                          className="bg-zinc-900 border-zinc-800 text-white" />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">GPS Device ID</Label>
                        <Input value={newVehicle.gps_device_id} onChange={e => setNewVehicle(p => ({ ...p, gps_device_id: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" placeholder="Optional" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400 text-xs">Driver Name</Label>
                        <Input value={newVehicle.driver_name} onChange={e => setNewVehicle(p => ({ ...p, driver_name: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Driver Phone</Label>
                        <Input value={newVehicle.driver_phone} onChange={e => setNewVehicle(p => ({ ...p, driver_phone: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" />
                      </div>
                    </div>
                    <Button onClick={handleAddVehicle} className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold">
                      Add Vehicle to Fleet
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Vehicle #</TableHead>
                    <TableHead className="text-zinc-400">Type</TableHead>
                    <TableHead className="text-zinc-400">Capacity</TableHead>
                    <TableHead className="text-zinc-400">Driver</TableHead>
                    <TableHead className="text-zinc-400">Phone</TableHead>
                    <TableHead className="text-zinc-400">GPS</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
                        <Bus className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No vehicles in fleet yet</p>
                        <p className="text-xs text-zinc-600 mt-1">Add your first vehicle to get started</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vehicles.filter(v => !search || v.vehicle_number.toLowerCase().includes(search.toLowerCase()) || v.driver_name?.toLowerCase().includes(search.toLowerCase())).map(v => (
                      <TableRow key={v.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-mono font-bold text-white">{v.vehicle_number}</TableCell>
                        <TableCell className="text-zinc-300 capitalize">{v.vehicle_type}</TableCell>
                        <TableCell className="text-zinc-300">{v.capacity} seats</TableCell>
                        <TableCell className="text-zinc-300">{v.driver_name || "—"}</TableCell>
                        <TableCell className="text-zinc-400 font-mono text-sm">{v.driver_phone || "—"}</TableCell>
                        <TableCell>
                          {v.gps_device_id ? (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
                              <Navigation className="h-3 w-3 mr-1" /> GPS Active
                            </Badge>
                          ) : (
                            <span className="text-zinc-600 text-xs">No GPS</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(v.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Routes Tab ──────────────────────────────────── */}
        <TabsContent value="routes">
          <Card className="bg-zinc-950 border-zinc-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Route className="h-5 w-5 text-violet-400" /> Route Management
              </CardTitle>
              <Dialog open={showAddRoute} onOpenChange={setShowAddRoute}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white font-bold shadow-md shadow-violet-500/10">
                    <Plus className="h-4 w-4 mr-2" /> Create Route
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create Bus Route</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label className="text-zinc-400 text-xs">Route Name</Label>
                      <Input value={newRoute.route_name} onChange={e => setNewRoute(p => ({ ...p, route_name: e.target.value }))}
                        className="bg-zinc-900 border-zinc-800 text-white" placeholder="DHA Phase 6 Morning" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400 text-xs">Route Code</Label>
                        <Input value={newRoute.route_code} onChange={e => setNewRoute(p => ({ ...p, route_code: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" placeholder="R-001" />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Direction</Label>
                        <Select value={newRoute.direction} onValueChange={v => setNewRoute(p => ({ ...p, direction: v }))}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="morning_pickup">Morning Pickup</SelectItem>
                            <SelectItem value="afternoon_drop">Afternoon Drop</SelectItem>
                            <SelectItem value="both">Both Ways</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs">Est. Duration (minutes)</Label>
                      <Input type="number" value={newRoute.estimated_duration_min} onChange={e => setNewRoute(p => ({ ...p, estimated_duration_min: parseInt(e.target.value) || 0 }))}
                        className="bg-zinc-900 border-zinc-800 text-white" />
                    </div>
                    <Button onClick={handleAddRoute} className="w-full bg-gradient-to-r from-violet-500 to-violet-600 text-white font-bold">
                      Create Route
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Code</TableHead>
                    <TableHead className="text-zinc-400">Route Name</TableHead>
                    <TableHead className="text-zinc-400">Direction</TableHead>
                    <TableHead className="text-zinc-400">Stops</TableHead>
                    <TableHead className="text-zinc-400">Duration</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                        <Route className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No routes configured yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    routes.filter(r => !search || r.route_name.toLowerCase().includes(search.toLowerCase())).map(r => (
                      <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-mono font-bold text-violet-400">{r.route_code}</TableCell>
                        <TableCell className="text-white font-medium">{r.route_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300 capitalize">
                            {r.direction.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-300">{r.total_stops} stops</TableCell>
                        <TableCell className="text-zinc-400">{r.estimated_duration_min || "—"} min</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Live Tracking Tab ────────────────────────────── */}
        <TabsContent value="tracking">
          <Card className="bg-zinc-950 border-zinc-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Navigation className="h-5 w-5 text-emerald-400" /> Live GPS Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-[420px] bg-zinc-900/50 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden">
                {/* Simulated map grid */}
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: "linear-gradient(to right, #3f3f46 1px, transparent 1px), linear-gradient(to bottom, #3f3f46 1px, transparent 1px)",
                  backgroundSize: "40px 40px"
                }} />
                <div className="text-center z-10">
                  <Navigation className="h-16 w-16 mx-auto text-emerald-500/30 mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold text-white mb-2">GPS Tracking Console</h3>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto">
                    Real-time vehicle positions will appear here when GPS devices are active. 
                    Connect tracker devices to start monitoring your fleet.
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-6">
                    {vehicles.filter(v => v.gps_device_id).map(v => (
                      <div key={v.id} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs text-zinc-300 font-mono">{v.vehicle_number}</span>
                      </div>
                    ))}
                    {vehicles.filter(v => v.gps_device_id).length === 0 && (
                      <p className="text-xs text-zinc-600">No GPS devices connected</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Event Log Tab ───────────────────────────────── */}
        <TabsContent value="logs">
          <Card className="bg-zinc-950 border-zinc-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-400" /> Transport Event Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Activity className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm">No transport events logged yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
                      <div className={`p-2 rounded-lg border ${
                        log.event_type === "departure" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" :
                        log.event_type === "arrival" ? "border-cyan-500/30 bg-cyan-500/5 text-cyan-400" :
                        log.event_type === "incident" ? "border-red-500/30 bg-red-500/5 text-red-400" :
                        "border-zinc-700 bg-zinc-800 text-zinc-400"
                      }`}>
                        {log.event_type === "departure" ? <ArrowRight className="h-4 w-4" /> :
                         log.event_type === "arrival" ? <MapPin className="h-4 w-4" /> :
                         log.event_type === "incident" ? <AlertTriangle className="h-4 w-4" /> :
                         <Clock className="h-4 w-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-white capitalize">{log.event_type.replace("_", " ")}</h4>
                          <span className="text-[10px] text-zinc-500 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        {log.current_location && <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" /> {log.current_location}</p>}
                        {log.notes && <p className="text-xs text-zinc-500 mt-1">{log.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TransportModule;
