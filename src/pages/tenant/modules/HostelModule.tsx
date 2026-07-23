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
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Home, Bed, Utensils, Moon, Plus, Search, RefreshCw,
  CheckCircle2, AlertCircle, UserCheck, Shield, Clock
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

export function HostelModule() {
  const [activeTab, setActiveTab] = useState("rooms");
  const [rooms, setRooms] = useState<HostelRoom[]>([]);
  const [messMenu, setMessMenu] = useState<MessMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Add Room Modal
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({
    building_name: "Boys Boarding Block A", room_number: "101", capacity: 2, room_type: "Deluxe AC", fee_per_term: 25000
  });

  // Allocate Modal
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocData, setAllocData] = useState({ room_id: "", student_id: "", check_in_date: "" });

  // Night Attendance Modal
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attData, setAttData] = useState({ student_id: "", status: "present", warden_notes: "" });

  const loadHostelData = async () => {
    setLoading(true);
    try {
      const [resRooms, resMess] = await Promise.all([
        apiClient.get("/hostel/rooms"),
        apiClient.get("/hostel/mess-menu")
      ]);
      setRooms(resRooms.data ?? []);
      setMessMenu(resMess.data ?? []);
    } catch {
      setRooms([]);
      setMessMenu([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadHostelData();
  }, []);

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
      toast.error("Select room and student ID");
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

  const handleNightAttendance = async () => {
    if (!attData.student_id) {
      toast.error("Enter student UUID");
      return;
    }
    try {
      await apiClient.post("/hostel/attendance", attData);
      toast.success("Boarding night attendance recorded");
      setShowAttendanceModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to record attendance");
    }
  };

  const totalCapacity = rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);
  const totalOccupied = rooms.reduce((acc, r) => acc + (r.occupied_count || 0), 0);

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Rooms</p>
              <p className="text-xl font-bold text-white mt-0.5">{rooms.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400">
              <Bed className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Bed Capacity</p>
              <p className="text-xl font-bold text-white mt-0.5">{totalCapacity}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Boarding Occupancy</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{totalOccupied} / {totalCapacity}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
              <Moon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Night Check Desk</p>
              <p className="text-xl font-bold text-indigo-400 mt-0.5">Active</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="rooms" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <Bed className="h-4 w-4 mr-2" /> Hostel Rooms & Beds
            </TabsTrigger>
            <TabsTrigger value="night-check" className="data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-400">
              <Moon className="h-4 w-4 mr-2" /> Nightly Roll Call
            </TabsTrigger>
            <TabsTrigger value="mess" className="data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400">
              <Utensils className="h-4 w-4 mr-2" /> Boarding Mess Menu
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search Room, Block..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-cyan-500/30" />
            </div>
            <Button variant="outline" onClick={loadHostelData} className="border-zinc-800 bg-zinc-950/60 text-zinc-200">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Rooms Tab ──────────────────────────────────── */}
        <TabsContent value="rooms">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Bed className="h-5 w-5 text-cyan-400" /> Hostel Room Master Allocation Grid
              </CardTitle>
              <div className="flex gap-2">
                <Button onClick={() => setShowAllocateModal(true)} variant="outline" className="border-zinc-700 text-zinc-200">
                  <UserCheck className="h-4 w-4 mr-2 text-cyan-400" /> Assign Student to Room
                </Button>
                <Button onClick={() => setShowAddRoomModal(true)} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold">
                  <Plus className="h-4 w-4 mr-2" /> Add Hostel Room
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">Room #</TableHead>
                    <TableHead className="text-zinc-400">Block / Building</TableHead>
                    <TableHead className="text-zinc-400">Room Type</TableHead>
                    <TableHead className="text-zinc-400">Occupancy</TableHead>
                    <TableHead className="text-zinc-400">Term Fee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-12">
                        <Bed className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No hostel room records registered yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rooms.filter(r => !search || r.room_number.includes(search) || r.building_name.toLowerCase().includes(search.toLowerCase())).map(r => (
                      <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-mono text-xs font-bold text-cyan-400">Room {r.room_number}</TableCell>
                        <TableCell className="font-semibold text-white">{r.building_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300">{r.room_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            r.occupied_count >= r.capacity ? "border-red-500/30 text-red-400 bg-red-500/5" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                          }`}>
                            {r.occupied_count} / {r.capacity} beds occupied
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-cyan-300">${r.fee_per_term?.toFixed(2) || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Night Check Tab ────────────────────────────── */}
        <TabsContent value="night-check">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Moon className="h-5 w-5 text-indigo-400" /> Nightly Boarding Roll Call Desk
              </CardTitle>
              <Button onClick={() => setShowAttendanceModal(true)} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold">
                <Plus className="h-4 w-4 mr-2" /> Mark Boarding Attendance
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-zinc-500">
                <Moon className="h-10 w-10 mx-auto mb-3 text-indigo-500" />
                <p className="text-sm">Boarding night curfew check active. All room wardens logged in.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Mess Tab ──────────────────────────────────── */}
        <TabsContent value="mess">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Utensils className="h-5 w-5 text-blue-400" /> Weekly Boarding Mess Meal Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messMenu.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Utensils className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm">No weekly mess menu configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Day</TableHead>
                      <TableHead className="text-zinc-400">Breakfast</TableHead>
                      <TableHead className="text-zinc-400">Lunch</TableHead>
                      <TableHead className="text-zinc-400">Dinner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messMenu.map(m => (
                      <TableRow key={m.id} className="border-zinc-800">
                        <TableCell className="font-bold text-cyan-400">{m.day_of_week}</TableCell>
                        <TableCell className="text-xs text-zinc-300">{m.breakfast}</TableCell>
                        <TableCell className="text-xs text-zinc-300">{m.lunch}</TableCell>
                        <TableCell className="text-xs text-zinc-300">{m.dinner}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Room Modal */}
      <Dialog open={showAddRoomModal} onOpenChange={setShowAddRoomModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Hostel Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Block / Building Name</Label>
              <Input value={newRoom.building_name} onChange={e => setNewRoom(p => ({ ...p, building_name: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Boys Boarding Block A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Room Number</Label>
                <Input value={newRoom.room_number} onChange={e => setNewRoom(p => ({ ...p, room_number: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="102" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Bed Capacity</Label>
                <Input type="number" value={newRoom.capacity} onChange={e => setNewRoom(p => ({ ...p, capacity: parseInt(e.target.value) || 2 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
            </div>
            <Button onClick={handleAddRoom} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold mt-2">
              Save Hostel Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Allocate Modal */}
      <Dialog open={showAllocateModal} onOpenChange={setShowAllocateModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Allocate Room to Boarder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Select Room</Label>
              <Select value={allocData.room_id} onValueChange={v => setAllocData(p => ({ ...p, room_id: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue placeholder="Choose available room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.filter(r => r.occupied_count < r.capacity).map(r => (
                    <SelectItem key={r.id} value={r.id}>Room {r.room_number} ({r.building_name})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Student ID / UUID</Label>
              <Input value={allocData.student_id} onChange={e => setAllocData(p => ({ ...p, student_id: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Enter student UUID" />
            </div>
            <Button onClick={handleAllocate} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold mt-2">
              Confirm Allocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Night Attendance Modal */}
      <Dialog open={showAttendanceModal} onOpenChange={setShowAttendanceModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Mark Nightly Roll Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Student ID / UUID</Label>
              <Input value={attData.student_id} onChange={e => setAttData(p => ({ ...p, student_id: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Enter student UUID" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Status</Label>
              <Select value={attData.status} onValueChange={v => setAttData(p => ({ ...p, status: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present in Room</SelectItem>
                  <SelectItem value="absent">Absent / Unexcused</SelectItem>
                  <SelectItem value="leave">On Leave / Home Visit</SelectItem>
                  <SelectItem value="late">Late Check-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleNightAttendance} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold mt-2">
              Record Attendance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HostelModule;
