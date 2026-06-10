import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useOfflineLeaveRequests } from "@/hooks/useOfflineData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Calendar, Clock, CheckCircle, XCircle, WifiOff } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";

interface LeaveType {
  id: string;
  name: string;
  days_per_year: number | null;
}

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  reason: string | null;
  created_at: string;
  reviewer_notes: string | null;
}

export function TeacherLeavesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const { user } = useSession();
  const queryClient = useQueryClient();
  
  const schoolId = useMemo(() => tenant.status === "ready" ? tenant.schoolId : null, [tenant.status, tenant.schoolId]);
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  // Offline data hook
  const { data: cachedRequests, isUsingCache, loading: offlineLoading } = useOfflineLeaveRequests(schoolId);

  // Get leave types
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_types")
        .select("id, name, max_days")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        id: d.id,
        name: d.name,
        days_per_year: d.max_days,
      })) as LeaveType[];
    },
    enabled: !!schoolId && !isOffline,
  });

  // Get my leave requests
  const { data: myRequests = [], isLoading } = useQuery({
    queryKey: ["my_leave_requests", schoolId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_requests")
        .select(`
          id, leave_type_id, start_date, end_date, days_count, status, reason, 
          created_at,
          hr_leave_types(name)
        `)
        .eq("school_id", schoolId!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        leave_type_name: r.hr_leave_types?.name || "Unknown",
      })) as LeaveRequest[];
    },
    enabled: !!schoolId && !!user && !isOffline,
  });

  // Use cached data when offline
  const displayRequests = useMemo(() => {
    if (isOffline || isUsingCache) {
      return cachedRequests
        .filter(r => r.userId === user?.id)
        .map(r => ({
          id: r.id,
          leave_type_id: r.leaveTypeId,
          leave_type_name: r.leaveTypeName || "Leave",
          start_date: r.startDate,
          end_date: r.endDate,
          days_count: r.daysCount,
          status: r.status,
          reason: r.reason,
          created_at: '',
          reviewed_at: null,
          reviewer_notes: null,
        })) as LeaveRequest[];
    }
    return myRequests;
  }, [myRequests, cachedRequests, isOffline, isUsingCache, user?.id]);

  // Apply for leave dialog
  const [applyOpen, setApplyOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    leave_type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const daysCount = useMemo(() => {
    if (!newRequest.start_date || !newRequest.end_date) return 0;
    const start = parseISO(newRequest.start_date);
    const end = parseISO(newRequest.end_date);
    return differenceInDays(end, start) + 1;
  }, [newRequest.start_date, newRequest.end_date]);

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId || !user) throw new Error("Not authenticated");
      
      const { error } = await supabase.from("hr_leave_requests").insert({
        school_id: schoolId,
        user_id: user.id,
        leave_type_id: newRequest.leave_type_id,
        start_date: newRequest.start_date,
        end_date: newRequest.end_date,
        days_count: daysCount,
        reason: newRequest.reason.trim() || null,
        status: "pending",
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_leave_requests"] });
      toast.success("Leave request submitted successfully");
      setApplyOpen(false);
      setNewRequest({ leave_type_id: "", start_date: "", end_date: "", reason: "" });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit leave request");
    },
  });

  const handleApply = () => {
    if (!newRequest.leave_type_id) {
      toast.error("Please select a leave type");
      return;
    }
    if (!newRequest.start_date || !newRequest.end_date) {
      toast.error("Please select start and end dates");
      return;
    }
    if (daysCount <= 0) {
      toast.error("End date must be after start date");
      return;
    }
    applyMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const loading = isLoading || offlineLoading;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {isOffline && (
        <div className="rounded-2xl bg-warning/10 border border-warning/20 p-3 text-sm text-warning text-center">
          <WifiOff className="inline-block h-4 w-4 mr-2" />
          Offline Mode — Showing cached data. New applications are disabled.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">My Leave Requests</h2>
          <p className="text-sm text-muted-foreground">Apply for leave and track your requests</p>
        </div>
        
        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogTrigger asChild>
            <Button disabled={isOffline || leaveTypes.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Apply for Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Leave Type *</Label>
                <Select
                  value={newRequest.leave_type_id}
                  onValueChange={(v) => setNewRequest((p) => ({ ...p, leave_type_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                        {type.days_per_year && ` (max ${type.days_per_year} days/year)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={newRequest.start_date}
                    onChange={(e) => setNewRequest((p) => ({ ...p, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>End Date *</Label>
                  <Input
                    type="date"
                    value={newRequest.end_date}
                    min={newRequest.start_date}
                    onChange={(e) => setNewRequest((p) => ({ ...p, end_date: e.target.value }))}
                  />
                </div>
              </div>
              
              {daysCount > 0 && (
                <div className="rounded-lg bg-accent p-3 text-center">
                  <span className="text-lg font-bold">{daysCount}</span>
                  <span className="text-sm text-muted-foreground ml-1">day{daysCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={newRequest.reason}
                  onChange={(e) => setNewRequest((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Optional reason for leave..."
                  rows={3}
                />
              </div>
              
              <Button 
                onClick={handleApply} 
                className="w-full"
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Leave Requests List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {displayRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isOffline ? "No cached leave requests available." : "No leave requests found. Click 'Apply for Leave' to submit your first request."}
            </p>
          ) : (
            <div className="space-y-3">
              {displayRequests.map((req) => (
                <div key={req.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <p className="font-medium">{req.leave_type_name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(parseISO(req.start_date), "MMM d, yyyy")} — {format(parseISO(req.end_date), "MMM d, yyyy")}
                        <span className="ml-2">({req.days_count} day{req.days_count !== 1 ? "s" : ""})</span>
                      </p>
                      {req.reason && (
                        <p className="text-sm mt-2">{req.reason}</p>
                      )}
                      {req.reviewer_notes && (
                        <p className="text-sm mt-2 text-muted-foreground italic">
                          Reviewer note: {req.reviewer_notes}
                        </p>
                      )}
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leave Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {leaveTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isOffline ? "Leave types not available offline." : "No leave types configured by HR."}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {leaveTypes.map((type) => {
                const used = displayRequests
                  .filter(r => r.leave_type_id === type.id && r.status === "approved")
                  .reduce((sum, r) => sum + r.days_count, 0);
                const max = type.days_per_year || 0;
                const remaining = max - used;
                
                return (
                  <div key={type.id} className="rounded-lg bg-accent p-3">
                    <p className="text-sm font-medium">{type.name}</p>
                    {max > 0 ? (
                      <>
                        <p className="text-2xl font-bold mt-1">{remaining}</p>
                        <p className="text-xs text-muted-foreground">of {max} remaining</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Unlimited</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
