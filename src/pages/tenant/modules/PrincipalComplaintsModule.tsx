import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Shield, AlertTriangle, EyeOff, Search, CheckCircle2, Clock, XCircle, Sparkles,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";

interface PrincipalComplaint {
  id: string;
  flow: string;
  sender_user_id: string | null;
  student_id: string | null;
  subject: string;
  content: string;
  category: string | null;
  status: string;
  created_at: string;
  resolution_note: string | null;
}

const STATUS_TONE: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: Clock },
  in_review: { label: "In review", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",       icon: Clock },
  resolved:  { label: "Resolved",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", cls: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

export default function PrincipalComplaintsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [items, setItems] = useState<PrincipalComplaint[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

  const load = async () => {
    if (!schoolId) return;
    const { data, error } = await (supabase as any)
      .from("complaints_principal_view")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as PrincipalComplaint[];
    setItems(list);

    const sids = Array.from(new Set(list.map((c) => c.student_id).filter(Boolean) as string[]));
    if (sids.length) {
      const { data: stu } = await supabase.from("students").select("id, first_name, last_name").in("id", sids);
      const m: Record<string, string> = {};
      (stu ?? []).forEach((s: any) => { m[s.id] = `${s.first_name} ${s.last_name ?? ""}`.trim(); });
      setStudentNames(m);
    }

    const senderIds = Array.from(new Set(list.map((c) => c.sender_user_id).filter(Boolean) as string[]));
    if (senderIds.length) {
      const { data: dir } = await supabase.rpc("get_school_user_directory", { _school_id: schoolId });
      const m: Record<string, string> = {};
      (dir ?? []).forEach((d: any) => {
        if (senderIds.includes(d.user_id)) m[d.user_id] = d.display_name || d.email || "Member";
      });
      setSenderNames(m);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from("complaints")
      .update({
        status,
        resolution_note: drafts[id] ?? undefined,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status.replace("_", " ")}`);
    load();
  };

  const applyFilters = (list: PrincipalComplaint[]) => {
    let l = list;
    if (statusFilter === "open") l = l.filter((c) => c.status === "open" || c.status === "in_review");
    if (statusFilter === "resolved") l = l.filter((c) => c.status === "resolved" || c.status === "dismissed");
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter((c) =>
        c.subject.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q),
      );
    }
    return l;
  };

  const anonItems = useMemo(() => applyFilters(items.filter((c) => c.flow === "student_to_principal")),
    [items, search, statusFilter]);
  const teacherItems = useMemo(() => applyFilters(items.filter((c) => c.flow === "teacher_to_parent")),
    [items, search, statusFilter]);

  const stats = useMemo(() => {
    const open = items.filter((c) => c.status === "open" || c.status === "in_review").length;
    const resolved = items.filter((c) => c.status === "resolved").length;
    return { total: items.length, open, resolved };
  }, [items]);

  const renderCard = (c: PrincipalComplaint, anonymous: boolean) => {
    const tone = STATUS_TONE[c.status] || STATUS_TONE.open;
    const Icon = tone.icon;
    return (
      <Card key={c.id} className="card-premium overflow-hidden">
        <div className={`h-1 w-full ${
          c.status === "open" ? "bg-amber-500" :
          c.status === "in_review" ? "bg-sky-500" :
          c.status === "resolved" ? "bg-emerald-500" : "bg-muted"
        }`} />
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold tracking-tight">{c.subject}</h3>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                {anonymous ? (
                  <Badge variant="secondary" className="gap-1">
                    <EyeOff className="h-3 w-3" /> Anonymous student
                  </Badge>
                ) : (
                  <Badge variant="secondary">From {senderNames[c.sender_user_id ?? ""] || "Teacher"}</Badge>
                )}
                {c.student_id && (
                  <Badge variant="outline">About: {studentNames[c.student_id] || "Student"}</Badge>
                )}
                {c.category && <Badge variant="outline">{c.category}</Badge>}
                <Badge className={`gap-1 ${tone.cls}`} variant="outline">
                  <Icon className="h-3 w-3" /> {tone.label}
                </Badge>
                <span className="ml-auto">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  <span className="mx-1.5 opacity-40">·</span>
                  {format(new Date(c.created_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{c.content}</p>

          {c.resolution_note && (
            <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300 text-xs uppercase tracking-wider mb-1">
                Resolution note
              </p>
              <p className="text-foreground/85">{c.resolution_note}</p>
            </div>
          )}

          {c.status !== "resolved" && c.status !== "dismissed" && (
            <div className="space-y-2 pt-1 border-t">
              <Textarea
                rows={3}
                placeholder="Add a resolution / action note (visible to the sender)…"
                value={drafts[c.id] ?? ""}
                onChange={(e) => setDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => updateStatus(c.id, "in_review")}>
                  <Clock className="h-3.5 w-3.5 mr-1.5" /> Mark in review
                </Button>
                <Button size="sm" onClick={() => updateStatus(c.id, "resolved")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updateStatus(c.id, "dismissed")}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Dismiss
                </Button>
              </div>
            </div>
          )}

          {schoolId && (
            <div className="pt-1 border-t">
              <ComplaintThread
                complaintId={c.id}
                schoolId={schoolId}
                authorRole="principal"
                anonymousAuthors={anonymous}
                usePrincipalView={anonymous}
                nameLookup={anonymous ? {} : { ...senderNames, ...studentNames }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const EmptyState = ({ label }: { label: string }) => (
    <Card className="card-premium">
      <CardContent className="py-16 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Shield className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">All caught up.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500/10 via-background to-background p-6 md:p-7">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Principal Desk
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1.5">Complaints</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Anonymous student reports and teacher-to-parent flags. Confidential by default.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <StatChip label="Total" value={stats.total} />
            <StatChip label="Open" value={stats.open} tone="warning" />
            <StatChip label="Resolved" value={stats.resolved} tone="success" />
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, content, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="resolved">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs defaultValue="anon" className="space-y-4">
        <TabsList>
          <TabsTrigger value="anon" className="gap-2">
            <Shield className="h-4 w-4" /> Anonymous from students ({anonItems.length})
          </TabsTrigger>
          <TabsTrigger value="teacher" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> From teachers ({teacherItems.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="anon" className="space-y-3">
          {anonItems.length === 0 ? <EmptyState label="No anonymous complaints" /> : anonItems.map((c) => renderCard(c, true))}
        </TabsContent>
        <TabsContent value="teacher" className="space-y-3">
          {teacherItems.length === 0 ? <EmptyState label="No teacher complaints" /> : teacherItems.map((c) => renderCard(c, false))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: "warning" | "success" }) {
  const cls =
    tone === "warning" ? "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300" :
    tone === "success" ? "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300" :
                          "from-primary/10 to-primary/5 text-foreground";
  return (
    <div className={`min-w-[80px] rounded-xl border bg-gradient-to-br ${cls} px-3 py-2`}>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{label}</p>
    </div>
  );
}
