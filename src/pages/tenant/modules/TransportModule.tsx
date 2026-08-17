import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Bus, MapPin, User, Plus, Search, RefreshCw, Navigation, AlertCircle, ShieldCheck
} from "lucide-react";

interface Vehicle {
  id: string;
  bus_number: string;
  registration_no?: string;
  seating_capacity: number;
  driver_name?: string;
  driver_phone?: string;
  status: string;
}

interface Route {
  id: string;
  route_name: string;
  route_code: string;
  start_point: string;
  end_point: string;
  monthly_fare: number;
  total_stops: number;
}

export function TransportModule() {
  const [activeTab, setActiveTab] = useState("fleet");
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showAddBus, setShowAddBus] = useState(false);
  const [newBus, setNewBus] = useState({
    bus_number: "BUS-1", registration_no: "LEA-1234", seating_capacity: 40, driver_name: "", driver_phone: ""
  });

  const loadTransportData = async () => {
    setLoading(true);
    try {
      const [resFleet, resRoutes] = await Promise.all([
        apiClient.get("/transport/fleet"),
        apiClient.get("/transport/routes")
      ]);
      setFleet(resFleet.data ?? []);
      setRoutes(resRoutes.data ?? []);
    } catch {
      setFleet([]);
      setRoutes([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTransportData();
  }, []);

  const handleAddBus = async () => {
    if (!newBus.bus_number) {
      toast.error("Provide bus identifier");
      return;
    }
    try {
      await apiClient.post("/transport/fleet", newBus);
      toast.success("Bus vehicle added to fleet");
      setShowAddBus(false);
      loadTransportData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add bus");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 shrink-0">
              <Bus className="h-6 w-6 sm:h-8 sm:w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Fleet & Transport Logistics</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Manage school buses, route stops, driver allocations & live trip tracking</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setShowAddBus(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md rounded-xl text-xs h-9">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Bus
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <Bus className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Fleet Buses</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">{fleet.length} Vehicles</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Bus Routes</p>
              <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">{routes.length} Routes</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
              <Navigation className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">GPS Tracking</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">Active</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <TabsTrigger value="fleet" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Bus className="h-3.5 w-3.5 mr-1.5" /> Vehicle Fleet
              </TabsTrigger>
              <TabsTrigger value="routes" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <MapPin className="h-3.5 w-3.5 mr-1.5" /> Transport Routes
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Bus, Route..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={loadTransportData} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Fleet Tab ──────────────────────────── */}
        <TabsContent value="fleet">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Bus className="h-5 w-5 text-blue-600" /> School Bus Fleet Roster
              </CardTitle>
              <Button onClick={() => setShowAddBus(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs h-9 self-start sm:self-auto">
                <Plus className="h-4 w-4 mr-2" /> Add Bus
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {fleet.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Bus className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Vehicles Registered</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Register Bus" to add buses and drivers to your transport fleet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                        <TableHead>Bus Number</TableHead>
                        <TableHead>License Plate</TableHead>
                        <TableHead>Assigned Driver</TableHead>
                        <TableHead>Seating Capacity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fleet.map(v => (
                        <TableRow key={v.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{v.bus_number}</TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{v.registration_no || "N/A"}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{v.driver_name || "Unassigned"}</TableCell>
                          <TableCell className="whitespace-nowrap">{v.seating_capacity} Seats</TableCell>
                          <TableCell className="whitespace-nowrap"><Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Routes Tab ─────────────────────────── */}
        <TabsContent value="routes">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" /> Transport Routes & Designated Stops
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {routes.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p>No transport routes configured yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                        <TableHead>Route Code</TableHead>
                        <TableHead>Route Name</TableHead>
                        <TableHead>Start - End Point</TableHead>
                        <TableHead>Total Stops</TableHead>
                        <TableHead>Monthly Fare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routes.map(r => (
                        <TableRow key={r.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">{r.route_code}</TableCell>
                          <TableCell className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.route_name}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.start_point} ➔ {r.end_point}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.total_stops} Stops</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">PKR {r.monthly_fare?.toLocaleString() || 0}</TableCell>
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

      {/* Add Bus Modal */}
      <Dialog open={showAddBus} onOpenChange={setShowAddBus}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Register School Bus</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Bus Identifier</Label>
              <Input value={newBus.bus_number} onChange={e => setNewBus({ ...newBus, bus_number: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>License Plate</Label>
                <Input value={newBus.registration_no} onChange={e => setNewBus({ ...newBus, registration_no: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Seating Capacity</Label>
                <Input type="number" value={newBus.seating_capacity} onChange={e => setNewBus({ ...newBus, seating_capacity: parseInt(e.target.value) || 40 })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddBus} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Vehicle</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
