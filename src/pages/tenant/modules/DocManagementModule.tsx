import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  MessageCircle,
  PenTool,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import {
  describeShare,
  downloadCertificate,
  printCertificate,
  shareCertificate,
  type Signatory,
} from "@/lib/documents";

/**
 * Document vault and certificates.
 *
 * This screen used to call endpoints that did not exist, so nothing on it
 * worked: the vault's "upload" saved a stock photograph's URL (labelled
 * "Simulated Scan File URL") as the student's document, and certificates were
 * printed from a pop-up with "AltRix Academy" across the top and a "digitally
 * signed" line whether or not anyone had signed. It now stores real files,
 * issues numbered, verifiable certificates, and prints them through the
 * document system.
 */

const VAULT_BUCKET = "student-documents";

const DOCUMENT_CATEGORIES = [
  "B-Form / Birth Certificate",
  "Parent CNIC",
  "Previous School Leaving Certificate",
  "Medical Record",
  "Photograph",
  "Result Card",
  "Other",
];

interface VaultDocument {
  id: string;
  student_id: string;
  document_name: string;
  category: string;
  file_url: string;
  expires_at: string | null;
  created_at: string | null;
}

interface StudentOption {
  id: string;
  name: string;
  detail: string;
}

interface CertificateRow {
  id: string;
  student_id: string;
  student_name: string | null;
  certificate_type: string;
  certificate_number: string;
  issue_date: string | null;
  remarks: string | null;
  status: string;
}

interface CertificateType {
  type: string;
  title: string;
}

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function DocManagementModule() {
  const [activeTab, setActiveTab] = useState("vault");
  const [students, setStudents] = useState<StudentOption[]>([]);

  // Vault
  const [studentId, setStudentId] = useState("");
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [expiring, setExpiring] = useState<VaultDocument[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Certificates
  const [types, setTypes] = useState<CertificateType[]>([]);
  const [certType, setCertType] = useState("bonafide");
  const [certStudentId, setCertStudentId] = useState("");
  const [certRemarks, setCertRemarks] = useState("");
  const [signatory, setSignatory] = useState<Signatory>({ name: "", title: "Principal" });
  const [issuing, setIssuing] = useState(false);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const studentName = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await apiClient.get("/students", { params: { page_size: 200 } });
      const raw = res?.data;
      const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
      setStudents(
        list.map((c: any) => ({
          id: c.id,
          name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.full_name || "Unnamed student",
          detail: [c.roll_number ? `Roll ${c.roll_number}` : null, c.registration_number].filter(Boolean).join(" · "),
        })),
      );
    } catch (err) {
      toast.error(`Students could not be loaded: ${errorText(err, "unknown error")}`);
    }
  }, []);

  const loadDocuments = useCallback(async (id: string) => {
    if (!id) return setDocuments([]);
    setVaultLoading(true);
    try {
      const res = await apiClient.get(`/documents/student/${id}`);
      setDocuments(res.data ?? []);
    } catch (err) {
      toast.error(`Documents could not be loaded: ${errorText(err, "unknown error")}`);
    } finally {
      setVaultLoading(false);
    }
  }, []);

  const loadExpiring = useCallback(async () => {
    try {
      const res = await apiClient.get("/documents/alerts");
      setExpiring(res.data ?? []);
    } catch (err) {
      toast.error(`Expiry alerts could not be loaded: ${errorText(err, "unknown error")}`);
    }
  }, []);

  const loadCertificates = useCallback(async () => {
    try {
      const [typesRes, certsRes] = await Promise.all([
        apiClient.get("/documents/certificates/types"),
        apiClient.get("/documents/certificates"),
      ]);
      setTypes(typesRes.data ?? []);
      setCertificates(certsRes.data ?? []);
    } catch (err) {
      toast.error(`Certificates could not be loaded: ${errorText(err, "unknown error")}`);
    }
  }, []);

  useEffect(() => {
    void loadStudents();
    void loadExpiring();
    void loadCertificates();
  }, [loadStudents, loadExpiring, loadCertificates]);

  useEffect(() => {
    void loadDocuments(studentId);
  }, [studentId, loadDocuments]);

  // ── Vault ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!studentId) return toast.error("Choose the student the document belongs to.");
    if (!uploadFile) return toast.error("Choose the file to upload.");
    if (!uploadName.trim()) return toast.error("Give the document a name.");
    setUploading(true);
    const id = toast.loading(`Uploading ${uploadFile.name}…`);
    try {
      const safeName = uploadFile.name.replace(/[^\w.-]+/g, "_");
      const path = `${studentId}/${Date.now()}-${safeName}`;
      const { data, error } = await api.storage.from(VAULT_BUCKET).upload(path, uploadFile);
      if (error || !data?.path) throw error ?? new Error("the file was not stored");
      await apiClient.post("/documents/upload", {
        student_id: studentId,
        document_name: uploadName.trim(),
        category: uploadCategory,
        file_url: data.path,
        expires_at: uploadExpiry || null,
      });
      toast.success(`${uploadName.trim()} added to the vault`, { id });
      setUploadOpen(false);
      setUploadName("");
      setUploadExpiry("");
      setUploadFile(null);
      void loadDocuments(studentId);
      void loadExpiring();
    } catch (err) {
      toast.error(`The document was not added: ${errorText(err, "upload failed")}`, { id });
    } finally {
      setUploading(false);
    }
  };

  const openDocument = async (doc: VaultDocument) => {
    const { data, error } = await api.storage.from(VAULT_BUCKET).createSignedUrl(doc.file_url, 300);
    if (error || !data?.signedUrl) return toast.error("The file could not be opened.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const deleteDocument = async (doc: VaultDocument) => {
    if (!confirm(`Remove "${doc.document_name}" from the vault?`)) return;
    try {
      await apiClient.delete(`/documents/${doc.id}`);
      toast.success("Document removed");
      void loadDocuments(studentId);
      void loadExpiring();
    } catch (err) {
      toast.error(`The document was not removed: ${errorText(err, "unknown error")}`);
    }
  };

  // ── Certificates ──────────────────────────────────────────────────────────
  const issueCertificate = async () => {
    if (!certStudentId) return toast.error("Choose the student the certificate is for.");
    setIssuing(true);
    const id = toast.loading("Issuing certificate…");
    try {
      const res = await apiClient.post("/documents/certificates/generate", {
        student_id: certStudentId,
        certificate_type: certType,
        remarks: certRemarks.trim() || null,
      });
      toast.success(`Issued ${res.data.certificate_number}`, { id });
      setCertRemarks("");
      await loadCertificates();
      await certificateAction(res.data as CertificateRow, "download");
    } catch (err) {
      toast.error(`The certificate was not issued: ${errorText(err, "unknown error")}`, { id });
    } finally {
      setIssuing(false);
    }
  };

  const certificateAction = async (cert: CertificateRow, kind: "print" | "download" | "share") => {
    const id = toast.loading("Preparing certificate…");
    try {
      if (kind === "share") {
        const outcome = await shareCertificate(cert.id, signatory);
        const { tone, message } = describeShare(outcome);
        if (tone === "error") toast.error(message, { id });
        else if (tone === "success") toast.success(message, { id });
        else toast.info(message, { id, duration: 9000 });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printCertificate(cert.id, signatory) : await downloadCertificate(cert.id, signatory);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}, but ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (err) {
      toast.error(`The certificate could not be prepared: ${errorText(err, "unknown error")}`, { id });
    }
  };

  const revokeCertificate = async () => {
    if (!revoking) return;
    if (revokeReason.trim().length < 3) return toast.error("Give a reason for revoking it.");
    try {
      await apiClient.post(`/documents/certificates/${revoking.id}/revoke`, { reason: revokeReason.trim() });
      toast.success(`${revoking.certificate_number} revoked — its QR code now verifies as revoked.`);
      setRevoking(null);
      setRevokeReason("");
      void loadCertificates();
    } catch (err) {
      toast.error(`Not revoked: ${errorText(err, "unknown error")}`);
    }
  };

  const typeTitle = (type: string) => types.find((t) => t.type === type)?.title ?? type;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Documents &amp; Certificates</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Student document vault, expiry alerts, and numbered certificates that anyone can verify by QR code.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2" disabled={!studentId}>
          <Upload className="h-4 w-4" /> Upload document
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="vault" className="gap-2 rounded-lg">
            <FolderOpen className="h-4 w-4" /> Vault
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 rounded-lg">
            <PenTool className="h-4 w-4" /> Certificates
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 rounded-lg">
            <AlertTriangle className="h-4 w-4" /> Expiry alerts
            {expiring.length > 0 && <Badge variant="destructive" className="ml-1">{expiring.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Vault ─────────────────────────────────────────────────── */}
        <TabsContent value="vault" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold font-display">Student</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full md:w-96 h-10 px-3 border rounded-md text-sm bg-background"
                aria-label="Student"
              >
                <option value="">Choose a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.detail ? ` — ${s.detail}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">Staff documents are kept in HR → Documents.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold font-display">
                {studentId ? `Documents — ${studentName.get(studentId) ?? ""}` : "Documents"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!studentId ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Choose a student to see their documents.</p>
              ) : vaultLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No documents in this student's vault yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.document_name}</TableCell>
                        <TableCell>{d.category}</TableCell>
                        <TableCell>{d.created_at ? format(new Date(d.created_at), "d MMM yyyy") : "—"}</TableCell>
                        <TableCell>{d.expires_at ? format(new Date(d.expires_at), "d MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => openDocument(d)} className="gap-1">
                            <FileText className="h-3.5 w-3.5" /> Open
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteDocument(d)} aria-label={`Remove ${d.document_name}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Certificates ──────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold font-display">Issue a certificate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Certificate</Label>
                  <select value={certType} onChange={(e) => setCertType(e.target.value)} className="w-full h-10 px-3 border rounded-md text-sm bg-background">
                    {(types.length ? types : [{ type: "bonafide", title: "Bonafide Certificate" }]).map((t) => (
                      <option key={t.type} value={t.type}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Student</Label>
                  <select value={certStudentId} onChange={(e) => setCertStudentId(e.target.value)} className="w-full h-10 px-3 border rounded-md text-sm bg-background">
                    <option value="">Choose a student…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.detail ? ` — ${s.detail}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Remarks / purpose (printed on the certificate)</Label>
                  <Textarea
                    value={certRemarks}
                    onChange={(e) => setCertRemarks(e.target.value)}
                    placeholder={certType === "transfer_certificate" ? "e.g. All dues cleared. Leaving on transfer of parent's employment." : "e.g. for the purpose of opening a bank account"}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Signed by (name)</Label>
                    <Input value={signatory.name ?? ""} onChange={(e) => setSignatory((s) => ({ ...s, name: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input value={signatory.title ?? ""} onChange={(e) => setSignatory((s) => ({ ...s, title: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each certificate gets the next number in the school's sequence and a QR code that verifies it. It is printed
                  with a signature line for a pen signature and the school seal.
                </p>
                <Button onClick={issueCertificate} disabled={issuing || !certStudentId} className="w-full gap-2">
                  {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Issue and download
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold font-display">Issued certificates</CardTitle>
              </CardHeader>
              <CardContent>
                {certificates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No certificates have been issued yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.certificate_number}</TableCell>
                          <TableCell>{c.student_name ?? studentName.get(c.student_id) ?? "—"}</TableCell>
                          <TableCell className="text-xs">{typeTitle(c.certificate_type)}</TableCell>
                          <TableCell>
                            {c.status === "valid" ? (
                              <Badge variant="secondary" className="gap-1"><CheckCircle className="h-3 w-3 text-emerald-600" /> Valid</Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> {c.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" onClick={() => certificateAction(c, "print")} aria-label="Print"><Printer className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => certificateAction(c, "download")} aria-label="Download PDF"><Download className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => certificateAction(c, "share")} aria-label="Share on WhatsApp"><MessageCircle className="h-4 w-4 text-green-600" /></Button>
                            {c.status === "valid" && (
                              <Button size="icon" variant="ghost" onClick={() => setRevoking(c)} aria-label="Revoke"><Ban className="h-4 w-4 text-destructive" /></Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Alerts ────────────────────────────────────────────────── */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold font-display text-destructive flex items-center gap-2">
                <Clock className="h-4 w-4" /> Documents expiring within 30 days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expiring.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nothing is due to expire in the next 30 days.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiring.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{studentName.get(d.student_id) ?? "—"}</TableCell>
                        <TableCell>{d.document_name}</TableCell>
                        <TableCell className="text-destructive font-medium">{d.expires_at ? format(new Date(d.expires_at), "d MMM yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Add to {studentName.get(studentId) ?? "student"}'s vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">PDF, image or Word document, up to 25 MB.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Document name</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. B-Form (NADRA)" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="w-full h-10 px-3 border rounded-md text-sm bg-background">
                  {DOCUMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date (optional)</Label>
                <Input type="date" value={uploadExpiry} onChange={(e) => setUploadExpiry(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading} className="gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke dialog */}
      <Dialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Revoke {revoking?.certificate_number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A revoked certificate stays on record, prints as VOID, and its QR code reports it as revoked to anyone who scans it.
          </p>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={3} placeholder="e.g. Issued with an incorrect date of birth; replaced by a new certificate." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="destructive" onClick={revokeCertificate}>Revoke certificate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
