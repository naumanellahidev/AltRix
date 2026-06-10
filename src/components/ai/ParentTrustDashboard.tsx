import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  Lightbulb,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  GraduationCap,
  Star,
  Sparkles,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  studentId: string;
  schoolId: string;
  parentUserId: string;
}

export function ParentTrustDashboard({ studentId, schoolId, parentUserId }: Props) {
  const { data: updates, isLoading } = useQuery({
    queryKey: ["ai_parent_updates", studentId, parentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_parent_updates")
        .select("*")
        .eq("student_id", studentId)
        .eq("parent_user_id", parentUserId)
        .eq("school_id", schoolId)
        .order("update_date", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    },
    enabled: !!studentId && !!parentUserId && !!schoolId,
  });

  const { data: student } = useQuery({
    queryKey: ["student_basic", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("first_name, last_name")
        .eq("id", studentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const latestUpdate = useMemo(() => updates?.[0], [updates]);
  const dailyUpdates = useMemo(() => updates?.filter(u => u.update_type === "daily") || [], [updates]);
  const weeklyUpdates = useMemo(() => updates?.filter(u => u.update_type === "weekly") || [], [updates]);
  const monthlyUpdates = useMemo(() => updates?.filter(u => u.update_type === "monthly") || [], [updates]);

  const attendanceIcon = useMemo(() => {
    const status = latestUpdate?.attendance_status;
    if (status === "present") return { icon: CheckCircle2, color: "text-emerald-500" };
    if (status === "absent") return { icon: AlertTriangle, color: "text-red-500" };
    if (status === "late") return { icon: Clock, color: "text-amber-500" };
    return { icon: Clock, color: "text-muted-foreground" };
  }, [latestUpdate]);

  const AttendanceIcon = attendanceIcon.icon;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-primary to-primary/60 p-3">
          <Heart className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">
            {student?.first_name}'s Learning Journey
          </h2>
          <p className="text-sm text-muted-foreground">
            AI-powered insights for engaged parenting
          </p>
        </div>
      </div>

      {/* Today's Snapshot */}
      <Card className="shadow-elevated border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" />
              Today's Snapshot
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {format(new Date(), "MMM d, yyyy")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {latestUpdate ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Attendance */}
              <div className="rounded-xl bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <AttendanceIcon className={`h-5 w-5 ${attendanceIcon.color}`} />
                  <span className="text-sm font-medium">Attendance</span>
                </div>
                <p className="mt-2 text-lg font-semibold capitalize">
                  {latestUpdate.attendance_status || "Pending"}
                </p>
              </div>

              {/* Participation */}
              <div className="rounded-xl bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  <span className="text-sm font-medium">Participation</span>
                </div>
                <p className="mt-2 text-lg font-semibold capitalize">
                  {latestUpdate.participation_level || "Active"}
                </p>
              </div>

              {/* Focus */}
              <div className="rounded-xl bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium">Focus Trend</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {latestUpdate.focus_trend === "improving" ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : latestUpdate.focus_trend === "declining" ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : null}
                  <span className="text-lg font-semibold capitalize">
                    {latestUpdate.focus_trend || "Stable"}
                  </span>
                </div>
              </div>

              {/* Performance */}
              <div className="rounded-xl bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-purple-500" />
                  <span className="text-sm font-medium">Performance</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {(latestUpdate.performance_change_percent || 0) > 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (latestUpdate.performance_change_percent || 0) < 0 ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : null}
                  <span className="text-lg font-semibold">
                    {latestUpdate.performance_change_percent !== null
                      ? `${latestUpdate.performance_change_percent > 0 ? "+" : ""}${latestUpdate.performance_change_percent}%`
                      : "Stable"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Calendar className="mx-auto h-10 w-10 opacity-50" />
              <p className="mt-2 text-sm">No updates available yet</p>
            </div>
          )}

          {/* Teacher Notes */}
          {latestUpdate?.teacher_notes && (latestUpdate.teacher_notes as unknown as string[]).length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">Teacher Notes</span>
              </div>
              <ul className="space-y-1">
                {(latestUpdate.teacher_notes as unknown as string[]).map((note, idx) => (
                  <li key={idx} className="text-sm text-amber-800">
                    • {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Behavior Remarks */}
          {latestUpdate?.behavior_remarks && (latestUpdate.behavior_remarks as unknown as string[]).length > 0 && (
            <div className="mt-4 rounded-xl bg-blue-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">Behavior</span>
              </div>
              <ul className="space-y-1">
                {(latestUpdate.behavior_remarks as unknown as string[]).map((remark, idx) => (
                  <li key={idx} className="text-sm text-blue-800">
                    • {remark}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Summary Tabs */}
      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <ScrollArea className="h-[400px]">
            {dailyUpdates.length > 0 ? (
              <div className="space-y-3 pr-4">
                {dailyUpdates.map((update) => (
                  <motion.div
                    key={update.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(update.update_date), "EEEE, MMM d")}
                            </p>
                            {update.ai_summary && (
                              <p className="mt-2 text-sm">{update.ai_summary}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${
                            update.attendance_status === "present" 
                              ? "text-emerald-600 bg-emerald-500/10" 
                              : update.attendance_status === "absent"
                              ? "text-red-600 bg-red-500/10"
                              : ""
                          }`}>
                            {update.attendance_status || "—"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Calendar className="mx-auto h-10 w-10 opacity-50" />
                <p className="mt-2 text-sm">No daily updates yet</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          {weeklyUpdates.length > 0 ? (
            <div className="space-y-4">
              {weeklyUpdates.slice(0, 4).map((update) => (
                <Card key={update.id} className="shadow-elevated">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Week of {format(parseISO(update.update_date), "MMM d")}
                      </CardTitle>
                      {update.performance_change_percent !== null && (
                        <Badge className={
                          (update.performance_change_percent || 0) >= 0 
                            ? "bg-emerald-500/10 text-emerald-600" 
                            : "bg-red-500/10 text-red-600"
                        }>
                          {update.performance_change_percent > 0 ? "+" : ""}{update.performance_change_percent}%
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {update.ai_summary && (
                      <p className="text-sm leading-relaxed">{update.ai_summary}</p>
                    )}

                    {/* Key Insights */}
                    {update.key_insights && (update.key_insights as string[]).length > 0 && (
                      <div className="rounded-xl bg-primary/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Key Insights</span>
                        </div>
                        <ul className="space-y-1">
                          {(update.key_insights as string[]).map((insight, idx) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {update.recommendations && (update.recommendations as string[]).length > 0 && (
                      <div className="rounded-xl bg-amber-500/10 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-700">Recommendations</span>
                        </div>
                        <ul className="space-y-1">
                          {(update.recommendations as string[]).map((rec, idx) => (
                            <li key={idx} className="text-sm text-amber-800">
                              • {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="mx-auto h-10 w-10 opacity-50" />
                <p className="mt-2 text-sm">Weekly summaries will appear here</p>
                <p className="text-xs">AI generates these every Friday</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          {monthlyUpdates.length > 0 ? (
            <div className="space-y-4">
              {monthlyUpdates.slice(0, 3).map((update) => (
                <Card key={update.id} className="shadow-elevated border-primary/20">
                  <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        {format(parseISO(update.update_date), "MMMM yyyy")} Report
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    {update.ai_summary && (
                      <p className="text-sm leading-relaxed">{update.ai_summary}</p>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Attendance</p>
                        <p className="mt-1 text-lg font-bold capitalize">
                          {update.attendance_status || "Good"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Participation</p>
                        <p className="mt-1 text-lg font-bold capitalize">
                          {update.participation_level || "Active"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Focus</p>
                        <p className="mt-1 text-lg font-bold capitalize">
                          {update.focus_trend || "Stable"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Growth</p>
                        <p className="mt-1 text-lg font-bold">
                          {update.performance_change_percent !== null
                            ? `${update.performance_change_percent > 0 ? "+" : ""}${update.performance_change_percent}%`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Key Insights */}
                    {update.key_insights && (update.key_insights as string[]).length > 0 && (
                      <div className="rounded-xl bg-primary/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Monthly Insights</span>
                        </div>
                        <ul className="space-y-1">
                          {(update.key_insights as string[]).map((insight, idx) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {update.recommendations && (update.recommendations as string[]).length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            Parent Action Items
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {(update.recommendations as string[]).map((rec, idx) => (
                            <li key={idx} className="text-sm text-amber-800 dark:text-amber-300">
                              • {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <GraduationCap className="mx-auto h-10 w-10 opacity-50" />
                <p className="mt-2 text-sm">Monthly reports will appear here</p>
                <p className="text-xs">AI generates comprehensive reports each month</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
