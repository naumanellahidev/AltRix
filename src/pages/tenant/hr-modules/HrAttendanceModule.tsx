import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineStaffMembers } from "@/hooks/useOfflineData";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Download, RefreshCw, WifiOff, Check, X, Clock, FileCheck, Coffee,
  Keyboard, Search, Users, CalendarDays, History
} from "lucide-react";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { exportToCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { StaffAttendanceHistoryDialog } from "@/components/attendance/StaffAttendanceHistoryDialog";

type Status = "present" | "absent" | "late" | "half_day" | "leave";
const STATUS_ORDER: Status[] = ["present", "absent", "late", "half_day", "leave"];

const STATUS_CONFIG: Record<Status, { label: string; icon: any; active: string; hover: string; chip: string }> = {
  present:  { label: "Present",  icon: Check,     active: "border-green-600 bg-green-100 text-green-700",  hover: "hover:border-green-400 hover:bg-green-50",  chip: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400" },
  absent:   { label: "Absent",   icon: X,         active: "border-red-600 bg-red-100 text-red-700",        hover: "hover:border-red-400 hover:bg-red-50",      chip: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400" },
  late:     { label: "Late",     icon: Clock,     active: "border-amber-600 bg-amber-100 text-amber-700",  hover: "hover:border-amber-400 hover:bg-amber-50",  chip: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  half_day: { label: "Half Day", icon: Coffee,    active: "border-purple-600 bg-purple-100 text-purple-700", hover: "hover:border-purple-400 hover:bg-purple-50", chip: "border-purple-500/50 bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  leave:    { label: "On Leave", icon: FileCheck, active: "border-blue-600 bg-blue-100 text-blue-700",     hover: "hover:border-blue-400 hover:bg-blue-50",    chip: "border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400" },
};

export function HrAttendanceModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [focusedRow, setFocusedRow] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: cachedStaff, isOffline, isUsingCache, refresh: refreshStaff } = useOfflineStaffMembers(schoolId);

  const { data: attendance = [], isLoading, refetch } = useQuery({
    queryKey: ["hr_staff_attendance", schoolId, selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_staff_attendance").select("*")
        .eq("school_id", schoolId!).eq("attendance_date", selectedDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId && !isOffline,
  });

  // Monthly summary
  const monthStart = useMemo(() => {
    const d = new Date(selectedDate);
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
  }, [selectedDate]);
  const monthEnd = useMemo(() => {
    const d = new Date(selectedDate);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
  }, [selectedDate]);

  const { data: monthData = [] } = useQuery({
    queryKey: ["hr_staff_attendance_month", schoolId, monthStart, monthEnd],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_staff_attendance").select("user_id,status,attendance_date")
        .eq("school_id", schoolId!).gte("attendance_date", monthStart).lte("attendance_date", monthEnd);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: regs = [] } = useQuery({
    queryKey: ["hr_attendance_regs", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_attendance_regularizations").select("*").eq("school_id", schoolId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const markMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: Status }) => {
      const { error } = await supabase.from("hr_staff_attendance").upsert({
        school_id: schoolId, user_id: userId, attendance_date: selectedDate, status,
        recorded_by: (await supabase.auth.getUser()).data.user?.id,
      }, { onConflict: "school_id,user_id,attendance_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance"] });
      queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance_month"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const bulkMarkMutation = useMutation({
    mutationFn: async (status: Status) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const rows = filteredStaff.map((s) => ({
        school_id: schoolId, user_id: s.userId, attendance_date: selectedDate, status, recorded_by: uid,
      }));
      const { error } = await supabase.from("hr_staff_attendance").upsert(rows, { onConflict: "school_id,user_id,attendance_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance"] });
      queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance_month"] });
      toast.success("Bulk attendance saved");
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const reviewReg = useMutation({
    mutationFn: async ({ id, status, reg }: { id: string; status: "approved" | "rejected"; reg: any }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("hr_attendance_regularizations").update({
        status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      if (status === "approved") {
        await supabase.from("hr_staff_attendance").upsert({
          school_id: schoolId, user_id: reg.employee_user_id, attendance_date: reg.attendance_date,
          status: reg.requested_status, recorded_by: user?.id,
        }, { onConflict: "school_id,user_id,attendance_date" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_attendance_regs"] });
      queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const attendanceByUserId = useMemo(() => {
    const map = new Map<string, any>();
    attendance.forEach((a: any) => map.set(a.user_id, a));
    return map;
  }, [attendance]);

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return cachedStaff;
    return cachedStaff.filter((s) =>
      (s.displayName || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q)
    );
  }, [cachedStaff, search]);

  const stats = useMemo(() => {
    const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 };
    let unmarked = 0;
    cachedStaff.forEach((s) => {
      const a = attendanceByUserId.get(s.userId);
      if (a && counts[a.status as Status] !== undefined) counts[a.status as Status]++;
      else unmarked++;
    });
    return { ...counts, unmarked, total: cachedStaff.length };
  }, [cachedStaff, attendanceByUserId]);

  // Monthly per-staff %
  const monthlyByUser = useMemo(() => {
    const map = new Map<string, { present: number; total: number }>();
    monthData.forEach((r: any) => {
      const cur = map.get(r.user_id) || { present: 0, total: 0 };
      cur.total++;
      if (r.status === "present" || r.status === "late" || r.status === "half_day") cur.present++;
      map.set(r.user_id, cur);
    });
    return map;
  }, [monthData]);

  const updateStatus = useCallback((userId: string, status: Status) => {
    markMutation.mutate({ userId, status });
  }, [markMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (filteredStaff.length === 0) return;
    const cur = filteredStaff[focusedRow];
    if (!cur) return;
    const curStatus = (attendanceByUserId.get(cur.userId)?.status as Status) || "present";
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); setFocusedRow((p) => Math.max(0, p - 1)); break;
      case "ArrowDown": e.preventDefault(); setFocusedRow((p) => Math.min(filteredStaff.length - 1, p + 1)); break;
      case "ArrowLeft": {
        e.preventDefault();
        const idx = STATUS_ORDER.indexOf(curStatus);
        updateStatus(cur.userId, STATUS_ORDER[Math.max(0, idx - 1)]);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        const idx = STATUS_ORDER.indexOf(curStatus);
        updateStatus(cur.userId, STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, idx + 1)]);
        break;
      }
      case "p": case "P": e.preventDefault(); updateStatus(cur.userId, "present"); break;
      case "a": case "A": e.preventDefault(); updateStatus(cur.userId, "absent"); break;
      case "l": case "L": e.preventDefault(); updateStatus(cur.userId, "late"); break;
      case "h": case "H": e.preventDefault(); updateStatus(cur.userId, "half_day"); break;
      case "e": case "E": e.preventDefault(); updateStatus(cur.userId, "leave"); break;
      case "Enter": e.preventDefault(); setFocusedRow((p) => Math.min(filteredStaff.length - 1, p + 1)); break;
    }
  }, [filteredStaff, focusedRow, attendanceByUserId, updateStatus]);

  useEffect(() => { setFocusedRow(0); }, [search, selectedDate]);

  const handleExport = () => {
    const rows = cachedStaff.map((s) => {
      const att = attendanceByUserId.get(s.userId);
      return { Name: s.displayName || s.email, Email: s.email, Date: selectedDate, Status: att?.status || "Not Marked" };
    });
    exportToCSV(rows, `staff-attendance-${selectedDate}`);
    toast.success("Exported");
  };

  const pendingRegs = regs.filter((r: any) => r.status === "pending");

  if (isLoading && !isUsingCache) {
    return <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={() => { refetch(); refreshStaff(); }} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Staff Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">Mark, review, and analyze staff attendance</p>
        </div>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
          <TabsTrigger value="regularizations">
            Regularizations{pendingRegs.length > 0 && ` (${pendingRegs.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </div>
                <div>
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" className="pl-8" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isOffline && <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>}
                <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
                <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}><History className="h-4 w-4 mr-1" />History</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </div>
                {!isOffline && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => bulkMarkMutation.mutate("present")}>All Present</Button>
                    <Button size="sm" variant="outline" onClick={() => bulkMarkMutation.mutate("absent")}>All Absent</Button>
                  </div>
                )}
              </div>

              {/* Summary chips */}
              <div className="mb-4 flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                <Badge variant="outline" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Total: {stats.total}</Badge>
                {STATUS_ORDER.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <Badge key={s} variant="outline" className={cn("gap-1.5", cfg.chip)}>
                      <Icon className="h-3.5 w-3.5" /> {cfg.label}: {stats[s]}
                    </Badge>
                  );
                })}
                <Badge variant="outline" className="gap-1.5">Unmarked: {stats.unmarked}</Badge>
              </div>

              {/* Shortcuts */}
              {!isOffline && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Keyboard className="h-4 w-4" />
                  <span>
                    <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate ·{" "}
                    <kbd className="rounded bg-muted px-1">←→</kbd> cycle ·{" "}
                    <kbd className="rounded bg-muted px-1">P</kbd> present ·{" "}
                    <kbd className="rounded bg-muted px-1">A</kbd> absent ·{" "}
                    <kbd className="rounded bg-muted px-1">L</kbd> late ·{" "}
                    <kbd className="rounded bg-muted px-1">H</kbd> half-day ·{" "}
                    <kbd className="rounded bg-muted px-1">E</kbd> leave ·{" "}
                    <kbd className="rounded bg-muted px-1">Enter</kbd> next
                  </span>
                </div>
              )}

              {filteredStaff.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {isOffline ? <div className="flex flex-col items-center gap-2"><WifiOff className="h-6 w-6" /><span>No cached staff</span></div> : "No staff found."}
                </div>
              ) : (
                <div
                  ref={containerRef}
                  tabIndex={isOffline ? -1 : 0}
                  onKeyDown={isOffline ? undefined : handleKeyDown}
                  className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead className="w-28">Month %</TableHead>
                        {STATUS_ORDER.map((s) => {
                          const cfg = STATUS_CONFIG[s];
                          const Icon = cfg.icon;
                          return (
                            <TableHead key={s} className="text-center">
                              <span className="inline-flex items-center justify-center gap-1">
                                <Icon className="h-4 w-4" /> {cfg.label}
                              </span>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStaff.map((staff, idx) => {
                        const att = attendanceByUserId.get(staff.userId);
                        const cur = (att?.status as Status) || null;
                        const m = monthlyByUser.get(staff.userId);
                        const pct = m && m.total > 0 ? Math.round((m.present / m.total) * 100) : null;
                        return (
                          <TableRow
                            key={staff.id}
                            className={cn(
                              "transition-colors cursor-pointer",
                              idx === focusedRow && "bg-accent/50 ring-1 ring-inset ring-primary/30",
                            )}
                            onClick={() => setFocusedRow(idx)}
                          >
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="font-medium">{staff.displayName || staff.email}</div>
                              <div className="text-xs text-muted-foreground">{staff.email}</div>
                            </TableCell>
                            <TableCell>
                              {pct !== null ? (
                                <Badge variant="outline" className={cn(
                                  pct >= 90 ? "border-green-500/50 text-green-700 dark:text-green-400" :
                                  pct >= 75 ? "border-amber-500/50 text-amber-700 dark:text-amber-400" :
                                  "border-red-500/50 text-red-700 dark:text-red-400"
                                )}>{pct}%</Badge>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            {STATUS_ORDER.map((status) => {
                              const cfg = STATUS_CONFIG[status];
                              const Icon = cfg.icon;
                              const active = cur === status;
                              return (
                                <TableCell key={status} className="text-center">
                                  <button
                                    type="button"
                                    disabled={isOffline}
                                    onClick={(e) => { e.stopPropagation(); updateStatus(staff.userId, status); setFocusedRow(idx); }}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                      active ? cfg.active : `border-muted ${!isOffline ? cfg.hover : ""}`,
                                      isOffline && "cursor-not-allowed opacity-60"
                                    )}
                                    aria-label={`Mark ${cfg.label}`}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </button>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {new Date(selectedDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })} — Per-Staff Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cachedStaff.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff data.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-center">Days Marked</TableHead>
                      <TableHead className="text-center">Effective Present</TableHead>
                      <TableHead className="text-center">Attendance %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cachedStaff.map((s) => {
                      const m = monthlyByUser.get(s.userId) || { present: 0, total: 0 };
                      const pct = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium">{s.displayName || s.email}</div>
                            <div className="text-xs text-muted-foreground">{s.email}</div>
                          </TableCell>
                          <TableCell className="text-center">{m.total}</TableCell>
                          <TableCell className="text-center">{m.present}</TableCell>
                          <TableCell className="text-center">
                            {m.total > 0 ? (
                              <Badge variant="outline" className={cn(
                                pct >= 90 ? "border-green-500/50 text-green-700 dark:text-green-400" :
                                pct >= 75 ? "border-amber-500/50 text-amber-700 dark:text-amber-400" :
                                "border-red-500/50 text-red-700 dark:text-red-400"
                              )}>{pct}%</Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regularizations" className="space-y-3 mt-4">
          {regs.length === 0 && <p className="text-sm text-muted-foreground">No regularization requests.</p>}
          {regs.map((r: any) => {
            const staff = cachedStaff.find((s) => s.userId === r.employee_user_id);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{staff?.displayName || staff?.email || r.employee_user_id.slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">{r.attendance_date} — wants <span className="font-medium capitalize">{r.requested_status}</span></p>
                    {r.reason && <p className="text-sm mt-1">{r.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === "pending" ? (
                      <>
                        <Button size="sm" onClick={() => reviewReg.mutate({ id: r.id, status: "approved", reg: r })}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => reviewReg.mutate({ id: r.id, status: "rejected", reg: r })}><X className="h-4 w-4" /></Button>
                      </>
                    ) : (
                      <Badge variant={r.status === "approved" ? "default" : "outline"} className="capitalize">{r.status}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <StaffAttendanceHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        schoolId={schoolId}
        staffMembers={cachedStaff}
        onSaveComplete={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance"] });
          queryClient.invalidateQueries({ queryKey: ["hr_staff_attendance_month"] });
        }}
      />
    </div>
  );
}
