import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Home, Bed, Utensils, Moon, Plus, Search, RefreshCw,
  CheckCircle2, AlertCircle, UserCheck, Shield, Clock, Building, User
} from "lucide-react";

interface HostelRoom {
  id: string;
  building_name: string;
  room_number: string;
  capacity: number;
  occupied_count: number;
  room_type: string;
  fee_per_term?: number;
}

interface MessMenu {
  id: string;
  day_of_week: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  special_notes?: string;
}

interface StudentOption {
  id: string;
  full_name: string;
  roll_number?: string;
  admission_number?: string;
  class_name?: string;
}

import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useSession } from "@/hooks/useSession";

export function HostelModule() {
  const { user } = useSession();
  const activeCampusId = useActiveCampus(user?.school_id ?? null) || user?.campus_id || null;

  const [activeTab, setActiveTab] = useState("rooms");
  const [rooms, setRooms] = useState<HostelRoom[]>([]);
  const [messMenu, setMessMenu] = useState<MessMenu[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({
    building_name: "Boys Boarding Block A", room_number: "101", capacity: 2, room_type: "Deluxe AC", fee_per_term: 25000
  });

  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocData, setAllocData] = useState({ room_id: "", student_id: "", check_in_date: "" });

  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attData, setAttData] = useState({ student_id: "", status: "present", warden_notes: "" });

  const loadHostelData = async () => {
    setLoading(true);
    try {
      const campusParam = activeCampusId ? `?campus_id=${activeCampusId}` : "";
      const [resRooms, resMess, resStudents] = await Promise.all([
        apiClient.get(`/hostel/rooms${campusParam}`),
        apiClient.get(`/hostel/mess-menu${campusParam}`),
        apiClient.get(`/students?page_size=500${activeCampusId ? `&campus_id=${activeCampusId}` : ""}`)
      ]);
      setRooms(Array.isArray(resRooms?.data) ? resRooms.data : []);
      setMessMenu(Array.isArray(resMess?.data) ? resMess.data : []);

      const rawStudents = resStudents?.data;
      const stuList = Array.isArray(rawStudents?.data)
        ? rawStudents.data
        : Array.isArray(rawStudents?.items)
        ? rawStudents.items
        : Array.isArray(rawStudents)
        ? rawStudents
        : [];
      setStudents(stuList.map((s: any) => ({
        id: s.id,
        full_name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student',
        roll_number: s.roll_number || '',
        admission_number: s.admission_number || '',
        class_name: s.class_name || ''
      })));
    } catch {
      setRooms([]);
      setMessMenu([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHostelData();
  }, [activeCampusId]);

  useEffect(() => {
    if (showAllocateModal || showAttendanceModal) {
      loadHostelData();
    }
  }, [showAllocateModal, showAttendanceModal]);

  const handleAddRoom = async () => {
    if (!newRoom.room_number) {
      toast.error("Provide room number");
      return;
    }
    try {
      await apiClient.post("/hostel/rooms", newRoom);
      toast.success("Hostel room added successfully");
      setShowAddRoomModal(false);
      loadHostelData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add hostel room");
    }
  };

  const handleAllocate = async () => {
    if (!allocData.room_id || !allocData.student_id) {
      toast.error("Select room and student");
      return;
    }
    try {
      await apiClient.post("/hostel/allocate", allocData);
      toast.success("Student allocated to hostel room");
      setShowAllocateModal(false);
      loadHostelData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to allocate student");
    }
  };

  const handleAttendance = async () => {
    if (!attData.student_id) {
      toast.error("Provide student");
      return;
    }
    try {
      await apiClient.post("/hostel/attendance", attData);
      toast.success("Night attendance recorded");
      setShowAttendanceModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to log attendance");
    }
  };

  const totalRooms = rooms.length;
  const totalCapacity = rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);
  const totalOccupied = rooms.reduce((acc, r) => acc + (r.occupied_count || 0), 0);

  const filteredRooms = rooms.filter(r =>
    r.building_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.room_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.room_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 shrink-0">
              <Building className="h-6 w-6 sm:h-8 sm:w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Hostel & Boarding</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Manage dormitories, room allocations, night attendance & mess menus</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setShowAttendanceModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs h-9">
              <Moon className="h-3.5 w-3.5 mr-1.5" /> Night Check
            </Button>
            <Button size="sm" onClick={() => setShowAddRoomModal(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md rounded-xl text-xs h-9">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Room
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <Home className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Total Rooms</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">{totalRooms}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Boarding Occupancy</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{totalOccupied} / {totalCapacity}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <Moon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Night Check Desk</p>
              <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">Active</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <TabsTrigger value="rooms" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Bed className="h-3.5 w-3.5 mr-1.5" /> Rooms & Beds
              </TabsTrigger>
              <TabsTrigger value="night-check" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Moon className="h-3.5 w-3.5 mr-1.5" /> Nightly Roll Call
              </TabsTrigger>
              <TabsTrigger value="mess" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Utensils className="h-3.5 w-3.5 mr-1.5" /> Mess Menu
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Room, Block..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={loadHostelData} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Rooms Tab ──────────────────────────────────── */}
        <TabsContent value="rooms">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Bed className="h-5 w-5 text-blue-600" /> Hostel Room Master Allocation Grid
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowAllocateModal(true)} variant="outline" className="border-slate-300 text-slate-700 dark:text-slate-200 text-xs h-9">
                  <UserCheck className="h-4 w-4 mr-2 text-blue-600" /> Assign Student to Room
                </Button>
                <Button onClick={() => setShowAddRoomModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md text-xs h-9">
                  <Plus className="h-4 w-4 mr-2" /> Add Hostel Room
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredRooms.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Building className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Hostel Rooms Registered Yet</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Add Hostel Room" to set up building blocks and room capacities.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Building Block</TableHead>
                      <TableHead>Room #</TableHead>
                      <TableHead>Room Type</TableHead>
                      <TableHead>Total Beds</TableHead>
                      <TableHead>Occupancy</TableHead>
                      <TableHead>Term Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRooms.map(r => {
                      const isFull = r.occupied_count >= r.capacity;
                      return (
                        <TableRow key={r.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.building_name}</TableCell>
                          <TableCell className="font-bold text-blue-600 dark:text-blue-400">Room {r.room_number}</TableCell>
                          <TableCell><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{r.room_type}</Badge></TableCell>
                          <TableCell>{r.capacity} Beds</TableCell>
                          <TableCell className="font-semibold">{r.occupied_count} / {r.capacity}</TableCell>
                          <TableCell className="font-mono text-slate-700 dark:text-slate-300">PKR {r.fee_per_term?.toLocaleString() || "N/A"}</TableCell>
                          <TableCell>
                            {isFull ? (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200">Full</Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200">Available</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Mess Menu Tab ──────────────────────────────── */}
        <TabsContent value="mess">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Utensils className="h-5 w-5 text-blue-600" /> Weekly Boarding Mess Menu Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messMenu.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Utensils className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>Weekly mess menu is ready for configuration.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Day</TableHead>
                      <TableHead>Breakfast</TableHead>
                      <TableHead>Lunch</TableHead>
                      <TableHead>Dinner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messMenu.map(m => (
                      <TableRow key={m.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-bold text-blue-700 dark:text-blue-400">{m.day_of_week}</TableCell>
                        <TableCell>{m.breakfast}</TableCell>
                        <TableCell>{m.lunch}</TableCell>
                        <TableCell>{m.dinner}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Nightly Roll Call Tab ─────────────────────── */}
        <TabsContent value="night-check">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Moon className="h-5 w-5 text-indigo-600" /> Night Attendance Warden Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Night check-in roll calls log absent boarders and send automatic parent SMS alerts at 10:00 PM.</p>
              <Button onClick={() => setShowAttendanceModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                <Clock className="h-4 w-4 mr-2" /> Take Night Roll Call
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showAddRoomModal} onOpenChange={setShowAddRoomModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Register Hostel Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Building / Block Name</Label>
              <Input value={newRoom.building_name} onChange={e => setNewRoom({ ...newRoom, building_name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Room Number</Label>
                <Input value={newRoom.room_number} onChange={e => setNewRoom({ ...newRoom, room_number: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Bed Capacity</Label>
                <Input type="number" value={newRoom.capacity} onChange={e => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Room Category</Label>
                <Input value={newRoom.room_type} onChange={e => setNewRoom({ ...newRoom, room_type: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Term Fee (PKR)</Label>
                <Input type="number" value={newRoom.fee_per_term} onChange={e => setNewRoom({ ...newRoom, fee_per_term: parseFloat(e.target.value) || 0 })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddRoom} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Hostel Room</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAllocateModal} onOpenChange={setShowAllocateModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Assign Student to Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Select Hostel Room</Label>
              <Select value={allocData.room_id} onValueChange={val => setAllocData({ ...allocData, room_id: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose Room..." />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.building_name} - Room {r.room_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Select Enrolled Student</Label>
              <SearchableSelect
                placeholder="Type student name, roll number, or class..."
                options={students.map((s: any) => ({
                  id: s.id,
                  label: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || "Enrolled Student",
                  sublabel: s.roll_number ? `Roll: ${s.roll_number}` : s.class_name ? `Class: ${s.class_name}` : "Student"
                }))}
                value={allocData.student_id}
                onChange={val => setAllocData({ ...allocData, student_id: val })}
              />
            </div>
            <Button onClick={handleAllocate} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Confirm Allocation</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAttendanceModal} onOpenChange={setShowAttendanceModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Night Warden Roll Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block">Select Boarding Student</Label>
              <SearchableSelect
                placeholder="Type student name, roll number, or class..."
                options={students.map((s: any) => ({
                  id: s.id,
                  label: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || "Boarding Student",
                  sublabel: s.roll_number ? `Roll: ${s.roll_number}` : s.class_name ? `Class: ${s.class_name}` : "Student"
                }))}
                value={attData.student_id}
                onChange={val => setAttData({ ...attData, student_id: val })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={attData.status} onValueChange={val => setAttData({ ...attData, status: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present in Room</SelectItem>
                  <SelectItem value="absent">Absent / Unexcused</SelectItem>
                  <SelectItem value="late">Late Check-In</SelectItem>
                  <SelectItem value="leave">On Leave with Permission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAttendance} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Log Attendance</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
