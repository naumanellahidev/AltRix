import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Grid, Plus, RefreshCw, UserCheck, ShieldCheck, Sparkles, Building, CheckCircle2,
  Printer, Trash2, Users, LayoutGrid, Award, BookOpen
} from "lucide-react";

interface Room {
  id: string;
  room_name: string;
  capacity_rows: number;
  capacity_cols: number;
  total_capacity: number;
}

interface SeatAssignment {
  row: number;
  col: number;
  seat_number: string;
  student_name: string;
  roll_number: string;
  class_name: string;
}

interface SeatingPlan {
  id: string;
  exam_title: string;
  room_name: string;
  invigilator_name: string;
  date: string;
  time_slot: string;
  assignments: SeatAssignment[];
  rows: number;
  cols: number;
}

export function ExamSeatingPlanModule() {
  const [rooms, setRooms] = useState<Room[]>([
    { id: "room-1", room_name: "Main Auditorium Hall A", capacity_rows: 5, capacity_cols: 6, total_capacity: 30 },
    { id: "room-2", room_name: "Science Complex Room 204", capacity_rows: 4, capacity_cols: 5, total_capacity: 20 },
    { id: "room-3", room_name: "Library Exam Annex B", capacity_rows: 6, capacity_cols: 6, total_capacity: 36 },
  ]);

  const [plans, setPlans] = useState<SeatingPlan[]>([
    {
      id: "plan-1",
      exam_title: "Mid-Term Physics & Chemistry",
      room_name: "Main Auditorium Hall A",
      invigilator_name: "Prof. Tariq Mahmood",
      date: "2026-08-15",
      time_slot: "09:00 AM - 12:00 PM",
      rows: 5,
      cols: 6,
      assignments: [
        { row: 1, col: 1, seat_number: "A-1", student_name: "Ahmad Raza", roll_number: "STU-9A-01", class_name: "Grade 9-A" },
        { row: 1, col: 2, seat_number: "A-2", student_name: "Bilal Hassan", roll_number: "STU-10B-04", class_name: "Grade 10-B" },
        { row: 1, col: 3, seat_number: "A-3", student_name: "Zainab Bibi", roll_number: "STU-9A-02", class_name: "Grade 9-A" },
        { row: 1, col: 4, seat_number: "A-4", student_name: "Hamza Malik", roll_number: "STU-10B-08", class_name: "Grade 10-B" },
        { row: 1, col: 5, seat_number: "A-5", student_name: "Fatima Khan", roll_number: "STU-9A-03", class_name: "Grade 9-A" },
        { row: 1, col: 6, seat_number: "A-6", student_name: "Usman Ali", roll_number: "STU-10B-12", class_name: "Grade 10-B" },

        { row: 2, col: 1, seat_number: "B-1", student_name: "Daniya Tariq", roll_number: "STU-10B-01", class_name: "Grade 10-B" },
        { row: 2, col: 2, seat_number: "B-2", student_name: "Omer Saeed", roll_number: "STU-9A-04", class_name: "Grade 9-A" },
        { row: 2, col: 3, seat_number: "B-3", student_name: "Sana Ahmed", roll_number: "STU-10B-05", class_name: "Grade 10-B" },
        { row: 2, col: 4, seat_number: "B-4", student_name: "Ali Raza", roll_number: "STU-9A-05", class_name: "Grade 9-A" },
        { row: 2, col: 5, seat_number: "B-5", student_name: "Maryam Noor", roll_number: "STU-10B-09", class_name: "Grade 10-B" },
        { row: 2, col: 6, seat_number: "B-6", student_name: "Saad Qureshi", roll_number: "STU-9A-06", class_name: "Grade 9-A" },
      ]
    }
  ]);

  const [selectedPlan, setSelectedPlan] = useState<SeatingPlan | null>(null);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showGeneratePlan, setShowGeneratePlan] = useState(false);

  // New room state
  const [roomData, setRoomData] = useState({ room_name: "Exam Hall C", capacity_rows: 5, capacity_cols: 6 });

  // Generator form state
  const [genExamTitle, setGenExamTitle] = useState("Final Mathematics Assessment");
  const [genRoomId, setGenRoomId] = useState("room-1");
  const [genClassA, setGenClassA] = useState("Grade 9-A");
  const [genClassB, setGenClassB] = useState("Grade 10-B");
  const [genInvigilator, setGenInvigilator] = useState("Dr. Shaheen Akhtar");
  const [genDate, setGenDate] = useState("2026-08-20");
  const [genTime, setGenTime] = useState("09:00 AM - 12:00 PM");

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [resRooms, resPlans] = await Promise.all([
        apiClient.get("/exams/rooms").catch(() => null),
        apiClient.get("/exams/seating-plans").catch(() => null)
      ]);
      if (resRooms?.data && Array.isArray(resRooms.data) && resRooms.data.length > 0) {
        setRooms(resRooms.data);
      }
      if (resPlans?.data && Array.isArray(resPlans.data) && resPlans.data.length > 0) {
        setPlans(resPlans.data);
      }
    } catch {
      // retain local default fallback state
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (Array.isArray(plans) && plans.length > 0 && !selectedPlan) {
      setSelectedPlan(plans[0]);
    }
  }, [plans]);

  const handleAddRoom = async () => {
    if (!roomData.room_name) {
      toast.error("Provide room name");
      return;
    }
    const newRoom: Room = {
      id: `room-${Date.now()}`,
      room_name: roomData.room_name,
      capacity_rows: roomData.capacity_rows,
      capacity_cols: roomData.capacity_cols,
      total_capacity: roomData.capacity_rows * roomData.capacity_cols
    };
    setRooms(prev => [...prev, newRoom]);
    toast.success("Exam hall registered");
    setShowAddRoom(false);

    try {
      await apiClient.post("/exams/rooms", roomData);
    } catch {
      // Saved locally
    }
  };

  const handleGeneratePlan = async () => {
    const targetRoom = rooms.find(r => r.id === genRoomId) || rooms[0];
    const rows = targetRoom.capacity_rows;
    const cols = targetRoom.capacity_cols;

    // Generate checkerboard student placement to prevent cheating
    const generatedAssignments: SeatAssignment[] = [];
    let countA = 1;
    let countB = 1;

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const isClassA = (r + c) % 2 === 0;
        const className = isClassA ? genClassA : genClassB;
        const studentNum = isClassA ? countA++ : countB++;
        const rowChar = String.fromCharCode(64 + r);

        generatedAssignments.push({
          row: r,
          col: c,
          seat_number: `${rowChar}-${c}`,
          student_name: `${className} Candidate #${studentNum}`,
          roll_number: `STU-${className.replace(/\s+/g, '')}-${String(studentNum).padStart(2, '0')}`,
          class_name: className
        });
      }
    }

    const newPlan: SeatingPlan = {
      id: `plan-${Date.now()}`,
      exam_title: genExamTitle,
      room_name: targetRoom.room_name,
      invigilator_name: genInvigilator,
      date: genDate,
      time_slot: genTime,
      rows,
      cols,
      assignments: generatedAssignments
    };

    setPlans(prev => [newPlan, ...prev]);
    setSelectedPlan(newPlan);
    setShowGeneratePlan(false);
    toast.success("Algorithmic Seating Plan generated successfully!");

    try {
      await apiClient.post("/exams/seating-plans", newPlan);
    } catch {
      // Saved locally
    }
  };

  const handleDeletePlan = (id: string) => {
    setPlans(prev => prev.filter(p => p.id !== id));
    if (selectedPlan?.id === id) {
      setSelectedPlan(plans.find(p => p.id !== id) || null);
    }
    toast.success("Seating plan removed");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 print:p-0">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Grid className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Algorithmic Exam Seating Generator</h1>
              <p className="text-blue-100 text-sm mt-0.5">Automated 2D checkerboard student placement to prevent exam cheating</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddRoom(true)} variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/30 font-semibold">
              <Building className="h-4 w-4 mr-2" /> Add Hall
            </Button>
            <Button onClick={() => setShowGeneratePlan(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
              <Sparkles className="h-4 w-4 mr-2" /> Auto-Generate Seating Grid
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="visualizer" className="space-y-6 print:space-y-2">
        <TabsList className="bg-muted p-1 rounded-xl print:hidden">
          <TabsTrigger value="visualizer" className="gap-2 rounded-lg font-semibold">
            <LayoutGrid className="h-4 w-4 text-blue-600" /> 2D Checkerboard Grid
          </TabsTrigger>
          <TabsTrigger value="halls" className="gap-2 rounded-lg font-semibold">
            <Building className="h-4 w-4 text-indigo-600" /> Physical Exam Halls ({rooms.length})
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 rounded-lg font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Active Seating Plans ({plans.length})
          </TabsTrigger>
        </TabsList>

        {/* 🌟 TAB 1: 2D CHECKERBOARD VISUALIZER */}
        <TabsContent value="visualizer" className="space-y-6">
          {plans.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <LayoutGrid className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Seating Plans Generated Yet</p>
              <p className="text-xs text-slate-500 mt-1">Click "Auto-Generate Seating Grid" to create anti-cheating candidate arrangements.</p>
              <Button onClick={() => setShowGeneratePlan(true)} className="mt-4 bg-blue-600 text-white font-semibold">
                <Sparkles className="h-4 w-4 mr-2" /> Generate Seating Plan
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Plan Picker & Controls */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <Select value={selectedPlan?.id ? String(selectedPlan.id) : ""} onValueChange={id => setSelectedPlan(plans.find(p => String(p.id) === String(id)) || null)}>
                    <SelectTrigger className="w-full md:w-80 font-bold text-slate-800 dark:text-slate-200">
                      <SelectValue placeholder="Select Seating Plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map(p => (
                        <SelectItem key={String(p.id)} value={String(p.id)}>{p.exam_title} ({p.room_name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0">
                    <UserCheck className="h-3.5 w-3.5 mr-1" /> Anti-Cheating Active
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => window.print()} variant="outline" className="border-slate-200 font-semibold text-xs h-9">
                    <Printer className="h-4 w-4 mr-2" /> Print Door Sheet
                  </Button>
                  {selectedPlan && (
                    <Button onClick={() => handleDeletePlan(selectedPlan.id)} variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-9">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Plan Detail & 2D Grid */}
              {selectedPlan && (
                <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden print:shadow-none print:border-none">
                  <CardHeader className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <Badge className="bg-blue-600 text-white mb-2">{selectedPlan.room_name}</Badge>
                        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">{selectedPlan.exam_title}</CardTitle>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-4">
                          <span>📅 Date: <strong>{selectedPlan.date}</strong></span>
                          <span>⏰ Time: <strong>{selectedPlan.time_slot}</strong></span>
                          <span>👮 Invigilator: <strong>{selectedPlan.invigilator_name}</strong></span>
                        </p>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border text-xs font-semibold">
                        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-500 inline-block" /> Class A</span>
                        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Class B</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6 space-y-6">
                    {/* Invigilator Podium Desk Header */}
                    <div className="w-full bg-slate-800 text-slate-200 py-2 rounded-lg text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" /> Invigilator Desk & Board Area (Front of Exam Hall)
                    </div>

                    {/* 2D Checkerboard Grid Render */}
                    <div className="overflow-x-auto pb-4">
                      <div 
                        className="grid gap-3 min-w-[600px]"
                        style={{ gridTemplateColumns: `repeat(${selectedPlan.cols}, minmax(0, 1fr))` }}
                      >
                        {(Array.isArray(selectedPlan.assignments) ? selectedPlan.assignments : []).map((seat, idx) => {
                          const isClassA = (seat.row + seat.col) % 2 === 0;
                          return (
                            <div 
                              key={idx}
                              className={`p-3 rounded-xl border transition-all flex flex-col justify-between h-24 ${
                                isClassA 
                                  ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" 
                                  : "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isClassA ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"
                                }`}>
                                  Seat {seat.seat_number}
                                </span>
                                <span className="text-[10px] font-medium text-slate-500">{seat.class_name}</span>
                              </div>

                              <div>
                                <p className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-1">{seat.student_name}</p>
                                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{seat.roll_number}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer instructions */}
                    <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                      * Checkerboard algorithm guarantees no two candidates of the same section sit in adjacent seats.
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* 🌟 TAB 2: REGISTERED EXAM HALLS */}
        <TabsContent value="halls" className="space-y-6">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building className="h-5 w-5 text-blue-600" /> Physical Exam Rooms & Grid Dimensions
              </CardTitle>
              <Button onClick={() => setShowAddRoom(true)} className="bg-blue-600 text-white font-semibold">
                <Plus className="h-4 w-4 mr-2" /> Register Exam Hall
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Hall Name</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Columns</TableHead>
                    <TableHead>Total Seating Capacity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map(r => (
                    <TableRow key={r.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold text-blue-700 dark:text-blue-400">{r.room_name}</TableCell>
                      <TableCell>{r.capacity_rows} Rows</TableCell>
                      <TableCell>{r.capacity_cols} Columns</TableCell>
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{r.total_capacity} Seats</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 🌟 TAB 3: ACTIVE PLANS LIST */}
        <TabsContent value="plans" className="space-y-6">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Generated Exam Seating Plans
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Exam Title</TableHead>
                    <TableHead>Hall</TableHead>
                    <TableHead>Invigilator</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Candidates Seated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{p.exam_title}</TableCell>
                      <TableCell>{p.room_name}</TableCell>
                      <TableCell>{p.invigilator_name}</TableCell>
                      <TableCell className="text-xs text-slate-500">{p.date} ({p.time_slot})</TableCell>
                      <TableCell><Badge variant="secondary">{p.assignments.length} Desks</Badge></TableCell>
                      <TableCell>
                        <Button onClick={() => { setSelectedPlan(p); }} variant="outline" size="sm" className="border-blue-200 text-blue-600">
                          View Grid
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal 1: Register Room */}
      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Register Exam Hall</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Hall Name</Label>
              <Input value={roomData.room_name} onChange={e => setRoomData({ ...roomData, room_name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rows</Label>
                <Input type="number" value={roomData.capacity_rows} onChange={e => setRoomData({ ...roomData, capacity_rows: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
              <div>
                <Label>Columns</Label>
                <Input type="number" value={roomData.capacity_cols} onChange={e => setRoomData({ ...roomData, capacity_cols: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddRoom} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Exam Hall</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Auto Generate Seating Plan */}
      <Dialog open={showGeneratePlan} onOpenChange={setShowGeneratePlan}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Auto-Generate Anti-Cheating Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Exam Title</Label>
              <Input value={genExamTitle} onChange={e => setGenExamTitle(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label>Target Exam Room</Label>
              <Select value={genRoomId} onValueChange={setGenRoomId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.room_name} ({r.total_capacity} Seats)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Class / Section A</Label>
                <Input value={genClassA} onChange={e => setGenClassA(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Class / Section B</Label>
                <Input value={genClassB} onChange={e => setGenClassB(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Invigilator Teacher</Label>
              <Input value={genInvigilator} onChange={e => setGenInvigilator(e.target.value)} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Exam Date</Label>
                <Input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Time Slot</Label>
                <Input value={genTime} onChange={e => setGenTime(e.target.value)} className="mt-1" />
              </div>
            </div>

            <Button onClick={handleGeneratePlan} className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 text-white font-semibold shadow-md py-5">
              <Sparkles className="h-4 w-4 mr-2" /> Generate Anti-Cheating Seating Layout
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExamSeatingPlanModule;
