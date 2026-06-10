import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Search, Link as LinkIcon, FileDown, Users2, UserPlus, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { useSchoolDocument } from "@/hooks/useSchoolDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { BrandedDocument } from "@/components/pdf/BrandedDocument";
import { ExportPdfButton } from "@/components/pdf/ExportPdfButton";
import { EDUVERSE_ROLES, roleLabel } from "@/lib/eduverse-roles";

type Row = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cnic: string | null;
  position: string | null;
  department: string | null;
  employment_type: string | null;
  joining_date: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_contact: string | null;
  notes: string | null;
  is_active: boolean;
  linked_user_id: string | null;
};

const empty: Partial<Row> = {
  full_name: "", email: "", phone: "", cnic: "", position: "", department: "",
  employment_type: "full_time", joining_date: "", date_of_birth: "", gender: "",
  address: "", emergency_contact: "", notes: "", is_active: true,
};

const ALL = "__all";
const FILTER_KEY = "hr.staff-directory.filters.v1";

const inviteRoles = EDUVERSE_ROLES.filter(
  (r) => !["super_admin", "school_owner", "student", "parent"].includes(r),
);

export function StaffDirectoryTab() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId],
  );
  const { school } = useSchoolDocument(schoolId);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // Persistent filters
  const persisted = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(FILTER_KEY) || "{}"); } catch { return {}; }
  }, []);
  const [search, setSearch] = useState<string>(persisted.search || "");
  const [deptFilter, setDeptFilter] = useState<string>(persisted.dept || ALL);
  const [typeFilter, setTypeFilter] = useState<string>(persisted.type || ALL);
  const [statusFilter, setStatusFilter] = useState<string>(persisted.status || ALL);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({
      search, dept: deptFilter, type: typeFilter, status: statusFilter,
    }));
  }, [search, deptFilter, typeFilter, statusFilter]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const rowExportRef = useRef<HTMLDivElement>(null);
  const [rowExport, setRowExport] = useState<Row | null>(null);

  // Onboarding / invite
  const [inviteFor, setInviteFor] = useState<Row | null>(null);
  const [invite, setInvite] = useState({ email: "", password: "", role: "teacher", displayName: "" });
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("hr_staff_directory")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Row[]) || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.department && set.add(r.department));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (deptFilter !== ALL && (r.department || "") !== deptFilter) return false;
      if (typeFilter !== ALL && (r.employment_type || "") !== typeFilter) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;
      if (statusFilter === "linked" && !r.linked_user_id) return false;
      if (statusFilter === "unlinked" && r.linked_user_id) return false;
      if (!q) return true;
      return [r.full_name, r.email, r.phone, r.cnic, r.position, r.department]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, deptFilter, typeFilter, statusFilter]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleAll = (v: boolean) => {
    const next = new Set(selectedIds);
    filtered.forEach((r) => v ? next.add(r.id) : next.delete(r.id));
    setSelectedIds(next);
  };
  const toggleOne = (id: string, v: boolean) => {
    const next = new Set(selectedIds);
    v ? next.add(id) : next.delete(id);
    setSelectedIds(next);
  };

  const clearFilters = () => {
    setSearch(""); setDeptFilter(ALL); setTypeFilter(ALL); setStatusFilter(ALL);
  };

  const openCreate = () => { setEditing({ ...empty }); setDialogOpen(true); };
  const openEdit = (row: Row) => { setEditing({ ...row }); setDialogOpen(true); };

  const save = async () => {
    if (!schoolId || !editing) return;
    if (!editing.full_name || !String(editing.full_name).trim()) {
      toast.error("Full name is required"); return;
    }
    const payload: any = {
      school_id: schoolId,
      full_name: String(editing.full_name).trim(),
      email: editing.email || null,
      phone: editing.phone || null,
      cnic: editing.cnic || null,
      position: editing.position || null,
      department: editing.department || null,
      employment_type: editing.employment_type || null,
      joining_date: editing.joining_date || null,
      date_of_birth: editing.date_of_birth || null,
      gender: editing.gender || null,
      address: editing.address || null,
      emergency_contact: editing.emergency_contact || null,
      notes: editing.notes || null,
      is_active: editing.is_active ?? true,
    };
    let error;
    if (editing.id) {
      ({ error } = await (supabase as any).from("hr_staff_directory").update(payload).eq("id", editing.id));
    } else {
      payload.created_by = user?.id || null;
      ({ error } = await (supabase as any).from("hr_staff_directory").insert(payload));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Staff record updated" : "Staff record added");
    setDialogOpen(false); setEditing(null); load();
  };

  const remove = async (row: Row) => {
    if (!confirm(`Delete ${row.full_name}? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("hr_staff_directory").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Staff record removed");
    load();
  };

  // Bulk actions
  const bulkSetActive = async (active: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${active ? "Activate" : "Deactivate"} ${ids.length} record(s)?`)) return;
    const { error } = await (supabase as any)
      .from("hr_staff_directory")
      .update({ is_active: active })
      .in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} record(s) updated`);
    setSelectedIds(new Set());
    load();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} staff record(s)? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("hr_staff_directory").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} record(s) deleted`);
    setSelectedIds(new Set());
    load();
  };

  // Invite / onboarding
  const openInvite = (r: Row) => {
    setInviteFor(r);
    setInvite({
      email: r.email || "",
      password: "",
      role: "teacher",
      displayName: r.full_name,
    });
  };

  const sendInvite = async () => {
    if (!inviteFor || !schoolSlug) return;
    if (!invite.email.trim() || !invite.password.trim()) {
      toast.error("Email and password are required"); return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("eduverse-invite", {
        body: {
          schoolSlug,
          email: invite.email.trim().toLowerCase(),
          password: invite.password,
          role: invite.role,
          displayName: invite.displayName || inviteFor.full_name,
        },
      });
      if (error) throw error;
      const userId = (data as any)?.userId || (data as any)?.user_id;
      // Link the directory row to the freshly-created account
      if (userId) {
        await (supabase as any)
          .from("hr_staff_directory")
          .update({ linked_user_id: userId, email: invite.email })
          .eq("id", inviteFor.id);
      }
      toast.success("Account created and linked");
      setInviteFor(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create account");
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" /> Record-only Staff
          </h3>
          <p className="text-xs text-muted-foreground">
            Employees tracked by HR without a system login. Invite them to create an account when ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)} disabled={filtered.length === 0}>
            <FileDown className="h-4 w-4 mr-2" /> Export Directory
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Staff
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, role, CNIC, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="full_time">Full-time</SelectItem>
              <SelectItem value="part_time">Part-time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="intern">Intern</SelectItem>
              <SelectItem value="visiting">Visiting</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="linked">Has account</SelectItem>
              <SelectItem value="unlinked">No account</SelectItem>
            </SelectContent>
          </Select>
          {(search || deptFilter !== ALL || typeFilter !== ALL || statusFilter !== ALL) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Filter className="h-3 w-3 mr-1" /> Reset
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result(s)</span>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-sm">
          <Badge variant="default">{selectedIds.size} selected</Badge>
          <Button size="sm" variant="outline" onClick={() => bulkSetActive(true)}>Activate</Button>
          <Button size="sm" variant="outline" onClick={() => bulkSetActive(false)}>Deactivate</Button>
          <Button size="sm" variant="destructive" onClick={bulkDelete}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No staff match the current filters.</TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} data-state={selectedIds.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, !!v)}
                        aria-label={`Select ${r.full_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.full_name}</div>
                      {r.cnic && <div className="text-[11px] text-muted-foreground font-mono">{r.cnic}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{r.position || "—"}</TableCell>
                    <TableCell className="text-sm">{r.department || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.email && <div>{r.email}</div>}
                      {r.phone && <div className="text-muted-foreground">{r.phone}</div>}
                      {!r.email && !r.phone && "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.joining_date ? new Date(r.joining_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      {r.linked_user_id ? (
                        <Badge variant="default" className="gap-1"><LinkIcon className="h-3 w-3" /> Linked</Badge>
                      ) : r.is_active ? (
                        <Badge variant="secondary">No login</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">Actions</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{r.full_name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRowExport(r)}>
                            <FileDown className="h-4 w-4 mr-2" /> Export record
                          </DropdownMenuItem>
                          {!r.linked_user_id && (
                            <DropdownMenuItem onClick={() => openInvite(r)}>
                              <UserPlus className="h-4 w-4 mr-2" /> Invite / Create account
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => remove(r)} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit staff record" : "Add staff (record-only, no login)"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name *">
                <Input value={editing.full_name || ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </Field>
              <Field label="Position">
                <Input value={editing.position || ""} onChange={(e) => setEditing({ ...editing, position: e.target.value })} placeholder="e.g. Math Teacher" />
              </Field>
              <Field label="Department">
                <Input value={editing.department || ""} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />
              </Field>
              <Field label="Employment type">
                <Select value={editing.employment_type || "full_time"} onValueChange={(v) => setEditing({ ...editing, employment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="visiting">Visiting</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Email">
                <Input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label="CNIC / National ID">
                <Input value={editing.cnic || ""} onChange={(e) => setEditing({ ...editing, cnic: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={editing.gender || ""} onValueChange={(v) => setEditing({ ...editing, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Joining date">
                <Input type="date" value={editing.joining_date || ""} onChange={(e) => setEditing({ ...editing, joining_date: e.target.value })} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" value={editing.date_of_birth || ""} onChange={(e) => setEditing({ ...editing, date_of_birth: e.target.value })} />
              </Field>
              <Field label="Emergency contact" className="sm:col-span-2">
                <Input value={editing.emergency_contact || ""} onChange={(e) => setEditing({ ...editing, emergency_contact: e.target.value })} placeholder="Name & phone" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea rows={2} value={editing.address || ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea rows={2} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing?.id ? "Save changes" : "Add staff"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full directory branded export */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Staff Directory · Branded Export</span>
              <ExportPdfButton targetRef={exportRef} filename={`staff-directory-${schoolSlug}.pdf`} />
            </DialogTitle>
          </DialogHeader>
          <BrandedDocument
            ref={exportRef}
            school={school}
            documentTitle="Staff Directory"
            referenceNumber={`HR-DIR-${new Date().getFullYear()}`}
            signatoryName="HR Manager"
            signatoryTitle="Human Resources"
          >
            <h2 className="text-lg font-bold mb-3">Staff Directory ({filtered.length})</h2>
            <table className="w-full text-[11.5px] border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left p-2 border border-slate-300">#</th>
                  <th className="text-left p-2 border border-slate-300">Name</th>
                  <th className="text-left p-2 border border-slate-300">Position</th>
                  <th className="text-left p-2 border border-slate-300">Department</th>
                  <th className="text-left p-2 border border-slate-300">Phone</th>
                  <th className="text-left p-2 border border-slate-300">Email</th>
                  <th className="text-left p-2 border border-slate-300">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="p-2 border border-slate-300">{i + 1}</td>
                    <td className="p-2 border border-slate-300 font-medium">{r.full_name}</td>
                    <td className="p-2 border border-slate-300">{r.position || "—"}</td>
                    <td className="p-2 border border-slate-300">{r.department || "—"}</td>
                    <td className="p-2 border border-slate-300">{r.phone || "—"}</td>
                    <td className="p-2 border border-slate-300">{r.email || "—"}</td>
                    <td className="p-2 border border-slate-300">{r.joining_date ? new Date(r.joining_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BrandedDocument>
        </DialogContent>
      </Dialog>

      {/* Per-record branded export */}
      <Dialog open={!!rowExport} onOpenChange={(o) => !o && setRowExport(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{rowExport?.full_name} · Staff Record</span>
              {rowExport && (
                <ExportPdfButton
                  targetRef={rowExportRef}
                  filename={`staff-${rowExport.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`}
                />
              )}
            </DialogTitle>
          </DialogHeader>
          {rowExport && (
            <BrandedDocument
              ref={rowExportRef}
              school={school}
              documentTitle="Employee Record"
              referenceNumber={`STAFF-${rowExport.id.slice(0, 8).toUpperCase()}`}
              signatoryName="HR Manager"
              signatoryTitle="Human Resources"
            >
              <h2 className="text-lg font-bold mb-1">{rowExport.full_name}</h2>
              <p className="text-xs text-slate-600 mb-4">{rowExport.position || "—"} · {rowExport.department || "—"}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
                <RecordLine label="Employment type" value={rowExport.employment_type} />
                <RecordLine label="Joining date" value={rowExport.joining_date && new Date(rowExport.joining_date).toLocaleDateString()} />
                <RecordLine label="Date of birth" value={rowExport.date_of_birth && new Date(rowExport.date_of_birth).toLocaleDateString()} />
                <RecordLine label="Gender" value={rowExport.gender} />
                <RecordLine label="Email" value={rowExport.email} />
                <RecordLine label="Phone" value={rowExport.phone} />
                <RecordLine label="CNIC" value={rowExport.cnic} />
                <RecordLine label="Emergency contact" value={rowExport.emergency_contact} />
              </div>
              {rowExport.address && (
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Address</p>
                  <p className="text-[12.5px] whitespace-pre-wrap">{rowExport.address}</p>
                </div>
              )}
              {rowExport.notes && (
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Notes</p>
                  <p className="text-[12.5px] whitespace-pre-wrap">{rowExport.notes}</p>
                </div>
              )}
            </BrandedDocument>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite / onboarding dialog */}
      <Dialog open={!!inviteFor} onOpenChange={(o) => !o && setInviteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create login for {inviteFor?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Display name">
              <Input value={invite.displayName} onChange={(e) => setInvite({ ...invite, displayName: e.target.value })} />
            </Field>
            <Field label="Email *">
              <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field label="Temporary password *">
              <Input
                type="text"
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                placeholder="Share securely with the employee"
              />
            </Field>
            <Field label="Role *">
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {inviteRoles.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">
              An account will be created and linked back to this staff record automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteFor(null)} disabled={inviting}>Cancel</Button>
            <Button onClick={sendInvite} disabled={inviting}>
              {inviting ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function RecordLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
