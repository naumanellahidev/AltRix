import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, GraduationCap, MapPin, Download, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/csv";

interface Props {
  schoolId: string | null;
}

interface Campus {
  id: string;
  school_id: string;
  name: string;
  slug: string;
  code: string | null;
  address: string | null;
  is_active: boolean;
  principal_user_id: string | null;
}

const STAFF_ROLES = [
  "super_admin",
  "school_owner",
  "principal",
  "vice_principal",
  "school_admin",
  "academic_coordinator",
  "teacher",
  "accountant",
  "hr_manager",
  "counselor",
  "marketing_staff",
];

export function OwnerCampusesModule({ schoolId }: Props) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqType, setReqType] = useState<"new_school" | "new_campus">("new_campus");
  const [reqSubject, setReqSubject] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: school } = useQuery({
    queryKey: ["owner_school_name", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await api.from("schools").select("name,slug").eq("id", schoolId).maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  const { data: campuses = [], isLoading } = useQuery({
    queryKey: ["owner_campuses_list", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await api
        .from("campuses")
        .select("*")
        .eq("school_id", schoolId)
        .order("name");
      return (data || []) as Campus[];
    },
    enabled: !!schoolId,
  });

  const { data: kpis = {} } = useQuery({
    queryKey: ["owner_campuses_kpis", schoolId],
    queryFn: async () => {
      if (!schoolId) return {};
      const [schoolRes, campusesRes, studentsRes, staffRolesRes] = await Promise.all([
        api.from("schools").select("slug").eq("id", schoolId).maybeSingle(),
        api.from("campuses").select("id,slug").eq("school_id", schoolId),
        api.from("students").select("campus_id").eq("school_id", schoolId),
        api.from("user_roles").select("user_id,role").eq("school_id", schoolId).in("role", STAFF_ROLES),
      ]);
      const campusRows = campusesRes.data || [];
      const campusIds = new Set(campusRows.map((c: any) => c.id));
      const mainCampusId =
        campusRows.find((c: any) => c.slug === schoolRes.data?.slug)?.id || campusRows[0]?.id || null;
      const staffUserIds = new Set<string>((staffRolesRes.data || []).map((r: any) => r.user_id));
      const staffAssignmentsRes = campusRows.length
        ? await api
            .from("staff_campus_assignments")
            .select("user_id,campus_id")
            .in("campus_id", Array.from(campusIds))
        : { data: [] };
      const map: Record<string, { students: number; staff: number }> = {};
      campusRows.forEach((c: any) => {
        map[c.id] = { students: 0, staff: 0 };
      });
      (studentsRes.data || []).forEach((s: any) => {
        const k = s.campus_id || mainCampusId || "_none";
        map[k] = map[k] || { students: 0, staff: 0 };
        map[k].students++;
      });
      const explicitlyAssignedStaff = new Set<string>();
      (staffAssignmentsRes.data || []).forEach((s: any) => {
        if (!staffUserIds.has(s.user_id) || !campusIds.has(s.campus_id)) return;
        explicitlyAssignedStaff.add(s.user_id);
        const k = s.campus_id;
        map[k] = map[k] || { students: 0, staff: 0 };
        map[k].staff++;
      });
      if (mainCampusId) {
        staffUserIds.forEach((userId) => {
          if (!explicitlyAssignedStaff.has(userId)) {
            map[mainCampusId] = map[mainCampusId] || { students: 0, staff: 0 };
            map[mainCampusId].staff++;
          }
        });
      }
      return map;
    },
    enabled: !!schoolId,
  });

  const total = campuses.length;
  const active = campuses.filter((c) => c.is_active).length;
  const totalStudents = Object.values(kpis).reduce((s, v) => s + v.students, 0);
  const totalStaff = Object.values(kpis).reduce((s, v) => s + v.staff, 0);

  const handleExport = () => {
    if (!campuses.length) {
      toast({ title: "Nothing to export", description: "No campuses found." });
      return;
    }
    const rows = campuses.map((c) => {
      const k = kpis[c.id] || { students: 0, staff: 0 };
      return {
        school: school?.name ?? "",
        campus_name: c.name,
        code: c.code ?? "",
        address: c.address ?? "",
        status: c.is_active ? "Active" : "Inactive",
        students: k.students,
        staff: k.staff,
      };
    });
    const fname = `${(school?.slug || "school")}-campuses-${new Date().toISOString().slice(0, 10)}`;
    exportToCSV(rows, fname);
    toast({ title: "Exported", description: `${rows.length} campus row(s) downloaded.` });
  };

  const submitRequest = async () => {
    if (!reqSubject.trim() || !reqMessage.trim()) {
      toast({ title: "Missing info", description: "Subject and message are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await api.auth.getUser();
    if (!user) {
      toast({ title: "Not signed in", variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const { error } = await api.from("platform_requests" as any).insert({
      requester_user_id: user.id,
      school_id: schoolId,
      request_type: reqType,
      subject: reqSubject.trim(),
      message: reqMessage.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request sent", description: "The platform super admin will review your request." });
    setRequestOpen(false);
    setReqSubject("");
    setReqMessage("");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Multi-Campus View</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Read-only overview across all your schools and campuses. New schools and campuses can only be created by the platform super admin.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!campuses.length} className="rounded-xl text-xs justify-center">
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setRequestOpen(true)} className="rounded-xl text-xs justify-center">
            <Send className="mr-1.5 h-4 w-4" /> Request new campus/school
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-3 sm:p-4"><Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /><p className="mt-2 font-display text-lg sm:text-2xl font-bold truncate">{total}</p><p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Campuses</p></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4"><Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" /><p className="mt-2 font-display text-lg sm:text-2xl font-bold truncate">{active}</p><p className="text-[10px] sm:text-xs text-muted-foreground truncate">Active</p></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4"><GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" /><p className="mt-2 font-display text-lg sm:text-2xl font-bold truncate">{totalStudents}</p><p className="text-[10px] sm:text-xs text-muted-foreground truncate">Students</p></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4"><Users className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" /><p className="mt-2 font-display text-lg sm:text-2xl font-bold truncate">{totalStaff}</p><p className="text-[10px] sm:text-xs text-muted-foreground truncate">Assigned Staff</p></CardContent></Card>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Loading…</CardContent></Card>
      ) : campuses.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No campuses configured for this school yet. Ask the platform super admin to add one.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {campuses.map((c) => {
            const k = kpis[c.id] || { students: 0, staff: 0 };
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{c.name}</CardTitle>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {c.code && <Badge variant="outline" className="h-5 text-[10px]">{c.code}</Badge>}
                        {c.address && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" /> {c.address}
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge variant={c.is_active ? "default" : "outline"} className="h-5 text-[10px]">
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2.5 sm:gap-3 p-4 sm:p-5 pt-0">
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Students</p>
                    <p className="font-display text-lg sm:text-xl font-semibold">{k.students}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Staff</p>
                    <p className="font-display text-lg sm:text-xl font-semibold">{k.staff}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-lg w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle>Request new campus or school</DialogTitle>
            <DialogDescription className="text-xs">
              Send a message to the platform super admin. They will review and follow up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Request type</Label>
              <Select value={reqType} onValueChange={(v) => setReqType(v as any)}>
                <SelectTrigger className="text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_campus">New campus</SelectItem>
                  <SelectItem value="new_school">New school</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={reqSubject} onChange={(e) => setReqSubject(e.target.value)} placeholder="e.g. Add new campus in Lahore" className="text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea
                value={reqMessage}
                onChange={(e) => setReqMessage(e.target.value)}
                rows={4}
                placeholder="Describe the campus/school name, location, intended slug, and any other details."
                className="text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={submitting} className="w-full sm:w-auto text-xs">Cancel</Button>
            <Button onClick={submitRequest} disabled={submitting} className="w-full sm:w-auto text-xs">
              <Send className="mr-1.5 h-4 w-4" /> {submitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
