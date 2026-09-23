import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, CheckCircle2, XCircle, FileText, Upload, Eye, Printer, Check, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { getVPSFileUrl } from "@/lib/vpsStorage";
import { printStudentCards } from "@/lib/id-card-print";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { BulkImportPanel } from "@/components/admissions/BulkImportPanel";
import { StudentPhotoField } from "@/components/admissions/StudentPhotoField";
import { ErrorState, ModuleHeader, StatTiles } from "@/components/tenant/module-kit";

type App = {
  id: string; school_id: string; first_name: string; last_name: string;
  date_of_birth: string | null; gender: string | null;
  parent_name: string | null; parent_email: string | null; parent_phone: string | null; parent_address: string | null;
  applying_for_class_id: string | null; applying_for_section_id: string | null;
  previous_school: string | null; registration_number: string | null; roll_number: string | null;
  status: string; decision_notes: string | null; notes: string | null;
  converted_student_id: string | null; created_at: string; campus_id: string | null;
};
type ClassRow = { id: string; name: string };
type SectionRow = { id: string; name: string; class_id: string };
type DocRow = { id: string; application_id: string; doc_type: string | null; file_path: string; file_name: string; uploaded_at: string };

export default function AdmissionsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const activeCampusId = useActiveCampus(schoolId);
  const perms = useSchoolPermissions(schoolId);
  const canManage = !perms.loading;

  const [tab, setTab] = useState("queue");
  const [apps, setApps] = useState<App[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [filter, setFilter] = useState<string>("submitted");

  const [newOpen, setNewOpen] = useState(false);
  // Every field here lands on the student record when the application is
  // approved. Before this, half of them had nowhere to be typed, so a school
  // that collected them on paper had to enter them a second time afterwards.
  const BLANK_FORM = {
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    parent_name: "", parent_email: "", parent_phone: "", parent_address: "",
    applying_for_class_id: "", applying_for_section_id: "",
    previous_school: "", registration_number: "", roll_number: "", notes: "",
    student_phone: "", city: "", area: "", blood_group: "",
    emergency_contact: "", medical_notes: "", admission_date: "",
    guardian2_name: "", guardian2_phone: "", guardian2_relation: "",
  };
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  // The roll as it stands, so an import can spot a child who is already on it.
  const [roll, setRoll] = useState<Array<{ registration_number: string | null; first_name: string; last_name: string | null; date_of_birth: string | null }>>([]);

  const [reviewApp, setReviewApp] = useState<App | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const [createdStudentForCard, setCreatedStudentForCard] = useState<any | null>(null);
  const [isCreatedSuccessOpen, setIsCreatedSuccessOpen] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      let appQuery = api.from("admission_applications").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500);
      if (activeCampusId) appQuery = appQuery.eq("campus_id", activeCampusId);

      let classQuery = api.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name");
      if (activeCampusId) classQuery = classQuery.eq("campus_id", activeCampusId);

      let secQuery = api.from("class_sections").select("id, name, class_id").eq("school_id", schoolId).order("name");
      if (activeCampusId) secQuery = secQuery.eq("campus_id", activeCampusId);

      try {
        const [aRes, cRes, sRes, dRes, rRes] = await Promise.all([
          appQuery,
          classQuery,
          secQuery,
          api.from("admission_application_documents").select("*").eq("school_id", schoolId),
          api.from("students").select("registration_number, first_name, last_name, date_of_birth").eq("school_id", schoolId),
        ]);
        const failure = aRes.error ?? cRes.error ?? sRes.error;
        if (failure) throw failure;
        setApps((aRes.data as any) ?? []);
        setClasses((cRes.data as any) ?? []);
        setSections((sRes.data as any) ?? []);
        setDocs((dRes.data as any) ?? []);
        setRoll((rRes.data as any) ?? []);
        setLoadError(null);
      } catch (err) {
        // Reported rather than swallowed: an empty applications table and a
        // permissions error used to look identical.
        setLoadError(err);
      }
    })();
  }, [schoolId, activeCampusId]);

  useEffect(() => {
    if (!schoolId) return;
    const ch = api.channel(`adm-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admission_applications", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await api.from("admission_applications").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500);
        setApps((data as App[]) || []);
      }).subscribe();
    return () => { api.removeChannel(ch); };
  }, [schoolId]);

  const filtered = useMemo(() => filter === "__all" ? apps : apps.filter(a => a.status === filter), [apps, filter]);
  const sectionsForClass = useMemo(() => sections.filter(s => s.class_id === form.applying_for_class_id), [sections, form.applying_for_class_id]);

  const submitApp = async () => {
    if (!schoolId || !form.first_name) return toast.error("A first name is required");
    setSubmitting(true);
    try {
    // The photograph goes up first: it is the field that puts a face on the
    // ID card and the report card, and an application saved without it would
    // have to be edited afterwards to add one.
    let photoUrl: string | null = null;
    if (photo) {
      const path = `${schoolId}/photos/${Date.now()}.jpg`;
      const file = new File([photo.blob], "student.jpg", { type: "image/jpeg" });
      const { error: upErr } = await api.storage.from("student-photos").upload(path, file);
      if (upErr) {
        // Said plainly, and the admission is not silently saved faceless.
        toast.error(`The photograph could not be saved: ${upErr.message}`);
        setSubmitting(false);
        return;
      }
      photoUrl = path;
    }

    const { data: app, error } = await api.from("admission_applications").insert({
      school_id: schoolId,
      ...(activeCampusId ? { campus_id: activeCampusId } : {}),
      first_name: form.first_name, last_name: form.last_name,
      date_of_birth: form.date_of_birth || null, gender: form.gender || null,
      parent_name: form.parent_name || null, parent_email: form.parent_email || null,
      parent_phone: form.parent_phone || null, parent_address: form.parent_address || null,
      applying_for_class_id: form.applying_for_class_id || null,
      applying_for_section_id: form.applying_for_section_id || null,
      previous_school: form.previous_school || null,
      registration_number: form.registration_number || null,
      roll_number: form.roll_number || null,
      notes: form.notes || null,
      photo_url: photoUrl,
      student_phone: form.student_phone || null,
      city: form.city || null,
      area: form.area || null,
      blood_group: form.blood_group || null,
      emergency_contact: form.emergency_contact || null,
      medical_notes: form.medical_notes || null,
      admission_date: form.admission_date || null,
      guardian2_name: form.guardian2_name || null,
      guardian2_phone: form.guardian2_phone || null,
      guardian2_relation: form.guardian2_relation || null,
      status: "submitted",
    }).select("*").single();
    if (error) { setSubmitting(false); return toast.error(error.message); }

    // Upload documents
    for (const f of docFiles) {
      const path = `${schoolId}/${app.id}/${Date.now()}_${f.name}`;
      const { error: upErr } = await api.storage.from("admission-documents").upload(path, f);
      if (upErr) { toast.error(`Doc upload failed: ${upErr.message}`); continue; }
      await api.from("admission_application_documents").insert({
        school_id: schoolId,
        ...(activeCampusId ? { campus_id: activeCampusId } : {}),
        application_id: app.id, file_path: path, file_name: f.name, mime_type: f.type || null,
      });
    }

    toast.success("Application submitted");
    setNewOpen(false);
    setForm({ ...BLANK_FORM });
    setDocFiles([]);
    setPhoto(null);
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (app: App) => {
    if (!confirm(`Approve ${app.first_name} ${app.last_name}? This will create a student record and generate the first invoice.`)) return;
    const { data: studentId, error } = await api.rpc("convert_admission_to_student", { _application_id: app.id });
    if (error) return toast.error(error.message);

    // Set default card validity (1 year from now) on the newly created student record
    const defaultValidity = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
    await api
      .from("students")
      .update({ card_valid_until: defaultValidity })
      .eq("id", studentId);

    // Fetch the updated student record to display in the card download dialog
    const { data: studentData } = await api
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();

    toast.success(`Approved. Student created.`);
    setReviewApp(null);

    if (studentData) {
      const classObj = classes.find(c => c.id === app.applying_for_class_id);
      const sectionObj = sections.find(s => s.id === app.applying_for_section_id);
      
      setCreatedStudentForCard({
        ...studentData,
        class_name: classObj?.name || "",
        section_name: sectionObj?.name || "",
      });
      setIsCreatedSuccessOpen(true);
    }
  };

  const setStatus = async (app: App, status: "under_review" | "rejected" | "waitlisted") => {
    const { error } = await api.from("admission_applications").update({
      status, decision_notes: decisionNotes || app.decision_notes, reviewed_at: new Date().toISOString(),
    }).eq("id", app.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${status.replace("_", " ")}`);
    setReviewApp(null); setDecisionNotes("");
  };

  const docsFor = (appId: string) => docs.filter(d => d.application_id === appId);
  const downloadDoc = async (path: string) => {
    const url = getVPSFileUrl("admission-documents", path);
    if (!url) return toast.error("Failed to open document");
    window.open(url, "_blank");
  };

  const statusVar = (s: string): any => s === "approved" ? "default" : s === "rejected" ? "destructive" : s === "submitted" ? "secondary" : "outline";

  if (!schoolId) return <div className="p-6 text-muted-foreground">Loading school…</div>;

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={UserPlus}
        tone="emerald"
        title="Admissions"
        description="Every child applying to the school, what the family handed in, and the decision — and, for a school just moving in, the register it already keeps."
        actions={
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New application</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New admission application</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Only a first name is required. Everything else can be filled in now or later — but
                what is entered here carries straight onto the student record when the application
                is approved, so there is nothing to type twice.
              </p>
            </DialogHeader>

            <div className="space-y-5">
              {/* ── The child ───────────────────────────────────────────── */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">The child</h4>
                <StudentPhotoField value={photo} onChange={setPhoto} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><Label>First name *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                  <div><Label>Last name</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                  <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                  <div><Label>Gender</Label>
                    <Select value={form.gender || "__none"} onValueChange={v => setForm({ ...form, gender: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none">—</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Student phone</Label><Input value={form.student_phone} onChange={e => setForm({ ...form, student_phone: e.target.value })} /></div>
                  <div><Label>Blood group</Label><Input placeholder="A+, O−, …" value={form.blood_group} onChange={e => setForm({ ...form, blood_group: e.target.value })} /></div>
                </div>
              </section>

              {/* ── Placement ───────────────────────────────────────────── */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Placement</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><Label>Applying for class</Label>
                    <Select value={form.applying_for_class_id || "__none"} onValueChange={v => setForm({ ...form, applying_for_class_id: v === "__none" ? "" : v, applying_for_section_id: "" })}>
                      <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none">—</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Section</Label>
                    <Select value={form.applying_for_section_id || "__none"} onValueChange={v => setForm({ ...form, applying_for_section_id: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none">—</SelectItem>{sectionsForClass.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choosing a section is what puts the child on a class register when the application is approved.
                    </p>
                  </div>
                  <div><Label>Admission date</Label><Input type="date" value={form.admission_date} onChange={e => setForm({ ...form, admission_date: e.target.value })} /></div>
                  <div><Label>Previous school</Label><Input value={form.previous_school} onChange={e => setForm({ ...form, previous_school: e.target.value })} /></div>
                  <div><Label>Registration number</Label><Input value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} /></div>
                  <div><Label>Roll number</Label><Input value={form.roll_number} onChange={e => setForm({ ...form, roll_number: e.target.value })} /></div>
                </div>
              </section>

              {/* ── The family ──────────────────────────────────────────── */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">The family</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><Label>Guardian name</Label><Input value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} /></div>
                  <div><Label>Guardian phone</Label><Input value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} /></div>
                  <div className="md:col-span-2">
                    <Label>Guardian email</Label>
                    <Input type="email" value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is what links the family to the parent portal, so they can see marks, fees and notices.
                    </p>
                  </div>
                  <div><Label>Second guardian</Label><Input value={form.guardian2_name} onChange={e => setForm({ ...form, guardian2_name: e.target.value })} /></div>
                  <div><Label>Second guardian phone</Label><Input value={form.guardian2_phone} onChange={e => setForm({ ...form, guardian2_phone: e.target.value })} /></div>
                  <div><Label>Relationship</Label><Input placeholder="mother, father, uncle…" value={form.guardian2_relation} onChange={e => setForm({ ...form, guardian2_relation: e.target.value })} /></div>
                  <div><Label>Emergency contact</Label><Input placeholder="Name and number" value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Address</Label><Input value={form.parent_address} onChange={e => setForm({ ...form, parent_address: e.target.value })} /></div>
                  <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>Area</Label><Input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} /></div>
                </div>
              </section>

              {/* ── What the school must know ───────────────────────────── */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Health and notes</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Medical notes</Label>
                    <Textarea placeholder="Allergies, conditions, medication the school must know about" value={form.medical_notes} onChange={e => setForm({ ...form, medical_notes: e.target.value })} />
                  </div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                  <div>
                    <Label>Documents</Label>
                    <Input type="file" multiple onChange={e => setDocFiles(Array.from(e.target.files || []))} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Birth certificate, previous report card, B-form. These are carried onto the
                      student's own record when the application is approved.
                    </p>
                    {docFiles.length > 0 && <p className="mt-1 text-xs font-medium">{docFiles.length} file(s) ready to upload</p>}
                  </div>
                </div>
              </section>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submitApp} disabled={submitting || !form.first_name.trim()}>
                {submitting ? "Saving…" : "Submit application"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      {loadError ? (
        <Card className="rounded-2xl border-rose-200 dark:border-rose-900">
          <ErrorState title="Admissions could not be loaded" error={loadError} />
        </Card>
      ) : null}

      <StatTiles
        stats={[
          { label: "Awaiting a decision", value: apps.filter(a => a.status === "submitted" || a.status === "under_review").length },
          { label: "Waitlisted", value: apps.filter(a => a.status === "waitlisted").length },
          { label: "Approved", value: apps.filter(a => a.status === "approved").length, tone: "positive" },
          { label: "Students on the roll", value: roll.length, hint: "Everyone currently enrolled" },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Applications</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="import">Import a register</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <BulkImportPanel
            classes={classes}
            sections={sections}
            existingRegistrations={roll.map(r => r.registration_number).filter(Boolean) as string[]}
            existingIdentities={roll.map(r => `${r.first_name} ${r.last_name ?? ""}|${r.date_of_birth ?? ""}`)}
            onImported={() => {
              // The roll is what the duplicate check is made against, so it
              // has to be current before a second file is uploaded.
              if (!schoolId) return;
              void api
                .from("students")
                .select("registration_number, first_name, last_name, date_of_birth")
                .eq("school_id", schoolId)
                .then((r: any) => setRoll(r.data ?? []));
            }}
          />
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Applications ({filtered.length})</CardTitle>
              <div className="flex items-center gap-2">
              <DataExportMenu
                title="Admission Applications"
                subtitle={filter !== "__all" ? filter.replace("_", " ") : undefined}
                rows={filtered.map((a) => ({
                  Applicant: `${a.first_name} ${a.last_name}`.trim(),
                  Class: classes.find((c) => c.id === a.applying_for_class_id)?.name ?? "",
                  Parent: a.parent_name ?? "",
                  "Parent phone": a.parent_phone ?? "",
                  "Parent email": a.parent_email ?? "",
                  "Previous school": a.previous_school ?? "",
                  Submitted: a.created_at.slice(0, 10),
                  Documents: docsFor(a.id).length,
                  Status: a.status.replace("_", " "),
                }))}
                orientation="landscape"
                disabled={!filtered.length}
                size="sm"
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="waitlisted">Waitlisted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Applicant</TableHead><TableHead>Class</TableHead><TableHead>Parent</TableHead>
                  <TableHead>Submitted</TableHead><TableHead>Docs</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.first_name} {a.last_name}</TableCell>
                      <TableCell>{classes.find(c => c.id === a.applying_for_class_id)?.name || "—"}</TableCell>
                      <TableCell><div className="text-sm">{a.parent_name || "—"}</div><div className="text-xs text-muted-foreground">{a.parent_email || a.parent_phone}</div></TableCell>
                      <TableCell>{format(new Date(a.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell>{docsFor(a.id).length}</TableCell>
                      <TableCell><Badge variant={statusVar(a.status)}>{a.status.replace("_", " ")}</Badge></TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => { setReviewApp(a); setDecisionNotes(a.decision_notes || ""); }}><Eye className="h-3 w-3 mr-1" />Review</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Approved & Converted</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Applicant</TableHead><TableHead>Class</TableHead><TableHead>Approved</TableHead><TableHead>Student created</TableHead></TableRow></TableHeader>
                <TableBody>
                  {apps.filter(a => a.status === "approved").map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{a.first_name} {a.last_name}</TableCell>
                      <TableCell>{classes.find(c => c.id === a.applying_for_class_id)?.name || "—"}</TableCell>
                      <TableCell>{format(new Date(a.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell>{a.converted_student_id ? <Badge>Yes</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!reviewApp} onOpenChange={v => !v && setReviewApp(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Review Application</DialogTitle></DialogHeader>
          {reviewApp && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <strong>{reviewApp.first_name} {reviewApp.last_name}</strong></div>
                <div><span className="text-muted-foreground">DOB:</span> {reviewApp.date_of_birth || "—"}</div>
                <div><span className="text-muted-foreground">Gender:</span> {reviewApp.gender || "—"}</div>
                <div><span className="text-muted-foreground">Class:</span> {classes.find(c => c.id === reviewApp.applying_for_class_id)?.name || "—"}</div>
                <div><span className="text-muted-foreground">Parent:</span> {reviewApp.parent_name || "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {reviewApp.parent_email || "—"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {reviewApp.parent_phone || "—"}</div>
                <div><span className="text-muted-foreground">Prev school:</span> {reviewApp.previous_school || "—"}</div>
              </div>
              {reviewApp.notes && <div className="text-sm"><span className="text-muted-foreground">Notes:</span> {reviewApp.notes}</div>}
              <div>
                <Label className="text-sm">Documents</Label>
                <div className="space-y-1 mt-1">
                  {docsFor(reviewApp.id).length === 0 && <p className="text-xs text-muted-foreground">No documents uploaded</p>}
                  {docsFor(reviewApp.id).map(d => (
                    <Button key={d.id} variant="outline" size="sm" className="mr-2" onClick={() => downloadDoc(d.file_path)}>
                      <FileText className="h-3 w-3 mr-1" />{d.file_name}
                    </Button>
                  ))}
                </div>
              </div>
              <div><Label>Decision notes</Label><Textarea value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} placeholder="Reason for decision (optional)" /></div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {reviewApp && reviewApp.status !== "approved" && reviewApp.status !== "rejected" && (
              <>
                <Button variant="outline" onClick={() => reviewApp && setStatus(reviewApp, "under_review")}>Mark Under Review</Button>
                <Button variant="outline" onClick={() => reviewApp && setStatus(reviewApp, "waitlisted")}>Waitlist</Button>
                <Button variant="destructive" onClick={() => reviewApp && setStatus(reviewApp, "rejected")}><XCircle className="h-4 w-4 mr-1" />Reject</Button>
                <Button onClick={() => reviewApp && approve(reviewApp)}><CheckCircle2 className="h-4 w-4 mr-1" />Approve & Convert</Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setReviewApp(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Approval Download/Export Dialog */}
      <Dialog open={isCreatedSuccessOpen} onOpenChange={setIsCreatedSuccessOpen}>
        <DialogContent className="max-w-md bg-white border border-blue-100 rounded-2xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center justify-center gap-2">
              <Check className="h-6 w-6 text-blue-600 bg-blue-50 rounded-full p-0.5" />
              Admissions Approved & Card Registered!
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
                  void printStudentCards(
                    api,
                    schoolId!,
                    [createdStudentForCard],
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
