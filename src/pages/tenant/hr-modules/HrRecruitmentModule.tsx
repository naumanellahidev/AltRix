import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Briefcase, Users, Calendar as CalendarIcon, Trash2, Pencil, FileText, Eye, Download, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useRef, useState as useRState } from "react";
import { RecruitmentPostingDocument } from "@/components/hr/RecruitmentPostingDocument";
import { ExportPdfButton } from "@/components/pdf/ExportPdfButton";
import { useSchoolDocument } from "@/hooks/useSchoolDocument";

const isImage = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) : false;
};

const isPdf = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === "pdf";
};

type JobPosting = {
  id: string; title: string; department: string | null; location: string | null;
  employment_type: string; status: string; openings: number; description: string | null;
  requirements: string | null; posted_at: string; closes_at: string | null; campus_id: string | null;
};
type Applicant = {
  id: string; posting_id: string | null; full_name: string; email: string | null;
  phone: string | null; stage: string; rating: number | null; notes: string | null;
  applied_at: string; resume_url: string | null;
};
type Interview = {
  id: string; applicant_id: string; scheduled_at: string; duration_minutes: number;
  mode: string; location_or_link: string | null; interviewer_user_id: string | null;
  status: string; feedback: string | null; score: number | null;
};

const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screening: "Screening", interview: "Interview",
  offer: "Offer", hired: "Hired", rejected: "Rejected",
};

export function HrRecruitmentModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string; path: string } | null>(null);
  const [loadingResume, setLoadingResume] = useState<string | null>(null); // store applicant ID

  const openResume = async (applicantId: string, path: string, name: string) => {
    if (!path) return;
    setLoadingResume(applicantId);
    try {
      if (/^https?:\/\//i.test(path)) {
        setPreviewDoc({ url: path, name: `${name}'s Resume`, type: "cv_resume", path });
        return;
      }
      const cleanPath = path.replace(/^[^\/]+\//, "");
      const { data, error } = await supabase.storage
        .from("hr-documents")
        .createSignedUrl(cleanPath, 3600);
      
      if (error || !data?.signedUrl) {
        const { data: data2, error: error2 } = await supabase.storage
          .from("hr-documents")
          .createSignedUrl(path, 3600);
        if (error2 || !data2?.signedUrl) {
          toast.error(error2?.message || "Unable to load resume");
          return;
        }
        setPreviewDoc({ url: data2.signedUrl, name: `${name}'s Resume`, type: "cv_resume", path });
        return;
      }
      setPreviewDoc({ url: data.signedUrl, name: `${name}'s Resume`, type: "cv_resume", path });
    } catch (err: any) {
      toast.error(err.message || "Failed to load resume");
    } finally {
      setLoadingResume(null);
    }
  };

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const [p, a, i] = await Promise.all([
      (supabase as any).from("hr_job_postings").select("*").eq("school_id", schoolId).order("posted_at", { ascending: false }),
      (supabase as any).from("hr_applicants").select("*").eq("school_id", schoolId).order("applied_at", { ascending: false }),
      (supabase as any).from("hr_interviews").select("*").eq("school_id", schoolId).order("scheduled_at", { ascending: true }),
    ]);
    if (p.data) setPostings(p.data);
    if (a.data) setApplicants(a.data);
    if (i.data) setInterviews(i.data);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!schoolId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const stats = {
    openings: postings.filter(p => p.status === "open").reduce((s, p) => s + p.openings, 0),
    applicants: applicants.length,
    interviewsThisWeek: interviews.filter(i => {
      const d = new Date(i.scheduled_at);
      const now = new Date();
      return d >= now && (d.getTime() - now.getTime()) < 7 * 24 * 3600 * 1000;
    }).length,
    hired: applicants.filter(a => a.stage === "hired").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Recruitment</h2>
        <p className="text-sm text-muted-foreground">Manage job postings, applicants, and interviews.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open positions" value={stats.openings} icon={Briefcase} />
        <StatCard label="Total applicants" value={stats.applicants} icon={Users} />
        <StatCard label="Interviews this week" value={stats.interviewsThisWeek} icon={CalendarIcon} />
        <StatCard label="Hired" value={stats.hired} icon={Users} tone="success" />
      </div>

      <Tabs defaultValue="postings">
        <TabsList>
          <TabsTrigger value="postings">Job Postings ({postings.length})</TabsTrigger>
          <TabsTrigger value="pipeline">Applicant Pipeline ({applicants.length})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews ({interviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="postings" className="mt-4">
          <PostingsTab postings={postings} schoolId={schoolId} onChange={refresh} loading={loading} />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineTab 
            applicants={applicants} 
            postings={postings} 
            schoolId={schoolId} 
            onChange={refresh}
            onPreviewResume={openResume}
            loadingResume={loadingResume}
          />
        </TabsContent>

        <TabsContent value="interviews" className="mt-4">
          <InterviewsTab interviews={interviews} applicants={applicants} schoolId={schoolId} onChange={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${tone === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function PostingsTab({ postings, schoolId, onChange, loading }: { postings: JobPosting[]; schoolId: string; onChange: () => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<JobPosting | null>(null);
  const [form, setForm] = useState({ title: "", department: "", location: "", employment_type: "full_time", openings: 1, description: "", requirements: "", status: "open" });
  const [preview, setPreview] = useState<JobPosting | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string; path: string } | null>(null);
  const { school } = useSchoolDocument(schoolId);
  const docRef = useRef<HTMLDivElement>(null);

  const startEdit = (p: JobPosting) => {
    setEdit(p);
    setForm({ title: p.title, department: p.department ?? "", location: p.location ?? "", employment_type: p.employment_type, openings: p.openings, description: p.description ?? "", requirements: p.requirements ?? "", status: p.status });
    setOpen(true);
  };
  const startNew = () => {
    setEdit(null);
    setForm({ title: "", department: "", location: "", employment_type: "full_time", openings: 1, description: "", requirements: "", status: "open" });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    const payload = { ...form, school_id: schoolId, openings: Number(form.openings) || 1 };
    const res = edit
      ? await (supabase as any).from("hr_job_postings").update(payload).eq("id", edit.id)
      : await (supabase as any).from("hr_job_postings").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(edit ? "Posting updated" : "Posting created");
    setOpen(false); onChange();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this posting?")) return;
    const { error } = await (supabase as any).from("hr_job_postings").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={startNew}><Plus className="h-4 w-4 mr-2" />New Posting</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} Job Posting</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Department</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Type</Label>
                <Select value={form.employment_type} onValueChange={v => setForm({ ...form, employment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Openings</Label><Input type="number" min={1} value={form.openings} onChange={e => setForm({ ...form, openings: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="col-span-2"><Label>Requirements</Label><Textarea rows={3} value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>{edit ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       postings.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No postings yet. Click "New Posting".</CardContent></Card> :
       <div className="grid gap-3">
         {postings.map(p => (
           <Card key={p.id}>
             <CardContent className="p-4 flex justify-between items-start">
               <div>
                 <div className="flex items-center gap-2">
                   <h3 className="font-semibold">{p.title}</h3>
                   <Badge variant={p.status === "open" ? "default" : "secondary"}>{p.status}</Badge>
                 </div>
                 <p className="text-sm text-muted-foreground mt-1">
                   {[p.department, p.location, p.employment_type.replace("_", " ")].filter(Boolean).join(" • ")}
                   {" • "}{p.openings} opening{p.openings !== 1 ? "s" : ""}
                 </p>
                 {p.description && <p className="text-sm mt-2 line-clamp-2">{p.description}</p>}
               </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreview(p)}><FileText className="h-4 w-4 mr-1" />View / Export</Button>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      }

      {/* Branded posting preview / export */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader className="flex-row items-center justify-between gap-4" data-print="hide">
            <DialogTitle>Job Posting · Branded Letterhead</DialogTitle>
            {preview && (
              <ExportPdfButton
                targetRef={docRef as any}
                filename={`Job-${preview.title.replace(/\s+/g, "-")}-${preview.id.slice(0, 6)}`}
              />
            )}
          </DialogHeader>
          {preview && (
            <div className="bg-slate-100 p-4 rounded">
              <RecruitmentPostingDocument ref={docRef} school={school} posting={preview as any} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Inline Resume Viewer Modal */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] p-0 flex flex-col bg-surface/90 backdrop-blur-md border border-primary/10 rounded-3xl overflow-hidden shadow-premium">
          <div className="flex items-center justify-between gap-4 p-5 border-b border-primary/5 bg-primary/5 sticky top-0 z-10">
            <div>
              <DialogTitle className="font-display text-base font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {previewDoc?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                Applicant Attachment
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewDoc?.url, "_blank")}
                className="rounded-xl border-primary/10 h-8 text-xs gap-1.5 bg-background/50 hover:bg-background/80 transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in New Tab
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = previewDoc?.url || "";
                  a.download = previewDoc?.name || "resume";
                  a.click();
                }}
                className="rounded-xl border-primary/10 h-8 text-xs gap-1.5 bg-background/50 hover:bg-background/80 transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-muted/20 relative p-4 flex items-center justify-center overflow-hidden">
            {previewDoc && (
              isImage(previewDoc.path) ? (
                <div className="w-full h-full flex items-center justify-center overflow-auto">
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.name}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-primary/5 bg-background"
                  />
                </div>
              ) : isPdf(previewDoc.path) ? (
                <iframe
                  src={`${previewDoc.url}#toolbar=1`}
                  title={previewDoc.name}
                  className="w-full h-full border-none rounded-xl bg-background shadow-lg"
                />
              ) : (
                <div className="text-center p-8 space-y-4 max-w-sm">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto opacity-40" />
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">No Preview Available</p>
                    <p className="text-xs text-muted-foreground">This file type cannot be previewed inline. Please open or download it.</p>
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button onClick={() => window.open(previewDoc.url, "_blank")}>Open File</Button>
                  </div>
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineTab({ 
  applicants, 
  postings, 
  schoolId, 
  onChange,
  onPreviewResume,
  loadingResume
}: { 
  applicants: Applicant[]; 
  postings: JobPosting[]; 
  schoolId: string; 
  onChange: () => void;
  onPreviewResume: (applicantId: string, path: string, name: string) => void;
  loadingResume: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", posting_id: "", notes: "" });

  const add = async () => {
    if (!form.full_name.trim()) { toast.error("Name required"); return; }
    const { error } = await (supabase as any).from("hr_applicants").insert({
      school_id: schoolId, full_name: form.full_name, email: form.email || null,
      phone: form.phone || null, posting_id: form.posting_id || null, notes: form.notes || null,
    });
    if (error) toast.error(error.message); else { toast.success("Applicant added"); setOpen(false); setForm({ full_name: "", email: "", phone: "", posting_id: "", notes: "" }); onChange(); }
  };

  const moveStage = async (id: string, stage: string) => {
    const { error } = await (supabase as any).from("hr_applicants").update({ stage }).eq("id", id);
    if (error) toast.error(error.message); else onChange();
  };

  const byStage = (s: string) => applicants.filter(a => a.stage === s);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Applicant</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Applicant</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Position</Label>
                <Select value={form.posting_id || "__none"} onValueChange={v => setForm({ ...form, posting_id: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Unassigned —</SelectItem>
                    {postings.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGES.map(s => (
          <Card key={s}>
            <CardHeader className="p-3 pb-2"><CardTitle className="text-xs uppercase">{STAGE_LABEL[s]} <span className="text-muted-foreground">({byStage(s).length})</span></CardTitle></CardHeader>
            <CardContent className="p-3 pt-0 space-y-2 max-h-[600px] overflow-y-auto">
              {byStage(s).map(a => (
                <div key={a.id} className="rounded border bg-card p-2 text-xs">
                  <p className="font-medium text-sm">{a.full_name}</p>
                  {a.email && <p className="text-muted-foreground truncate">{a.email}</p>}
                  <p className="text-muted-foreground">{postings.find(p => p.id === a.posting_id)?.title ?? "—"}</p>
                  {a.resume_url && (
                    <Button 
                      size="sm" 
                      variant="link" 
                      disabled={loadingResume === a.id}
                      onClick={() => onPreviewResume(a.id, a.resume_url!, a.full_name)}
                      className="p-0 h-auto text-primary text-[10px] mt-1.5 flex items-center gap-1 justify-start font-medium hover:no-underline"
                    >
                      {loadingResume === a.id ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                        </span>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" /> View CV/Resume
                        </>
                      )}
                    </Button>
                  )}
                  <Select value={a.stage} onValueChange={v => moveStage(a.id, v)}>
                    <SelectTrigger className="h-7 mt-1.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map(x => <SelectItem key={x} value={x}>{STAGE_LABEL[x]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InterviewsTab({ interviews, applicants, schoolId, onChange }: { interviews: Interview[]; applicants: Applicant[]; schoolId: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ applicant_id: "", scheduled_at: "", duration_minutes: 30, mode: "in_person", location_or_link: "" });

  const add = async () => {
    if (!form.applicant_id || !form.scheduled_at) { toast.error("Applicant and time required"); return; }
    const { error } = await (supabase as any).from("hr_interviews").insert({
      school_id: schoolId, applicant_id: form.applicant_id, scheduled_at: form.scheduled_at,
      duration_minutes: Number(form.duration_minutes), mode: form.mode, location_or_link: form.location_or_link || null,
    });
    if (error) toast.error(error.message); else { toast.success("Interview scheduled"); setOpen(false); onChange(); }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("hr_interviews").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Schedule Interview</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Interview</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Applicant *</Label>
                <Select value={form.applicant_id} onValueChange={v => setForm({ ...form, applicant_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>{applicants.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Date & Time *</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
              <div><Label>Mode</Label>
                <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In Person</SelectItem>
                    <SelectItem value="video">Video Call</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Location / Link</Label><Input value={form.location_or_link} onChange={e => setForm({ ...form, location_or_link: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Schedule</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {interviews.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No interviews scheduled.</CardContent></Card> :
        <div className="grid gap-2">
          {interviews.map(i => {
            const a = applicants.find(x => x.id === i.applicant_id);
            return (
              <Card key={i.id}>
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{a?.full_name ?? "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(i.scheduled_at), "PPp")} • {i.duration_minutes}min • {i.mode.replace("_", " ")}
                      {i.location_or_link && ` • ${i.location_or_link}`}
                    </p>
                  </div>
                  <Select value={i.status} onValueChange={v => updateStatus(i.id, v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }
    </div>
  );
}
