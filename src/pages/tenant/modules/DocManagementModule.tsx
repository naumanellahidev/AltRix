import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  FolderOpen,
  FileText,
  AlertTriangle,
  PenTool,
  Plus,
  Trash2,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle,
  Clock,
  User,
  Users
} from "lucide-react";
import { toast } from "sonner";

interface SchoolDocument {
  id: string;
  owner_type: string;
  owner_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  expiry_date: string | null;
  created_at: string;
}

interface DocTemplate {
  id: string;
  template_name: string;
  body_content: string;
}

interface StudentOption {
  id: string;
  name: string;
  roll_number: string;
}

export default function DocManagementModule() {
  const [activeTab, setActiveTab] = useState("vault");
  const [documents, setDocuments] = useState<SchoolDocument[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<SchoolDocument[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Selector states
  const [selectedOwnerType, setSelectedOwnerType] = useState("student");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");

  // Upload Modal State
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("cnic");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileUrl, setUploadFileUrl] = useState("https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=80");
  const [uploadExpiry, setUploadExpiry] = useState("");

  // Certificate Generator States
  const [selectedTemplateName, setSelectedTemplateName] = useState("bonafide");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [renderedHtml, setRenderedHtml] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("Principal");
  const [issuedCert, setIssuedCert] = useState<any | null>(null);

  const loadDocuments = async () => {
    try {
      const res = await apiClient.get("/documents", {
        params: {
          owner_type: selectedOwnerType,
          owner_id: selectedOwnerId || undefined,
        },
      });
      setDocuments(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAlerts = async () => {
    try {
      const res = await apiClient.get("/documents/alerts");
      setExpiringDocs(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await apiClient.get("/documents/templates");
      setTemplates(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStudents = async () => {
    try {
      const res = await apiClient.get("/parents/children");
      setStudents(
        (res.data || []).map((c: any) => ({
          id: c.student_id,
          name: `${c.first_name} ${c.last_name || ""}`.trim(),
          roll_number: c.roll_number || "N/A",
        }))
      );
      if (res.data && res.data.length > 0) {
        setSelectedOwnerId(res.data[0].student_id);
        setSelectedStudentId(res.data[0].student_id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStudents();
    loadAlerts();
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedOwnerId) {
      loadDocuments();
    }
  }, [selectedOwnerType, selectedOwnerId]);

  // Render template preview on variable changes
  useEffect(() => {
    if (!selectedStudentId || !selectedTemplateName) return;
    apiClient
      .post("/documents/templates/render", null, {
        params: {
          template_name: selectedTemplateName,
          student_id: selectedStudentId,
        },
      })
      .then((res) => {
        setRenderedHtml(res.data.rendered_html);
      })
      .catch(console.error);
  }, [selectedTemplateName, selectedStudentId]);

  const handleUpload = async () => {
    if (!uploadFileName || !selectedOwnerId) {
      toast.error("Document name and profile selection are required");
      return;
    }
    try {
      await apiClient.post("/documents", {
        owner_type: selectedOwnerType,
        owner_id: selectedOwnerId,
        document_type: uploadDocType,
        file_name: uploadFileName,
        file_url: uploadFileUrl,
        expiry_date: uploadExpiry || null,
      });
      toast.success("Document added to vault successfully!");
      setShowUploadDialog(false);
      setUploadFileName("");
      setUploadExpiry("");
      loadDocuments();
      loadAlerts();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add document to vault");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/documents/${id}`);
      toast.success("Document removed");
      loadDocuments();
      loadAlerts();
    } catch (err) {
      console.error(err);
      toast.error("Could not remove document");
    }
  };

  const handleIssueCertificate = async () => {
    if (!selectedStudentId || !renderedHtml) return;
    try {
      const res = await apiClient.post("/documents/templates/issue", {
        student_id: selectedStudentId,
        template_name: selectedTemplateName,
        content: renderedHtml,
        digital_signature_name: signatureName || null,
        digital_signature_title: signatureTitle || null,
      });
      toast.success("Certificate issued and signed digitally!");
      setIssuedCert(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to issue digital certificate");
    }
  };

  const printCertificate = () => {
    if (!issuedCert) return;
    const w = window.open("", "_blank", "width=700,height=550");
    if (!w) return;
    const html = `
      <!doctype html>
      <html>
      <head>
        <title>Certificate - ${issuedCert.template_name}</title>
        <style>
          body { font-family: 'Outfit', sans-serif; text-align: center; padding: 50px; color: #1e293b; background: #fafaf9; }
          .border-frame { border: 12px double #1e3a8a; border-radius: 4px; padding: 40px; background: #fff; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
          h1 { color: #1e3a8a; font-size: 28px; margin: 0 0 20px; text-transform: uppercase; }
          .content { font-size: 16px; line-height: 1.6; margin: 30px 0; color: #475569; }
          .signature-box { border-top: 1px solid #cbd5e1; display: inline-block; padding-top: 8px; margin-top: 40px; width: 220px; }
          .sig-name { font-weight: bold; color: #0f172a; }
          .sig-title { font-size: 12px; color: #64748b; }
          @media print { body { background: none; padding: 0; } .border-frame { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="border-frame">
          <h1>AltRix Academy</h1>
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-top: -10px;">Official Document</div>
          <div class="content">${issuedCert.content}</div>
          
          <div class="signature-box">
            <div class="sig-name">${issuedCert.digital_signature_name || "AUTHORIZED SIGNATORY"}</div>
            <div class="sig-title">${issuedCert.digital_signature_title || "Principal Registrar"}</div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Digitally Signed: ${format(new Date(issuedCert.signed_at), "PPpp")}</div>
          </div>
        </div>
        <script>setTimeout(() => window.print(), 300)</script>
      </body>
      </html>
    `;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">DMS Document Board</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Manage student & staff document vaults, track expiring certifications, and render digitally signed certificates.
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} className="bg-primary text-primary-foreground font-semibold">
          <Plus className="h-4 w-4 mr-2" /> Upload Document
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="vault" className="gap-2 rounded-lg">
            <FolderOpen className="h-4 w-4" /> Vaults Folders
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 rounded-lg">
            <PenTool className="h-4 w-4" /> Certificate Builder
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 rounded-lg">
            <AlertTriangle className="h-4 w-4" /> Expiry Alerts ({expiringDocs.length})
          </TabsTrigger>
        </TabsList>

        {/* Vaults Folders Tab */}
        <TabsContent value="vault" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Filters sidebar */}
            <Card className="lg:col-span-1 shadow-soft border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Vault Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Profile Type</Label>
                  <select
                    value={selectedOwnerType}
                    onChange={(e) => {
                      setSelectedOwnerType(e.target.value);
                      setSelectedOwnerId(""); // reset selection
                    }}
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                  >
                    <option value="student">Student Profile</option>
                    <option value="staff">Staff/Teacher Profile</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Select Profile</Label>
                  <select
                    value={selectedOwnerId}
                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                  >
                    <option value="">— Select Target profile —</option>
                    {students.map((std) => (
                      <option key={std.id} value={std.id}>{std.name} (Roll: {std.roll_number})</option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Documents Table */}
            <Card className="lg:col-span-3 shadow-soft border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Vault Files</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="font-semibold pl-6">Document Name</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Expiry Alert</TableHead>
                      <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                          No document scans uploaded for this profile folder.
                        </TableCell>
                      </TableRow>
                    ) : (
                      documents.map((doc) => (
                        <TableRow key={doc.id} className="hover:bg-muted/30">
                          <TableCell className="font-bold text-foreground pl-6">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                              <span>{doc.file_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs uppercase font-medium">{doc.document_type}</TableCell>
                          <TableCell className="text-xs">
                            {doc.expiry_date ? (
                              <Badge variant="outline" className="border-amber-500/30 text-amber-600 font-semibold">
                                Expires: {format(new Date(doc.expiry_date), "PP")}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Lifetime</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6 space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(doc.file_url, "_blank")}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(doc.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Certificate templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Editor fields card */}
            <Card className="lg:col-span-1 shadow-soft border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Render Certificate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Certificate Template</Label>
                  <select
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                  >
                    <option value="bonafide">Bonafide Certificate</option>
                    <option value="transfer_certificate">Transfer Certificate</option>
                    <option value="character_certificate">Character Certificate</option>
                    <option value="noc">No Objection Certificate (NOC)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Target Student</Label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                  >
                    {students.map((std) => (
                      <option key={std.id} value={std.id}>{std.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 border-t pt-4">
                  <Label>Digital Signatory Name</Label>
                  <Input
                    placeholder="e.g. Dr. Haris Ali"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Signatory Title</Label>
                  <Input
                    placeholder="e.g. Principal Registrar"
                    value={signatureTitle}
                    onChange={(e) => setSignatureTitle(e.target.value)}
                  />
                </div>

                <Button onClick={handleIssueCertificate} className="w-full bg-primary text-primary-foreground font-semibold">
                  <ShieldCheck className="h-4 w-4 mr-2" /> Issue Signed Certificate
                </Button>
              </CardContent>
            </Card>

            {/* Rendering Live preview frame */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="border-b">
                  <CardTitle className="text-base font-bold font-display">Certificate Preview</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {renderedHtml ? (
                    <div className="space-y-6">
                      {/* Document frame display */}
                      <div className="border-8 double border-primary/40 rounded p-6 bg-muted/20 min-h-[160px] text-center text-foreground space-y-4">
                        <h4 className="text-xl font-bold font-display text-primary">ALTRIX ACADEMY</h4>
                        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} className="text-sm leading-relaxed text-muted-foreground px-4" />
                      </div>
                      
                      {issuedCert && (
                        <div className="flex gap-3 justify-end border-t pt-4">
                          <Button onClick={printCertificate} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5">
                            <Printer className="h-4 w-4" /> Print Document Certificate
                          </Button>
                          <Button onClick={() => setIssuedCert(null)} variant="outline">
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      Select variables to load preview.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Expiry alerts list Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Impending Expiration Alerts (CNICs/Contracts)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Owner Type</TableHead>
                    <TableHead className="font-semibold">Document Name</TableHead>
                    <TableHead className="font-semibold">Expiry Date</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                        No documents are expiring within the next 30 days. Active alerts are clear.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expiringDocs.map((doc) => (
                      <TableRow key={doc.id} className="hover:bg-muted/30">
                        <TableCell className="pl-6 font-bold text-foreground capitalize">
                          {doc.owner_type} folder
                        </TableCell>
                        <TableCell className="font-medium text-muted-foreground">{doc.file_name}</TableCell>
                        <TableCell className="text-xs font-semibold text-destructive">
                          {format(new Date(doc.expiry_date!), "PP")}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Badge variant="destructive" className="font-semibold text-white animate-pulse">
                            EXPIRING SOON
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Upload to Vault Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Profile Category</Label>
                <select
                  value={selectedOwnerType}
                  onChange={(e) => setSelectedOwnerType(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value="student">Student</option>
                  <option value="staff">Staff/Teacher</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Choose Account</Label>
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  {students.map((std) => (
                    <option key={std.id} value={std.id}>{std.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Document Name</Label>
              <Input
                placeholder="e.g. Birth Certificate Scan"
                value={uploadFileName}
                onChange={(e) => setUploadFileName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value="cnic">CNIC / ID Card</option>
                  <option value="contract">Employment Contract</option>
                  <option value="birth_certificate">Birth Certificate</option>
                  <option value="degree">Academic Degree</option>
                  <option value="cv">CV / Resume</option>
                  <option value="medical">Medical Record</option>
                  <option value="other">Other scan</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date (Optional)</Label>
                <Input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Simulated Scan File URL</Label>
              <Input
                value={uploadFileUrl}
                onChange={(e) => setUploadFileUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowUploadDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleUpload} className="bg-primary text-primary-foreground font-semibold">
              Save Document Vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
