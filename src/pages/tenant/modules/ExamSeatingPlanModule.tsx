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
import { format } from "date-fns";
import {
  Grid3X3,
  Calendar,
  Users,
  DoorOpen,
  Printer,
  ChevronRight,
  Plus,
  Play,
  CheckCircle,
  Inbox,
  AlertTriangle,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";

interface ExamRoom {
  id: string;
  room_name: string;
  capacity_rows: number;
  capacity_cols: number;
  total_capacity: number;
}

interface ExamDatesheet {
  id: string;
  exam_id: string;
  class_section_id: string;
  subject_id: string | null;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface SeatAssignment {
  id: string;
  seating_plan_id: string;
  student_id: string;
  student_name: string;
  student_roll: string;
  student_class: string;
  row_num: number;
  col_num: number;
}

interface SeatingPlan {
  id: string;
  datesheet_id: string;
  room_id: string;
  room_name: string;
  assignments: SeatAssignment[];
  invigilators: { staff_user_id: string; role: string }[];
}

export default function ExamSeatingPlanModule() {
  const [activeTab, setActiveTab] = useState("plans");
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [datesheets, setDatesheets] = useState<ExamDatesheet[]>([]);
  const [plans, setPlans] = useState<SeatingPlan[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals controller
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [showArrangeDialog, setShowArrangeDialog] = useState(false);

  // New room states
  const [roomName, setRoomName] = useState("");
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(6);

  // Arrange states
  const [selectedDatesheetId, setSelectedDatesheetId] = useState("");
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

  // Selected plan detail
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SeatingPlan | null>(null);

  // Invigilator assignment
  const [invigStaffId, setInvigStaffId] = useState("");
  const [invigRole, setInvigRole] = useState("primary");

  const loadRooms = async () => {
    try {
      const res = await apiClient.get("/exams/rooms");
      setRooms(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedRoomIds([res.data[0].id]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadDatesheets = async () => {
    try {
      // Datesheets are fetched from first exam listed
      const examsRes = await apiClient.get("/exams");
      if (examsRes.data && examsRes.data.length > 0) {
        const firstExamId = examsRes.data[0].id;
        const res = await apiClient.get(`/exams/${firstExamId}/datesheet`);
        setDatesheets(res.data || []);
        if (res.data && res.data.length > 0) {
          setSelectedDatesheetId(res.data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/exams/seating-plans");
      setPlans(res.data || []);
      if (res.data && res.data.length > 0 && !selectedPlanId) {
        setSelectedPlanId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
    loadDatesheets();
    loadPlans();
  }, []);

  useEffect(() => {
    if (selectedPlanId) {
      const found = plans.find((p) => p.id === selectedPlanId);
      setSelectedPlan(found || null);
    }
  }, [selectedPlanId, plans]);

  const handleCreateRoom = async () => {
    if (!roomName) return;
    try {
      await apiClient.post("/exams/rooms", {
        room_name: roomName,
        capacity_rows: rows,
        capacity_cols: cols,
      });
      toast.success("Exam room hall registered!");
      setShowRoomDialog(false);
      setRoomName("");
      loadRooms();
    } catch (err) {
      console.error(err);
      toast.error("Failed to register room");
    }
  };

  const handleArrangeSeating = async () => {
    if (!selectedDatesheetId || selectedRoomIds.length === 0) {
      toast.error("Please select a datesheet and at least one room");
      return;
    }
    try {
      await apiClient.post("/exams/seating-plans/generate", null, {
        params: {
          datesheet_id: selectedDatesheetId,
          room_ids: selectedRoomIds,
        },
      });
      toast.success("Alternate adjacent seating plan generated successfully!");
      setShowArrangeDialog(false);
      loadPlans();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.detail || "Insufficient room capacity or arrangement limits exceeded";
      toast.error(msg);
    }
  };

  const handleAssignInvigilator = async () => {
    if (!selectedPlanId || !invigStaffId) return;
    try {
      await apiClient.post(`/exams/seating-plans/${selectedPlanId}/invigilators`, null, {
        params: {
          staff_user_id: invigStaffId,
          role: invigRole,
        },
      });
      toast.success("Invigilator duty assigned!");
      setInvigStaffId("");
      loadPlans();
    } catch (err) {
      console.error(err);
      toast.error("Failed to assign invigilator");
    }
  };

  const handleToggleRoomSelection = (roomId: string) => {
    if (selectedRoomIds.includes(roomId)) {
      setSelectedRoomIds(selectedRoomIds.filter((id) => id !== roomId));
    } else {
      setSelectedRoomIds([...selectedRoomIds, roomId]);
    }
  };

  // Render Seating Grid matrix (rows x cols)
  const renderSeatingGrid = (plan: SeatingPlan) => {
    const roomInfo = rooms.find((r) => r.id === plan.room_id);
    if (!roomInfo) return null;

    const gridRows = roomInfo.capacity_rows;
    const gridCols = roomInfo.capacity_cols;

    // Create matrix
    const matrix = Array.from({ length: gridRows }, () =>
      Array.from({ length: gridCols }, () => null as SeatAssignment | null)
    );

    // Populate assignments
    plan.assignments.forEach((a) => {
      if (a.row_num < gridRows && a.col_num < gridCols) {
        matrix[a.row_num][a.col_num] = a;
      }
    });

    // Helper class colors to visually show checkerboard sorting
    const classColors: { [key: string]: string } = {
      "even": "bg-primary/20 border-primary/40 text-primary-foreground",
      "odd": "bg-accent/20 border-accent/40 text-accent-foreground",
    };

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto p-4 bg-muted/20 border rounded-2xl">
          <div
            className="grid gap-3 mx-auto"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(110px, 1fr))`,
            }}
          >
            {matrix.map((row, rIdx) =>
              row.map((seat, cIdx) => {
                const isChecker = (rIdx + cIdx) % 2 === 0;
                const seatClass = isChecker ? "even" : "odd";

                return (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    className={`h-24 p-2.5 rounded-xl border flex flex-col justify-between text-center transition-all ${
                      seat
                        ? classColors[seatClass]
                        : "bg-muted/10 border-border/40 text-muted-foreground border-dashed"
                    }`}
                  >
                    <div className="text-[10px] text-muted-foreground font-semibold">
                      Row {rIdx + 1}, Col {cIdx + 1}
                    </div>
                    {seat ? (
                      <div>
                        <div className="font-bold text-xs truncate max-w-full text-foreground">
                          {seat.student_name}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {seat.student_roll}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/60 italic">Vacant Seat</span>
                    )}
                    <div className="text-[8px] font-semibold tracking-wider text-muted-foreground/80">
                      {seat ? seat.student_class.slice(-8) : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        
        {/* Color Legend */}
        <div className="flex gap-4 items-center justify-center text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-primary/20 border border-primary/40" />
            <span>Checker Category A</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-accent/20 border border-accent/40" />
            <span>Checker Category B</span>
          </div>
        </div>
      </div>
    );
  };

  const printSeatingPlan = (plan: SeatingPlan) => {
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    
    // Construct Grid html
    const roomInfo = rooms.find((r) => r.id === plan.room_id);
    if (!roomInfo) return;
    
    const gridRows = roomInfo.capacity_rows;
    const gridCols = roomInfo.capacity_cols;
    const matrix = Array.from({ length: gridRows }, () =>
      Array.from({ length: gridCols }, () => null as SeatAssignment | null)
    );
    plan.assignments.forEach((a) => {
      if (a.row_num < gridRows && a.col_num < gridCols) {
        matrix[a.row_num][a.col_num] = a;
      }
    });

    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: 10px; margin: 30px 0;">`;
    matrix.forEach((row, r) => {
      row.forEach((seat, c) => {
        gridHtml += `
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; background: ${seat ? '#f1f5f9' : '#fff'};">
            <div style="font-size: 9px; color: #94a3b8;">Row ${r+1}, Col ${c+1}</div>
            <div style="font-weight: bold; font-size: 12px; margin: 6px 0 2px;">${seat ? seat.student_name : 'VACANT'}</div>
            <div style="font-size: 10px; color: #64748b;">${seat ? seat.student_roll : '—'}</div>
          </div>
        `;
      });
    });
    gridHtml += "</div>";

    const html = `
      <!doctype html>
      <html>
      <head>
        <title>Seating Chart - ${plan.room_name}</title>
        <style>
          body { font-family: sans-serif; padding: 30px; color: #1e293b; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>EXAMINATION HALL SEATING CHART</h2>
          <div>Room: <strong>${plan.room_name}</strong> | Total Capacity: ${roomInfo.total_capacity} seats</div>
          <div>Datesheet Mapped: ${plan.datesheet_id}</div>
        </div>
        ${gridHtml}
        <script>setTimeout(() => window.print(), 300)</script>
      </body>
      </html>
    `;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Title Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Exam Seating Planner</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Register exam halls, schedule seating coordinates, run alternate adjacent allocation algorithm, and print charts.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setShowRoomDialog(true)} variant="outline" className="border-primary/20 text-foreground">
            <Plus className="h-4 w-4 mr-2" /> Add Exam Room
          </Button>
          <Button onClick={() => setShowArrangeDialog(true)} className="bg-primary text-primary-foreground font-semibold">
            <Play className="h-4 w-4 mr-2" /> Auto-Arrange Seating
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="plans" className="gap-2 rounded-lg">
            <Grid3X3 className="h-4 w-4" /> Seating Grids
          </TabsTrigger>
          <TabsTrigger value="rooms" className="gap-2 rounded-lg">
            <DoorOpen className="h-4 w-4" /> Exam Halls ({rooms.length})
          </TabsTrigger>
        </TabsList>

        {/* Seating Grids Tab */}
        <TabsContent value="plans" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Sidebar plans selector */}
            <Card className="lg:col-span-1 shadow-soft border-border/60">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Seating Handoffs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {plans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    No active arrangements. Click "Auto-Arrange" to generate.
                  </div>
                ) : (
                  plans.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all flex flex-col gap-1 ${
                        selectedPlanId === p.id
                          ? "bg-primary text-primary-foreground font-semibold shadow-glow"
                          : "hover:bg-muted/80 text-foreground"
                      }`}
                    >
                      <span className="text-sm font-bold truncate">{p.room_name}</span>
                      <span className={`text-[10px] ${selectedPlanId === p.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        Allocated: {p.assignments.length} Students
                      </span>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Plan grid viewer */}
            <div className="lg:col-span-3 space-y-6">
              {selectedPlan ? (
                <div className="space-y-6">
                  {/* Seating matrix grid */}
                  <Card className="shadow-soft border-border/60">
                    <CardHeader className="border-b flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold font-display text-foreground">
                          Seating Layout Matrix — {selectedPlan.room_name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Adjacent seats color mapped to block same-class peer sits.</p>
                      </div>
                      <Button onClick={() => printSeatingPlan(selectedPlan)} variant="outline" className="gap-2">
                        <Printer className="h-4 w-4" /> Print Seating Chart
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {renderSeatingGrid(selectedPlan)}
                    </CardContent>
                  </Card>

                  {/* Invigilators assignment panel */}
                  <Card className="shadow-soft border-border/60">
                    <CardHeader>
                      <CardTitle className="text-base font-bold font-display">Invigilators Duty</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Invigilator creator */}
                      <div className="flex flex-col md:flex-row gap-3 items-end bg-muted/20 p-4 border rounded-2xl">
                        <div className="flex-1 space-y-1.5">
                          <Label>Select Teacher / Staff</Label>
                          <Input
                            placeholder="e.g. Teacher User UUID / Profile Name"
                            value={invigStaffId}
                            onChange={(e) => setInvigStaffId(e.target.value)}
                          />
                        </div>
                        <div className="w-full md:w-48 space-y-1.5">
                          <Label>Duty Role</Label>
                          <select
                            value={invigRole}
                            onChange={(e) => setInvigRole(e.target.value)}
                            className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                          >
                            <option value="primary">Primary Invigilator</option>
                            <option value="secondary">Co-Invigilator</option>
                            <option value="helper">Hall Helper</option>
                          </select>
                        </div>
                        <Button onClick={handleAssignInvigilator} className="bg-primary text-primary-foreground font-semibold">
                          <UserCheck className="h-4 w-4 mr-2" /> Assign Duty
                        </Button>
                      </div>

                      {/* Invigilator list */}
                      {selectedPlan.invigilators.length > 0 && (
                        <div className="border border-border/80 rounded-xl overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="font-semibold pl-6">Staff Member</TableHead>
                                <TableHead className="font-semibold text-right pr-6">Assigned Role</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedPlan.invigilators.map((inv, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="pl-6 font-bold text-foreground">
                                    Teacher ID: {inv.staff_user_id.slice(0, 8)}
                                  </TableCell>
                                  <TableCell className="text-right pr-6 capitalize font-semibold text-xs">
                                    {inv.role}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl text-muted-foreground text-center">
                  <Grid3X3 className="h-10 w-10 text-slate-400 mb-3" />
                  <p>Choose or generate a seating plan schedule to inspect arrangements charts.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Room Manager Tab */}
        <TabsContent value="rooms" className="space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Registered Exam Rooms</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Room / Hall Name</TableHead>
                    <TableHead className="font-semibold text-center">Rows Capacity</TableHead>
                    <TableHead className="font-semibold text-center">Columns Capacity</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Total Seats</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No physical halls configured. Configure a room grid to set coordinates.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rooms.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-6 font-bold text-foreground">{r.room_name}</TableCell>
                        <TableCell className="text-center">{r.capacity_rows}</TableCell>
                        <TableCell className="text-center">{r.capacity_cols}</TableCell>
                        <TableCell className="text-right pr-6 font-bold text-primary">{r.total_capacity} Seats</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Room Dialog */}
      <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">Register Exam Hall</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Room Name</Label>
              <Input
                placeholder="e.g. Auditorium Hall C"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Grid Rows</Label>
                <Input
                  type="number"
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Grid Cols</Label>
                <Input
                  type="number"
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground border-t pt-2">
              Seat capacity automatically scales to: <span className="font-bold text-foreground">{rows * cols} seats</span>.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRoomDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleCreateRoom} className="bg-primary text-primary-foreground font-semibold">
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Arrange Seating Plan Dialog */}
      <Dialog open={showArrangeDialog} onOpenChange={setShowArrangeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Configure Seating generator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Select Datesheet Exam Slot</Label>
              <select
                value={selectedDatesheetId}
                onChange={(e) => setSelectedDatesheetId(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
              >
                {datesheets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    Date: {ds.exam_date} | Class: {ds.class_section_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Select Exam Room(s)</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border/80 rounded-xl p-3">
                {rooms.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`chk-${r.id}`}
                      checked={selectedRoomIds.includes(r.id)}
                      onChange={() => handleToggleRoomSelection(r.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor={`chk-${r.id}`} className="text-xs font-semibold cursor-pointer text-foreground">
                      {r.room_name} ({r.total_capacity} seats)
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowArrangeDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleArrangeSeating} className="bg-primary text-primary-foreground font-semibold">
              Run Seating Arrangement Algorithm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
