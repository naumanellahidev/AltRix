import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, CheckCircle2, XCircle, FileText, Upload, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
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

type App = {
  id: string; school_id: string; first_name: string; last_name: string;
  date_of_birth: string | null; gender: string | null;
  parent_name: string | null; parent_email: string | null; parent_phone: string | null; parent_address: string | null;
  applying_for_class_id: string | null; applying_for_section_id: string | null;
  previous_school: string | null; registration_number: string | null; roll_number: string | null;
  status: string; decision_notes: string | null; notes: string | null;
  converted_student_id: string | null; created_at: string;
};
type ClassRow = { id: string; name: string };
type SectionRow = { id: string; name: string; class_id: string };
type DocRow = { id: string; application_id: string; doc_type: string | null; file_path: string; file_name: string; uploaded_at: string };

export default function AdmissionsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const perms = useSchoolPermissions(schoolId);
  const canManage = !perms.loading;

  const [tab, setTab] = useState("queue");
  const [apps, setApps] = useState<App[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [filter, setFilter] = useState<string>("submitted");

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    parent_name: "", parent_email: "", parent_phone: "", parent_address: "",
    applying_for_class_id: "", applying_for_section_id: "",
    previous_school: "", registration_number: "", roll_number: "", notes: "",
  });
  const [docFiles, setDocFiles] = useState<File[]>([]);

  const [reviewApp, setReviewApp] = useState<App | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const [aRes, cRes, sRes, dRes] = await Promise.all([
        supabase.from("admission_applications").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500),
        supabase.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId).order("name"),
        supabase.from("admission_application_documents").select("*").eq("school_id", schoolId),
      ]);
      setApps((aRes.data as App[]) || []);
      setClasses((cRes.data as ClassRow[]) || []);
      setSections((sRes.data as SectionRow[]) || []);
      setDocs((dRes.data as DocRow[]) || []);
    })();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`adm-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admission_applications", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("admission_applications").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500);
        setApps((data as App[]) || []);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId]);

  const filtered = useMemo(() => filter === "__all" ? apps : apps.filter(a => a.status === filter), [apps, filter]);
  const sectionsForClass = useMemo(() => sections.filter(s => s.class_id === form.applying_for_class_id), [sections, form.applying_for_class_id]);

  const submitApp = async () => {
    if (!schoolId || !form.first_name || !form.last_name) return toast.error("First and last name required");
    const { data: app, error } = await supabase.from("admission_applications").insert({
      school_id: schoolId,
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
      status: "submitted",
    }).select("*").single();
    if (error) return toast.error(error.message);

    // Upload documents
    for (const f of docFiles) {
      const path = `${schoolId}/${app.id}/${Date.now()}_${f.name}`;
      const { error: upErr } = await supabase.storage.from("admission-documents").upload(path, f);
      if (upErr) { toast.error(`Doc upload failed: ${upErr.message}`); continue; }
      await supabase.from("admission_application_documents").insert({
        school_id: schoolId, application_id: app.id, file_path: path, file_name: f.name, doc_type: null,
      });
    }

    toast.success("Application submitted");
    setNewOpen(false);
    setForm({ first_name: "", last_name: "", date_of_birth: "", gender: "", parent_name: "", parent_email: "", parent_phone: "", parent_address: "", applying_for_class_id: "", applying_for_section_id: "", previous_school: "", registration_number: "", roll_number: "", notes: "" });
    setDocFiles([]);
  };

  const approve = async (app: App) => {
    if (!confirm(`Approve ${app.first_name} ${app.last_name}? This will create a student record and generate the first invoice.`)) return;
    const { data, error } = await supabase.rpc("convert_admission_to_student", { _application_id: app.id });
    if (error) return toast.error(error.message);
    toast.success(`Approved. Student created.`);
    setReviewApp(null);
  };

  const setStatus = async (app: App, status: "under_review" | "rejected" | "waitlisted") => {
    const { error } = await supabase.from("admission_applications").update({
      status, decision_notes: decisionNotes || app.decision_notes, reviewed_at: new Date().toISOString(),
    }).eq("id", app.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${status.replace("_", " ")}`);
    setReviewApp(null); setDecisionNotes("");
  };

  const docsFor = (appId: string) => docs.filter(d => d.application_id === appId);
  const downloadDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("admission-documents").createSignedUrl(path, 60 * 5);
    if (error || !data) return toast.error("Failed to open document");
    window.open(data.signedUrl, "_blank");
  };

  const statusVar = (s: string): any => s === "approved" ? "default" : s === "rejected" ? "destructive" : s === "submitted" ? "secondary" : "outline";

  if (!schoolId) return <div className="p-6 text-muted-foreground">Loading school…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Admissions</h1>
          <p className="text-muted-foreground">Manage student admission applications, documents and approvals.</p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Application</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Admission Application</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label>Last name *</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
              <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
              <div><Label>Gender</Label>
                <Select value={form.gender || "__none"} onValueChange={v => setForm({ ...form, gender: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">—</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Applying for class</Label>
                <Select value={form.applying_for_class_id || "__none"} onValueChange={v => setForm({ ...form, applying_for_class_id: v === "__none" ? "" : v, applying_for_section_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">—</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section (optional)</Label>
                <Select value={form.applying_for_section_id || "__none"} onValueChange={v => setForm({ ...form, applying_for_section_id: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">—</SelectItem>{sectionsForClass.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Parent name</Label><Input value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} /></div>
              <div><Label>Parent email</Label><Input type="email" value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} /></div>
              <div><Label>Parent phone</Label><Input value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} /></div>
              <div><Label>Parent address</Label><Input value={form.parent_address} onChange={e => setForm({ ...form, parent_address: e.target.value })} /></div>
              <div><Label>Previous school</Label><Input value={form.previous_school} onChange={e => setForm({ ...form, previous_school: e.target.value })} /></div>
              <div><Label>Registration #</Label><Input value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="md:col-span-2">
                <Label>Documents (birth certificate, prev. report card, etc.)</Label>
                <Input type="file" multiple onChange={e => setDocFiles(Array.from(e.target.files || []))} />
                {docFiles.length > 0 && <p className="text-xs text-muted-foreground mt-1">{docFiles.length} file(s) ready to upload</p>}
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={submitApp}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Applications</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Applications ({filtered.length})</CardTitle>
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
    </div>
  );
}
