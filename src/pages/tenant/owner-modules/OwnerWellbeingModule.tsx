import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, HeartPulse, Users, Activity, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props { schoolId: string | null; }

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function OwnerWellbeingModule({ schoolId }: Props) {
  const activeCampusId = useActiveCampus(schoolId);
  const campusEq = (q: any) => (activeCampusId ? q.eq("campus_id", activeCampusId) : q);

  const { data, isLoading } = useQuery({
    queryKey: ["owner_wellbeing", schoolId, activeCampusId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;
      const since = subDays(new Date(), 90).toISOString();
      const [behaviorRes, complaintsRes, studentsRes] = await Promise.all([
        campusEq(
          supabase.from("behavior_notes")
            .select("id,title,note_type,is_shared_with_parents,student_id,created_at")
            .eq("school_id", schoolId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
        ),
        campusEq(
          supabase.from("complaints")
            .select("id,subject,category,status,flow,created_at,resolved_at")
            .eq("school_id", schoolId)
            .order("created_at", { ascending: false })
        ),
        campusEq(supabase.from("students").select("id,first_name,last_name").eq("school_id", schoolId)),
      ]);
      const behavior = behaviorRes.data || [];
      const complaints = complaintsRes.data || [];
      const students = studentsRes.data || [];
      const studentMap = new Map<string, string>(students.map((s: any) => [s.id as string, `${s.first_name} ${s.last_name}`]));

      // note_type taxonomy: positive | concern | incident | observation
      const incidents = behavior.filter((b: any) => ["incident", "concern"].includes((b.note_type || "").toLowerCase())).length;
      const positive = behavior.filter((b: any) => (b.note_type || "").toLowerCase() === "positive").length;

      const openComplaints = complaints.filter((c: any) => c.status !== "resolved" && c.status !== "closed").length;
      const resolvedComplaints = complaints.filter((c: any) => c.status === "resolved" || c.status === "closed").length;
      const resolutionRate = complaints.length ? Math.round((resolvedComplaints / complaints.length) * 100) : 100;

      const ratio = students.length > 0 ? incidents / students.length : 0;
      const dropoutRisk = ratio > 0.1 ? "High" : ratio > 0.05 ? "Medium" : "Low";
      const wellbeing = incidents === 0 ? "Excellent" : incidents < 5 ? "Good" : "Needs Attention";

      // 30-day trend
      const trend = Array.from({ length: 30 }).map((_, idx) => {
        const day = subDays(new Date(), 29 - idx);
        const key = format(day, "yyyy-MM-dd");
        const inc = behavior.filter((b: any) =>
          format(new Date(b.created_at), "yyyy-MM-dd") === key &&
          ["incident", "concern"].includes((b.note_type || "").toLowerCase())
        ).length;
        return { day: format(day, "MMM d"), incidents: inc };
      });

      // Type breakdown
      const typeMap: Record<string, number> = {};
      behavior.forEach((b: any) => {
        const t = (b.note_type || "other").toLowerCase();
        typeMap[t] = (typeMap[t] || 0) + 1;
      });
      const typeBreakdown = Object.entries(typeMap).map(([name, value], i) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value, fill: COLORS[i % COLORS.length],
      }));

      // Top concerned students
      const perStudent: Record<string, { name: string; count: number }> = {};
      behavior.forEach((b: any) => {
        if (!b.student_id) return;
        if (!["incident", "concern"].includes((b.note_type || "").toLowerCase())) return;
        const name = studentMap.get(b.student_id) || `${b.student_id.slice(0, 8)}…`;
        perStudent[b.student_id] = { name, count: (perStudent[b.student_id]?.count || 0) + 1 };
      });
      const topConcerned = Object.values(perStudent).sort((a, b) => b.count - a.count).slice(0, 8);

      // Complaint category breakdown
      const catMap: Record<string, number> = {};
      complaints.forEach((c: any) => {
        const k = (c.category || "other").toLowerCase();
        catMap[k] = (catMap[k] || 0) + 1;
      });
      const categoryBreakdown = Object.entries(catMap).map(([name, value]) => ({ name, value }));

      return {
        incidents, positive, openComplaints, resolutionRate, dropoutRisk, wellbeing,
        behaviorCount: behavior.length, trend, typeBreakdown, topConcerned,
        complaints, categoryBreakdown,
      };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Student Wellbeing & Safety</h1>
        <p className="text-muted-foreground">
          Welfare tracking, behavior analytics and complaint monitoring{activeCampusId ? " (campus-scoped)" : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><HeartPulse className="h-5 w-5 text-pink-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.wellbeing ?? "—"}</p><p className="text-xs text-muted-foreground">Overall Wellbeing</p></CardContent></Card>
        <Card><CardContent className="p-4"><Users className="h-5 w-5 text-blue-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.behaviorCount ?? 0}</p><p className="text-xs text-muted-foreground">Notes (90d)</p></CardContent></Card>
        <Card><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-amber-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.incidents ?? 0}</p><p className="text-xs text-muted-foreground">Incidents/Concerns</p></CardContent></Card>
        <Card><CardContent className="p-4"><Activity className="h-5 w-5 text-emerald-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.dropoutRisk ?? "Low"}</p><p className="text-xs text-muted-foreground">Dropout Risk</p></CardContent></Card>
      </div>

      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="concerned">Top Concerns</TabsTrigger>
          <TabsTrigger value="complaints">Complaints</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Incidents (30 days)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.trend || []}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="day" fontSize={10} interval={3} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="incidents" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Behavior note types</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data?.typeBreakdown || []} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {(data?.typeBreakdown || []).map((e: any, i: number) => (<Cell key={i} fill={e.fill} />))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="concerned" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Students with most concerns/incidents (90d)</CardTitle></CardHeader>
            <CardContent>
              {(data?.topConcerned.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No concerns logged in the last 90 days.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Student</TableHead><TableHead className="text-right">Notes</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.topConcerned.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right"><Badge variant={s.count >= 3 ? "destructive" : "secondary"}>{s.count}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><MessageSquare className="h-5 w-5 text-primary" /><p className="mt-2 font-display text-2xl font-bold">{data?.complaints.length || 0}</p><p className="text-xs text-muted-foreground">Total Complaints</p></CardContent></Card>
            <Card><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-amber-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.openComplaints || 0}</p><p className="text-xs text-muted-foreground">Open</p></CardContent></Card>
            <Card><CardContent className="p-4"><Activity className="h-5 w-5 text-emerald-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.resolutionRate || 0}%</p><p className="text-xs text-muted-foreground">Resolution Rate</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Recent complaints</CardTitle></CardHeader>
            <CardContent>
              {(data?.complaints.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No complaints recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Subject</TableHead><TableHead>Category</TableHead><TableHead>Flow</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.complaints.slice(0, 20).map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.subject || "—"}</TableCell>
                        <TableCell>{c.category || "—"}</TableCell>
                        <TableCell className="text-xs">{c.flow || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "resolved" || c.status === "closed" ? "default" : "secondary"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "MMM d") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
