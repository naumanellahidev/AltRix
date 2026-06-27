import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";
import { 
  TrendingUp, Award, Calendar, Clock, RefreshCw, BarChart2, ShieldAlert, 
  Smile, Frown, CheckCircle, AlertTriangle, BookOpen, Brain, Users
} from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import type { ChildInfo } from "@/hooks/useMyChildren";
import { useOfflineAssessments, useOfflineStudentMarks, useOfflineSubjects, useOfflineAssignments, useOfflineEnrollments } from "@/hooks/useOfflineData";

interface ParentKPIsModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const COLORS = ["#2563eb", "#60a5fa", "#34d399", "#f59e0b", "#f87171"];

export default function ParentKPIsModule({ child, schoolId }: ParentKPIsModuleProps) {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<"30" | "90" | "all">("90");
  
  // Real-time state
  const [attendance, setAttendance] = useState<any[]>([]);
  const [behaviorNotes, setBehaviorNotes] = useState<any[]>([]);
  const [submissionsCount, setSubmissionsCount] = useState(0);

  // Offline-first data
  const { data: cachedAssessments, refresh: refreshAssessments } = useOfflineAssessments(schoolId);
  const { data: cachedMarks, refresh: refreshMarks } = useOfflineStudentMarks(schoolId);
  const { data: cachedSubjects } = useOfflineSubjects(schoolId);
  const { data: cachedAssignments, refresh: refreshAssignments } = useOfflineAssignments(schoolId);
  const { data: cachedEnrollments } = useOfflineEnrollments(schoolId);

  const fetchRealtimeKPIs = async () => {
    if (!child || !schoolId) return;
    setLoading(true);
    try {
      const gteDate = timeRange === "all" 
        ? new Date(2000, 1, 1).toISOString() 
        : subDays(new Date(), parseInt(timeRange)).toISOString();

      // 1. Fetch attendance
      const { data: attData } = await supabase
        .from("attendance_entries")
        .select("status, created_at")
        .eq("student_id", child.student_id)
        .gte("created_at", gteDate);
      setAttendance(attData || []);

      // 2. Fetch behavior logs
      const { data: behaviorData } = await supabase
        .from("parent_behavior_notes" as any)
        .select("mood, note_date")
        .eq("student_id", child.student_id)
        .gte("note_date", gteDate.slice(0, 10));
      setBehaviorNotes(behaviorData || []);

      // 3. Fetch submissions
      const { count } = await supabase
        .from("assignment_submissions")
        .select("id", { count: "exact", head: true })
        .eq("student_id", child.student_id);
      setSubmissionsCount(count || 0);

    } catch (err: any) {
      console.error("Error fetching realtime KPIs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRealtimeKPIs();
  }, [child, schoolId, timeRange]);

  const handleRefresh = async () => {
    refreshAssessments();
    refreshMarks();
    refreshAssignments();
    await fetchRealtimeKPIs();
    toast.success("KPI data updated successfully");
  };

  // Child Section IDs
  const childSectionIds = useMemo(() => {
    if (!child) return [];
    return cachedEnrollments
      .filter((e) => e.studentId === child.student_id)
      .map((e) => e.classSectionId);
  }, [cachedEnrollments, child]);

  // Derived Academic Grades KPIs
  const academicKPIs = useMemo(() => {
    if (!child) return { average: 0, subjectScores: [], history: [], gradeCounts: {} };
    
    const childMarks = cachedMarks.filter(m => m.studentId === child.student_id);
    const publishedAssessments = cachedAssessments.filter(a => a.isPublished);
    const subjectNameById = new Map(cachedSubjects.map(s => [s.id, s.name]));
    
    const scoresBySubject: Record<string, { total: number; count: number }> = {};
    const historyData: any[] = [];
    const gradeCounts: Record<string, number> = {};

    let totalPercentSum = 0;
    let validMarksCount = 0;

    // Filter time-ranged marks
    const thresholdDate = timeRange === "all" ? 0 : subDays(new Date(), parseInt(timeRange)).getTime();

    childMarks.forEach(mark => {
      const assessment = publishedAssessments.find(a => a.id === mark.assessmentId);
      if (!assessment) return;

      const date = assessment.assessmentDate ? new Date(assessment.assessmentDate) : null;
      if (date && date.getTime() < thresholdDate) return;

      const max = assessment.maxMarks || 100;
      const obtained = mark.marks || 0;
      const percent = Math.round((obtained / max) * 100);

      totalPercentSum += percent;
      validMarksCount++;

      // Subject scores
      const subName = assessment.subjectId ? (subjectNameById.get(assessment.subjectId) || "Other") : "Other";
      if (!scoresBySubject[subName]) {
        scoresBySubject[subName] = { total: 0, count: 0 };
      }
      scoresBySubject[subName].total += percent;
      scoresBySubject[subName].count++;

      // History
      historyData.push({
        date: date ? format(date, "MMM d") : "Unknown",
        timestamp: date ? date.getTime() : 0,
        score: percent,
        title: assessment.title
      });

      // Grade counts
      const gr = mark.computedGrade || "B";
      gradeCounts[gr] = (gradeCounts[gr] || 0) + 1;
    });

    const average = validMarksCount > 0 ? Math.round(totalPercentSum / validMarksCount) : 0;
    const subjectScores = Object.entries(scoresBySubject).map(([subject, s]) => ({
      subject,
      score: Math.round(s.total / s.count),
      fullMark: 100
    }));

    const sortedHistory = historyData
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ date, score, title }) => ({ date, score, title }));

    return {
      average,
      subjectScores,
      history: sortedHistory,
      gradeCounts
    };
  }, [cachedMarks, cachedAssessments, cachedSubjects, child, timeRange]);

  // Derived Attendance KPIs
  const attendanceKPIs = useMemo(() => {
    const total = attendance.length;
    if (total === 0) return { presentRate: 100, lateRate: 0, absentRate: 0, data: [] };

    const present = attendance.filter(a => a.status === "present").length;
    const late = attendance.filter(a => a.status === "late").length;
    const absent = attendance.filter(a => a.status === "absent").length;

    const presentRate = Math.round((present / total) * 100);
    const lateRate = Math.round((late / total) * 100);
    const absentRate = Math.round((absent / total) * 100);

    return {
      presentRate,
      lateRate,
      absentRate,
      data: [
        { name: "Present", value: present, color: "#10b981" },
        { name: "Late", value: late, color: "#f59e0b" },
        { name: "Absent", value: absent, color: "#ef4444" }
      ].filter(d => d.value > 0)
    };
  }, [attendance]);

  // Derived Assignment Punctuality KPIs
  const assignmentKPIs = useMemo(() => {
    const allowed = new Set(childSectionIds);
    const relevantAssignments = cachedAssignments.filter(a => !allowed.size || allowed.has(a.classSectionId));
    
    const total = relevantAssignments.length;
    const submitted = submissionsCount;
    const pending = Math.max(0, total - submitted);
    const completionRate = total > 0 ? Math.round((submitted / total) * 100) : 100;

    return {
      total,
      submitted,
      pending,
      completionRate
    };
  }, [cachedAssignments, childSectionIds, submissionsCount]);

  // Derived Behavior Mood KPIs
  const behaviorKPIs = useMemo(() => {
    const moodCounts: Record<string, number> = { happy: 0, neutral: 0, tired: 0, upset: 0 };
    behaviorNotes.forEach(note => {
      const mood = (note.mood || "neutral").toLowerCase();
      if (moodCounts[mood] !== undefined) {
        moodCounts[mood]++;
      }
    });

    const totalNotes = behaviorNotes.length;
    
    return {
      moodCounts,
      totalNotes,
      data: Object.entries(moodCounts).map(([mood, count]) => ({
        name: mood.charAt(0).toUpperCase() + mood.slice(1),
        count
      })).filter(m => m.count > 0)
    };
  }, [behaviorNotes]);

  if (!child) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Award className="h-10 w-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-600">No Child Selected</p>
        <p className="text-xs text-slate-400 mt-1">Please select a child to view performance metrics.</p>
      </div>
    );
  }

  const childName = [child.first_name, child.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-800">Performance KPIs</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Key Performance Indices and academic tracking metrics for <span className="font-semibold text-blue-600">{childName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range switcher */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-55/40 p-1 shrink-0">
            <button
              onClick={() => setTimeRange("30")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${timeRange === "30" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("90")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${timeRange === "90" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              90 Days
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${timeRange === "all" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              All Time
            </button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={loading}
            className="gap-2 border-slate-200 hover:bg-slate-50 hover:text-blue-600 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Card */}
        <Card className="border-slate-100 bg-white shadow-soft transition-all hover:border-blue-100">
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Rate</span>
              <p className="font-display text-2xl font-black text-slate-800">
                {attendance.length > 0 ? `${attendanceKPIs.presentRate}%` : "100%"}
              </p>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle className="h-3 w-3" />
                <span>On track</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Academic Card */}
        <Card className="border-slate-100 bg-white shadow-soft transition-all hover:border-blue-100">
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Academic Score</span>
              <p className="font-display text-2xl font-black text-slate-800">
                {academicKPIs.average > 0 ? `${academicKPIs.average}%` : "—"}
              </p>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                <TrendingUp className="h-3 w-3" />
                <span>Class Rank #4 (Mock)</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Award className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Assignment Punctuality Card */}
        <Card className="border-slate-100 bg-white shadow-soft transition-all hover:border-blue-100">
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submission Rate</span>
              <p className="font-display text-2xl font-black text-slate-800">
                {assignmentKPIs.completionRate}%
              </p>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                <Clock className="h-3 w-3" />
                <span>{assignmentKPIs.pending} pending tasks</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Behavior Mood Card */}
        <Card className="border-slate-100 bg-white shadow-soft transition-all hover:border-blue-100">
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Behavior notes</span>
              <p className="font-display text-2xl font-black text-slate-800">
                {behaviorKPIs.totalNotes} logs
              </p>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
                <Smile className="h-3 w-3" />
                <span>Mostly Happy Mood</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Smile className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Academic Radar Chart & Trend Chart */}
        <Card className="border-slate-100 bg-white shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Academic Analytics</CardTitle>
            <CardDescription className="text-xs text-slate-400">Grade performance per subject & historical progression</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {academicKPIs.subjectScores.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[260px] text-center text-slate-400">
                <Brain className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-xs font-semibold">No academic marks recorded in the selected range.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-[200px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" radius="80%" data={academicKPIs.subjectScores}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                      <Radar name="Score" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                
                {academicKPIs.history.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-655 uppercase tracking-wider">Historical Trend</p>
                    <div className="h-[120px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={academicKPIs.history}>
                          <defs>
                            <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '10px' }} />
                          <Area type="monotone" dataKey="score" stroke="#2563eb" fillOpacity={1} fill="url(#scoreColor)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance Status Pie Chart & Submission Progress */}
        <Card className="border-slate-100 bg-white shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Engagement & Attendance</CardTitle>
            <CardDescription className="text-xs text-slate-400">Class attendance breakdown and homework completion status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {attendance.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[260px] text-center text-slate-400">
                <BarChart2 className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-xs font-semibold">No attendance entries recorded in the selected range.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center h-full min-h-[260px]">
                <div className="h-[200px] w-full flex justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={attendanceKPIs.data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={75}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {attendanceKPIs.data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} days`, 'Count']} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 500 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Center Text inside Donut chart */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-9">
                    <span className="font-display text-lg font-black text-slate-800">{attendanceKPIs.presentRate}%</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Present</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                      <span>Assignment Completion</span>
                      <span className="text-blue-600">{assignmentKPIs.completionRate}%</span>
                    </div>
                    <Progress value={assignmentKPIs.completionRate} className="h-2 bg-slate-100 [&>div]:bg-blue-600" />
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                      <span>{assignmentKPIs.submitted} Submitted</span>
                      <span>{assignmentKPIs.pending} Pending</span>
                    </div>
                  </div>

                  <div className="border border-slate-100 bg-slate-50/50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Attendance Breakdown</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100/50">
                        <span className="block font-display text-sm font-black text-emerald-600">{attendance.filter(a=>a.status === 'present').length}</span>
                        <span className="text-[8px] font-semibold text-emerald-600">Present</span>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2 border border-amber-100/50">
                        <span className="block font-display text-sm font-black text-amber-600">{attendance.filter(a=>a.status === 'late').length}</span>
                        <span className="text-[8px] font-semibold text-amber-600">Late</span>
                      </div>
                      <div className="bg-rose-50 rounded-lg p-2 border border-rose-100/50">
                        <span className="block font-display text-sm font-black text-rose-600">{attendance.filter(a=>a.status === 'absent').length}</span>
                        <span className="text-[8px] font-semibold text-rose-650">Absent</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Behavior note mood distribution bar chart */}
      {behaviorNotes.length > 0 && (
        <Card className="border-slate-100 bg-white shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Behavior & Mood Index</CardTitle>
            <CardDescription className="text-xs text-slate-400">Analysis of daily wellness and mood entries submitted by you</CardDescription>
          </CardHeader>
          <CardContent className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={behaviorKPIs.data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {behaviorKPIs.data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
