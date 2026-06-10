import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  MessageSquare,
  RefreshCw,
  Shield,
  TrendingDown,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  schoolId: string;
}

const SEVERITY_CONFIG = {
  critical: { color: "bg-red-500/10 text-red-600 border-red-200", icon: XCircle },
  high: { color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: AlertTriangle },
  medium: { color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: Bell },
  low: { color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Eye },
};

const WARNING_TYPES = [
  { value: "__all", label: "All Types" },
  { value: "attendance", label: "Attendance" },
  { value: "academic", label: "Academic" },
  { value: "behavioral", label: "Behavioral" },
  { value: "emotional", label: "Emotional" },
  { value: "engagement", label: "Engagement" },
];

export function EarlyWarningSystem({ schoolId }: Props) {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState("__all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [selectedWarning, setSelectedWarning] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data: warnings, isLoading, refetch } = useQuery({
    queryKey: ["ai_early_warnings", schoolId, filterType, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from("ai_early_warnings")
        .select(`
          *,
          students:student_id (
            first_name,
            last_name
          )
        `)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (filterType && filterType !== "__all") {
        query = query.eq("warning_type", filterType);
      }

      if (filterStatus === "active") {
        query = query.is("resolved_at", null);
      } else if (filterStatus === "resolved") {
        query = query.not("resolved_at", "is", null);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const stats = useMemo(() => {
    if (!warnings) return { critical: 0, high: 0, medium: 0, total: 0 };
    const active = warnings.filter(w => !w.resolved_at);
    return {
      critical: active.filter(w => w.severity === "critical").length,
      high: active.filter(w => w.severity === "high").length,
      medium: active.filter(w => w.severity === "medium").length,
      total: active.length,
    };
  }, [warnings]);

  const acknowledgeMutation = useMutation({
    mutationFn: async (warningId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("ai_early_warnings")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", warningId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Warning acknowledged");
      qc.invalidateQueries({ queryKey: ["ai_early_warnings", schoolId] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ warningId, notes }: { warningId: string; notes: string }) => {
      const { error } = await supabase
        .from("ai_early_warnings")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          description: notes ? `[Resolved] ${notes}` : undefined,
        })
        .eq("id", warningId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Warning resolved");
      setSelectedWarning(null);
      setResolutionNotes("");
      qc.invalidateQueries({ queryKey: ["ai_early_warnings", schoolId] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-red-500 to-orange-500 p-2.5">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Early Warning System</h2>
            <p className="text-sm text-muted-foreground">
              AI-powered dropout prevention & intervention
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="shadow-sm border-red-200 bg-red-500/5">
          <CardContent className="p-4">
            <XCircle className="h-5 w-5 text-red-600" />
            <p className="mt-2 text-2xl font-bold text-red-600">{stats.critical}</p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-orange-200 bg-orange-500/5">
          <CardContent className="p-4">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <p className="mt-2 text-2xl font-bold text-orange-600">{stats.high}</p>
            <p className="text-xs text-muted-foreground">High Priority</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-amber-200 bg-amber-500/5">
          <CardContent className="p-4">
            <Bell className="h-5 w-5 text-amber-600" />
            <p className="mt-2 text-2xl font-bold text-amber-600">{stats.medium}</p>
            <p className="text-xs text-muted-foreground">Medium</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter Type" />
          </SelectTrigger>
          <SelectContent>
            {WARNING_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Warnings List */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {warnings && warnings.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {warnings.map((warning, idx) => {
                  const severity = warning.severity as keyof typeof SEVERITY_CONFIG;
                  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;
                  const SeverityIcon = config.icon;

                  return (
                    <motion.div
                      key={warning.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card className={`shadow-sm border ${warning.resolved_at ? "opacity-60" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`rounded-lg p-2 ${config.color}`}>
                              <SeverityIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">{warning.title}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {(warning.students as any)?.first_name}{" "}
                                    {(warning.students as any)?.last_name}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <Badge className={config.color}>
                                    {severity}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDistanceToNow(parseISO(warning.created_at), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>

                              {warning.description && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {warning.description}
                                </p>
                              )}

                              {/* Detected Patterns */}
                              {warning.detected_patterns && (warning.detected_patterns as string[]).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {(warning.detected_patterns as string[]).map((pattern, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">
                                      {pattern}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Actions */}
                              {!warning.resolved_at && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {!warning.acknowledged_at && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => acknowledgeMutation.mutate(warning.id)}
                                      disabled={acknowledgeMutation.isPending}
                                      className="h-7 text-xs"
                                    >
                                      <Eye className="mr-1 h-3 w-3" />
                                      Acknowledge
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedWarning(warning)}
                                    className="h-7 text-xs"
                                  >
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Resolve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                  >
                                    <MessageSquare className="mr-1 h-3 w-3" />
                                    Contact Parent
                                  </Button>
                                </div>
                              )}

                              {warning.resolved_at && (
                                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Resolved {formatDistanceToNow(parseISO(warning.resolved_at), { addSuffix: true })}
                                </div>
                              )}
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
              <Shield className="mx-auto h-12 w-12 text-emerald-500/50" />
              <p className="mt-4 font-medium text-emerald-600">All Clear!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No active warnings at this time
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={!!selectedWarning} onOpenChange={() => setSelectedWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Warning</DialogTitle>
            <DialogDescription>
              Mark this warning as resolved and add notes about the intervention taken.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{selectedWarning?.title}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedWarning?.students as any)?.first_name}{" "}
                {(selectedWarning?.students as any)?.last_name}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Resolution Notes</label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe the intervention taken..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedWarning(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  resolveMutation.mutate({
                    warningId: selectedWarning.id,
                    notes: resolutionNotes,
                  })
                }
                disabled={resolveMutation.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Resolved
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
