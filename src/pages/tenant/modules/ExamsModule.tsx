import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  GraduationCap, Plus, Trash2, CalendarDays, Send, Calendar, 
  BookOpen, Heart, FileSpreadsheet, BarChart2, ShieldAlert, Users, 
  Printer, Loader2, Award, HeartPulse, CheckCircle2, ChevronRight, Info
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ExamDatesheetDialog from "./components/ExamDatesheetDialog";
import ExamPublishDialog from "./components/ExamPublishDialog";
import ExamGradingDialog from "./components/ExamGradingDialog";
import InvigilationWorkload from "./components/InvigilationWorkload";
import AdmitCardPrinter from "./components/AdmitCardPrinter";
import ParentDatesheetsCard from "@/components/parent/ParentDatesheetsCard";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface Exam {
  id: string; 
  name: string; 
  term_label: string | null;
  start_date: string | null; 
  end_date: string | null; 
  status: string;
  result_published: boolean; 
  result_published_at: string | null;
}

interface ExamSubject {
  id: string;
  exam_id: string;
  subject_id: string;
  class_section_id: string;
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number;
  passing_marks: number;
  room: string | null;
  invigilator_user_id: string | null;
}

interface Props { 
  schoolId: string | null; 
  canManage?: boolean; 
  studentId?: string | null;
}

export default function ExamsModule({ schoolId, canManage: canManageProp = false, studentId }: Props) {
  const { user } = useSession();
  const [items, setItems] = useState<Exam[]>([]);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingRole, setLoadingRole] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "", term_label: "", start_date: today, end_date: today, status: "scheduled" });

  // Evaluation details
  const [examPapers, setExamPapers] = useState<ExamSubject[]>([]);
  const [teacherSections, setTeacherSections] = useState<string[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name?: string }[]>([]);

  // Dialog control
  const [datesheetExam, setDatesheetExam] = useState<Exam | null>(null);
  const [publishExam, setPublishExam] = useState<Exam | null>(null);
  const [gradingPaper, setGradingPaper] = useState<ExamSubject | null>(null);
  const [admitCardExam, setAdmitCardExam] = useState<Exam | null>(null);

  const checkRole = async () => {
    if (!schoolId || !user) return;
    setLoadingRole(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("school_id", schoolId)
        .eq("user_id", user.id);
      
      const roleList = (roles || []).map((r: any) => r.role);
      const adminRoles = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "academic_coordinator"];
      const isUserAdmin = roleList.some((r) => adminRoles.includes(r));
      setIsAdmin(isUserAdmin);

      if (!isUserAdmin) {
        // Teacher specific records
        const [ta, ss, tsa] = await Promise.all([
          supabase.from("teacher_assignments").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", user.id),
          supabase.from("section_subjects").select("class_section_id, subject_id").eq("school_id", schoolId).eq("teacher_user_id", user.id),
          supabase.from("teacher_subject_assignments").select("class_section_id, subject_id").eq("school_id", schoolId).eq("teacher_user_id", user.id),
        ]);

        const secIds = new Set<string>();
        const subIds = new Set<string>();

        [...(ta.data || []), ...(ss.data || []), ...(tsa.data || [])].forEach((r: any) => {
          if (r?.class_section_id) secIds.add(r.class_section_id);
          if (r?.subject_id) subIds.add(r.subject_id);
        });

        setTeacherSections(Array.from(secIds));
        setTeacherSubjects(Array.from(subIds));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRole(false);
    }
  };

  const loadExams = async () => {
    if (!schoolId) return;
    const { data } = await supabase
      .from("exams")
      .select("*")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false });
    setItems(data || []);

    // Load static lists
    const [subs, secs, papers] = await Promise.all([
      supabase.from("subjects").select("id,name").eq("school_id", schoolId).order("name"),
      supabase.from("class_sections").select("id,name,academic_classes(name)").eq("school_id", schoolId),
      supabase.from("exam_subjects").select("*").eq("school_id", schoolId)
    ]);
    setSubjects(subs.data || []);
    setSections((secs.data || []).map((s: any) => ({ id: s.id, name: s.name, class_name: s.academic_classes?.name })));
    setExamPapers(papers.data || []);
  };

  useEffect(() => {
    checkRole();
    loadExams();
  }, [schoolId, user]);

  const submit = async () => {
    if (!schoolId || !user) return;
    if (!form.name.trim()) return toast.error("Name required");
    const { error } = await supabase
      .from("exams")
      .insert({ school_id: schoolId, ...form, created_by: user.id });
    
    if (error) return toast.error(error.message);
    toast.success("Exam created"); 
    setOpen(false); 
    loadExams();
    setForm({ name: "", term_label: "", start_date: today, end_date: today, status: "scheduled" });
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    loadExams();
  };

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects]);
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, `${s.class_name ? s.class_name + " — " : ""}${s.name}`])), [sections]);

  // Invigilation list for teachers
  const teacherInvigilations = useMemo(() => {
    if (isAdmin || !user) return [];
    return examPapers
      .filter((p) => p.invigilator_user_id === user.id)
      .sort((a, b) => (a.exam_date || "").localeCompare(b.exam_date || "") || (a.start_time || "").localeCompare(b.start_time || ""));
  }, [examPapers, isAdmin, user]);

  // Subjects assigned to the teacher for evaluation
  const teacherGradingPapers = useMemo(() => {
    if (isAdmin) return [];
    return examPapers
      .filter((p) => teacherSections.includes(p.class_section_id) && teacherSubjects.includes(p.subject_id))
      .sort((a, b) => (a.exam_date || "").localeCompare(b.exam_date || ""));
  }, [examPapers, isAdmin, teacherSections, teacherSubjects]);

  const statusColor = (s: string) => s === "completed" ? "default" : s === "ongoing" ? "destructive" : "secondary";

  if (loadingRole) {
    return (
      <div className="flex h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Non-manage/Parent View fallback */}
      {!canManageProp && schoolId && <ParentDatesheetsCard schoolId={schoolId} studentId={studentId} />}

      {canManageProp && (
        <Tabs defaultValue={isAdmin ? "exams" : "invigilations"} className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-800">Exam Portal</h2>
              <p className="text-xs text-slate-455 mt-0.5">Exam schedules, datesheets, duties, and result evaluations</p>
            </div>
            
            <TabsList className="bg-slate-50 border border-slate-100 p-1 rounded-xl w-fit">
              {isAdmin ? (
                <>
                  <TabsTrigger value="exams" className="rounded-lg text-xs font-semibold">Active Exams</TabsTrigger>
                  <TabsTrigger value="workload" className="rounded-lg text-xs font-semibold">Duty Workloads</TabsTrigger>
                  <TabsTrigger value="school_analytics" className="rounded-lg text-xs font-semibold">Analytics</TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="invigilations" className="rounded-lg text-xs font-semibold">My Duties</TabsTrigger>
                  <TabsTrigger value="grading" className="rounded-lg text-xs font-semibold">Grading Workspace</TabsTrigger>
                  <TabsTrigger value="my_analytics" className="rounded-lg text-xs font-semibold">Analytics</TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          {/* ADMIN TABS */}
          {isAdmin && (
            <>
              {/* Active Exams Tab */}
              <TabsContent value="exams" className="space-y-4">
                <div className="flex justify-between items-center bg-blue-50/20 border border-blue-100/50 rounded-2xl p-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Administrative Hub</span>
                    <h3 className="text-sm font-bold text-slate-805">Schedule and Manage Exams</h3>
                  </div>
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-soft">
                        <Plus className="h-4 w-4" />New Exam
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-white border border-slate-100 rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="font-display text-base font-bold text-slate-800">Create Exam Cycle</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">Exam Name</label>
                          <Input placeholder="Exam name (e.g. Mid-Term 2026)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border-slate-200" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">Term Label</label>
                          <Input placeholder="Term label (e.g. Term 1)" value={form.term_label} onChange={(e) => setForm({ ...form, term_label: e.target.value })} className="rounded-xl border-slate-200" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Start Date</label>
                            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-xl border-slate-200" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">End Date</label>
                            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="rounded-xl border-slate-200" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">Status</label>
                          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                            <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="ongoing">Ongoing</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter className="gap-2 pt-4">
                        <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl text-xs font-semibold">Cancel</Button>
                        <Button onClick={submit} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-soft">Save Exam</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {items.length === 0 ? (
                  <Card className="border-slate-100 bg-white"><CardContent className="py-12 text-center text-slate-400">
                    <GraduationCap className="mx-auto h-12 w-12 text-slate-200 mb-2 animate-pulse" />
                    <p className="text-sm font-bold text-slate-800">No exams scheduled.</p>
                  </CardContent></Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {items.map((e) => (
                      <Card key={e.id} className="border-slate-100 bg-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated hover:border-blue-100">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5">
                              <CardTitle className="font-display text-base font-bold text-slate-800">{e.name}</CardTitle>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusColor(e.status) as any} className="text-[10px] font-bold py-0.5 px-2 rounded-full uppercase tracking-wider">{e.status}</Badge>
                                {e.term_label && <Badge variant="outline" className="text-[10px] font-semibold py-0.5 px-2 rounded-full border-slate-200">{e.term_label}</Badge>}
                                <Badge variant={e.result_published ? "default" : "secondary"} className="text-[10px] font-bold py-0.5 px-2 rounded-full uppercase tracking-wider">
                                  {e.result_published ? "Published" : "Results pending"}
                                </Badge>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => remove(e.id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 rounded-xl shrink-0"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-4">
                          {e.start_date && (
                            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-slate-350" />
                              {format(new Date(e.start_date), "MMM d, yyyy")}
                              {e.end_date && e.end_date !== e.start_date && ` → ${format(new Date(e.end_date), "MMM d, yyyy")}`}
                              {e.result_published_at && ` · Released ${format(new Date(e.result_published_at), "MMM d")}`}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                            <Button size="sm" variant="outline" onClick={() => setDatesheetExam(e)} className="rounded-xl text-xs font-semibold border-slate-200 hover:bg-slate-50 hover:text-blue-600">
                              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />Datesheet
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPublishExam(e)} className="rounded-xl text-xs font-semibold border-slate-200 hover:bg-slate-50 hover:text-blue-600">
                              <Send className="mr-1.5 h-3.5 w-3.5" />Publish
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAdmitCardExam(e)} className="rounded-xl text-xs font-semibold border-slate-200 hover:bg-slate-50 hover:text-blue-600">
                              <Printer className="mr-1.5 h-3.5 w-3.5" />Bulk Hall Tickets
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Workload Roster Tab */}
              <TabsContent value="workload" className="space-y-4">
                {items.length > 0 ? (
                  <InvigilationWorkload 
                    schoolId={schoolId!} 
                    examId={items[0].id} 
                    examName={items[0].name} 
                    onAllocated={loadExams} 
                  />
                ) : (
                  <Card className="border-slate-100 bg-white"><CardContent className="py-12 text-center text-slate-400">Create an exam cycle to analyze duty workloads.</CardContent></Card>
                )}
              </TabsContent>

              {/* School-wide Analytics Tab */}
              <TabsContent value="school_analytics" className="space-y-4">
                <Card className="border-slate-100 bg-white shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-800">Cumulative Class Performance</CardTitle>
                    <CardDescription className="text-[11px] text-slate-400">Class average comparison (Mock)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: "Class 1", Avg: 78 }, { name: "Class 2", Avg: 84 },
                        { name: "Class 3", Avg: 69 }, { name: "Class 4", Avg: 92 },
                        { name: "Class 5", Avg: 88 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="Avg" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}

          {/* TEACHER TABS */}
          {!isAdmin && (
            <>
              {/* Duties Tab */}
              <TabsContent value="invigilations" className="space-y-4">
                <div className="border border-blue-100 bg-blue-50/30 rounded-2xl p-4 flex gap-3 text-slate-700">
                  <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-blue-800">Invigilator Guidelines</p>
                    <p className="text-[11px] text-slate-655 leading-relaxed">
                      Please arrive at your allocated examination room 15 minutes before the start time. Keep all student admit cards verified and marked.
                    </p>
                  </div>
                </div>

                <Card className="border-slate-100 bg-white shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-800">My Invigilation Schedule</CardTitle>
                    <CardDescription className="text-[11px] text-slate-400">Timeline of exam supervision duties allocated to you</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/40">
                        <TableRow>
                          <TableHead className="text-xs font-semibold text-slate-700">Date</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700">Time</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700">Subject</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700">Class Section</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700 text-center">Exam Venue / Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teacherInvigilations.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-slate-400">You are not assigned to invigilate any upcoming exams.</TableCell></TableRow>
                        ) : (
                          teacherInvigilations.map((row) => (
                            <TableRow key={row.id} className="hover:bg-slate-50/30">
                              <TableCell className="text-xs font-semibold text-slate-800">
                                {row.exam_date ? format(new Date(row.exam_date), "MMM d, yyyy (EEE)") : "—"}
                              </TableCell>
                              <TableCell className="text-xs font-medium text-slate-500">
                                {row.start_time ? row.start_time.slice(0, 5) : "—"} ({row.duration_minutes} mins)
                              </TableCell>
                              <TableCell className="text-xs font-semibold text-slate-805">
                                {row.subject_id ? subjectMap.get(row.subject_id) || "—" : "—"}
                              </TableCell>
                              <TableCell className="text-xs font-medium text-slate-600">
                                {row.class_section_id ? sectionMap.get(row.class_section_id) || "—" : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center">
                                <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-100 font-bold">
                                  <MapPin className="h-3.5 w-3.5 text-blue-500" />
                                  {row.room || "Main Hall"}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Evaluation Tab */}
              <TabsContent value="grading" className="space-y-4">
                <Card className="border-slate-100 bg-white shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-800">My Subject Grading Queue</CardTitle>
                    <CardDescription className="text-[11px] text-slate-400">Enter marks and comments for the subjects you evaluate</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/40">
                        <TableRow>
                          <TableHead className="text-xs font-semibold text-slate-700">Exam Cycle</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700">Subject Paper</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700">Class Section</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700 text-center">Max Marks</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-700 text-center">Evaluator Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teacherGradingPapers.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-slate-400">No exam papers found for your assigned subjects/sections.</TableCell></TableRow>
                        ) : (
                          teacherGradingPapers.map((row) => {
                            const examNameLabel = items.find(e => e.id === row.exam_id)?.name || "Exam Cycle";
                            
                            return (
                              <TableRow key={row.id} className="hover:bg-slate-50/30">
                                <TableCell className="text-xs font-semibold text-slate-800">{examNameLabel}</TableCell>
                                <TableCell className="text-xs font-semibold text-slate-800">
                                  {row.subject_id ? subjectMap.get(row.subject_id) || "—" : "—"}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-slate-500">
                                  {row.class_section_id ? sectionMap.get(row.class_section_id) || "—" : "—"}
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-slate-400 text-center">{row.max_marks}</TableCell>
                                <TableCell className="text-center">
                                  <Button 
                                    size="sm" 
                                    onClick={() => setGradingPaper(row)} 
                                    className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                                  >
                                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                                    Enter Grades
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Teacher Analytics Tab */}
              <TabsContent value="my_analytics" className="space-y-4">
                <Card className="border-slate-100 bg-white shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-800">Subject Grade Distribution</CardTitle>
                    <CardDescription className="text-[11px] text-slate-400">Grades performance across your evaluated papers (Mock)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: "A+", Count: 5 }, { name: "A", Count: 12 },
                        { name: "B", Count: 18 }, { name: "C", Count: 8 },
                        { name: "D", Count: 3 }, { name: "F", Count: 1 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="Count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      )}

      {/* ADMIN DIALOGS */}
      {datesheetExam && schoolId && (
        <ExamDatesheetDialog
          open={!!datesheetExam}
          onOpenChange={(v) => !v && setDatesheetExam(null)}
          schoolId={schoolId}
          examId={datesheetExam.id}
          examName={datesheetExam.name}
          canManage={isAdmin}
        />
      )}
      
      {publishExam && schoolId && (
        <ExamPublishDialog
          open={!!publishExam}
          onOpenChange={(v) => !v && setPublishExam(null)}
          schoolId={schoolId}
          examId={publishExam.id}
          examName={publishExam.name}
          resultPublished={publishExam.result_published}
          resultPublishedAt={publishExam.result_published_at}
          onUpdated={loadExams}
        />
      )}

      {admitCardExam && schoolId && (
        <AdmitCardPrinter
          open={!!admitCardExam}
          onOpenChange={(v) => !v && setAdmitCardExam(null)}
          schoolId={schoolId}
          examId={admitCardExam.id}
          examName={admitCardExam.name}
          sections={sections}
          subjects={subjects}
        />
      )}

      {/* TEACHER/EVALUATOR GRADING DIALOG */}
      {gradingPaper && schoolId && (
        <ExamGradingDialog
          open={!!gradingPaper}
          onOpenChange={(v) => !v && setGradingPaper(null)}
          schoolId={schoolId}
          examId={gradingPaper.exam_id}
          examName={items.find(e => e.id === gradingPaper.exam_id)?.name || "Exam Cycle"}
          subjectId={gradingPaper.subject_id}
          subjectName={subjectMap.get(gradingPaper.subject_id) || "Subject"}
          classSectionId={gradingPaper.class_section_id}
          classSectionName={sectionMap.get(gradingPaper.class_section_id) || "Class Section"}
          maxMarks={gradingPaper.max_marks || 100}
          passingMarks={gradingPaper.passing_marks || 40}
        />
      )}
    </div>
  );
}
