import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Edit,
  GraduationCap,
  Percent,
  Plus,
  Search,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { StudentFormDialog, EMPTY_STUDENT_FORM, type StudentFormValues, type ParentUserOption } from "@/components/academic/StudentFormDialog";

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
  parent_name: string | null;
  student_code: string | null;
  date_of_birth: string | null;
  status: string;
  profile_id: string | null;
  created_at: string;
  address?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
}

interface ClassRow {
  id: string;
  name: string;
}

interface SectionRow {
  id: string;
  name: string;
  class_id: string;
}

interface Enrollment {
  student_id: string;
  class_section_id: string;
}

interface AttendanceStats {
  student_id: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

interface PrincipalStudentsTabProps {
  schoolId: string;
}

export function PrincipalStudentsTab({ schoolId }: PrincipalStudentsTabProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<Map<string, AttendanceStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAttendance, setFilterAttendance] = useState<string>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Form states for add/edit
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    parent_name: "",
    date_of_birth: "",
    section_id: "",
    status: "enrolled",
    address: "",
    phone: "",
    parent_phone: "",
    parent_email: "",
  });
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parentUsers, setParentUsers] = useState<ParentUserOption[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [editInitial, setEditInitial] = useState<Partial<StudentFormValues> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      let studentsData: any[] = [];
      let classesData: any[] = [];
      let sectionsData: any[] = [];
      let enrollmentsData: any[] = [];
      let attendanceData: any[] = [];
      let subjectsData: any[] = [];
      let parentUsersData: any[] = [];

      if (USE_FASTAPI) {
        const [
          studentsRes,
          classesRes,
          sectionsRes,
          enrollmentsRes,
          attendanceRes,
          subjectsRes,
          parentsRes,
        ] = await Promise.all([
          apiClient.get("/students", { params: { page_size: 1000 } }),
          apiClient.get("/academic/classes"),
          apiClient.get("/academic/sections"),
          apiClient.get("/students/enrollments"),
          apiClient.get("/attendance/recent-entries", { params: { from_date: sevenDaysAgo } }),
          apiClient.get("/academic/subjects"),
          apiClient.get("/students/parents"),
        ]);

        studentsData = studentsRes.data?.data || studentsRes.data || [];
        classesData = classesRes.data || [];
        sectionsData = sectionsRes.data || [];
        enrollmentsData = enrollmentsRes.data || [];
        attendanceData = attendanceRes.data || [];
        subjectsData = subjectsRes.data || [];
        parentUsersData = parentsRes.data || [];
      } else {
        const [
          studentsRes,
          classesRes,
          sectionsRes,
          enrollmentsRes,
          attendanceRes,
          subjectsRes,
          parentRolesRes,
        ] = await Promise.all([
          (supabase as any)
            .from("students")
            .select("id, first_name, last_name, parent_name, student_code, date_of_birth, status, profile_id, created_at, address, phone, parent_phone, parent_email")
            .eq("school_id", schoolId)
            .order("first_name"),
          supabase.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name"),
          supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId),
          supabase.from("student_enrollments").select("student_id, class_section_id").eq("school_id", schoolId),
          supabase
            .from("attendance_entries")
            .select("student_id, status")
            .eq("school_id", schoolId)
            .gte("created_at", sevenDaysAgo),
          supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
          supabase.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", "parent"),
        ]);

        studentsData = studentsRes.data || [];
        classesData = classesRes.data || [];
        sectionsData = sectionsRes.data || [];
        enrollmentsData = enrollmentsRes.data || [];
        attendanceData = attendanceRes.data || [];
        subjectsData = subjectsRes.data || [];

        // Load parent user options via directory RPC, filtered by parent role
        const parentIds = new Set((parentRolesRes.data ?? []).map((r: any) => r.user_id));
        if (parentIds.size > 0) {
          const { data: dir } = await (supabase as any).rpc("get_school_user_directory", {
            _school_id: schoolId,
          });
          parentUsersData = ((dir ?? []) as any[])
            .filter((u) => parentIds.has(u.user_id))
            .map((u) => ({
              user_id: u.user_id,
              email: u.email ?? "",
              full_name: u.display_name ?? u.email ?? "Parent",
            }));
        }
      }

      setStudents(studentsData as unknown as Student[]);
      setClasses(classesData as ClassRow[]);
      setSections(sectionsData as SectionRow[]);
      setEnrollments(enrollmentsData as Enrollment[]);
      setSubjects(subjectsData as { id: string; name: string }[]);
      setParentUsers(parentUsersData.map((u: any) => ({
        user_id: u.user_id,
        email: u.email ?? "",
        full_name: u.full_name || u.display_name || u.email || "Parent",
      })));

      // Process attendance stats
      const statsMap = new Map<string, AttendanceStats>();
      attendanceData.forEach((entry: any) => {
        const existing = statsMap.get(entry.student_id) || {
          student_id: entry.student_id,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
        };
        existing.total++;
        if (entry.status === "present") existing.present++;
        else if (entry.status === "absent") existing.absent++;
        else if (entry.status === "late") existing.late++;
        statsMap.set(entry.student_id, existing);
      });
      setAttendanceStats(statsMap);
    } catch (err) {
      console.error("Error loading students data:", err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const getSectionLabel = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return "Unassigned";
      const cls = classes.find((c) => c.id === section.class_id);
      return `${cls?.name ?? "Class"} • ${section.name}`;
    },
    [sections, classes]
  );

  const getStudentSection = useCallback(
    (studentId: string) => {
      const enrollment = enrollments.find((e) => e.student_id === studentId);
      return enrollment ? enrollment.class_section_id : null;
    },
    [enrollments]
  );

  // Enriched students with section and stats
  const enrichedStudents = useMemo(() => {
    return students.map((student) => {
      const sectionId = getStudentSection(student.id);
      const attendance = attendanceStats.get(student.id);
      const attendanceRate = attendance && attendance.total > 0
        ? Math.round((attendance.present / attendance.total) * 100)
        : null;

      return {
        ...student,
        sectionId,
        sectionLabel: sectionId ? getSectionLabel(sectionId) : "Unassigned",
        attendanceRate,
        attendanceStats: attendance,
      };
    });
  }, [students, getStudentSection, getSectionLabel, attendanceStats]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    let result = enrichedStudents;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name?.toLowerCase().includes(q) ||
          s.parent_name?.toLowerCase().includes(q) ||
          s.student_code?.toLowerCase().includes(q) ||
          s.parent_email?.toLowerCase().includes(q) ||
          s.parent_phone?.toLowerCase().includes(q) ||
          s.phone?.toLowerCase().includes(q),
      );
    }

    if (filterClass !== "all") {
      const classSectionIds = new Set(sections.filter((s) => s.class_id === filterClass).map((s) => s.id));
      result = result.filter((s) => s.sectionId && classSectionIds.has(s.sectionId));
    }

    if (filterSection !== "all") {
      result = result.filter((s) => s.sectionId === filterSection);
    }

    if (filterStatus !== "all") {
      result = result.filter((s) => s.status === filterStatus);
    }

    if (filterAttendance !== "all") {
      result = result.filter((s) => {
        if (s.attendanceRate === null) return filterAttendance === "no_data";
        if (filterAttendance === "low") return s.attendanceRate < 75;
        if (filterAttendance === "good") return s.attendanceRate >= 75 && s.attendanceRate < 90;
        if (filterAttendance === "excellent") return s.attendanceRate >= 90;
        return true;
      });
    }

    return result;
  }, [enrichedStudents, searchQuery, filterClass, filterSection, filterStatus, filterAttendance, sections]);

  const selectedStudent = useMemo(() => {
    return enrichedStudents.find((s) => s.id === selectedStudentId) ?? null;
  }, [enrichedStudents, selectedStudentId]);

  // Stats
  const stats = useMemo(() => {
    const enrolled = students.filter((s) => s.status === "enrolled").length;
    const inquiry = students.filter((s) => s.status === "inquiry").length;
    const avgAttendance = enrichedStudents
      .filter((s) => s.attendanceRate !== null)
      .reduce((sum, s, _, arr) => sum + (s.attendanceRate ?? 0) / arr.length, 0);

    return {
      total: students.length,
      enrolled,
      inquiry,
      avgAttendance: Math.round(avgAttendance),
    };
  }, [students, enrichedStudents]);

  // CRUD Operations
  const handleAddStudent = async () => {
    if (!formData.first_name.trim()) return toast.error("First name is required");
    if (!formData.parent_name.trim()) return toast.error("Parent name is required for identification");
    if (!formData.section_id) return toast.error("Please select a section");

    setSubmitting(true);
    try {
      if (USE_FASTAPI) {
        await apiClient.post("/students", {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim() || "",
          parent_name: formData.parent_name.trim(),
          date_of_birth: formData.date_of_birth || null,
          status: formData.status === "enrolled" ? "active" : formData.status,
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          parent_phone: formData.parent_phone.trim() || null,
          parent_email: formData.parent_email.trim() || null,
          section_id: formData.section_id,
        });
      } else {
        const { data: student, error } = await supabase
          .from("students")
          .insert({
            school_id: schoolId,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim() || null,
            parent_name: formData.parent_name.trim(),
            date_of_birth: formData.date_of_birth || null,
            status: formData.status,
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            parent_phone: formData.parent_phone.trim() || null,
            parent_email: formData.parent_email.trim() || null,
          } as any)
          .select("id")
          .single();

        if (error) throw error;

        const { error: enrollError } = await supabase.from("student_enrollments").insert({
          school_id: schoolId,
          student_id: student.id,
          class_section_id: formData.section_id,
        });

        if (enrollError) throw enrollError;
      }

      toast.success("Student added successfully");
      setShowAddDialog(false);
      resetForm();
      await fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStudent = async () => {
    if (!editingStudent) return;
    if (!formData.first_name.trim()) return toast.error("First name is required");
    if (!formData.parent_name.trim()) return toast.error("Parent name is required");

    setSubmitting(true);
    try {
      if (USE_FASTAPI) {
        await apiClient.patch(`/students/${editingStudent.id}`, {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim() || "",
          parent_name: formData.parent_name.trim(),
          date_of_birth: formData.date_of_birth || null,
          status: formData.status === "enrolled" ? "active" : formData.status,
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          parent_phone: formData.parent_phone.trim() || null,
          parent_email: formData.parent_email.trim() || null,
          section_id: formData.section_id,
        });
      } else {
        const { error } = await supabase
          .from("students")
          .update({
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim() || null,
            parent_name: formData.parent_name.trim(),
            date_of_birth: formData.date_of_birth || null,
            status: formData.status,
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            parent_phone: formData.parent_phone.trim() || null,
            parent_email: formData.parent_email.trim() || null,
          } as any)
          .eq("id", editingStudent.id);

        if (error) throw error;

        // Update enrollment if section changed
        const currentEnrollment = enrollments.find((e) => e.student_id === editingStudent.id);
        if (formData.section_id && formData.section_id !== currentEnrollment?.class_section_id) {
          if (currentEnrollment) {
            await supabase
              .from("student_enrollments")
              .update({ class_section_id: formData.section_id })
              .eq("school_id", schoolId)
              .eq("student_id", editingStudent.id);
          } else {
            await supabase.from("student_enrollments").insert({
              school_id: schoolId,
              student_id: editingStudent.id,
              class_section_id: formData.section_id,
            });
          }
        }
      }

      toast.success("Student updated successfully");
      setShowEditDialog(false);
      setEditingStudent(null);
      resetForm();
      await fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!editingStudent) return;

    setSubmitting(true);
    try {
      if (USE_FASTAPI) {
        await apiClient.delete(`/students/${editingStudent.id}`);
      } else {
        // Delete enrollments first (with school_id filter for RLS)
        const { error: enrollError } = await supabase
          .from("student_enrollments")
          .delete()
          .eq("school_id", schoolId)
          .eq("student_id", editingStudent.id);

        if (enrollError) {
          console.error("Enrollment delete error:", enrollError);
        }

        // Then delete student (with school_id filter for RLS)
        const { error } = await supabase
          .from("students")
          .delete()
          .eq("school_id", schoolId)
          .eq("id", editingStudent.id);

        if (error) throw error;
      }

      toast.success("Student deleted successfully");
      setShowDeleteDialog(false);
      setEditingStudent(null);
      setSelectedStudentId(null);
      await fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      parent_name: "",
      date_of_birth: "",
      section_id: "",
      status: "enrolled",
      address: "",
      phone: "",
      parent_phone: "",
      parent_email: "",
    });
  };

  const openEditDialog = (student: typeof enrichedStudents[0]) => {
    setEditingStudent(student as unknown as Student);
    setEditInitial({
      first_name: student.first_name,
      last_name: student.last_name || "",
      date_of_birth: student.date_of_birth || "",
      section_id: student.sectionId || "",
      status: student.status,
      student_code: student.student_code || "",
      address: (student as any).address || "",
      city: (student as any).city || "",
      area: (student as any).area || "",
      phone: (student as any).phone || "",
      parent_full_name: student.parent_name || "",
      parent_phone: (student as any).parent_phone || "",
      parent_email: (student as any).parent_email || "",
      profile_image_url: (student as any).profile_image_url || "",
      roll_number: (student as any).roll_number || "",
      registration_number: (student as any).registration_number || "",
      admission_date: (student as any).admission_date || "",
      gender: (student as any).gender || "",
      emergency_contact: (student as any).emergency_contact || "",
      medical_notes: (student as any).medical_notes || "",
      notes: (student as any).notes || "",
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (student: typeof enrichedStudents[0]) => {
    setEditingStudent(student);
    setShowDeleteDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading students...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Total Students</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Enrolled</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-primary sm:mt-1 sm:text-2xl">{stats.enrolled}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Inquiries</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-accent-foreground sm:mt-1 sm:text-2xl">{stats.inquiry}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Avg Attendance</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">{stats.avgAttendance}%</p>
        </div>
      </div>

      {/* Search, Filters & Add Button */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, parent, or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setFilterSection("all"); }}>
            <SelectTrigger className="flex-1 sm:w-[140px] sm:flex-none">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSection} onValueChange={setFilterSection}>
            <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections
                .filter((s) => filterClass === "all" || s.class_id === filterClass)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {getSectionLabel(s.id)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="flex-1 sm:w-[120px] sm:flex-none">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
              <SelectItem value="inquiry">Inquiry</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAttendance} onValueChange={setFilterAttendance}>
            <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none">
              <SelectValue placeholder="Attendance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Attendance</SelectItem>
              <SelectItem value="excellent">Excellent (≥90%)</SelectItem>
              <SelectItem value="good">Good (75–89%)</SelectItem>
              <SelectItem value="low">Low (&lt;75%)</SelectItem>
              <SelectItem value="no_data">No Data</SelectItem>
            </SelectContent>
          </Select>
          {(searchQuery || filterClass !== "all" || filterSection !== "all" || filterStatus !== "all" || filterAttendance !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilterClass("all");
                setFilterSection("all");
                setFilterStatus("all");
                setFilterAttendance("all");
              }}
            >
              Clear
            </Button>
          )}
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="flex-1 sm:flex-none">
            <Plus className="mr-1 h-4 w-4" /> 
            <span className="hidden sm:inline">Add Student</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Mobile: Selected Student Quick View OR Full Grid on larger screens */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
        {/* Student List */}
        <Card className="lg:col-span-1">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              Students ({filteredStudents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 sm:pt-0">
            <ScrollArea className="h-[300px] sm:h-[400px] lg:h-[500px]">
              <div className="space-y-1.5 sm:space-y-2">
                {filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 sm:rounded-xl sm:p-3 ${
                      selectedStudentId === student.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 sm:h-10 sm:w-10">
                        <User className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium sm:text-base">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                          {student.parent_name ? `${student.parent_name}` : student.sectionLabel}
                        </p>
                      </div>
                      <Badge
                        variant={student.status === "enrolled" ? "default" : "secondary"}
                        className="hidden text-[10px] sm:inline-flex sm:text-xs"
                      >
                        {student.status}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        {student.sectionLabel}
                      </Badge>
                      {student.attendanceRate !== null && (
                        <Badge
                          variant={student.attendanceRate >= 75 ? "secondary" : "destructive"}
                          className="text-[10px] sm:text-xs"
                        >
                          {student.attendanceRate}%
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
                {filteredStudents.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground sm:py-8 sm:text-sm">
                    No students found
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Student Details Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="truncate text-base sm:text-lg">
                  {selectedStudent
                    ? `${selectedStudent.first_name} ${selectedStudent.last_name || ""}`
                    : "Select a Student"}
                </CardTitle>
                {selectedStudent && (
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">
                    {selectedStudent.student_code || "No student code"}
                  </p>
                )}
              </div>
              {selectedStudent && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(selectedStudent)} className="flex-1 sm:flex-none">
                    <Edit className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> 
                    <span className="text-xs sm:text-sm">Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:bg-destructive/10 sm:flex-none"
                    onClick={() => openDeleteDialog(selectedStudent)}
                  >
                    <Trash2 className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> 
                    <span className="text-xs sm:text-sm">Delete</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            {!selectedStudent ? (
              <div className="flex h-[200px] items-center justify-center sm:h-[300px] lg:h-[400px]">
                <p className="text-sm text-muted-foreground">
                  Select a student to view details
                </p>
              </div>
            ) : (
              <Tabs defaultValue="overview" className="space-y-3 sm:space-y-4">
                <TabsList className="w-full grid grid-cols-2 sm:w-auto sm:inline-flex">
                  <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                  <TabsTrigger value="attendance" className="text-xs sm:text-sm">Attendance</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 sm:space-y-4">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="rounded-lg bg-muted/50 p-2 text-center sm:rounded-xl sm:p-3">
                      <GraduationCap className="mx-auto h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      <p className="mt-0.5 text-xs font-medium sm:mt-1 sm:text-sm">{selectedStudent.sectionLabel}</p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Section</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2 text-center sm:rounded-xl sm:p-3">
                      <Percent className="mx-auto h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      <p className="mt-0.5 text-lg font-semibold sm:mt-1 sm:text-xl">
                        {selectedStudent.attendanceRate ?? "—"}%
                      </p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Attendance (7d)</p>
                    </div>
                  </div>

                  {/* Student Info */}
                  <div className="rounded-lg border bg-surface p-3 sm:rounded-xl sm:p-4">
                    <h4 className="mb-2 text-sm font-medium sm:mb-3">Student Information</h4>
                    <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Full Name</p>
                        <p className="text-sm font-medium">
                          {selectedStudent.first_name} {selectedStudent.last_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Parent/Guardian</p>
                        <p className="text-sm font-medium">{selectedStudent.parent_name || "Not specified"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Date of Birth</p>
                        <p className="text-sm font-medium">
                          {selectedStudent.date_of_birth
                            ? format(new Date(selectedStudent.date_of_birth), "MMM d, yyyy")
                            : "Not specified"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Student Code</p>
                        <p className="text-sm font-medium">{selectedStudent.student_code || "Not assigned"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Status</p>
                        <Badge variant={selectedStudent.status === "enrolled" ? "default" : "secondary"} className="text-xs">
                          {selectedStudent.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-xs">Joined</p>
                        <p className="text-sm font-medium">
                          {format(new Date(selectedStudent.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="attendance" className="space-y-3 sm:space-y-4">
                  <AttendanceDetailView
                    stats={selectedStudent.attendanceStats}
                    attendanceRate={selectedStudent.attendanceRate}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Student Dialog (full form) */}
      <StudentFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        schoolId={schoolId}
        classes={classes}
        sections={sections}
        subjects={subjects}
        parentUsers={parentUsers}
        onSaved={() => void fetchData()}
      />

      {/* Edit Student Dialog (full form) */}
      <StudentFormDialog
        open={showEditDialog}
        onOpenChange={(o) => {
          setShowEditDialog(o);
          if (!o) {
            setEditingStudent(null);
            setEditInitial(null);
          }
        }}
        schoolId={schoolId}
        studentId={editingStudent?.id ?? null}
        initial={editInitial ?? undefined}
        classes={classes}
        sections={sections}
        subjects={subjects}
        parentUsers={parentUsers}
        onSaved={() => void fetchData()}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {editingStudent?.first_name} {editingStudent?.last_name}? 
              This action cannot be undone and will remove all associated data including enrollments 
              and attendance records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Deleting..." : "Delete Student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Sub-component for attendance detail
function AttendanceDetailView({
  stats,
  attendanceRate,
}: {
  stats?: AttendanceStats;
  attendanceRate: number | null;
}) {
  if (!stats) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No attendance data for the last 7 days</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-medium">Attendance Rate (Last 7 Days)</h4>
          <Badge variant={attendanceRate && attendanceRate >= 75 ? "default" : "destructive"}>
            {attendanceRate}%
          </Badge>
        </div>
        <Progress value={attendanceRate || 0} className="h-3" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-primary/10 p-4 text-center">
          <CheckCircle className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-2 text-2xl font-semibold text-primary">{stats.present}</p>
          <p className="text-sm text-muted-foreground">Present</p>
        </div>
        <div className="rounded-xl bg-destructive/10 p-4 text-center">
          <X className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-2xl font-semibold text-destructive">{stats.absent}</p>
          <p className="text-sm text-muted-foreground">Absent</p>
        </div>
        <div className="rounded-xl bg-accent/50 p-4 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-accent-foreground" />
          <p className="mt-2 text-2xl font-semibold text-accent-foreground">{stats.late}</p>
          <p className="text-sm text-muted-foreground">Late</p>
        </div>
      </div>
    </div>
  );
}
