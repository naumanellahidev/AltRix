import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BookOpen,
  Building2,
  GraduationCap,
  Plus,
  Settings,
  User,
  UserCog,
  Users,
} from "lucide-react";
import { StudentTransferDialog } from "@/components/academic/StudentTransferDialog";
import { TeacherDetailsCard } from "@/components/academic/TeacherDetailsCard";
import { ClassStructureCard } from "@/components/academic/ClassStructureCard";
import { StudentRosterCard } from "@/components/academic/StudentRosterCard";
import { SubjectsOverviewCard } from "@/components/academic/SubjectsOverviewCard";
import { EditClassDialog } from "@/components/academic/EditClassDialog";
import { EditSectionDialog } from "@/components/academic/EditSectionDialog";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { SubjectCatalogCard, type SubjectRow } from "@/pages/tenant/modules/components/SubjectCatalogCard";
import {
  SectionSubjectsCard,
  type ClassSectionSubjectRow,
} from "@/pages/tenant/modules/components/SectionSubjectsCard";
import {
  TeacherSubjectAssignmentsCard,
  type TeacherSubjectAssignmentRow,
} from "@/pages/tenant/modules/components/TeacherSubjectAssignmentsCard";

import { AssessmentManagerCard } from "@/pages/tenant/modules/components/AssessmentManagerCard";
import { GradeThresholdsCard } from "@/pages/tenant/modules/components/GradeThresholdsCard";

type ClassRow = { id: string; name: string; grade_level: number | null };
type SectionRow = { id: string; name: string; class_id: string; room: string | null };
type StudentRow = { id: string; first_name: string; last_name: string | null; parent_name?: string | null; status: string; profile_id: string | null; section_label?: string };
type DirectoryProfileRow = { user_id: string; profile_id: string | null; email: string; display_name: string | null };
type EnrollmentRow = { student_id: string; class_section_id: string };
type TeacherAssignmentRow = { teacher_user_id: string; class_section_id: string };

export function AcademicModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryProfileRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classSectionSubjects, setClassSectionSubjects] = useState<ClassSectionSubjectRow[]>([]);
  const [teacherSubjectAssignments, setTeacherSubjectAssignments] = useState<TeacherSubjectAssignmentRow[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignmentRow[]>([]);

  const [newClassName, setNewClassName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [studentFirst, setStudentFirst] = useState("");
  const [studentLast, setStudentLast] = useState("");
  const [studentParentName, setStudentParentName] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [linkStudentId, setLinkStudentId] = useState<string>("");
  const [linkUserId, setLinkUserId] = useState<string>("");

  const [teachers, setTeachers] = useState<{ user_id: string; email: string; display_name: string | null }[]>([]);
  const [teacherUserId, setTeacherUserId] = useState<string>("");
  const [assignSectionId, setAssignSectionId] = useState<string>("");

  // Student Edit/Delete states
  const [showEditStudentDialog, setShowEditStudentDialog] = useState(false);
  const [showDeleteStudentDialog, setShowDeleteStudentDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [editStudentForm, setEditStudentForm] = useState({
    first_name: "",
    last_name: "",
    parent_name: "",
    status: "enrolled",
    section_id: "",
  });
  const [studentSubmitting, setStudentSubmitting] = useState(false);

  const refresh = async () => {
    if (!schoolId) return;

    const [c, s, st, enr, ta, dirUsers, roleRows, dir, subj, css, tsa] = await Promise.all([
      supabase.from("academic_classes").select("id,name,grade_level").eq("school_id", schoolId).order("name"),
      supabase.from("class_sections").select("id,name,class_id,room").eq("school_id", schoolId).order("name"),
      supabase
        .from("students")
        .select("id,first_name,last_name,parent_name,status,profile_id")
        .eq("school_id", schoolId)
        .order("first_name"),
      supabase.from("student_enrollments").select("student_id,class_section_id").eq("school_id", schoolId),
      supabase.from("teacher_assignments").select("teacher_user_id,class_section_id").eq("school_id", schoolId),
      supabase.rpc("list_school_user_profiles", { _school_id: schoolId }),
      supabase.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", "teacher"),
      supabase.from("school_user_directory").select("user_id,email,display_name").eq("school_id", schoolId).order("email"),
      supabase.from("subjects").select("id,name,code").eq("school_id", schoolId).order("name"),
      supabase.from("class_section_subjects").select("id,class_section_id,subject_id").eq("school_id", schoolId),
      supabase
        .from("teacher_subject_assignments")
        .select("id,class_section_id,subject_id,teacher_user_id")
        .eq("school_id", schoolId),
    ]);

    const classesData = (c.data ?? []) as ClassRow[];
    const sectionsData = (s.data ?? []) as SectionRow[];
    const enrollmentsData = (enr.data ?? []) as EnrollmentRow[];

    // Build section label map
    const sectionLabelMap = new Map<string, string>();
    sectionsData.forEach((sec) => {
      const cls = classesData.find((cl) => cl.id === sec.class_id);
      sectionLabelMap.set(sec.id, `${cls?.name ?? "Class"} • ${sec.name}`);
    });

    // Build student -> section map
    const studentSectionMap = new Map<string, string>();
    enrollmentsData.forEach((e) => {
      studentSectionMap.set(e.student_id, sectionLabelMap.get(e.class_section_id) ?? "");
    });

    // Enrich students with section labels
    const studentsData = (st.data ?? []).map((s: any) => ({
      ...s,
      section_label: studentSectionMap.get(s.id) || "",
    })) as StudentRow[];

    setClasses(classesData);
    setSections(sectionsData);
    setStudents(studentsData);
    setEnrollments(enrollmentsData);
    setTeacherAssignments((ta.data ?? []) as TeacherAssignmentRow[]);
    setDirectoryUsers((dirUsers.data ?? []) as DirectoryProfileRow[]);
    setSubjects((subj.data ?? []) as SubjectRow[]);
    setClassSectionSubjects((css.data ?? []) as ClassSectionSubjectRow[]);
    setTeacherSubjectAssignments((tsa.data ?? []) as TeacherSubjectAssignmentRow[]);

    const ids = new Set((roleRows.data ?? []).map((r: any) => r.user_id as string));
    setTeachers(((dir.data ?? []) as any[]).filter((d) => ids.has(d.user_id)) as any);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const createClass = async () => {
    if (!schoolId) return;
    if (!newClassName.trim()) return toast.error("Class name required");
    const { error } = await supabase.from("academic_classes").insert({ school_id: schoolId, name: newClassName.trim() });
    if (error) return toast.error(error.message);
    setNewClassName("");
    toast.success("Class created");
    await refresh();
  };

  const createSection = async () => {
    if (!schoolId) return;
    if (!selectedClassId) return toast.error("Pick a class");
    if (!newSectionName.trim()) return toast.error("Section name required");
    const { error } = await supabase
      .from("class_sections")
      .insert({ school_id: schoolId, class_id: selectedClassId, name: newSectionName.trim() });
    if (error) return toast.error(error.message);
    setNewSectionName("");
    toast.success("Section created");
    await refresh();
  };

  const createStudentAndEnroll = async () => {
    if (!schoolId) return;
    if (!studentFirst.trim()) return toast.error("First name required");
    if (!studentParentName.trim()) return toast.error("Parent name required for identification");
    if (!selectedSectionId) return toast.error("Pick a section");

    const { data: student, error } = await supabase
      .from("students")
      .insert({ 
        school_id: schoolId, 
        first_name: studentFirst.trim(), 
        last_name: studentLast.trim() || null,
        parent_name: studentParentName.trim(),
        status: "enrolled"
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);

    const { error: enrErr } = await supabase
      .from("student_enrollments")
      .insert({ school_id: schoolId, student_id: student.id, class_section_id: selectedSectionId });
    if (enrErr) return toast.error(enrErr.message);

    setStudentFirst("");
    setStudentLast("");
    setStudentParentName("");
    toast.success("Student created + enrolled");
    await refresh();
  };

  const assignTeacher = async () => {
    if (!schoolId) return;
    if (!teacherUserId) return toast.error("Pick a teacher");
    if (!assignSectionId) return toast.error("Pick a section");
    const { error } = await supabase
      .from("teacher_assignments")
      .upsert({ school_id: schoolId, teacher_user_id: teacherUserId, class_section_id: assignSectionId }, { onConflict: "school_id,teacher_user_id,class_section_id" });
    if (error) return toast.error(error.message);
    toast.success("Teacher assigned");
    await refresh();
  };

  const linkStudentToProfile = async () => {
    if (!schoolId) return;
    if (!linkStudentId) return toast.error("Pick a student");
    if (!linkUserId) return toast.error("Pick a user");

    // Ensure a profile row exists for this user (auto-create if missing)
    await supabase
      .from("profiles")
      .upsert({ id: linkUserId }, { onConflict: "id" });

    const { error } = await supabase
      .from("students")
      .update({ profile_id: linkUserId })
      .eq("school_id", schoolId)
      .eq("id", linkStudentId);
    if (error) return toast.error(error.message);
    toast.success("Student linked to user profile");
    await refresh();
  };

  // Student Edit/Delete handlers
  const openEditStudent = (student: StudentRow) => {
    setEditingStudent(student);
    const enrollment = enrollments.find((e) => e.student_id === student.id);
    setEditStudentForm({
      first_name: student.first_name,
      last_name: student.last_name || "",
      parent_name: student.parent_name || "",
      status: student.status,
      section_id: enrollment?.class_section_id || "",
    });
    setShowEditStudentDialog(true);
  };

  const openDeleteStudent = (student: StudentRow) => {
    setEditingStudent(student);
    setShowDeleteStudentDialog(true);
  };

  const handleEditStudent = async () => {
    if (!schoolId || !editingStudent) return;
    if (!editStudentForm.first_name.trim()) return toast.error("First name is required");
    if (!editStudentForm.parent_name.trim()) return toast.error("Parent name is required");

    setStudentSubmitting(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          first_name: editStudentForm.first_name.trim(),
          last_name: editStudentForm.last_name.trim() || null,
          parent_name: editStudentForm.parent_name.trim(),
          status: editStudentForm.status,
        })
        .eq("school_id", schoolId)
        .eq("id", editingStudent.id);

      if (error) throw error;

      // Update enrollment if section changed
      const currentEnrollment = enrollments.find((e) => e.student_id === editingStudent.id);
      if (editStudentForm.section_id && editStudentForm.section_id !== currentEnrollment?.class_section_id) {
        if (currentEnrollment) {
          await supabase
            .from("student_enrollments")
            .update({ class_section_id: editStudentForm.section_id })
            .eq("school_id", schoolId)
            .eq("student_id", editingStudent.id);
        } else {
          await supabase.from("student_enrollments").insert({
            school_id: schoolId,
            student_id: editingStudent.id,
            class_section_id: editStudentForm.section_id,
          });
        }
      }

      toast.success("Student updated successfully");
      setShowEditStudentDialog(false);
      setEditingStudent(null);
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStudentSubmitting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!schoolId || !editingStudent) return;

    setStudentSubmitting(true);
    try {
      // Delete enrollments first
      const { error: enrollError } = await supabase
        .from("student_enrollments")
        .delete()
        .eq("school_id", schoolId)
        .eq("student_id", editingStudent.id);

      if (enrollError) {
        console.error("Enrollment delete error:", enrollError);
      }

      // Then delete student
      const { error } = await supabase
        .from("students")
        .delete()
        .eq("school_id", schoolId)
        .eq("id", editingStudent.id);

      if (error) throw error;

      toast.success("Student deleted successfully");
      setShowDeleteStudentDialog(false);
      setEditingStudent(null);
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStudentSubmitting(false);
    }
  };

  // Summary stats
  const stats = useMemo(() => ({
    classes: classes.length,
    sections: sections.length,
    students: students.filter(s => s.status === "enrolled").length,
    teachers: teachers.length,
    subjects: subjects.length,
  }), [classes, sections, students, teachers, subjects]);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border bg-surface p-4 text-center">
          <Building2 className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xl font-bold">{stats.classes}</p>
          <p className="text-xs text-muted-foreground">Classes</p>
        </div>
        <div className="rounded-2xl border bg-surface p-4 text-center">
          <GraduationCap className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xl font-bold">{stats.sections}</p>
          <p className="text-xs text-muted-foreground">Sections</p>
        </div>
        <div className="rounded-2xl border bg-surface p-4 text-center">
          <Users className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xl font-bold">{stats.students}</p>
          <p className="text-xs text-muted-foreground">Students</p>
        </div>
        <div className="rounded-2xl border bg-surface p-4 text-center">
          <User className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xl font-bold">{stats.teachers}</p>
          <p className="text-xs text-muted-foreground">Teachers</p>
        </div>
        <div className="rounded-2xl border bg-surface p-4 text-center">
          <BookOpen className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xl font-bold">{stats.subjects}</p>
          <p className="text-xs text-muted-foreground">Subjects</p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-1 p-1 sm:gap-2">
          <TabsTrigger value="overview" className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Building2 className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="teachers" className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <User className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">Teachers</span>
          </TabsTrigger>
          <TabsTrigger value="students" className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Users className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">Students</span>
          </TabsTrigger>
          <TabsTrigger value="subjects" className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <BookOpen className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">Subjects</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Settings className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">Manage</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ClassStructureCard
              classes={classes}
              sections={sections}
              subjects={subjects}
              classSectionSubjects={classSectionSubjects}
              enrollments={enrollments}
            />
            <TeacherDetailsCard
              teachers={teachers}
              classes={classes}
              sections={sections}
              subjects={subjects}
              teacherAssignments={teacherAssignments}
              teacherSubjectAssignments={teacherSubjectAssignments}
            />
          </div>
        </TabsContent>

        {/* Teachers Tab */}
        <TabsContent value="teachers" className="space-y-4">
          <TeacherDetailsCard
            teachers={teachers}
            classes={classes}
            sections={sections}
            subjects={subjects}
            teacherAssignments={teacherAssignments}
            teacherSubjectAssignments={teacherSubjectAssignments}
          />

          {/* Assign Teacher to Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCog className="h-5 w-5" />
                Assign Teacher to Section
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Teacher</Label>
                  <Select value={teacherUserId} onValueChange={setTeacherUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {t.display_name ?? t.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Section</Label>
                  <Select value={assignSectionId} onValueChange={setAssignSectionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={assignTeacher} className="w-full">
                    <UserCog className="mr-2 h-4 w-4" /> Assign
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <TeacherSubjectAssignmentsCard
            schoolId={schoolId}
            classes={classes}
            sections={sections}
            subjects={subjects}
            classSectionSubjects={classSectionSubjects}
            teachers={teachers}
            teacherSubjectAssignments={teacherSubjectAssignments}
            onChanged={refresh}
          />
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-4">
          <StudentRosterCard
            students={students}
            classes={classes}
            sections={sections}
            enrollments={enrollments}
            onEdit={openEditStudent}
            onDelete={openDeleteStudent}
          />

          {/* Quick Add Student */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                Add New Student
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs">First Name *</Label>
                    <Input value={studentFirst} onChange={(e) => setStudentFirst(e.target.value)} placeholder="First name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={studentLast} onChange={(e) => setStudentLast(e.target.value)} placeholder="Last name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Parent Name *</Label>
                    <Input value={studentParentName} onChange={(e) => setStudentParentName(e.target.value)} placeholder="Parent name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Enroll in Section *</Label>
                    <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={createStudentAndEnroll} className="w-full">
                      <Plus className="mr-2 h-4 w-4" /> Add Student
                    </Button>
                  </div>
                </div>
                {schoolId && (
                  <StudentTransferDialog
                    schoolId={schoolId}
                    students={students}
                    classes={classes}
                    sections={sections}
                    onTransferComplete={refresh}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Link Student to Portal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Link Student to Portal Account</CardTitle>
              <p className="text-sm text-muted-foreground">
                Connect a student record to a user account for student portal access.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Student</Label>
                  <Select value={linkStudentId} onValueChange={setLinkStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.filter(s => !s.profile_id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name ?? ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">User Account</Label>
                  <Select value={linkUserId} onValueChange={setLinkUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {directoryUsers.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.display_name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={linkStudentToProfile} variant="outline" className="w-full">
                    Link Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subjects Tab */}
        <TabsContent value="subjects" className="space-y-4">
          <SubjectsOverviewCard
            subjects={subjects}
            classes={classes}
            sections={sections}
            teachers={teachers}
            classSectionSubjects={classSectionSubjects}
            teacherSubjectAssignments={teacherSubjectAssignments}
          />

          <SubjectCatalogCard schoolId={schoolId} subjects={subjects} onChanged={refresh} />

          <SectionSubjectsCard
            schoolId={schoolId}
            classes={classes}
            sections={sections}
            subjects={subjects}
            classSectionSubjects={classSectionSubjects}
            onChanged={refresh}
          />
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-4">
          {/* Create Class/Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                Class & Section Management
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Create Class */}
              <div className="space-y-3">
                <p className="font-medium">Create New Class</p>
                <div className="flex gap-2">
                  <Input 
                    value={newClassName} 
                    onChange={(e) => setNewClassName(e.target.value)} 
                    placeholder="e.g. Grade 5, Class 10" 
                  />
                  <Button onClick={createClass}>
                    <Plus className="mr-2 h-4 w-4" /> Create
                  </Button>
                </div>
                <ScrollArea className="h-[250px] rounded-xl border">
                  <div className="p-3 space-y-2">
                    {classes.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {c.grade_level ? `Grade ${c.grade_level}` : "No grade"}
                          </Badge>
                        </div>
                        {schoolId && (
                          <EditClassDialog
                            classData={c}
                            schoolId={schoolId}
                            onSaved={refresh}
                          />
                        )}
                      </div>
                    ))}
                    {classes.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No classes yet</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Create Section */}
              <div className="space-y-3">
                <p className="font-medium">Create New Section</p>
                <div className="space-y-2">
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input 
                      value={newSectionName} 
                      onChange={(e) => setNewSectionName(e.target.value)} 
                      placeholder="e.g. A, B, Science" 
                    />
                    <Button onClick={createSection}>
                      <Plus className="mr-2 h-4 w-4" /> Create
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[250px] rounded-xl border">
                  <div className="p-3 space-y-2">
                    {sections.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="secondary" className="ml-2">
                            {classes.find((c) => c.id === s.class_id)?.name ?? "—"}
                          </Badge>
                          {s.room && (
                            <span className="ml-2 text-xs text-muted-foreground">Room: {s.room}</span>
                          )}
                        </div>
                        {schoolId && (
                          <EditSectionDialog
                            section={s}
                            classes={classes}
                            schoolId={schoolId}
                            onSaved={refresh}
                          />
                        )}
                      </div>
                    ))}
                    {sections.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No sections yet</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          <AssessmentManagerCard schoolId={schoolId} />

          {schoolId && <GradeThresholdsCard schoolId={schoolId} />}
        </TabsContent>
      </Tabs>

      {/* Edit Student Dialog */}
      <Dialog open={showEditStudentDialog} onOpenChange={setShowEditStudentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription>
              Update student information below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input
                value={editStudentForm.first_name}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, first_name: e.target.value })}
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input
                value={editStudentForm.last_name}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, last_name: e.target.value })}
                placeholder="Last name"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Name *</Label>
              <Input
                value={editStudentForm.parent_name}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, parent_name: e.target.value })}
                placeholder="Parent name"
              />
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={editStudentForm.section_id}
                onValueChange={(val) => setEditStudentForm({ ...editStudentForm, section_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editStudentForm.status}
                onValueChange={(val) => setEditStudentForm({ ...editStudentForm, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enrolled">Enrolled</SelectItem>
                  <SelectItem value="inquiry">Inquiry</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  <SelectItem value="graduated">Graduated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditStudentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditStudent} disabled={studentSubmitting}>
              {studentSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Student Dialog */}
      <AlertDialog open={showDeleteStudentDialog} onOpenChange={setShowDeleteStudentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                {editingStudent?.first_name} {editingStudent?.last_name || ""}
              </span>
              ? This will also remove their enrollment records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {studentSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
