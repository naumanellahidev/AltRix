import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit, Plus, Search, Printer, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { printStudentCards } from "@/lib/id-card-print";
import { useTenant } from "@/hooks/useTenant";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";

type SearchRow = {
  entity: "students" | "staff" | "leads";
  id: string;
  title: string;
  subtitle: string;
  status: string;
  created_at: string;
  total_count: number;
};

type EditEntity = { entity: SearchRow["entity"]; id: string };

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DirectoryModule() {
  const { schoolSlug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [tab, setTab] = useState<"students" | "staff" | "leads">("students");
  const [q, setQ] = useState("");
  const needle = useDebounced(q.trim(), 250);

  const [status, setStatus] = useState<string>("any");
  const statusFilter = status === "any" ? null : status;

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Keyboard-first row selection + actions
  const [selectedIdx, setSelectedIdx] = useState(0);
  const tableRegionRef = useRef<HTMLDivElement | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditEntity | null>(null);

  // Post Student Creation Card Export States
  const [createdStudentForCard, setCreatedStudentForCard] = useState<any | null>(null);
  const [isCreatedSuccessOpen, setIsCreatedSuccessOpen] = useState(false);

  // Create/edit forms
  const [studentFirst, setStudentFirst] = useState("");
  const [studentLast, setStudentLast] = useState("");
  const [studentStatus, setStudentStatus] = useState("active");
  const [leadName, setLeadName] = useState("");
  const [leadStatus, setLeadStatus] = useState("open");
  const [leadNotes, setLeadNotes] = useState("");

  useEffect(() => {
    // reset pagination when query changes
    setPage(1);
    setSelectedIdx(0);
  }, [needle, tab, status]);

  const offset = (page - 1) * pageSize;

  const search = useQuery({
    queryKey: ["directory_search", schoolId, tab, needle, statusFilter, pageSize, offset],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("directory_search", {
        _school_id: schoolId,
        _entity: tab,
        _q: needle || null,
        _status: statusFilter,
        _limit: pageSize,
        _offset: offset,
      });
      if (error) throw error;
      const rows = (data ?? []) as SearchRow[];
      const filteredRows = rows.filter((r) => {
        if (r.entity === "staff") {
          const lowerTitle = r.title?.toLowerCase() ?? "";
          const lowerSubtitle = r.subtitle?.toLowerCase() ?? "";
          if (
            lowerTitle.includes("naumancheema643") ||
            lowerSubtitle.includes("naumancheema643") ||
            lowerTitle.includes("nauman cheema")
          ) {
            return false;
          }
        }
        return true;
      });
      const total = filteredRows.length ? Number(filteredRows[0].total_count ?? 0) : 0;
      return { rows: filteredRows, total };
    },
  });

  const rows = search.data?.rows ?? [];
  const total = search.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selected = rows[selectedIdx] ?? null;

  const openCreate = () => {
    setCreateOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditTarget({ entity: selected.entity, id: selected.id });
    // preload fields (best-effort)
    if (selected.entity === "students") {
      const parts = selected.title.split(" ");
      setStudentFirst(parts[0] ?? "");
      setStudentLast(parts.slice(1).join(" ") ?? "");
      setStudentStatus(selected.status || "active");
    }
    if (selected.entity === "leads") {
      setLeadName(selected.title ?? "");
      setLeadStatus(selected.status || "open");
      setLeadNotes("");
    }
  };

  const viewSelected = () => {
    if (!selected) return;
    // "View" means jumping to the owning module where CRUD exists.
    if (selected.entity === "leads") return navigate(`/${tenant.slug}/${"marketing"}/crm?leadId=${selected.id}`);
    if (selected.entity === "students") return navigate(`/${tenant.slug}/${"principal"}/academic?studentId=${selected.id}`);
    return navigate(`/${tenant.slug}/${"principal"}/users?userId=${selected.id}`);
  };

  useEffect(() => {
    const el = tableRegionRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, Math.max(0, rows.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        viewSelected();
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        openEdit();
      }
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        openCreate();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, selected?.id]);

  const counts = useMemo(() => ({ students: tab === "students" ? total : 0, staff: tab === "staff" ? total : 0, leads: tab === "leads" ? total : 0 }), [tab, total]);

  const statusOptions = useMemo(() => {
    if (tab === "students") return ["active", "inactive", "graduated", "unknown"];
    if (tab === "leads") return ["open", "won", "lost"];
    return ["active"]; // staff directory is read-only
  }, [tab]);

  const canInlineEdit = editTarget?.entity === "students" || editTarget?.entity === "leads";

  const create = async () => {
    if (!schoolId) return;
    if (tab === "students") {
      if (!studentFirst.trim()) return toast.error("First name required");
      const defaultValidity = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
      const { data, error } = await supabase.from("students").insert({
        school_id: schoolId,
        first_name: studentFirst.trim(),
        last_name: studentLast.trim() || null,
        status: studentStatus,
        card_valid_until: defaultValidity,
      }).select("*").single();

      if (error) return toast.error(error.message);
      toast.success("Student created successfully!");
      setCreateOpen(false);
      
      setCreatedStudentForCard(data);
      setIsCreatedSuccessOpen(true);

      setStudentFirst("");
      setStudentLast("");
      setStudentStatus("active");

      search.refetch();
      return;
    }

    if (tab === "leads") {
      if (!leadName.trim()) return toast.error("Lead name required");
      // ensure defaults (same behavior as CRM module)
      await supabase.rpc("ensure_default_crm_pipeline", { _school_id: schoolId });
      const { data: p, error: pErr } = await supabase
        .from("crm_pipelines")
        .select("id")
        .eq("school_id", schoolId)
        .eq("is_default", true)
        .maybeSingle();
      if (pErr) return toast.error(pErr.message);
      const pipelineId = (p as any)?.id as string | undefined;
      if (!pipelineId) return toast.error("No CRM pipeline found");
      const { data: s, error: sErr } = await supabase
        .from("crm_stages")
        .select("id")
        .eq("school_id", schoolId)
        .eq("pipeline_id", pipelineId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (sErr) return toast.error(sErr.message);
      const stageId = (s as any)?.id as string | undefined;
      if (!stageId) return toast.error("No CRM stage found");

      const { error } = await supabase.from("crm_leads").insert({
        school_id: schoolId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        full_name: leadName.trim(),
        notes: leadNotes.trim() || null,
        status: leadStatus,
        score: 0,
      });
      if (error) return toast.error(error.message);
      toast.success("Lead created");
      setCreateOpen(false);
      search.refetch();
      return;
    }

    toast.error("Create is managed in Users module for staff.");
  };

  const saveEdit = async () => {
    if (!schoolId || !editTarget) return;
    if (editTarget.entity === "students") {
      if (!studentFirst.trim()) return toast.error("First name required");
      const { error } = await supabase
        .from("students")
        .update({ first_name: studentFirst.trim(), last_name: studentLast.trim() || null, status: studentStatus })
        .eq("school_id", schoolId)
        .eq("id", editTarget.id);
      if (error) return toast.error(error.message);
      toast.success("Student updated");
      setEditTarget(null);
      search.refetch();
      return;
    }

    if (editTarget.entity === "leads") {
      if (!leadName.trim()) return toast.error("Lead name required");
      const { error } = await supabase
        .from("crm_leads")
        .update({ full_name: leadName.trim(), status: leadStatus, notes: leadNotes.trim() || null })
        .eq("school_id", schoolId)
        .eq("id", editTarget.id);
      if (error) return toast.error(error.message);
      toast.success("Lead updated");
      setEditTarget(null);
      search.refetch();
      return;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-display text-xl">Global search</CardTitle>
              <p className="text-sm text-muted-foreground">
                Server-side search with filters + pagination. Keyboard: ↑/↓ select, Enter view, E edit, C create.
              </p>
            </div>
            <div className="w-full space-y-2 md:w-[520px]">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search students, staff, leads…"
                    className="pl-9"
                  />
                </div>

                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="md:w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any status</SelectItem>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="md:w-[120px]">
                    <SelectValue placeholder="Page size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}/page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {search.isFetching ? "Searching…" : total ? `${total.toLocaleString()} results` : "No results"}
                </p>
                <div className="flex gap-2">
                  <Button variant="soft" size="sm" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Create
                  </Button>
                  <Button variant="outline" size="sm" onClick={openEdit} disabled={!selected}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="students">Students{tab === "students" ? ` (${counts.students})` : ""}</TabsTrigger>
              <TabsTrigger value="staff">Staff{tab === "staff" ? ` (${counts.staff})` : ""}</TabsTrigger>
              <TabsTrigger value="leads">Leads{tab === "leads" ? ` (${counts.leads})` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="students" className="mt-4">
              <div
                ref={tableRegionRef}
                tabIndex={0}
                className="rounded-2xl border bg-surface outline-none focus:ring-2 focus:ring-ring"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow
                        key={r.id}
                        className={idx === selectedIdx ? "bg-accent/50" : undefined}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        onClick={() => {
                          setSelectedIdx(idx);
                          viewSelected();
                        }}
                      >
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="text-muted-foreground">{r.status}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                      </TableRow>
                    ))}
                    {!search.isFetching && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">No students found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="staff" className="mt-4">
              <div
                ref={tableRegionRef}
                tabIndex={0}
                className="rounded-2xl border bg-surface outline-none focus:ring-2 focus:ring-ring"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">User ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow
                        key={r.id}
                        className={idx === selectedIdx ? "bg-accent/50" : undefined}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        onClick={() => {
                          setSelectedIdx(idx);
                          viewSelected();
                        }}
                      >
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                      </TableRow>
                    ))}
                    {!search.isFetching && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm text-muted-foreground">No staff found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="leads" className="mt-4">
              <div
                ref={tableRegionRef}
                tabIndex={0}
                className="rounded-2xl border bg-surface outline-none focus:ring-2 focus:ring-ring"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow
                        key={r.id}
                        className={idx === selectedIdx ? "bg-accent/50" : undefined}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        onClick={() => {
                          setSelectedIdx(idx);
                          viewSelected();
                        }}
                      >
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="text-muted-foreground">{r.status}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!search.isFetching && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">No leads found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive onClick={(e) => e.preventDefault()}>
                    {page}
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Create {tab === "staff" ? "Staff (in Users module)" : tab.slice(0, -1)}</DialogTitle>
          </DialogHeader>

          {tab === "students" && (
            <div className="space-y-3">
              <Input value={studentFirst} onChange={(e) => setStudentFirst(e.target.value)} placeholder="First name" />
              <Input value={studentLast} onChange={(e) => setStudentLast(e.target.value)} placeholder="Last name" />
              <Select value={studentStatus} onValueChange={setStudentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="hero" onClick={create}>
                <Plus className="mr-2 h-4 w-4" /> Create student
              </Button>
            </div>
          )}

          {tab === "leads" && (
            <div className="space-y-3">
              <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Lead name" />
              <Select value={leadStatus} onValueChange={setLeadStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {["open", "won", "lost"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Notes (optional)" />
              <Button variant="hero" onClick={create}>
                <Plus className="mr-2 h-4 w-4" /> Create lead
              </Button>
            </div>
          )}

          {tab === "staff" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Staff creation/invites are managed in the Users module.
              </p>
              <Button
                variant="hero"
                onClick={() => navigate(`/${tenant.slug}/principal/users`)}
              >
                Go to Users
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog (students/leads only) */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Edit {editTarget?.entity === "students" ? "Student" : editTarget?.entity === "leads" ? "Lead" : ""}
            </DialogTitle>
          </DialogHeader>

          {!canInlineEdit && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Editing staff is handled in Users module.</p>
              <Button variant="hero" onClick={() => navigate(`/${tenant.slug}/principal/users`)}>
                Go to Users
              </Button>
            </div>
          )}

          {editTarget?.entity === "students" && (
            <div className="space-y-3">
              <Input value={studentFirst} onChange={(e) => setStudentFirst(e.target.value)} placeholder="First name" />
              <Input value={studentLast} onChange={(e) => setStudentLast(e.target.value)} placeholder="Last name" />
              <Select value={studentStatus} onValueChange={setStudentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="hero" onClick={saveEdit}>
                Save
              </Button>
            </div>
          )}

          {editTarget?.entity === "leads" && (
            <div className="space-y-3">
              <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Lead name" />
              <Select value={leadStatus} onValueChange={setLeadStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {["open", "won", "lost"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Notes (optional)" />
              <Button variant="hero" onClick={saveEdit}>
                Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Post Creation Download/Export Dialog */}
      <Dialog open={isCreatedSuccessOpen} onOpenChange={setIsCreatedSuccessOpen}>
        <DialogContent className="max-w-md bg-white border border-blue-100 rounded-2xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center justify-center gap-2">
              <Check className="h-6 w-6 text-blue-600 bg-blue-50 rounded-full p-0.5" />
              Student Created & Card Registered!
            </DialogTitle>
          </DialogHeader>

          <div className="my-4 space-y-3">
            <p className="text-slate-600 text-sm">
              The student record and card details have been successfully created under saved global settings.
            </p>
            {createdStudentForCard && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-medium text-slate-800 text-sm">
                {createdStudentForCard.first_name} {createdStudentForCard.last_name || ""}
                {createdStudentForCard.registration_number && (
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{createdStudentForCard.registration_number}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setIsCreatedSuccessOpen(false)} className="w-full">
              Close
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white w-full flex items-center justify-center gap-1.5"
              onClick={() => {
                if (createdStudentForCard) {
                  const schoolLogo = tenant.status === "ready" ? tenant.logoUrl : null;
                  const schoolName = tenant.status === "ready" ? tenant.name : "Our School";
                  void printStudentCards(
                    supabase,
                    schoolId!,
                    [createdStudentForCard],
                    schoolLogo,
                    schoolName
                  );
                }
              }}
            >
              <Printer className="h-4 w-4" />
              Export ID Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
