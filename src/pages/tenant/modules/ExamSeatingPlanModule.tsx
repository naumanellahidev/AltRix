import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Grid, Plus, RefreshCw, UserCheck, ShieldCheck, Sparkles, Building, CheckCircle2
} from "lucide-react";

interface Room {
  id: string;
  room_name: string;
  capacity_rows: number;
  capacity_cols: number;
  total_capacity: number;
}

interface SeatingPlan {
  id: string;
  room_name: string;
  assignments: any[];
  invigilators: any[];
}

export function ExamSeatingPlanModule() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [plans, setPlans] = useState<SeatingPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomData, setRoomData] = useState({ room_name: "Exam Hall A", capacity_rows: 5, capacity_cols: 6 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [resRooms, resPlans] = await Promise.all([
        apiClient.get("/exams/rooms"),
        apiClient.get("/exams/seating-plans")
      ]);
      setRooms(resRooms.data ?? []);
      setPlans(resPlans.data ?? []);
    } catch {
      setRooms([]);
      setPlans([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRoom = async () => {
    if (!roomData.room_name) {
      toast.error("Provide room name");
      return;
    }
    try {
      await apiClient.post("/exams/rooms", roomData);
      toast.success("Exam hall registered");
      setShowAddRoom(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to register room");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
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
          <Button onClick={() => setShowAddRoom(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
            <Plus className="h-4 w-4 mr-2" /> Register Exam Hall
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Building className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Halls</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{rooms.length} Exam Rooms</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Grid className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Seating Plans</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{plans.length} Generated</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Algorithm Status</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Ready</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" /> Physical Exam Rooms & Grid Dimensions
          </CardTitle>
          <Button variant="outline" onClick={loadData} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {rooms.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Building className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Exam Halls Registered</p>
              <p className="text-xs text-slate-500 mt-1">Click "Register Exam Hall" to define room rows and column grids.</p>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
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
    </div>
  );
}
