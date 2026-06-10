import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Brain,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  Plus,
  User,
  Users,
  AlertTriangle,
  FileText,
  TrendingUp,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  schoolId: string | null;
}

const PRIORITY_CONFIG = {
  urgent: { color: "bg-red-500/10 text-red-600", label: "Urgent" },
  high: { color: "bg-orange-500/10 text-orange-600", label: "High" },
  normal: { color: "bg-blue-500/10 text-blue-600", label: "Normal" },
  low: { color: "bg-slate-500/10 text-slate-600", label: "Low" },
};

const STATUS_CONFIG = {
  pending: { color: "bg-amber-500/10 text-amber-600", label: "Pending" },
  scheduled: { color: "bg-blue-500/10 text-blue-600", label: "Scheduled" },
  in_progress: { color: "bg-purple-500/10 text-purple-600", label: "In Progress" },
  completed: { color: "bg-emerald-500/10 text-emerald-600", label: "Completed" },
  cancelled: { color: "bg-slate-500/10 text-slate-600", label: "Cancelled" },
};

export function AICounselorMode({ schoolId }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("queue");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionOutcome, setSessionOutcome] = useState("");

  const { data: queue, isLoading } = useQuery({
    queryKey: ["ai_counseling_queue", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_counseling_queue")
        .select(`
          *,
          students:student_id (
            first_name,
            last_name
          )
        `)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const stats = useMemo(() => {
    if (!queue) return { pending: 0, scheduled: 0, completed: 0 };
    return {
      pending: queue.filter(q => q.status === "pending").length,
      scheduled: queue.filter(q => q.status === "scheduled").length,
      completed: queue.filter(q => q.status === "completed").length,
    };
  }, [queue]);

  const pendingQueue = useMemo(() => 
    queue?.filter(q => q.status === "pending" || q.status === "scheduled") || [], 
    [queue]
  );

  const completedSessions = useMemo(() => 
    queue?.filter(q => q.status === "completed") || [], 
    [queue]
  );

  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, status, notes, outcome }: { 
      id: string; 
      status: string; 
      notes?: string; 
      outcome?: string;
    }) => {
      const updates: any = { status };
      if (notes) updates.session_notes = notes;
      if (outcome) updates.outcome = outcome;

      const { error } = await supabase
        .from("ai_counseling_queue")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session updated");
      setSelectedSession(null);
      setSessionNotes("");
      setSessionOutcome("");
      qc.invalidateQueries({ queryKey: ["ai_counseling_queue", schoolId] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 p-2.5">
          <Heart className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">AI Counselor Mode</h2>
          <p className="text-sm text-muted-foreground">
            Student wellbeing tracking & intervention management
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="shadow-sm border-amber-200 bg-amber-500/5">
          <CardContent className="p-4">
            <Clock className="h-5 w-5 text-amber-600" />
            <p className="mt-2 text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Awaiting Session</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-blue-200 bg-blue-500/5">
          <CardContent className="p-4">
            <Calendar className="h-5 w-5 text-blue-600" />
            <p className="mt-2 text-2xl font-bold text-blue-600">{stats.scheduled}</p>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-emerald-200 bg-emerald-500/5">
          <CardContent className="p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 text-2xl font-bold text-emerald-600">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue" className="gap-2">
            <Clock className="h-4 w-4" />
            Queue ({pendingQueue.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed ({completedSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Counseling Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingQueue.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-4">
                    {pendingQueue.map((item, idx) => {
                      const priorityKey = (item.priority && (item.priority in PRIORITY_CONFIG) ? item.priority : "normal") as keyof typeof PRIORITY_CONFIG;
                      const priorityConfig = PRIORITY_CONFIG[priorityKey];
                      const statusKey = (item.status && (item.status in STATUS_CONFIG) ? item.status : "pending") as keyof typeof STATUS_CONFIG;
                      const statusConfig = STATUS_CONFIG[statusKey];

                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <Card className="shadow-sm">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {(item.students as any)?.first_name?.charAt(0) || "S"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-medium">
                                        {(item.students as any)?.first_name}{" "}
                                        {(item.students as any)?.last_name}
                                      </p>
                                      <p className="text-sm text-muted-foreground capitalize">
                                        {item.reason_type.replace("_", " ")}
                                      </p>
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <Badge className={priorityConfig.color}>
                                        {priorityConfig.label}
                                      </Badge>
                                      <Badge variant="outline" className={statusConfig.color}>
                                        {statusConfig.label}
                                      </Badge>
                                    </div>
                                  </div>

                                  {item.reason_details && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {item.reason_details}
                                    </p>
                                  )}

                                  {/* Detected Indicators */}
                                  {item.detected_indicators && (item.detected_indicators as string[]).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {(item.detected_indicators as string[]).map((indicator, i) => (
                                        <Badge key={i} variant="secondary" className="text-[10px]">
                                          {indicator}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {/* Scheduled Date */}
                                  {item.scheduled_date && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                                      <Calendar className="h-3.5 w-3.5" />
                                      Scheduled: {format(parseISO(item.scheduled_date), "MMM d, yyyy 'at' h:mm a")}
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setSelectedSession(item)}
                                      className="h-7 text-xs"
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      Complete Session
                                    </Button>
                                    {item.status === "pending" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => updateSessionMutation.mutate({ 
                                          id: item.id, 
                                          status: "scheduled" 
                                        })}
                                        className="h-7 text-xs"
                                      >
                                        <Calendar className="mr-1 h-3 w-3" />
                                        Schedule
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-12 text-center">
                  <Heart className="mx-auto h-12 w-12 text-emerald-500/50" />
                  <p className="mt-4 font-medium text-emerald-600">Queue Empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No students currently need counseling intervention
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Completed Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {completedSessions.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-4">
                    {completedSessions.map((item) => (
                      <Card key={item.id} className="shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-emerald-500/10 p-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">
                                    {(item.students as any)?.first_name}{" "}
                                    {(item.students as any)?.last_name}
                                  </p>
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {item.reason_type.replace("_", " ")}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })}
                                </span>
                              </div>

                              {item.session_notes && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {item.session_notes}
                                </p>
                              )}

                              {item.outcome && (
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Outcome: {item.outcome}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto h-10 w-10 opacity-50" />
                  <p className="mt-2 text-sm">No completed sessions yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Complete Session Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Counseling Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">
                {(selectedSession?.students as any)?.first_name}{" "}
                {(selectedSession?.students as any)?.last_name}
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                {selectedSession?.reason_type?.replace("_", " ")}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Session Notes</label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Document the session details, observations, and discussion points..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Outcome</label>
              <Select value={sessionOutcome} onValueChange={setSessionOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="improved">Improved - No follow-up needed</SelectItem>
                  <SelectItem value="stable">Stable - Continue monitoring</SelectItem>
                  <SelectItem value="follow_up">Needs follow-up session</SelectItem>
                  <SelectItem value="escalated">Escalated to specialist</SelectItem>
                  <SelectItem value="parent_meeting">Parent meeting scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedSession(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  updateSessionMutation.mutate({
                    id: selectedSession.id,
                    status: "completed",
                    notes: sessionNotes,
                    outcome: sessionOutcome,
                  })
                }
                disabled={updateSessionMutation.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Complete Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
