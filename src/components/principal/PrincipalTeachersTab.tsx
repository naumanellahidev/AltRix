import { useCallback, useEffect, useMemo, useState } from "react";
import { TeacherPerformanceReport } from "./TeacherPerformanceReport";
import { LiveTeacherPresenceCard } from "./LiveTeacherPresenceCard";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  GraduationCap,
  Mail,
  Phone,
  Search,
  User,
} from "lucide-react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, subWeeks, subMonths, eachDayOfInterval, isSameDay, isToday } from "date-fns";

interface Teacher {
  user_id: string;
  email: string;
  display_name: string | null;
  phone?: string | null;
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

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
}

interface TeacherAssignment {
  teacher_user_id: string;
  class_section_id: string;
}

interface TeacherSubjectAssignment {
  teacher_user_id: string;
  class_section_id: string;
  subject_id: string;
}

interface TimetableEntry {
  id: string;
  subject_name: string;
  day_of_week: number;
  period_id: string;
  room: string | null;
  teacher_user_id: string | null;
  class_section_id: string | null;
}

interface Period {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  is_break: boolean;
}

interface PrincipalTeachersTabProps {
  schoolId: string;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function PrincipalTeachersTab({ schoolId }: PrincipalTeachersTabProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [teacherSubjectAssignments, setTeacherSubjectAssignments] = useState<TeacherSubjectAssignment[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let teacherRolesData: any[] = [];
      let directoryData: any[] = [];
      let classesData: any[] = [];
      let sectionsData: any[] = [];
      let subjectsData: any[] = [];
      let assignmentsData: any[] = [];
      let subjectAssignmentsData: any[] = [];
      let timetableData: any[] = [];
      let periodsData: any[] = [];

      if (USE_FASTAPI) {
        const [
          dirRes,
          classesRes,
          sectionsRes,
          subjectsRes,
          assignmentsRes,
          subAssignmentsRes,
          timetableRes,
          periodsRes,
        ] = await Promise.all([
          apiClient.get("/teachers/directory"),
          apiClient.get("/academic/classes"),
          apiClient.get("/academic/sections"),
          apiClient.get("/academic/subjects"),
          apiClient.get("/teachers/class-assignments"),
          apiClient.get("/teachers/subject-assignments"),
          apiClient.get("/academic/timetable"),
          apiClient.get("/academic/periods"),
        ]);

        directoryData = dirRes.data || [];
        classesData = classesRes.data || [];
        sectionsData = sectionsRes.data || [];
        subjectsData = subjectsRes.data || [];
        assignmentsData = assignmentsRes.data || [];
        subjectAssignmentsData = subAssignmentsRes.data || [];
        timetableData = timetableRes.data || [];
        periodsData = periodsRes.data || [];
        
        teacherRolesData = (directoryData || []).map((t: any) => ({ user_id: t.user_id }));
      } else {
        const [
          teacherRolesRes,
          directoryRes,
          classesRes,
          sectionsRes,
          subjectsRes,
          assignmentsRes,
          subjectAssignmentsRes,
          timetableRes,
          periodsRes,
        ] = await Promise.all([
          supabase
            .from("user_roles")
            .select("user_id")
            .eq("school_id", schoolId)
            .eq("role", "teacher"),
          supabase.rpc("get_school_user_directory", { _school_id: schoolId }),
          supabase.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name"),
          supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId),
          supabase.from("subjects").select("id, name, code").eq("school_id", schoolId),
          (supabase as any).from("teacher_assignments").select("teacher_user_id, class_section_id").eq("school_id", schoolId),
          (supabase as any).from("teacher_subject_assignments").select("teacher_user_id, class_section_id, subject_id").eq("school_id", schoolId),
          supabase.from("timetable_entries").select("id, subject_name, day_of_week, period_id, room, teacher_user_id, class_section_id").eq("school_id", schoolId),
          supabase.from("timetable_periods").select("id, label, sort_order, start_time, end_time, is_break").eq("school_id", schoolId).order("sort_order"),
        ]);

        teacherRolesData = teacherRolesRes.data || [];
        directoryData = directoryRes.data || [];
        classesData = classesRes.data || [];
        sectionsData = sectionsRes.data || [];
        subjectsData = subjectsRes.data || [];
        assignmentsData = assignmentsRes.data || [];
        subjectAssignmentsData = subjectAssignmentsRes.data || [];
        timetableData = timetableRes.data || [];
        periodsData = periodsRes.data || [];
      }

      const teacherUserIds = new Set((teacherRolesData ?? []).map((r: { user_id: string }) => r.user_id));
      const teachersList = (directoryData ?? []).filter((d: Teacher) => teacherUserIds.has(d.user_id));

      setTeachers(teachersList as Teacher[]);
      setClasses((classesData ?? []) as ClassRow[]);
      setSections((sectionsData ?? []) as SectionRow[]);
      setSubjects((subjectsData ?? []) as SubjectRow[]);
      setTeacherAssignments((assignmentsData ?? []) as TeacherAssignment[]);
      setTeacherSubjectAssignments((subjectAssignmentsData ?? []) as TeacherSubjectAssignment[]);
      setTimetableEntries((timetableData ?? []) as TimetableEntry[]);
      setPeriods((periodsData ?? []) as Period[]);
    } catch (err) {
      console.error("Error loading teachers data:", err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const getSectionLabel = useCallback((sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return "Unknown";
    const cls = classes.find((c) => c.id === section.class_id);
    return `${cls?.name ?? "Class"} • ${section.name}`;
  }, [sections, classes]);

  const getSubjectName = useCallback((subjectId: string) => {
    return subjects.find((s) => s.id === subjectId)?.name ?? "Unknown";
  }, [subjects]);

  // Compute teacher details
  const teacherDetails = useMemo(() => {
    return teachers.map((teacher) => {
      const assignedSections = teacherAssignments
        .filter((a) => a.teacher_user_id === teacher.user_id)
        .map((a) => ({
          sectionId: a.class_section_id,
          label: getSectionLabel(a.class_section_id),
        }));

      const subjectsBySection = new Map<string, string[]>();
      teacherSubjectAssignments
        .filter((tsa) => tsa.teacher_user_id === teacher.user_id)
        .forEach((tsa) => {
          const existing = subjectsBySection.get(tsa.class_section_id) || [];
          existing.push(getSubjectName(tsa.subject_id));
          subjectsBySection.set(tsa.class_section_id, existing);
        });

      const allSectionIds = new Set([
        ...assignedSections.map((s) => s.sectionId),
        ...subjectsBySection.keys(),
      ]);

      const sectionDetails = Array.from(allSectionIds).map((sectionId) => ({
        sectionId,
        label: getSectionLabel(sectionId),
        subjects: subjectsBySection.get(sectionId) || [],
        isClassTeacher: assignedSections.some((s) => s.sectionId === sectionId),
      }));

      const teacherTimetable = timetableEntries.filter((e) => e.teacher_user_id === teacher.user_id);

      return {
        ...teacher,
        sectionDetails,
        totalSections: sectionDetails.length,
        totalSubjects: new Set(
          teacherSubjectAssignments
            .filter((tsa) => tsa.teacher_user_id === teacher.user_id)
            .map((tsa) => tsa.subject_id)
        ).size,
        timetable: teacherTimetable,
        totalPeriods: teacherTimetable.length,
      };
    });
  }, [teachers, teacherAssignments, teacherSubjectAssignments, timetableEntries, getSectionLabel, getSubjectName]);

  const filteredTeachers = useMemo(() => {
    let result = teacherDetails;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.display_name?.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q),
      );
    }
    if (filterSection !== "all") {
      result = result.filter((t) => t.sectionDetails.some((s) => s.sectionId === filterSection));
    }
    if (filterClass !== "all") {
      const classSectionIds = new Set(sections.filter((s) => s.class_id === filterClass).map((s) => s.id));
      result = result.filter((t) => t.sectionDetails.some((s) => classSectionIds.has(s.sectionId)));
    }
    return result;
  }, [teacherDetails, searchQuery, filterSection, filterClass, sections]);

  const selectedTeacher = useMemo(() => {
    return teacherDetails.find((t) => t.user_id === selectedTeacherId) ?? null;
  }, [teacherDetails, selectedTeacherId]);

  // Date navigation
  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "daily") {
      setCurrentDate((d) => {
        const newDate = new Date(d);
        newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
        return newDate;
      });
    } else if (viewMode === "weekly") {
      setCurrentDate((d) => (direction === "next" ? addWeeks(d, 1) : subWeeks(d, 1)));
    } else {
      setCurrentDate((d) => (direction === "next" ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const dateRangeLabel = useMemo(() => {
    if (viewMode === "daily") {
      return format(currentDate, "EEEE, MMMM d, yyyy");
    } else if (viewMode === "weekly") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
    } else {
      return format(currentDate, "MMMM yyyy");
    }
  }, [viewMode, currentDate]);

  // Filter timetable by view mode
  const getFilteredTimetable = useCallback(
    (entries: TimetableEntry[]) => {
      if (viewMode === "daily") {
        const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
        return entries.filter((e) => e.day_of_week === dayOfWeek);
      }
      // For weekly and monthly, show all days (timetable is typically weekly pattern)
      return entries;
    },
    [viewMode, currentDate]
  );

  // Monthly calendar days
  const monthDays = useMemo(() => {
    if (viewMode !== "monthly") return [];
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [viewMode, currentDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading teachers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <LiveTeacherPresenceCard schoolId={schoolId} />
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Total Teachers</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">{teachers.length}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Class Teachers</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">
            {teacherAssignments.length}
          </p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Subject Assign.</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">
            {teacherSubjectAssignments.length}
          </p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Timetable Entries</p>
          <p className="mt-0.5 font-display text-xl font-semibold sm:mt-1 sm:text-2xl">
            {timetableEntries.length}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search teachers by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
        <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setFilterSection("all"); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
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
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sections
              .filter((s) => filterClass === "all" || s.class_id === filterClass)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>{getSectionLabel(s.id)}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        {(searchQuery || filterSection !== "all" || filterClass !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setFilterSection("all"); setFilterClass("all"); }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
        {/* Teacher List */}
        <Card className="lg:col-span-1">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
              Teachers ({filteredTeachers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 sm:pt-0">
            <ScrollArea className="h-[300px] sm:h-[400px] lg:h-[500px]">
              <div className="space-y-1.5 sm:space-y-2">
                {filteredTeachers.map((teacher) => (
                  <button
                    key={teacher.user_id}
                    onClick={() => setSelectedTeacherId(teacher.user_id)}
                    className={`w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 sm:rounded-xl sm:p-3 ${
                      selectedTeacherId === teacher.user_id
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
                          {teacher.display_name || teacher.email.split("@")[0]}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                          {teacher.email}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        {teacher.totalSections} {teacher.totalSections === 1 ? "section" : "sections"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        {teacher.totalSubjects} {teacher.totalSubjects === 1 ? "subject" : "subjects"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        {teacher.totalPeriods} {teacher.totalPeriods === 1 ? "period" : "periods"}
                      </Badge>
                    </div>
                  </button>
                ))}
                {filteredTeachers.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground sm:py-8 sm:text-sm">
                    No teachers found
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Teacher Details Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3">
            <CardTitle className="truncate text-base sm:text-lg">
              {selectedTeacher
                ? selectedTeacher.display_name || selectedTeacher.email.split("@")[0]
                : "Select a Teacher"}
            </CardTitle>
            {selectedTeacher && (
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{selectedTeacher.email}</p>
            )}
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            {!selectedTeacher ? (
              <div className="flex h-[200px] items-center justify-center sm:h-[300px] lg:h-[400px]">
                <p className="text-sm text-muted-foreground">
                  Select a teacher to view details
                </p>
              </div>
            ) : (
              <Tabs defaultValue="overview" className="space-y-3 sm:space-y-4">
                <TabsList className="w-full grid grid-cols-3 sm:w-auto sm:inline-flex">
                  <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                  <TabsTrigger value="timetable" className="text-xs sm:text-sm">Timetable</TabsTrigger>
                  <TabsTrigger value="performance" className="text-xs sm:text-sm">Performance</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 sm:space-y-4">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="rounded-lg bg-muted/50 p-2 text-center sm:rounded-xl sm:p-3">
                      <GraduationCap className="mx-auto h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      <p className="mt-0.5 text-lg font-semibold sm:mt-1 sm:text-xl">{selectedTeacher.totalSections}</p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Sections</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2 text-center sm:rounded-xl sm:p-3">
                      <BookOpen className="mx-auto h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      <p className="mt-0.5 text-lg font-semibold sm:mt-1 sm:text-xl">{selectedTeacher.totalSubjects}</p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Subjects</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2 text-center sm:rounded-xl sm:p-3">
                      <CalendarDays className="mx-auto h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      <p className="mt-0.5 text-lg font-semibold sm:mt-1 sm:text-xl">{selectedTeacher.totalPeriods}</p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Periods</p>
                    </div>
                  </div>

                  {/* Section Assignments */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Class & Section Assignments</h4>
                    {selectedTeacher.sectionDetails.length === 0 ? (
                      <p className="text-xs text-muted-foreground sm:text-sm">No sections assigned yet.</p>
                    ) : (
                      <ScrollArea className="h-[180px] sm:h-[280px]">
                        <div className="space-y-1.5 sm:space-y-2">
                          {selectedTeacher.sectionDetails.map((section) => (
                            <div
                              key={section.sectionId}
                              className="rounded-lg border bg-surface p-2 sm:p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <GraduationCap className="h-3 w-3 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
                                  <span className="truncate text-xs font-medium sm:text-sm">{section.label}</span>
                                </div>
                                {section.isClassTeacher && (
                                  <Badge className="shrink-0 text-[10px] sm:text-xs">Class Teacher</Badge>
                                )}
                              </div>
                              {section.subjects.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
                                  {section.subjects.map((subj, i) => (
                                    <Badge key={i} variant="secondary" className="text-[10px] sm:text-xs">
                                      {subj}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="timetable" className="space-y-3 sm:space-y-4">
                  {/* View Controls */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDate("prev")}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[140px] text-center text-xs font-medium sm:min-w-[180px] sm:text-sm">
                        {dateRangeLabel}
                      </span>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDate("next")}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentDate(new Date())}
                        className="text-xs"
                      >
                        Today
                      </Button>
                      <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                        <SelectTrigger className="w-[100px] h-8 text-xs sm:w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Timetable Display */}
                  <div className="overflow-x-auto">
                    <ScrollArea className="h-[220px] sm:h-[320px]">
                      <div className="min-w-[600px]">
                        {viewMode === "monthly" ? (
                          <MonthlyCalendarView
                            days={monthDays}
                            entries={selectedTeacher.timetable}
                            periods={periods}
                            getSectionLabel={getSectionLabel}
                          />
                        ) : viewMode === "daily" ? (
                          <DailyTimetableView
                            entries={getFilteredTimetable(selectedTeacher.timetable)}
                            periods={periods}
                            getSectionLabel={getSectionLabel}
                          />
                        ) : (
                          <WeeklyTimetableView
                            entries={selectedTeacher.timetable}
                            periods={periods}
                            getSectionLabel={getSectionLabel}
                          />
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="performance" className="space-y-3 sm:space-y-4">
                  <TeacherPerformanceReport
                    schoolId={schoolId}
                    teacherUserId={selectedTeacher.user_id}
                    teacherName={selectedTeacher.display_name || selectedTeacher.email.split("@")[0]}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Teacher Accordion List - Hidden on mobile for cleaner UX */}
      <Card className="hidden sm:block">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3">
          <CardTitle className="text-base sm:text-lg">All Teachers Detail View</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <ScrollArea className="h-[300px] pr-2 sm:h-[400px] sm:pr-4">
            <Accordion type="multiple" className="space-y-1.5 sm:space-y-2">
              {filteredTeachers.map((teacher) => (
                <AccordionItem
                  key={teacher.user_id}
                  value={teacher.user_id}
                  className="rounded-lg border bg-surface px-3 sm:rounded-xl sm:px-4"
                >
                  <AccordionTrigger className="py-2 hover:no-underline sm:py-3">
                    <div className="flex flex-1 items-center justify-between gap-2 pr-2 sm:pr-4">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 sm:h-9 sm:w-9">
                          <User className="h-3 w-3 text-primary sm:h-4 sm:w-4" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-xs font-medium sm:text-sm">
                            {teacher.display_name || teacher.email.split("@")[0]}
                          </p>
                          <p className="hidden truncate text-[10px] text-muted-foreground sm:block sm:text-xs">{teacher.email}</p>
                        </div>
                      </div>
                      <div className="hidden items-center gap-1 sm:flex sm:gap-2">
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          <GraduationCap className="mr-0.5 h-2.5 w-2.5 sm:mr-1 sm:h-3 sm:w-3" />
                          {teacher.totalSections}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          <BookOpen className="mr-0.5 h-2.5 w-2.5 sm:mr-1 sm:h-3 sm:w-3" />
                          {teacher.totalSubjects}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          <CalendarDays className="mr-0.5 h-2.5 w-2.5 sm:mr-1 sm:h-3 sm:w-3" />
                          {teacher.totalPeriods}
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 sm:pb-4">
                    <div className="space-y-3 sm:space-y-4">
                      {/* Section Assignments */}
                      <div>
                        <h5 className="mb-1.5 text-xs font-medium text-muted-foreground sm:mb-2 sm:text-sm">
                          Section Assignments
                        </h5>
                        {teacher.sectionDetails.length === 0 ? (
                          <p className="text-xs text-muted-foreground sm:text-sm">No sections assigned.</p>
                        ) : (
                          <div className="grid gap-1.5 sm:gap-2 sm:grid-cols-2">
                            {teacher.sectionDetails.map((section) => (
                              <div
                                key={section.sectionId}
                                className="rounded-md bg-muted/50 p-2 sm:rounded-lg sm:p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-xs font-medium sm:text-sm">{section.label}</span>
                                  {section.isClassTeacher && (
                                    <Badge className="shrink-0 text-[10px] sm:text-xs">CT</Badge>
                                  )}
                                </div>
                                {section.subjects.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-0.5 sm:mt-2 sm:gap-1">
                                    {section.subjects.map((subj, i) => (
                                      <Badge key={i} variant="secondary" className="text-[10px] sm:text-xs">
                                        {subj}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Mini Weekly Timetable */}
                      <div>
                        <h5 className="mb-1.5 text-xs font-medium text-muted-foreground sm:mb-2 sm:text-sm">
                          Weekly Schedule ({teacher.totalPeriods} {teacher.totalPeriods === 1 ? "period" : "periods"})
                        </h5>
                        <MiniWeeklyTimetable
                          entries={teacher.timetable}
                          periods={periods}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Sub-components for timetable views
function WeeklyTimetableView({
  entries,
  periods,
  getSectionLabel,
}: {
  entries: TimetableEntry[];
  periods: Period[];
  getSectionLabel: (id: string) => string;
}) {
  const nonBreakPeriods = periods.filter((p) => !p.is_break);
  const days = [1, 2, 3, 4, 5, 6];

  const getEntry = (dayOfWeek: number, periodId: string) => {
    return entries.find((e) => e.day_of_week === dayOfWeek && e.period_id === periodId);
  };

  if (nonBreakPeriods.length === 0) {
    return <p className="text-sm text-muted-foreground">No periods configured.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px] whitespace-nowrap">Period</TableHead>
              {days.map((d) => (
                <TableHead key={d} className="text-center whitespace-nowrap">{DAY_NAMES[d]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonBreakPeriods.map((period) => (
              <TableRow key={period.id}>
                <TableCell className="font-medium">
                  <div>
                    <p className="text-sm whitespace-nowrap">{period.label}</p>
                    {period.start_time && (
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {period.start_time?.slice(0, 5)}
                      </p>
                    )}
                  </div>
                </TableCell>
                {days.map((d) => {
                  const entry = getEntry(d, period.id);
                  return (
                    <TableCell key={d} className="text-center">
                      {entry ? (
                        <div className="rounded-md bg-primary/10 p-1.5">
                          <p className="text-xs font-medium whitespace-nowrap">{entry.subject_name}</p>
                          {entry.class_section_id && (
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              {getSectionLabel(entry.class_section_id)}
                            </p>
                          )}
                          {entry.room && (
                            <p className="text-xs text-muted-foreground whitespace-nowrap">{entry.room}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DailyTimetableView({
  entries,
  periods,
  getSectionLabel,
}: {
  entries: TimetableEntry[];
  periods: Period[];
  getSectionLabel: (id: string) => string;
}) {
  const sortedPeriods = periods.filter((p) => !p.is_break);

  if (entries.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No classes scheduled for this day</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sortedPeriods.map((period) => {
        const entry = entries.find((e) => e.period_id === period.id);
        const isBreak = periods.find((p) => p.id === period.id)?.is_break;

        return (
          <div
            key={period.id}
            className={`rounded-xl border p-3 ${
              entry ? "bg-primary/5 border-primary/20" : "bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="font-medium">{period.label}</p>
                  {period.start_time && period.end_time && (
                    <p className="text-xs text-muted-foreground">
                      {period.start_time.slice(0, 5)} - {period.end_time.slice(0, 5)}
                    </p>
                  )}
                </div>
                <div className="h-8 w-px bg-border" />
                {entry ? (
                  <div>
                    <p className="font-medium">{entry.subject_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {entry.class_section_id && (
                        <span>{getSectionLabel(entry.class_section_id)}</span>
                      )}
                      {entry.room && <span>• Room: {entry.room}</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Free period</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyCalendarView({
  days,
  entries,
  periods,
  getSectionLabel,
}: {
  days: Date[];
  entries: TimetableEntry[];
  periods: Period[];
  getSectionLabel: (id: string) => string;
}) {
  const getEntriesForDay = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    return entries.filter((e) => e.day_of_week === dayOfWeek);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[450px]">
        <div className="grid grid-cols-7 gap-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {/* Padding for first week */}
          {days[0] && Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
            <div key={`pad-${i}`} className="p-2" />
          ))}
          {days.map((day) => {
            const dayEntries = getEntriesForDay(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[60px] rounded-lg border p-1 ${
                  isToday(day)
                    ? "border-primary bg-primary/5"
                    : isWeekend
                    ? "bg-muted/30"
                    : "bg-surface"
                }`}
              >
                <p className={`text-xs font-medium ${isToday(day) ? "text-primary" : ""}`}>
                  {format(day, "d")}
                </p>
                {dayEntries.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dayEntries.length} periods
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniWeeklyTimetable({
  entries,
  periods,
}: {
  entries: TimetableEntry[];
  periods: Period[];
}) {
  const days = [1, 2, 3, 4, 5, 6];

  const countByDay = useMemo(() => {
    const counts = new Map<number, number>();
    entries.forEach((e) => {
      counts.set(e.day_of_week, (counts.get(e.day_of_week) || 0) + 1);
    });
    return counts;
  }, [entries]);

  return (
    <div className="flex gap-1">
      {days.map((d) => {
        const count = countByDay.get(d) || 0;
        return (
          <div
            key={d}
            className={`flex-1 rounded-lg p-2 text-center ${
              count > 0 ? "bg-primary/10" : "bg-muted/50"
            }`}
          >
            <p className="text-xs font-medium">{DAY_NAMES[d]}</p>
            <p className="text-lg font-semibold">{count}</p>
          </div>
        );
      })}
    </div>
  );
}
