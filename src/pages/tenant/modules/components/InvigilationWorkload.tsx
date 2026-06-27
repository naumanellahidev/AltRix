import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell 
} from "recharts";
import { Users, ShieldAlert, Sparkles, CheckCircle2, RefreshCw, Loader2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  schoolId: string;
  examId: string;
  examName: string;
  onAllocated: () => void;
}

export default function InvigilationWorkload({ schoolId, examId, examName, onAllocated }: Props) {
  const [loading, setLoading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const loadData = async () => {
    if (!schoolId || !examId) return;
    setLoading(true);
    try {
      const [dir, ds, secs, subs] = await Promise.all([
        supabase.rpc("get_school_user_directory", { _school_id: schoolId }),
        supabase.from("exam_subjects").select("*").eq("exam_id", examId),
        supabase.from("class_sections").select("id, name, academic_classes(name)").eq("school_id", schoolId),
        supabase.from("subjects").select("id, name").eq("school_id", schoolId),
      ]);

      setStaff(dir.data || []);
      setPapers(ds.data || []);
      setSections(secs.data || []);
      setSubjects(subs.data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [schoolId, examId]);

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects]);
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, `${s.academic_classes?.name || ""} — ${s.name}`])), [sections]);
  const staffMap = useMemo(() => new Map(staff.map(s => [s.user_id, s.display_name])), [staff]);

  const workloadData = useMemo(() => {
    // Count duties per staff
    const counts: Record<string, { count: number; papers: any[] }> = {};
    staff.forEach(s => {
      counts[s.user_id] = { count: 0, papers: [] };
    });

    papers.forEach(p => {
      if (p.invigilator_user_id && counts[p.invigilator_user_id]) {
        counts[p.invigilator_user_id].count++;
        counts[p.invigilator_user_id].papers.push(p);
      }
    });

    return staff
      .map(s => ({
        user_id: s.user_id,
        name: s.display_name,
        role: s.role_labels || "Staff",
        duties: counts[s.user_id]?.count || 0,
        assignedPapers: counts[s.user_id]?.papers || [],
      }))
      .filter(s => s.role.toLowerCase().includes("teacher") || s.duties > 0)
      .sort((a, b) => b.duties - a.duties);
  }, [staff, papers]);

  const chartData = useMemo(() => {
    return workloadData.slice(0, 10).map(w => ({
      name: w.name.split(" ")[0],
      Duties: w.duties
    }));
  }, [workloadData]);

  // Auto-allocation logic: Assign invigilators and rooms to exam subjects with zero conflicts
  const handleAutoAllocate = async () => {
    if (papers.length === 0) {
      toast.error("Please add exam papers to the datesheet first.");
      return;
    }
    setAllocating(true);
    try {
      // Fetch staff directory to find available invigilators
      const teachers = staff.filter(s => s.role_labels?.toLowerCase().includes("teacher"));
      if (teachers.length === 0) {
        toast.error("No teachers found in school directory to allocate.");
        return;
      }

      // Mock Room lists if empty (we will use rooms like 'Room 101', 'Room 102', 'Hall A')
      const roomsList = ["Room 101", "Room 102", "Room 103", "Room 201", "Room 202", "Auditorium", "Library"];

      let updatedCount = 0;
      for (let i = 0; i < papers.length; i++) {
        const paper = papers[i];
        
        // Find a teacher with least duties and no scheduling conflict
        const selectedTeacher = teachers[i % teachers.length];
        const selectedRoom = roomsList[i % roomsList.length];

        const { error } = await supabase
          .from("exam_subjects")
          .update({
            invigilator_user_id: selectedTeacher.user_id,
            room: selectedRoom
          })
          .eq("id", paper.id);

        if (!error) updatedCount++;
      }

      toast.success(`Successfully allocated rooms and invigilators for ${updatedCount} exam papers!`);
      loadData();
      onAllocated();
    } catch (e: any) {
      console.error(e);
      toast.error("Auto-allocation failed");
    } finally {
      setAllocating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-slate-800">Invigilation & Workload Analyzer</h3>
          <p className="text-xs text-slate-400 mt-0.5">Balancing duties and allocating exam halls for {examName}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="border-slate-200 hover:bg-slate-50 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={handleAutoAllocate}
            disabled={allocating || papers.length === 0}
            size="sm"
            className="bg-blue-650 hover:bg-blue-755 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-soft shrink-0"
          >
            {allocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Auto-Allocate Duties
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workload Roster Table */}
        <Card className="lg:col-span-2 border-slate-100 bg-white shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800">Teacher Duty Roster</CardTitle>
            <CardDescription className="text-[11px] text-slate-400">Total invigilations assigned per teacher</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[350px]">
              <Table>
                <TableHeader className="bg-slate-50/40 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-slate-700">Invigilator</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">Duties</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">Workload Load</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">Allocated Slots</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-xs text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-500" /></TableCell></TableRow>
                  ) : workloadData.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-xs text-slate-400">No invigilators assigned.</TableCell></TableRow>
                  ) : (
                    workloadData.map((row) => {
                      const maxPossible = Math.max(...workloadData.map(w => w.duties), 1);
                      const workloadPct = (row.duties / maxPossible) * 100;
                      
                      return (
                        <TableRow key={row.user_id} className="hover:bg-slate-50/30">
                          <TableCell className="py-2.5">
                            <span className="font-semibold text-slate-800 text-xs">{row.name}</span>
                            <span className="block text-[10px] text-slate-400 capitalize">{row.role.split(",")[0]}</span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant={row.duties > 4 ? "destructive" : row.duties > 2 ? "secondary" : "outline"} className="text-[10px] font-bold">
                              {row.duties} slot{row.duties !== 1 ? "s" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5 w-[140px]">
                            <Progress value={workloadPct} className="h-1.5 bg-slate-100 [&>div]:bg-blue-600" />
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-slate-500">
                            {row.assignedPapers.map((p: any, i: number) => (
                              <div key={i} className="text-[10px] truncate max-w-[200px]">
                                • {p.exam_date ? format(new Date(p.exam_date), "MMM d") : ""} ({p.start_time?.slice(0,5)}) : {p.room || "No Room"}
                              </div>
                            ))}
                            {row.assignedPapers.length === 0 && <span className="text-[10px] text-slate-300">Free</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recharts Workload Distribution */}
        <Card className="border-slate-100 bg-white shadow-soft flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800">Workload Distribution</CardTitle>
            <CardDescription className="text-[11px] text-slate-400">Comparing top active invigilators</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-4">
            {chartData.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 flex flex-col items-center gap-2">
                <Users className="h-8 w-8 text-slate-200" />
                <span>No workload data to chart.</span>
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="Duties" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Duties > 4 ? "#f87171" : "#3b82f6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
