import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Upload, ExternalLink, Trash2, FileText, Eye, Download, Loader2 } from "lucide-react";

const DOC_TYPES = ["contract", "id_proof", "cv_resume", "certification", "offer_letter", "policy", "general"];
const ALL = "__all";

const isImage = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) : false;
};

const isPdf = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === "pdf";
};

export function HrDocumentsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const qc = useQueryClient();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [open, setOpen] = useState(false);
  const [filterEmp, setFilterEmp] = useState<string>(ALL);
  const [filterType, setFilterType] = useState<string>(ALL);
  const [form, setForm] = useState<{ user_id: string; document_type: string; file?: File | null; document_name: string }>({ user_id: "", document_type: "general", file: null, document_name: "" });
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string; path: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["hr_documents_full", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_documents").select("*").eq("school_id", schoolId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["hr_staff_dir_docs", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_staff_directory", { _school_id: schoolId! });
      if (error) throw error;
      return data || [];
    },
  });
  const nameById = useMemo(() => { const m = new Map<string, string>(); (staff as any[]).forEach((s) => m.set(s.user_id, s.display_name || s.email)); return m; }, [staff]);

  const handleUpload = async () => {
    if (!form.file || !form.user_id) { toast.error("Select employee and file"); return; }
    setUploading(true);
    try {
      const fileName = `${schoolId}/${form.user_id}/${Date.now()}_${form.file.name}`;
      const { error: upErr } = await supabase.storage.from("hr-documents").upload(fileName, form.file);
      if (upErr) throw upErr;
      // Store storage path in file_url; we open via signed URL on demand
      // because hr-documents is a private bucket.
      const { error: dbErr } = await supabase.from("hr_documents").insert({
        school_id: schoolId, user_id: form.user_id,
        document_type: form.document_type, document_name: form.document_name || form.file.name,
        file_url: fileName,
      });
      if (dbErr) throw dbErr;
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["hr_documents_full"] });
      setOpen(false);
      setForm({ user_id: "", document_type: "general", file: null, document_name: "" });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setUploading(false); }
  };

  const openDoc = async (path: string, name: string, type: string) => {
    if (!path) return;
    setLoadingPreview(true);
    try {
      // Backward-compat: if an old row still has a full URL, just open it.
      if (/^https?:\/\//i.test(path)) {
        setPreviewDoc({ url: path, name, type, path });
        return;
      }
      const { data, error } = await supabase.storage
        .from("hr-documents")
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        toast.error(error?.message || "Unable to open document");
        return;
      }
      setPreviewDoc({ url: data.signedUrl, name, type, path });
    } catch (err: any) {
      toast.error(err.message || "Failed to load document");
    } finally {
      setLoadingPreview(false);
    }
  };


  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr_documents_full"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (docs as any[]).filter((d) => (filterEmp === ALL || d.user_id === filterEmp) && (filterType === ALL || d.document_type === filterType));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-2xl font-bold">Employee Documents</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Upload className="h-4 w-4 mr-1" />Upload</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(staff as any[]).map((s) => (<SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => (<SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Document Name (optional)</Label><Input value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })} /></div>
              <div><Label>File</Label><Input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} /></div>
            </div>
            <DialogFooter><Button onClick={handleUpload} disabled={uploading || !form.file || !form.user_id}>{uploading ? "Uploading…" : "Upload"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={filterEmp} onValueChange={setFilterEmp}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All employees</SelectItem>
            {(staff as any[]).map((s) => (<SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {DOC_TYPES.map((t) => (<SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No documents.</p>}
        {filtered.map((d) => (
          <Card key={d.id}><CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{d.document_name}</p>
                <p className="text-xs text-muted-foreground">{nameById.get(d.user_id) || d.user_id.slice(0, 8)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{(d.document_type || "general").replace(/_/g, " ")}</Badge>
              <Button size="icon" variant="ghost" disabled={loadingPreview} onClick={() => openDoc(d.file_url, d.document_name, d.document_type || "general")}>
                {loadingPreview && previewDoc?.path === d.file_url ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                )}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(d.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Inline Document Viewer Modal */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] p-0 flex flex-col bg-surface/90 backdrop-blur-md border border-primary/10 rounded-3xl overflow-hidden shadow-premium">
          <div className="flex items-center justify-between gap-4 p-5 border-b border-primary/5 bg-primary/5 sticky top-0 z-10">
            <div>
              <DialogTitle className="font-display text-base font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {previewDoc?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                Type: {previewDoc?.type.replace(/_/g, " ")}
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
                  a.download = previewDoc?.name || "document";
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
