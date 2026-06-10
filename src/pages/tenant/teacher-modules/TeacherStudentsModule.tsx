import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Plus, Search, UserPlus, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineStudents, useOfflineSections, useOfflineEnrollments, useOfflineTeacherAssignments } from "@/hooks/useOfflineData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  StudentFormDialog,
  type ParentUserOption,
  type ClassOption,
  type SectionOption,
  type SubjectOption,
} from "@/components/academic/StudentFormDialog";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
  parent_name: string | null;
  student_code: string | null;
  status: string;
  section_id: string;
  section_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  roll_number?: string | null;
  registration_number?: string | null;
  admission_date?: string | null;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  emergency_contact?: string | null;
  medical_notes?: string | null;
  notes?: string | null;
  profile_image_url?: string | null;
}

interface Guardian {
  id: string;
  full_name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export function TeacherStudentsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  // Offline data hooks
  const { data: cachedStudents, isUsingCache: studentsFromCache } = useOfflineStudents(schoolId);
  const { data: cachedSections, isUsingCache: sectionsFromCache } = useOfflineSections(schoolId);
  const { data: cachedEnrollments } = useOfflineEnrollments(schoolId);
  const { data: cachedAssignments } = useOfflineTeacherAssignments(schoolId);

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("enrolled");
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  // Add student dialog (full form)
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [parentUsers, setParentUsers] = useState<ParentUserOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  // Add parent dialog
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [newParent, setNewParent] = useState({ full_name: "", relationship: "parent", phone: "", email: "" });

  // View guardians
  const [viewGuardiansOpen, setViewGuardiansOpen] = useState(false);
  const [guardians, setGuardians] = useState<Guardian[]>([]);

  useEffect(() => {
    if (tenant.status !== "ready") return;

    const fetchSections = async () => {
      // Get current teacher's user id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Only get assignments for THIS teacher
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", tenant.schoolId)
        .eq("teacher_user_id", userId);

      if (!assignments?.length) {
        setLoading(false);
        return;
      }

      const sectionIds = assignments.map((a) => a.class_section_id);

      const { data: sectionData } = await supabase
        .from("class_sections")
        .select("id, name, class_id")
        .in("id", sectionIds);

      if (!sectionData?.length) {
        setLoading(false);
        return;
      }

      const classIds = [...new Set(sectionData.map((s) => s.class_id))];
      const { data: classes } = await supabase
        .from("academic_classes")
        .select("id, name")
        .in("id", classIds);

      const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

      const enriched = sectionData.map((s) => ({
        id: s.id,
        name: s.name,
        class_name: classMap.get(s.class_id) || "Unknown",
      }));

      setSections(enriched);
      if (enriched.length > 0) {
        setSelectedSection(enriched[0].id);
      }
      setLoading(false);
    };

    fetchSections();
  }, [tenant.status, tenant.schoolId]);

  useEffect(() => {
    if (!selectedSection || tenant.status !== "ready") return;

    const fetchStudents = async () => {
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id, class_section_id")
        .eq("school_id", tenant.schoolId)
        .eq("class_section_id", selectedSection);

      if (!enrollments?.length) {
        setStudents([]);
        return;
      }

      const studentIds = enrollments.map((e) => e.student_id);
      let query = (supabase as any)
        .from("students")
        .select(
          "id, first_name, last_name, parent_name, student_code, status, date_of_birth, gender, roll_number, registration_number, admission_date, address, city, area, phone, parent_phone, parent_email, emergency_contact, medical_notes, notes, profile_image_url",
        )
        .in("id", studentIds);
      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }
      const { data: studentData } = await query;

      const section = sections.find((s) => s.id === selectedSection);
      const mapped = (studentData || []).map((s: any) => ({
        ...s,
        section_id: selectedSection,
        section_name: section?.name || "",
      }));

      setStudents(mapped as Student[]);
    };

    fetchStudents();
  }, [selectedSection, filterStatus, tenant.status, tenant.schoolId, sections]);

  // Refetch students for the currently selected section (used after StudentFormDialog save)
  const refreshStudents = async () => {
    if (!selectedSection || tenant.status !== "ready") return;
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", selectedSection);
    const ids = (enrollments ?? []).map((e: any) => e.student_id);
    if (ids.length === 0) {
      setStudents([]);
      return;
    }
    let query = (supabase as any)
      .from("students")
      .select(
        "id, first_name, last_name, parent_name, student_code, status, date_of_birth, gender, roll_number, registration_number, admission_date, address, city, area, phone, parent_phone, parent_email, emergency_contact, medical_notes, notes, profile_image_url",
      )
      .in("id", ids);
    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    const { data: studentData } = await query;
    const section = sections.find((s) => s.id === selectedSection);
    setStudents(
      (studentData || []).map((s: any) => ({
        ...s,
        section_id: selectedSection,
        section_name: section?.name || "",
      })) as Student[],
    );
  };

  // Load reference data (classes, subjects, parent users) for the StudentFormDialog
  useEffect(() => {
    if (tenant.status !== "ready") return;
    const schoolIdLocal = tenant.schoolId;
    const load = async () => {
      const [{ data: classesData }, { data: subjectsData }, { data: parentRolesData }] =
        await Promise.all([
          supabase.from("academic_classes").select("id, name").eq("school_id", schoolIdLocal).order("name"),
          supabase.from("subjects").select("id, name").eq("school_id", schoolIdLocal).order("name"),
          supabase.from("user_roles").select("user_id").eq("school_id", schoolIdLocal).eq("role", "parent"),
        ]);
      setClasses((classesData ?? []) as ClassOption[]);
      setSubjects((subjectsData ?? []) as SubjectOption[]);
      const parentIds = new Set((parentRolesData ?? []).map((r: any) => r.user_id));
      if (parentIds.size > 0) {
        const { data: dir } = await (supabase as any).rpc("get_school_user_directory", {
          _school_id: schoolIdLocal,
        });
        const opts: ParentUserOption[] = ((dir ?? []) as any[])
          .filter((u) => parentIds.has(u.user_id))
          .map((u) => ({
            user_id: u.user_id,
            email: u.email ?? "",
            full_name: u.display_name ?? u.email ?? "Parent",
          }));
        setParentUsers(opts);
      } else {
        setParentUsers([]);
      }
    };
    void load();
  }, [tenant.status, tenant.schoolId]);

  const handleAddParent = async () => {
    if (!selectedStudentId || !newParent.full_name.trim()) {
      toast.error("Name is required");
      return;
    }

    const { error } = await supabase.from("student_guardians").insert({
      student_id: selectedStudentId,
      full_name: newParent.full_name.trim(),
      relationship: newParent.relationship,
      phone: newParent.phone.trim() || null,
      email: newParent.email.trim() || null,
    });

    if (error) {
      toast.error(error.message || "Failed to add parent");
      return;
    }

    toast.success("Parent/Guardian added successfully");
    setAddParentOpen(false);
    setNewParent({ full_name: "", relationship: "parent", phone: "", email: "" });
    setSelectedStudentId(null);
  };

  const openAddParent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setAddParentOpen(true);
  };

  const viewStudentGuardians = async (studentId: string) => {
    setSelectedStudentId(studentId);
    const { data } = await supabase
      .from("student_guardians")
      .select("*")
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false });

    setGuardians(data || []);
    setViewGuardiansOpen(true);
  };

  const filteredStudents = students.filter((s) => {
    const fullName = `${s.first_name} ${s.last_name || ""}`.toLowerCase();
    const parentName = (s.parent_name || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    if (!query) return true;
    return (
      fullName.includes(query) ||
      parentName.includes(query) ||
      (s.student_code?.toLowerCase().includes(query)) ||
      (s.roll_number?.toLowerCase().includes(query)) ||
      (s.parent_email?.toLowerCase().includes(query)) ||
      (s.parent_phone?.toLowerCase().includes(query)) ||
      (s.phone?.toLowerCase().includes(query))
    );
  });

  // Show offline fallback instead of loading
  if (loading && !isOffline) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  // Offline mode with cached data
  if (isOffline && sections.length === 0 && cachedSections.length > 0) {
    // Build sections from cache
    const mySectionIds = new Set(cachedAssignments.map(a => a.classSectionId));
    const offlineSections = cachedSections
      .filter(s => mySectionIds.has(s.id))
      .map(s => ({ id: s.id, name: s.name, class_name: s.className }));

    if (offlineSections.length > 0) {
      setSections(offlineSections);
      if (!selectedSection) setSelectedSection(offlineSections[0].id);
    }
  }

  if (isOffline && students.length === 0 && selectedSection && cachedStudents.length > 0) {
    // Build students from cache
    const sectionEnrollments = cachedEnrollments.filter(e => e.classSectionId === selectedSection);
    const studentIds = new Set(sectionEnrollments.map(e => e.studentId));
    const section = sections.find(s => s.id === selectedSection);
    const offlineStudents = cachedStudents
      .filter(s => studentIds.has(s.id))
      .map(s => ({
        id: s.id,
        first_name: s.firstName,
        last_name: s.lastName,
        parent_name: null,
        student_code: null,
        status: s.status || 'enrolled',
        section_id: selectedSection,
        section_name: section?.name || '',
      }));
    setStudents(offlineStudents);
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No classes assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Offline Banner */}
      {isOffline && (
        <div className="rounded-2xl bg-warning/10 border border-warning/20 p-3 text-sm text-warning text-center">
          <WifiOff className="inline-block h-4 w-4 mr-2" />
          Offline Mode — Showing cached data. Some actions are disabled.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedSection} onValueChange={setSelectedSection}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.class_name} - {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="enrolled">Enrolled</SelectItem>
            <SelectItem value="inquiry">Inquiry</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
            <SelectItem value="graduated">Graduated</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, parent, code, roll, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {(searchQuery || filterStatus !== "enrolled") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setFilterStatus("enrolled"); }}
          >
            Clear
          </Button>
        )}

        <Button onClick={() => setAddStudentOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Student
        </Button>

        <StudentFormDialog
          open={addStudentOpen}
          onOpenChange={setAddStudentOpen}
          schoolId={tenant.status === "ready" ? tenant.schoolId : ""}
          classes={classes}
          sections={sections.map((s) => ({
            id: s.id,
            name: s.name,
            class_id: classes.find((c) => c.name === s.class_name)?.id ?? "",
          }))}
          subjects={subjects}
          parentUsers={parentUsers}
          initial={selectedSection ? { section_id: selectedSection } : undefined}
          onSaved={() => void refreshStudents()}
        />
      </div>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle>Students ({filteredStudents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailStudent(s)}
                    >
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={(e) => { e.stopPropagation(); setDetailStudent(s); }}
                        >
                          {s.first_name} {s.last_name}
                        </button>
                        {s.roll_number && (
                          <span className="ml-2 text-xs text-muted-foreground">#{s.roll_number}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.parent_name || "—"}
                      </TableCell>
                      <TableCell>{s.student_code || "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-accent px-2 py-1 text-xs capitalize">{s.status}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => openAddParent(s.id)}>
                            <UserPlus className="mr-1 h-3 w-3" /> Add Parent
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => viewStudentGuardians(s.id)}>
                            View Parents
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Parent Dialog */}
      <Dialog open={addParentOpen} onOpenChange={setAddParentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Parent/Guardian</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={newParent.full_name}
                onChange={(e) => setNewParent((p) => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Relationship</Label>
              <Select
                value={newParent.relationship}
                onValueChange={(v) => setNewParent((p) => ({ ...p, relationship: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="grandparent">Grandparent</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newParent.phone}
                onChange={(e) => setNewParent((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newParent.email}
                onChange={(e) => setNewParent((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <Button onClick={handleAddParent} className="w-full">
              Add Parent/Guardian
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Guardians Dialog */}
      <Dialog open={viewGuardiansOpen} onOpenChange={setViewGuardiansOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parents/Guardians</DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parents/guardians added yet.</p>
            ) : (
              <div className="space-y-3">
                {guardians.map((g) => (
                  <div key={g.id} className="rounded-lg border p-3">
                    <p className="font-medium">{g.full_name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{g.relationship}</p>
                    {g.phone && <p className="text-sm">📞 {g.phone}</p>}
                    {g.email && <p className="text-sm">✉️ {g.email}</p>}
                    {g.is_primary && (
                      <span className="mt-1 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Primary Contact
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Student Details Dialog */}
      <Dialog open={!!detailStudent} onOpenChange={(o) => !o && setDetailStudent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailStudent ? `${detailStudent.first_name} ${detailStudent.last_name ?? ""}` : "Student"}
            </DialogTitle>
          </DialogHeader>
          {detailStudent && (
            <div className="space-y-5 pt-2">
              <div className="flex items-start gap-4">
                {detailStudent.profile_image_url ? (
                  <img
                    src={detailStudent.profile_image_url}
                    alt={detailStudent.first_name}
                    className="h-20 w-20 rounded-full object-cover border"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-primary/10 grid place-items-center text-2xl font-semibold text-primary">
                    {detailStudent.first_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-lg font-semibold">
                    {detailStudent.first_name} {detailStudent.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {detailStudent.section_name} • {detailStudent.status}
                  </p>
                  {detailStudent.roll_number && (
                    <p className="text-xs text-muted-foreground mt-1">Roll #{detailStudent.roll_number}</p>
                  )}
                </div>
              </div>

              <Section title="Identification">
                <Field label="Student Code" value={detailStudent.student_code} />
                <Field label="Registration #" value={detailStudent.registration_number} />
                <Field label="Roll Number" value={detailStudent.roll_number} />
                <Field label="Admission Date" value={detailStudent.admission_date} />
              </Section>

              <Section title="Personal">
                <Field label="Date of Birth" value={detailStudent.date_of_birth} />
                <Field label="Gender" value={detailStudent.gender} />
                <Field label="Phone" value={detailStudent.phone} />
                <Field label="Emergency Contact" value={detailStudent.emergency_contact} />
              </Section>

              <Section title="Address">
                <Field label="Address" value={detailStudent.address} className="sm:col-span-2" />
                <Field label="City" value={detailStudent.city} />
                <Field label="Area" value={detailStudent.area} />
              </Section>

              <Section title="Parent / Guardian">
                <Field label="Parent Name" value={detailStudent.parent_name} />
                <Field label="Parent Phone" value={detailStudent.parent_phone} />
                <Field label="Parent Email" value={detailStudent.parent_email} className="sm:col-span-2" />
              </Section>

              {(detailStudent.medical_notes || detailStudent.notes) && (
                <Section title="Notes">
                  <Field label="Medical Notes" value={detailStudent.medical_notes} className="sm:col-span-2" />
                  <Field label="Other Notes" value={detailStudent.notes} className="sm:col-span-2" />
                </Section>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { openAddParent(detailStudent.id); }}>
                  <UserPlus className="mr-1 h-3 w-3" /> Add Parent
                </Button>
                <Button size="sm" variant="ghost" onClick={() => viewStudentGuardians(detailStudent.id)}>
                  View All Parents
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-surface p-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
