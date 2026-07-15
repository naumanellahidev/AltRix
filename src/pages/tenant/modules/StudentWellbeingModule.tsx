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
  HeartPulse,
  Activity,
  Plus,
  Stethoscope,
  Smile,
  AlertOctagon,
  CalendarDays,
  FileText,
  PhoneCall,
  Search,
  CheckCircle,
  Clock,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";

interface MedicalRecord {
  id: string;
  student_id: string;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  health_insurance_info: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface InfirmaryVisit {
  id: string;
  student_id: string;
  visit_date: string;
  reason: string;
  treatment_given: string | null;
  doctor_notes: string | null;
  status: string;
}

interface Vaccination {
  id: string;
  student_id: string;
  vaccine_name: string;
  dose_number: number;
  administered_date: string;
  next_due_date: string | null;
}

interface FirstAidIncident {
  id: string;
  student_id: string;
  incident_description: string;
  first_aid_given: string;
  reporter_user_id: string;
  incident_date: string;
}

interface MedicalContact {
  id: string;
  contact_name: string;
  specialty: string | null;
  phone: string;
  hospital_name: string | null;
  address: string | null;
}

interface StudentOption {
  id: string;
  name: string;
}

export default function StudentWellbeingModule() {
  const [activeTab, setActiveTab] = useState("medical");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // Data lists
  const [medRecords, setMedRecords] = useState<MedicalRecord[]>([]);
  const [infirmaryLogs, setInfirmaryLogs] = useState<InfirmaryVisit[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [incidents, setIncidents] = useState<FirstAidIncident[]>([]);
  const [contacts, setContacts] = useState<MedicalContact[]>([]);
  
  // Wellbeing index
  const [wellbeingStats, setWellbeingStats] = useState<any | null>(null);

  // Modal display toggles
  const [showMedicalDialog, setShowMedicalDialog] = useState(false);
  const [showInfirmaryDialog, setShowInfirmaryDialog] = useState(false);
  const [showVaccineDialog, setShowVaccineDialog] = useState(false);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showSurveyDialog, setShowSurveyDialog] = useState(false);

  // Forms state
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [insurance, setInsurance] = useState("");
  const [emerContact, setEmerContact] = useState("");
  const [emerPhone, setEmerPhone] = useState("");

  // Infirmary Form
  const [infReason, setInfReason] = useState("");
  const [infTreatment, setInfTreatment] = useState("");
  const [infNotes, setInfNotes] = useState("");
  const [infStatus, setInfStatus] = useState("treated");

  // Vaccine Form
  const [vaxName, setVaxName] = useState("");
  const [vaxDose, setVaxDose] = useState(1);
  const [vaxAdminDate, setVaxAdminDate] = useState("");
  const [vaxDueDate, setVaxDueDate] = useState("");

  // Incident Form
  const [incDesc, setIncDesc] = useState("");
  const [incFirstAid, setIncFirstAid] = useState("");
  const [incDate, setIncDate] = useState("");

  // Medical Contact Form
  const [cName, setCName] = useState("");
  const [cSpecialty, setCSpecialty] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cHospital, setCHospital] = useState("");
  const [cAddress, setCAddress] = useState("");

  // Wellbeing survey check-in form
  const [surveyMood, setSurveyMood] = useState(8);
  const [surveyStress, setSurveyStress] = useState(3);
  const [surveyNotes, setSurveyNotes] = useState("");

  const loadStudents = async () => {
    try {
      const res = await apiClient.get("/parents/children");
      setStudents(
        (res.data || []).map((c: any) => ({
          id: c.student_id,
          name: `${c.first_name} ${c.last_name || ""}`.trim(),
        }))
      );
      if (res.data && res.data.length > 0) {
        setSelectedStudentId(res.data[0].student_id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadMedicalRecords = async () => {
    try {
      const res = await apiClient.get("/wellbeing/medical-records", {
        params: { student_id: selectedStudentId || undefined },
      });
      setMedRecords(res.data || []);
      if (res.data && res.data.length > 0) {
        const active = res.data[0];
        setAllergies(active.allergies || "");
        setConditions(active.conditions || "");
        setMedications(active.medications || "");
        setInsurance(active.health_insurance_info || "");
        setEmerContact(active.emergency_contact_name || "");
        setEmerPhone(active.emergency_contact_phone || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadInfirmary = async () => {
    try {
      const res = await apiClient.get("/wellbeing/infirmary", {
        params: { student_id: selectedStudentId || undefined },
      });
      setInfirmaryLogs(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadVaccinations = async () => {
    try {
      const res = await apiClient.get("/wellbeing/vaccinations", {
        params: { student_id: selectedStudentId || undefined },
      });
      setVaccinations(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadIncidents = async () => {
    try {
      const res = await apiClient.get("/wellbeing/first-aid", {
        params: { student_id: selectedStudentId || undefined },
      });
      setIncidents(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDirectory = async () => {
    try {
      const res = await apiClient.get("/wellbeing/directory");
      setContacts(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadWellbeingStats = async () => {
    try {
      const res = await apiClient.get("/wellbeing/surveys/summary");
      setWellbeingStats(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadStudents();
    loadDirectory();
    loadWellbeingStats();
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      loadMedicalRecords();
      loadInfirmary();
      loadVaccinations();
      loadIncidents();
    }
  }, [selectedStudentId]);

  const handleUpsertMedical = async () => {
    if (!selectedStudentId) return;
    try {
      await apiClient.post("/wellbeing/medical-records", {
        student_id: selectedStudentId,
        allergies: allergies || null,
        conditions: conditions || null,
        medications: medications || null,
        health_insurance_info: insurance || null,
        emergency_contact_name: emerContact || null,
        emergency_contact_phone: emerPhone || null,
      });
      toast.success("Student medical profile updated successfully!");
      setShowMedicalDialog(false);
      loadMedicalRecords();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update medical profile");
    }
  };

  const handleRecordInfirmary = async () => {
    if (!selectedStudentId || !infReason) return;
    try {
      await apiClient.post("/wellbeing/infirmary", {
        student_id: selectedStudentId,
        reason: infReason,
        treatment_given: infTreatment || null,
        doctor_notes: infNotes || null,
        status: infStatus,
      });
      toast.success("Infirmary visit recorded");
      setShowInfirmaryDialog(false);
      setInfReason("");
      setInfTreatment("");
      loadInfirmary();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record infirmary visit log");
    }
  };

  const handleAddVaccine = async () => {
    if (!selectedStudentId || !vaxName || !vaxAdminDate) return;
    try {
      await apiClient.post("/wellbeing/vaccinations", {
        student_id: selectedStudentId,
        vaccine_name: vaxName,
        dose_number: vaxDose,
        administered_date: vaxAdminDate,
        next_due_date: vaxDueDate || null,
      });
      toast.success("Vaccination record updated!");
      setShowVaccineDialog(false);
      setVaxName("");
      loadVaccinations();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save vaccination log");
    }
  };

  const handleReportIncident = async () => {
    if (!selectedStudentId || !incDesc || !incFirstAid || !incDate) return;
    try {
      await apiClient.post("/wellbeing/first-aid", {
        student_id: selectedStudentId,
        incident_description: incDesc,
        first_aid_given: incFirstAid,
        incident_date: incDate,
      });
      toast.success("First-aid playground incident logged successfully!");
      setShowIncidentDialog(false);
      setIncDesc("");
      setIncFirstAid("");
      loadIncidents();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record incident report");
    }
  };

  const handleAddContact = async () => {
    if (!cName || !cPhone) return;
    try {
      await apiClient.post("/wellbeing/directory", {
        contact_name: cName,
        specialty: cSpecialty || null,
        phone: cPhone,
        hospital_name: cHospital || null,
        address: cAddress || null,
      });
      toast.success("Emergency medical directory updated!");
      setShowContactDialog(false);
      setCName("");
      setCPhone("");
      loadDirectory();
    } catch (err) {
      console.error(err);
      toast.error("Could not register contact directory entry");
    }
  };

  const handleSubmitSurvey = async () => {
    if (!selectedStudentId) return;
    try {
      await apiClient.post("/wellbeing/surveys", {
        student_id: selectedStudentId,
        mood_score: surveyMood,
        stress_level: surveyStress,
        notes: surveyNotes || null,
      });
      toast.success("Wellness check-in survey logged! Appreciate your update.");
      setShowSurveyDialog(false);
      setSurveyNotes("");
      loadWellbeingStats();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record survey check");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Title Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Student Wellbeing & Health Vault</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Monitor medical records profiles, track infirmary visit files, record emergency hospital contacts, and wellness survey checks.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setShowSurveyDialog(true)} variant="outline">
            Wellbeing Check-in
          </Button>
          <Button onClick={() => setShowInfirmaryDialog(true)} className="bg-primary text-primary-foreground font-semibold">
            Log Infirmary Visit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left side student selector */}
        <Card className="lg:col-span-1 shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Select Student Folder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Student Profile</Label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
              >
                <option value="">— Select student —</option>
                {students.map((std) => (
                  <option key={std.id} value={std.id}>{std.name}</option>
                ))}
              </select>
            </div>

            {/* General index cards */}
            {wellbeingStats && (
              <div className="space-y-3 pt-4 border-t">
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/15 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">School Mood Index</div>
                    <div className="text-lg font-black text-foreground">{wellbeingStats.average_mood_score} / 10</div>
                  </div>
                  <Smile className="h-7 w-7 text-primary" />
                </div>

                <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/15 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">School Stress level</div>
                    <div className="text-lg font-black text-foreground">{wellbeingStats.average_stress_level} / 10</div>
                  </div>
                  <Activity className="h-7 w-7 text-amber-500" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right side Tabs interface */}
        <div className="lg:col-span-3 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-muted p-1 rounded-xl">
              <TabsTrigger value="medical" className="rounded-lg">Health File</TabsTrigger>
              <TabsTrigger value="infirmary" className="rounded-lg">Infirmary ({infirmaryLogs.length})</TabsTrigger>
              <TabsTrigger value="vaccine" className="rounded-lg">Vaccinations</TabsTrigger>
              <TabsTrigger value="firstaid" className="rounded-lg">First-Aid Reports</TabsTrigger>
              <TabsTrigger value="contacts" className="rounded-lg">Hospitals Directory</TabsTrigger>
            </TabsList>

            {/* Health File Tab */}
            <TabsContent value="medical" className="space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
                  <CardTitle className="text-base font-bold font-display">Medical Details Vault</CardTitle>
                  <Button onClick={() => setShowMedicalDialog(true)} size="sm" variant="outline">
                    Edit Profile Details
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  {medRecords.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No health profile variables saved yet. Click "Edit Profile Details" to set medical info.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Allergies</div>
                          <p className="mt-1 font-semibold text-foreground">{medRecords[0].allergies || "None logged"}</p>
                        </div>
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Chronic Conditions</div>
                          <p className="mt-1 font-semibold text-foreground">{medRecords[0].conditions || "None logged"}</p>
                        </div>
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Current Medications</div>
                          <p className="mt-1 font-semibold text-foreground">{medRecords[0].medications || "None logged"}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Health Insurance details</div>
                          <p className="mt-1 font-semibold text-foreground">{medRecords[0].health_insurance_info || "None logged"}</p>
                        </div>
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Emergency Contact</div>
                          <p className="mt-1 font-semibold text-foreground">{medRecords[0].emergency_contact_name || "N/A"}</p>
                        </div>
                        <div>
                          <div className="text-xs uppercase font-bold text-muted-foreground">Emergency Phone</div>
                          <p className="mt-1 font-semibold text-foreground text-primary font-mono">{medRecords[0].emergency_contact_phone || "N/A"}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Infirmary Logs Tab */}
            <TabsContent value="infirmary" className="space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader>
                  <CardTitle className="text-base font-bold font-display">Infirmary Log History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Check-in Date</TableHead>
                        <TableHead className="font-semibold">Reason</TableHead>
                        <TableHead className="font-semibold">Treatment Administered</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {infirmaryLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            No infirmary check-ins registered for this student.
                          </TableCell>
                        </TableRow>
                      ) : (
                        infirmaryLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="pl-6 text-xs">{format(new Date(log.visit_date), "PP")}</TableCell>
                            <TableCell className="font-bold text-foreground">{log.reason}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{log.treatment_given || "Rest / Observation"}</TableCell>
                            <TableCell className="text-right pr-6">
                              <Badge variant={log.status === "referred_to_hospital" ? "destructive" : "secondary"}>
                                {log.status.toUpperCase()}
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

            {/* Vaccinations Tab */}
            <TabsContent value="vaccine" className="space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
                  <CardTitle className="text-base font-bold font-display">Immunization Tracker</CardTitle>
                  <Button onClick={() => setShowVaccineDialog(true)} size="sm" variant="outline">
                    Add Vaccination Record
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Vaccine Name</TableHead>
                        <TableHead className="font-semibold text-center">Dose Number</TableHead>
                        <TableHead className="font-semibold text-center">Administered Date</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Next Due date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vaccinations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            No vaccinations registered.
                          </TableCell>
                        </TableRow>
                      ) : (
                        vaccinations.map((vac) => (
                          <TableRow key={vac.id}>
                            <TableCell className="pl-6 font-bold text-foreground">{vac.vaccine_name}</TableCell>
                            <TableCell className="text-center font-semibold">Dose #{vac.dose_number}</TableCell>
                            <TableCell className="text-center text-xs">{format(new Date(vac.administered_date), "PP")}</TableCell>
                            <TableCell className="text-right pr-6 text-xs text-destructive font-semibold">
                              {vac.next_due_date ? format(new Date(vac.next_due_date), "PP") : "Fully Immunized"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* First aid incident logs Tab */}
            <TabsContent value="firstaid" className="space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
                  <CardTitle className="text-base font-bold font-display">First Aid Incident Reports</CardTitle>
                  <Button onClick={() => setShowIncidentDialog(true)} size="sm" variant="outline">
                    Log Playground Incident
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Incident Date</TableHead>
                        <TableHead className="font-semibold">Description</TableHead>
                        <TableHead className="font-semibold">First aid applied</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Reporter ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incidents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            No first-aid incident reports logged.
                          </TableCell>
                        </TableRow>
                      ) : (
                        incidents.map((inc) => (
                          <TableRow key={inc.id}>
                            <TableCell className="pl-6 text-xs">{format(new Date(inc.incident_date), "PP")}</TableCell>
                            <TableCell className="text-xs font-semibold text-foreground max-w-xs truncate">{inc.incident_description}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{inc.first_aid_given}</TableCell>
                            <TableCell className="text-right pr-6 text-xs font-mono">{inc.reporter_user_id.slice(0, 8)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Medical Hospital Directory Tab */}
            <TabsContent value="contacts" className="space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
                  <CardTitle className="text-base font-bold font-display">Doctor/Hospital Emergency Directory</CardTitle>
                  <Button onClick={() => setShowContactDialog(true)} size="sm" variant="outline">
                    Add Medical Contact
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Contact Name</TableHead>
                        <TableHead className="font-semibold">Specialty</TableHead>
                        <TableHead className="font-semibold">Phone Contact</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Hospital / Clinic</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((cont) => (
                        <TableRow key={cont.id} className="hover:bg-muted/30">
                          <TableCell className="pl-6 font-bold text-foreground">{cont.contact_name}</TableCell>
                          <TableCell className="text-xs font-semibold">{cont.specialty || "General Service"}</TableCell>
                          <TableCell className="text-xs text-primary font-bold font-mono">{cont.phone}</TableCell>
                          <TableCell className="text-right pr-6 text-xs text-muted-foreground">{cont.hospital_name || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Edit Health File Details Dialog */}
      <Dialog open={showMedicalDialog} onOpenChange={setShowMedicalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Edit Medical Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Allergies List</Label>
              <Input
                placeholder="e.g. Pollen, Penicillin, Nuts"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chronic Conditions</Label>
              <Input
                placeholder="e.g. Asthma, Diabetes Type 1"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Medications Required</Label>
              <Input
                placeholder="e.g. Inhaler twice daily, insulin injections"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Insurance Policy details</Label>
              <Input
                placeholder="e.g. Jubilee Life Ins Policy #90871"
                value={insurance}
                onChange={(e) => setInsurance(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Emergency Contact Person</Label>
                <Input
                  placeholder="Father / Mother name"
                  value={emerContact}
                  onChange={(e) => setEmerContact(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency Contact Phone</Label>
                <Input
                  placeholder="e.g. 03009988776"
                  value={emerPhone}
                  onChange={(e) => setEmerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowMedicalDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleUpsertMedical} className="bg-primary text-primary-foreground font-semibold">
              Save Health File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Infirmary Visit Dialog */}
      <Dialog open={showInfirmaryDialog} onOpenChange={setShowInfirmaryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Log Infirmary Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Reason for Visit</Label>
              <Input
                placeholder="e.g. Mild fever, stomach pain, dizziness"
                value={infReason}
                onChange={(e) => setInfReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Treatment Given</Label>
              <Input
                placeholder="e.g. Panadol 500mg, cold compress, rest in bed"
                value={infTreatment}
                onChange={(e) => setInfTreatment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Doctor / Nurse Notes</Label>
              <Input
                placeholder="Observation details..."
                value={infNotes}
                onChange={(e) => setInfNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Check-out Status</Label>
              <select
                value={infStatus}
                onChange={(e) => setInfStatus(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
              >
                <option value="treated">Treated & Discharged to class</option>
                <option value="referred_to_hospital">Referred to Hospital</option>
                <option value="sent_home">Sent Home with parent</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInfirmaryDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleRecordInfirmary} className="bg-primary text-primary-foreground font-semibold">
              Save Infirmary Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Vaccine Dose Dialog */}
      <Dialog open={showVaccineDialog} onOpenChange={setShowVaccineDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Register Immunization Dose</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Vaccine Name</Label>
              <Input
                placeholder="e.g. COVID-19 Pfizer, MMR, Polio drops"
                value={vaxName}
                onChange={(e) => setVaxName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Dose Number</Label>
                <Input
                  type="number"
                  value={vaxDose}
                  onChange={(e) => setVaxDose(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Administered Date</Label>
                <Input
                  type="date"
                  value={vaxAdminDate}
                  onChange={(e) => setVaxAdminDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Next Due Date (Optional)</Label>
              <Input
                type="date"
                value={vaxDueDate}
                onChange={(e) => setVaxDueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowVaccineDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleAddVaccine} className="bg-primary text-primary-foreground font-semibold">
              Save Dose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Incident Dialog */}
      <Dialog open={showIncidentDialog} onOpenChange={setShowIncidentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Log First-Aid playground incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Incident Description</Label>
              <textarea
                placeholder="e.g. Scraped knee after slipping on grass during soccer matches..."
                value={incDesc}
                onChange={(e) => setIncDesc(e.target.value)}
                className="w-full min-h-[80px] p-3 border border-input rounded-md text-sm bg-background text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label>First Aid treatment given</Label>
              <Input
                placeholder="e.g. Bandaged wound, antiseptic spray..."
                value={incFirstAid}
                onChange={(e) => setIncFirstAid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Incident Date</Label>
              <Input
                type="date"
                value={incDate}
                onChange={(e) => setIncDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowIncidentDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleReportIncident} className="bg-primary text-primary-foreground font-semibold">
              Log Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Add Emergency Directory Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Contact Name</Label>
              <Input
                placeholder="e.g. Dr. Asim Jamil"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Medical Specialty</Label>
                <Input
                  placeholder="e.g. Pediatrician / Ambulance"
                  value={cSpecialty}
                  onChange={(e) => setCSpecialty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Contact</Label>
                <Input
                  placeholder="e.g. 03001234567"
                  value={cPhone}
                  onChange={(e) => setCPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Hospital / Clinic Name</Label>
              <Input
                placeholder="e.g. Kids Medical Center"
                value={cHospital}
                onChange={(e) => setCHospital(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                placeholder="e.g. Block D, Gulberg, Lahore"
                value={cAddress}
                onChange={(e) => setCAddress(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowContactDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleAddContact} className="bg-primary text-primary-foreground font-semibold">
              Save Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wellbeing Survey Dialog */}
      <Dialog open={showSurveyDialog} onOpenChange={setShowSurveyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Wellness Survey check</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-3">
            <div className="space-y-1.5">
              <Label className="flex justify-between">
                <span>Mood Score Rating (1 - 10)</span>
                <span className="font-black text-primary">{surveyMood} / 10</span>
              </Label>
              <input
                type="range"
                min="1"
                max="10"
                value={surveyMood}
                onChange={(e) => setSurveyMood(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex justify-between">
                <span>Stress Level Rating (1 - 10)</span>
                <span className="font-black text-amber-500">{surveyStress} / 10</span>
              </Label>
              <input
                type="range"
                min="1"
                max="10"
                value={surveyStress}
                onChange={(e) => setSurveyStress(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Survey remarks / comments</Label>
              <Input
                placeholder="How are you feeling today?"
                value={surveyNotes}
                onChange={(e) => setSurveyNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSurveyDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleSubmitSurvey} className="bg-primary text-primary-foreground font-semibold">
              Submit Check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
