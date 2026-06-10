import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Check, FileText, Plus, Trash, Mail, MessageSquare, Edit2, Save } from "lucide-react";

type Template = {
  id: string;
  name: string;
  type: "email" | "sms";
  subject?: string;
  body: string;
  category: string;
};

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "welcome-email",
    name: "Admission Inquiry Welcome",
    type: "email",
    subject: "Thank you for inquiring about {SchoolName}",
    body: "Dear {ParentName},\n\nThank you for your interest in {SchoolName}. We are excited to assist you with your inquiry regarding admissions. \n\nWe have received your request and our admissions counselor will get in touch with you shortly. In the meantime, please feel free to review our school brochure.\n\nBest regards,\nAdmissions Team\n{SchoolName}",
    category: "Inquiry"
  },
  {
    id: "followup-sms",
    name: "SMS Call Follow-up",
    type: "sms",
    body: "Hi {ParentName}, this is the Admissions Team at {SchoolName}. We tried calling you regarding your inquiry. Please let us know a convenient time to connect! Thanks.",
    category: "Follow-up"
  },
  {
    id: "interview-invite",
    name: "Assessment & Interview Invite",
    type: "email",
    subject: "Admissions Assessment Invitation - {SchoolName}",
    body: "Dear {ParentName},\n\nWe are pleased to invite {StudentName} for an admission assessment and interaction session. \n\nPlease let us know if you are available this week for a school visit. \n\nWarm regards,\n{SchoolName} Admissions Office",
    category: "Interview"
  },
  {
    id: "doc-reminder-sms",
    name: "Documents Pending Reminder",
    type: "sms",
    body: "Dear {ParentName}, we are currently processing {StudentName}'s admission application. Please share the pending academic reports at your earliest convenience to avoid delays. Thank you, {SchoolName} team.",
    category: "Reminder"
  }
];

export function MarketingTemplatesModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("Our School");
  
  const [templates, setTemplates] = useState<Template[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit / Create State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"email" | "sms">("email");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    (async () => {
      if (!schoolSlug) return;
      const { data } = await supabase.from("schools").select("id,name").eq("slug", schoolSlug).maybeSingle();
      if (data) {
        setSchoolId(data.id);
        setSchoolName(data.name);
      }
    })();
  }, [schoolSlug]);

  // Load Templates & Leads
  useEffect(() => {
    if (!schoolId) return;

    // Fetch leads for placeholder replacement preview
    (async () => {
      const { data } = await supabase
        .from("crm_leads")
        .select("id,full_name,email,phone")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      setLeads((data ?? []) as Lead[]);
    })();

    // Load templates from localStorage scoped by schoolId
    const localKey = `altrix:marketing:templates:${schoolId}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      setTemplates(JSON.parse(saved));
    } else {
      localStorage.setItem(localKey, JSON.stringify(DEFAULT_TEMPLATES));
      setTemplates(DEFAULT_TEMPLATES);
    }
  }, [schoolId]);

  const saveTemplatesToStorage = (updated: Template[]) => {
    if (!schoolId) return;
    setTemplates(updated);
    localStorage.setItem(`altrix:marketing:templates:${schoolId}`, JSON.stringify(updated));
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  // Helper to replace template placeholders
  const getSubstitutedContent = (template: Template) => {
    const parentName = selectedLead ? selectedLead.full_name : "[Parent Name]";
    const studentName = selectedLead ? selectedLead.full_name.split(" ")[0] + "'s Child" : "[Student Name]";
    
    let sub = template.subject ? template.subject : "";
    let body = template.body;

    const replacements = {
      "{ParentName}": parentName,
      "{StudentName}": studentName,
      "{SchoolName}": schoolName,
    };

    Object.entries(replacements).forEach(([key, val]) => {
      sub = sub.replace(new RegExp(key, "g"), val);
      body = body.replace(new RegExp(key, "g"), val);
    });

    return { subject: sub, body };
  };

  const handleCopy = (t: Template) => {
    const { subject, body } = getSubstitutedContent(t);
    const textToCopy = t.type === "email" ? `Subject: ${subject}\n\n${body}` : body;
    
    navigator.clipboard.writeText(textToCopy);
    copiedIdState(t.id);
  };

  const copiedIdState = (id: string) => {
    setCopiedId(id);
    toast.success("Template copied with variables replaced!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartEdit = (t: Template) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditType(t.type);
    setEditSubject(t.subject || "");
    setEditBody(t.body);
    setEditCategory(t.category);
    setIsCreating(false);
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editBody.trim()) {
      return toast.error("Name and Body are required");
    }

    let updated: Template[];
    if (isCreating) {
      const newT: Template = {
        id: `tpl-${Date.now()}`,
        name: editName,
        type: editType,
        subject: editType === "email" ? editSubject : undefined,
        body: editBody,
        category: editCategory || "General"
      };
      updated = [...templates, newT];
      toast.success("Outreach template created!");
    } else {
      updated = templates.map(t => {
        if (t.id === editingId) {
          return {
            ...t,
            name: editName,
            type: editType,
            subject: editType === "email" ? editSubject : undefined,
            body: editBody,
            category: editCategory || "General"
          };
        }
        return t;
      });
      toast.success("Template updated successfully!");
    }

    saveTemplatesToStorage(updated);
    setEditingId(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    saveTemplatesToStorage(updated);
    toast.success("Template deleted");
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingId("new");
    setEditName("");
    setEditType("email");
    setEditSubject("");
    setEditBody("");
    setEditCategory("General");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Outreach & Communications Templates</h2>
          <p className="text-sm text-muted-foreground">Standardized messaging templates for admissions staff and counselors.</p>
        </div>
        <Button variant="hero" className="gap-2" onClick={handleStartCreate}>
          <Plus className="h-4 w-4" /> Create Template
        </Button>
      </div>

      {/* Variables Config Card */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Active Placeholder Context</h4>
            <p className="text-xs text-muted-foreground">
              Select a lead to automatically fill variables like <code className="text-primary font-mono text-[11px]">{`{ParentName}`}</code>, <code className="text-primary font-mono text-[11px]">{`{StudentName}`}</code>, and <code className="text-primary font-mono text-[11px]">{`{SchoolName}`}</code>.
            </p>
          </div>
          <div className="w-full md:w-72">
            <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Preview using lead data..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none_clear">Clear - use placeholders</SelectItem>
                {leads.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-2 space-y-4">
          {templates.map(t => {
            const { subject, body } = getSubstitutedContent(t);
            return (
              <Card key={t.id} className="hover:shadow-md transition-all shadow-sm">
                <CardHeader className="p-4 flex flex-row items-start justify-between pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.type === "email" ? (
                        <Mail className="h-4 w-4 text-primary" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                      )}
                      <h3 className="font-semibold text-sm tracking-tight">{t.name}</h3>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 uppercase font-semibold">
                        {t.category}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {t.type === "email" ? "Email Draft Template" : "SMS/WhatsApp outreach draft"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleStartEdit(t)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  {t.type === "email" && (
                    <div className="rounded-lg bg-muted/40 p-2.5 border text-xs font-mono">
                      <span className="text-muted-foreground">Subject: </span>
                      <span>{subject || t.subject}</span>
                    </div>
                  )}
                  <div className="rounded-lg bg-muted/40 p-3 border text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed max-h-40 overflow-y-auto">
                    {body}
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="soft" className="gap-1 text-xs" onClick={() => handleCopy(t)}>
                      {copiedId === t.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy Outreach Draft
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Editor sidebar */}
        <div className="space-y-4">
          {editingId ? (
            <Card className="sticky top-6 shadow-md">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {isCreating ? "New Template" : "Edit Template"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Template Name</label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Call Follow-up SMS" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Select value={editType} onValueChange={(v: "email" | "sms") => setEditType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS / WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. Follow-up, Interview, Offer" className="text-sm" />
                </div>
                {editType === "email" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Subject Line</label>
                    <Input value={editSubject} onChange={e => setEditSubject(e.target.value)} placeholder="Subject Line" className="text-sm" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-muted-foreground">Message Body</label>
                    <span className="text-[10px] text-muted-foreground">Supports variable tokens</span>
                  </div>
                  <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8} placeholder="Dear {ParentName}, ..." className="text-sm font-sans" />
                </div>

                {/* Token Helper */}
                <div className="rounded-lg bg-muted/40 p-2.5 border space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Available Placeholder Tokens</p>
                  <div className="flex flex-wrap gap-1">
                    {["{ParentName}", "{StudentName}", "{SchoolName}"].map(token => (
                      <code
                        key={token}
                        onClick={() => setEditBody(prev => prev + token)}
                        className="text-[10px] bg-secondary hover:bg-primary/10 cursor-pointer py-0.5 px-1.5 rounded border font-mono text-primary"
                      >
                        {token}
                      </code>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" className="flex-1 text-xs" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="hero" className="flex-1 text-xs gap-1.5" onClick={handleSaveEdit}>
                    <Save className="h-3 w-3" /> Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm p-4">
              <h4 className="text-sm font-semibold mb-2">Templated Outreach</h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Maintain consistency in outreach, email campaigns, and SMS templates. Standard placeholders are automatically populated with lead profiles details.
              </p>
              <div className="text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Quick Tips:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Use dynamic tokens inside subjects and body contexts.</li>
                  <li>Click on tokens to insert them directly at the end of the text.</li>
                  <li>Select preview leads to double-check formatting before copying.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
