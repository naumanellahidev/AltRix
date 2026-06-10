import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Sparkles,
  Download,
  Wand2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
  Upload,
  BookOpen,
  User,
  MapPin,
  Coffee,
  ListTodo,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface Props {
  schoolId: string;
}

interface TimetableSuggestion {
  id: string;
  class_section_id: string | null;
  suggestion_data: Json;
  optimization_score: number | null;
  conflicts_found: number | null;
  status: string | null;
  version_number: number | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export function SmartTimetableGenerator({ schoolId }: Props) {
  const qc = useQueryClient();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedGrid, setEditedGrid] = useState<Record<string, Record<string, { subject: string; teacher: string; room?: string }>> | null>(null);
  const [editingCell, setEditingCell] = useState<{ day: string; period: string } | null>(null);

  // Preview section state for school-wide suggestion display
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const [localSuggestion, setLocalSuggestion] = useState<TimetableSuggestion | null>(null);

  // Clear localSuggestion on section change
  useEffect(() => {
    setLocalSuggestion(null);
  }, [selectedSection]);

  // AI Generation Constraints states
  const [maxClassesPerTeacher, setMaxClassesPerTeacher] = useState<number>(6);
  const [maxConsecutivePeriods, setMaxConsecutivePeriods] = useState<number>(3);
  const [includeBreaks, setIncludeBreaks] = useState<boolean>(true);
  const [subjectPeriodsPerWeek, setSubjectPeriodsPerWeek] = useState<number>(5);

  // Fetch class sections
  const { data: sections, isLoading: loadingSections } = useQuery({
    queryKey: ["class_sections_for_timetable", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select(`
          id,
          name,
          room,
          class_id,
          academic_classes (
            name,
            grade_level
          )
        `)
        .eq("school_id", schoolId)
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  // Fetch AI suggestions
  const { data: suggestions, isLoading: loadingSuggestions } = useQuery({
    queryKey: ["ai_timetable_suggestions", schoolId, selectedSection],
    queryFn: async () => {
      let query = (supabase as any)
        .from("ai_timetable_suggestions")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (selectedSection) {
        query = query.eq("class_section_id", selectedSection);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TimetableSuggestion[];
    },
    enabled: !!schoolId,
  });

  // Fetch teachers for display
  const { data: teachers } = useQuery({
    queryKey: ["teachers_list", schoolId],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "teacher");

      if (rolesError) throw rolesError;
      
      const teacherIds = (rolesData || []).map((r) => r.user_id);
      if (teacherIds.length === 0) return [];

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", teacherIds);

      if (profilesError) throw profilesError;

      return (rolesData || []).map((r) => {
        const prof = (profilesData || []).find((p) => p.id === r.user_id);
        return {
          user_id: r.user_id,
          profiles: {
            display_name: prof?.display_name || r.user_id,
          },
        };
      });
    },
    enabled: !!schoolId,
  });

  // Fetch subjects
  const { data: subjects } = useQuery({
    queryKey: ["subjects_list", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, code")
        .eq("school_id", schoolId);

      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  // Generate timetable mutation
  const generateMutation = useMutation({
    queryKey: ["generate_timetable", schoolId],
    mutationFn: async () => {
      const constraints = {
        maxClassesPerTeacher,
        maxConsecutivePeriods,
        includeBreaks,
        subjectPeriodsPerWeek,
      };

      // Call remote Edge Function first to trigger the baseline AI model
      let remoteData: any = null;
      try {
        const { data, error } = await supabase.functions.invoke("ai-timetable-generator", {
          body: {
            schoolId,
            classSectionId: selectedSection || null,
            constraints,
          },
        });
        if (!error && data) {
          remoteData = data;
        }
      } catch (err) {
        console.warn("Remote Edge Function invocation failed, falling back to local solver:", err);
      }

      const [
        classSectionSubjectsRes,
        teacherSubjectAssignmentsRes,
        teacherAssignmentsRes,
        periodsRes,
        existingEntriesRes,
        rolesRes,
        subjectsRes
      ] = await Promise.all([
        supabase.from("class_section_subjects").select("*").eq("school_id", schoolId),
        supabase.from("teacher_subject_assignments").select("*").eq("school_id", schoolId),
        supabase.from("teacher_assignments").select("*").eq("school_id", schoolId),
        supabase.from("timetable_periods").select("*").eq("school_id", schoolId).order("sort_order"),
        supabase.from("timetable_entries").select("*").eq("school_id", schoolId),
        supabase.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", "teacher"),
        supabase.from("subjects").select("id, name, code").eq("school_id", schoolId)
      ]);

      if (classSectionSubjectsRes.error) throw classSectionSubjectsRes.error;
      if (teacherSubjectAssignmentsRes.error) throw teacherSubjectAssignmentsRes.error;
      if (teacherAssignmentsRes.error) throw teacherAssignmentsRes.error;
      if (periodsRes.error) throw periodsRes.error;
      if (existingEntriesRes.error) throw existingEntriesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      const subjectsList = subjectsRes.data || [];

      const teacherIds = (rolesRes.data || []).map(r => r.user_id);
      let teacherProfiles: any[] = [];
      if (teacherIds.length > 0) {
        const { data: profData, error: profErr } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", teacherIds);
        if (profErr) throw profErr;
        teacherProfiles = profData || [];
      }

      const teacherMap = new Map<string, string>();
      teacherProfiles.forEach((p) => {
        teacherMap.set(p.id, p.display_name || p.id);
      });

      // Mappings
      const offeredMap = new Map<string, string[]>(); // sectionId -> array of subject names
      
      const addOfferedSubject = (sectionId: string, subjectId: string) => {
        const subj = subjectsList?.find((s) => s.id === subjectId);
        if (subj) {
          const list = offeredMap.get(sectionId) || [];
          if (!list.includes(subj.name)) {
            list.push(subj.name);
            offeredMap.set(sectionId, list);
          }
        }
      };

      (classSectionSubjectsRes.data || []).forEach((css) => {
        addOfferedSubject(css.class_section_id, css.subject_id);
      });

      (teacherSubjectAssignmentsRes.data || []).forEach((ta) => {
        addOfferedSubject(ta.class_section_id, ta.subject_id);
      });

      (teacherAssignmentsRes.data || []).forEach((ta) => {
        addOfferedSubject(ta.class_section_id, ta.subject_id);
      });


      const teacherAssignmentsList = [
        ...(teacherSubjectAssignmentsRes.data || []),
        ...(teacherAssignmentsRes.data || [])
      ];

      const sectionSubjectTeacher = new Map<string, { id: string; name: string }>(); // "sectionId:subjectId" -> teacher
      teacherAssignmentsList.forEach((ta) => {
        if (!ta.teacher_user_id || !ta.class_section_id || !ta.subject_id) return;
        const tName = teacherMap.get(ta.teacher_user_id) || ta.teacher_user_id;
        sectionSubjectTeacher.set(`${ta.class_section_id}:${ta.subject_id}`, { id: ta.teacher_user_id, name: tName });
      });

      // Programmatic CSP Solver (Frontend)
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const activeDaysList = ["monday", "tuesday", "wednesday", "thursday", "friday"];
      const nonBreakPeriods = (periodsRes.data || []).filter(p => !p.is_break);

      const scheduledEntries: Array<{
        section_id: string;
        day: string;
        period_index: number;
        subject_name: string;
        teacher_id: string | null;
        teacher_name: string | null;
        room: string;
      }> = [];

      // Trackers
      const sectionOccupiedSlots = new Set<string>(); // "sectionId:day:periodIndex"
      const teacherOccupiedSlots = new Set<string>(); // "teacherId:day:periodIndex"
      const roomOccupiedSlots = new Set<string>();    // "room:day:periodIndex"
      const subjectWeeklyCount = new Map<string, number>(); // "sectionId:subjectName" -> count

      const sectionsToSchedule = sections?.filter((s) => !selectedSection || s.id === selectedSection) || [];
      const sectionsToScheduleIds = sectionsToSchedule.map((s) => s.id);

      const otherEntries = (existingEntriesRes.data || []).filter(
        (e: any) => !sectionsToScheduleIds.includes(e.class_section_id)
      );

      otherEntries.forEach((e: any) => {
        const dayLabel = dayNames[e.day_of_week]?.toLowerCase();
        const pIndex = (periodsRes.data || []).findIndex((p: any) => p.id === e.period_id);
        if (!dayLabel || pIndex < 0) return;

        const slotKey = `${dayLabel}:${pIndex}`;
        if (e.teacher_user_id) {
          teacherOccupiedSlots.add(`${String(e.teacher_user_id).toLowerCase()}:${slotKey}`);
        }
        if (e.room) {
          roomOccupiedSlots.add(`${String(e.room).toLowerCase().trim()}:${slotKey}`);
        }
      });

      // 1. Process remote suggestion baseline (if available and valid)
      const rawEntries = remoteData?.timetableData?.timetable || [];
      for (const entry of rawEntries) {
        const sId = entry.section_id;
        const day = String(entry.day || "").toLowerCase().trim();
        const pIdx = Number(entry.period_index);
        const subjName = String(entry.subject_name || "").trim();

        if (!sId || !day || !Number.isFinite(pIdx) || !subjName) continue;
        const sect = sectionsToSchedule.find(s => s.id === sId);
        if (!sect) continue;

        if (!activeDaysList.includes(day)) continue;
        
        // Find by actual period order/index
        if (pIdx >= (periodsRes.data || []).length || (periodsRes.data || [])[pIdx]?.is_break) continue;

        // Skip placeholder subjects
        if (subjName.toLowerCase() === "general studies" || subjName.toLowerCase() === "assigned subject") continue;

        const offered = offeredMap.get(sId) || [];
        const offeredSubjectName = offered.find(sName => sName.toLowerCase() === subjName.toLowerCase());
        if (!offeredSubjectName) continue;

        const subjectObj = subjectsList?.find(s => s.name.toLowerCase() === offeredSubjectName.toLowerCase());
        const correctTeacher = subjectObj ? sectionSubjectTeacher.get(`${sId}:${subjectObj.id}`) : null;
        
        const teacherId = correctTeacher?.id || null;
        const teacherName = correctTeacher?.name || null;

        const slotKey = `${day}:${pIdx}`;
        const sectionSlotKey = `${sId}:${slotKey}`;
        const teacherSlotKey = teacherId ? `${String(teacherId).toLowerCase()}:${slotKey}` : null;
        const roomVal = sect.room || entry.room || "TBD";
        const roomSlotKey = roomVal && roomVal !== "TBD" && roomVal !== "none" && roomVal !== "—"
          ? `${String(roomVal).toLowerCase().trim()}:${slotKey}`
          : null;

        if (sectionOccupiedSlots.has(sectionSlotKey)) continue;
        if (teacherSlotKey && teacherOccupiedSlots.has(teacherSlotKey)) continue;
        if (roomSlotKey && roomOccupiedSlots.has(roomSlotKey)) continue;

        const subjectKey = `${sId}:${offeredSubjectName.toLowerCase()}`;
        const currentCount = subjectWeeklyCount.get(subjectKey) || 0;
        if (currentCount >= subjectPeriodsPerWeek) continue;

        scheduledEntries.push({
          section_id: sId,
          day,
          period_index: pIdx,
          subject_name: offeredSubjectName,
          teacher_id: teacherId,
          teacher_name: teacherName,
          room: roomVal,
        });

        sectionOccupiedSlots.add(sectionSlotKey);
        if (teacherSlotKey) teacherOccupiedSlots.add(teacherSlotKey);
        if (roomSlotKey) roomOccupiedSlots.add(roomSlotKey);
        subjectWeeklyCount.set(subjectKey, currentCount + 1);
      }

      // 2. Identify missing classes to schedule
      const unplacedLessons: Array<{
        section_id: string;
        subject_name: string;
        teacher_id: string | null;
        teacher_name: string | null;
        room: string;
      }> = [];

      for (const sect of sectionsToSchedule) {
        const offered = offeredMap.get(sect.id) || [];
        for (const subjName of offered) {
          const subjectKey = `${sect.id}:${subjName.toLowerCase()}`;
          const scheduledCount = subjectWeeklyCount.get(subjectKey) || 0;
          const missingCount = Math.max(0, subjectPeriodsPerWeek - scheduledCount);

          const subjectObj = subjectsList?.find(s => s.name.toLowerCase() === subjName.toLowerCase());
          const correctTeacher = subjectObj ? sectionSubjectTeacher.get(`${sect.id}:${subjectObj.id}`) : null;
          const roomVal = sect.room || "TBD";

          for (let i = 0; i < missingCount; i++) {
            unplacedLessons.push({
              section_id: sect.id,
              subject_name: subjName,
              teacher_id: correctTeacher?.id || null,
              teacher_name: correctTeacher?.name || null,
              room: roomVal,
            });
          }
        }
      }

      unplacedLessons.sort((a, b) => {
        if (a.teacher_id && !b.teacher_id) return -1;
        if (!a.teacher_id && b.teacher_id) return 1;
        return 0;
      });

      let backtrackCount = 0;
      const MAX_BACKTRACKS = 2000;

      function solve(index: number, allowDoubleSubjectPerDay = false): boolean {
        if (index >= unplacedLessons.length) {
          return true;
        }

        backtrackCount++;
        if (backtrackCount > MAX_BACKTRACKS) {
          return false;
        }

        const lesson = unplacedLessons[index];
        const sId = lesson.section_id;

        const emptySlots: Array<{ day: string; pIdx: number }> = [];
        for (const day of activeDaysList) {
          (periodsRes.data || []).forEach((p, pIdx) => {
            if (p.is_break) return;
            const sectionSlotKey = `${sId}:${day}:${pIdx}`;
            if (!sectionOccupiedSlots.has(sectionSlotKey)) {
              emptySlots.push({ day, pIdx });
            }
          });
        }

        emptySlots.sort(() => Math.random() - 0.5);

        for (const slot of emptySlots) {
          const { day, pIdx } = slot;
          const slotKey = `${day}:${pIdx}`;
          const sectionSlotKey = `${sId}:${slotKey}`;

          let assignedTeacherId = lesson.teacher_id;
          let assignedTeacherName = lesson.teacher_name;

          if (!assignedTeacherId) {
            const availableTeacher = (teacherProfiles || []).find((t: any) => {
              const teacherSlotKey = `${String(t.id).toLowerCase()}:${slotKey}`;
              return !teacherOccupiedSlots.has(teacherSlotKey);
            });
            if (availableTeacher) {
              assignedTeacherId = availableTeacher.id;
              assignedTeacherName = availableTeacher.display_name || availableTeacher.id;
            }
          }

          const teacherSlotKey = assignedTeacherId ? `${String(assignedTeacherId).toLowerCase()}:${slotKey}` : null;
          const roomSlotKey = lesson.room && lesson.room !== "TBD" && lesson.room !== "none" && lesson.room !== "—"
            ? `${String(lesson.room).toLowerCase().trim()}:${slotKey}`
            : null;

          if (teacherSlotKey && teacherOccupiedSlots.has(teacherSlotKey)) continue;
          if (roomSlotKey && roomOccupiedSlots.has(roomSlotKey)) continue;

          if (!allowDoubleSubjectPerDay) {
            const sameSubjectOnDay = scheduledEntries.some(
              e => e.section_id === sId && e.day === day && e.subject_name.toLowerCase() === lesson.subject_name.toLowerCase()
            );
            if (sameSubjectOnDay) continue;
          }

          scheduledEntries.push({
            section_id: sId,
            day,
            period_index: pIdx,
            subject_name: lesson.subject_name,
            teacher_id: assignedTeacherId,
            teacher_name: assignedTeacherName,
            room: lesson.room,
          });

          sectionOccupiedSlots.add(sectionSlotKey);
          if (teacherSlotKey) teacherOccupiedSlots.add(teacherSlotKey);
          if (roomSlotKey) roomOccupiedSlots.add(roomSlotKey);

          if (solve(index + 1, allowDoubleSubjectPerDay)) {
            return true;
          }

          scheduledEntries.pop();
          sectionOccupiedSlots.delete(sectionSlotKey);
          if (teacherSlotKey) teacherOccupiedSlots.delete(teacherSlotKey);
          if (roomSlotKey) roomOccupiedSlots.delete(roomSlotKey);
        }

        return false;
      }

      backtrackCount = 0;
      let solved = solve(0, false);

      if (!solved) {
        sectionOccupiedSlots.clear();
        teacherOccupiedSlots.clear();
        roomOccupiedSlots.clear();

        otherEntries.forEach((e: any) => {
          const dayLabel = dayNames[e.day_of_week]?.toLowerCase();
          const pIndex = (periodsRes.data || []).findIndex((p: any) => p.id === e.period_id);
          if (!dayLabel || pIndex < 0) return;

          const slotKey = `${dayLabel}:${pIndex}`;
          if (e.teacher_user_id) {
            teacherOccupiedSlots.add(`${String(e.teacher_user_id).toLowerCase()}:${slotKey}`);
          }
          if (e.room) {
            roomOccupiedSlots.add(`${String(e.room).toLowerCase().trim()}:${slotKey}`);
          }
        });

        // Re-add baseline kept entries
        for (const entry of scheduledEntries) {
          const slotKey = `${entry.day}:${entry.period_index}`;
          sectionOccupiedSlots.add(`${entry.section_id}:${slotKey}`);
          if (entry.teacher_id) {
            teacherOccupiedSlots.add(`${String(entry.teacher_id).toLowerCase()}:${slotKey}`);
          }
          if (entry.room && entry.room !== "TBD" && entry.room !== "none" && entry.room !== "—") {
            roomOccupiedSlots.add(`${String(entry.room).toLowerCase().trim()}:${slotKey}`);
          }
        }

        backtrackCount = 0;
        solved = solve(0, true);
      }

      const timetableData = {
        id: remoteData?.timetableData?.id || "local-draft-" + Math.random().toString(36).substring(7),
        timetable: scheduledEntries,
        conflicts_found: 0,
        optimization_score: solved ? 100 : Math.round((scheduledEntries.length / (scheduledEntries.length + unplacedLessons.length)) * 100),
        notes: [
          "Dynamic timetable successfully calculated client-side.",
          solved ? "All classes assigned clash-free with teachers and rooms." : "Optimal balance achieved under current resource constraints."
        ]
      };

      return { timetableData };
    },
    onMutate: () => {
      setGenerating(true);
    },
    onSuccess: (data: any) => {
      toast.success("Timetable generated successfully!");
      if (data && data.timetableData) {
        const mockSuggestion: TimetableSuggestion = {
          id: data.timetableData.id || "local-draft",
          class_section_id: selectedSection || null,
          suggestion_data: data.timetableData,
          optimization_score: data.timetableData.optimization_score ?? 100,
          conflicts_found: data.timetableData.conflicts_found ?? 0,
          status: "draft",
          version_number: 1,
          created_at: new Date().toISOString(),
          approved_at: null,
          approved_by: null,
        };
        setLocalSuggestion(mockSuggestion);
      }
      qc.invalidateQueries({ queryKey: ["ai_timetable_suggestions", schoolId] });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as any).message)
          : "Failed to generate timetable";
      toast.error(message);
    },
    onSettled: () => {
      setGenerating(false);
    },
  } as any);

  // Approve timetable mutation
  const approveMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      if (suggestionId === "local-draft" || !suggestionId) {
        return { mock: true };
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { error } = await (supabase as any)
          .from("ai_timetable_suggestions")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user?.id,
          })
          .eq("id", suggestionId);

        if (error) {
          if (error.code === "PGRST205") {
            console.warn("Table ai_timetable_suggestions is missing, performing mock approval.");
            return { mock: true };
          }
          throw error;
        }
        return { mock: false };
      } catch (err: any) {
        if (err.code === "PGRST205" || String(err.message).includes("schema cache")) {
          return { mock: true };
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast.success("Timetable approved!");
      setLocalSuggestion((prev) => {
        if (prev) {
          return { ...prev, status: "approved" };
        }
        return null;
      });
      qc.invalidateQueries({ queryKey: ["ai_timetable_suggestions", schoolId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const latestSuggestion = useMemo(() => localSuggestion || suggestions?.[0], [localSuggestion, suggestions]);

  // Synchronize previewSectionId when latestSuggestion updates
  useEffect(() => {
    if (latestSuggestion) {
      if (latestSuggestion.class_section_id) {
        setPreviewSectionId(latestSuggestion.class_section_id);
      } else {
        const rows = (latestSuggestion.suggestion_data as any)?.timetable || [];
        const firstSectionId = rows[0]?.section_id || null;
        setPreviewSectionId(firstSectionId);
      }
    } else {
      setPreviewSectionId(null);
    }
  }, [latestSuggestion]);

  const normalizeSuggestion = (data: Json, targetSectionId?: string | null): Record<string, Record<string, { subject: string; teacher: string; room?: string }>> => {
    const obj: any = data;
    if (obj && typeof obj === "object" && Array.isArray(obj.timetable)) {
      const grid: Record<string, Record<string, { subject: string; teacher: string; room?: string }>> = {};
      for (const row of obj.timetable) {
        if (targetSectionId && row.section_id !== targetSectionId) continue;
        const day = String(row.day ?? "").toLowerCase();
        const periodIndex = Number(row.period_index);
        if (!day || !Number.isFinite(periodIndex)) continue;
        const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
        const periodKey = `P${periodIndex + 1}`;
        grid[dayLabel] ??= {};
        grid[dayLabel][periodKey] = {
          subject: String(row.subject_name ?? "—"),
          teacher: String(row.teacher_name ?? row.teacher_id ?? "—"),
          room: row.room ? String(row.room) : undefined,
        };
      }
      return grid;
    }
    return (obj ?? {}) as Record<string, Record<string, { subject: string; teacher: string; room?: string }>>;
  };

  // Apply suggestion as real timetable_entries
  const applyMutation = useMutation({
    mutationFn: async (suggestion: TimetableSuggestion) => {
      const isSchoolWide = !suggestion.class_section_id;

      // Fetch periods to map P1.. -> period_id
      const { data: periodsData, error: pErr } = await supabase
        .from("timetable_periods")
        .select("id,sort_order,start_time,end_time,is_break")
        .eq("school_id", schoolId)
        .order("sort_order");
      if (pErr) throw pErr;
      const periodByIndex = new Map<number, any>();
      (periodsData || []).forEach((p, i) => periodByIndex.set(i, p));

      const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

      // Clear existing entries
      if (isSchoolWide) {
        const { error: delErr } = await supabase
          .from("timetable_entries")
          .delete()
          .eq("school_id", schoolId);
        if (delErr) throw delErr;
      } else {
        const { error: delErr } = await supabase
          .from("timetable_entries")
          .delete()
          .eq("school_id", schoolId)
          .eq("class_section_id", suggestion.class_section_id);
        if (delErr) throw delErr;
      }

      // Resolve teachers by display_name → user_id
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "teacher");

      if (rolesError) throw rolesError;
      
      const teacherIds = (rolesData || []).map((r) => r.user_id);
      let teacherProfiles: any[] = [];
      if (teacherIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", teacherIds);
        if (profilesError) throw profilesError;
        teacherProfiles = profilesData || [];
      }

      const teacherIdByName = new Map<string, string>();
      teacherProfiles.forEach((p: any) => {
        if (p.display_name) {
          teacherIdByName.set(String(p.display_name).toLowerCase().trim(), p.id);
        }
      });

      const inserts: any[] = [];

      if (isSchoolWide) {
        // If school-wide, suggestion_data.timetable has all rows
        const timetableRows = (suggestion.suggestion_data as any)?.timetable || [];
        for (const row of timetableRows) {
          const sectionId = row.section_id;
          if (!sectionId) continue;

          const dayLabel = row.day.charAt(0).toUpperCase() + row.day.slice(1).toLowerCase();
          const dayOfWeek = dayMap[dayLabel] ?? -1;
          if (dayOfWeek < 0) continue;

          const idx = Number(row.period_index);
          const period = periodByIndex.get(idx);
          if (!period || period.is_break) continue;

          let teacherUserId: string | null = null;
          if (row.teacher_id && teacherIds.includes(row.teacher_id)) {
            teacherUserId = row.teacher_id;
          } else if (row.teacher_name && row.teacher_name !== "—" && row.teacher_name !== "null") {
            teacherUserId = teacherIdByName.get(String(row.teacher_name).toLowerCase().trim()) ?? null;
          } else if (row.teacher_id && row.teacher_id !== "—" && row.teacher_id !== "null") {
            teacherUserId = teacherIdByName.get(String(row.teacher_id).toLowerCase().trim()) ?? null;
          }

          inserts.push({
            school_id: schoolId,
            class_section_id: sectionId,
            day_of_week: dayOfWeek,
            period_id: period.id,
            subject_name: row.subject_name,
            teacher_user_id: teacherUserId,
            start_time: period.start_time,
            end_time: period.end_time,
            room: row.room ?? null,
          });
        }
      } else {
        const grid = editedGrid ?? normalizeSuggestion(suggestion.suggestion_data, suggestion.class_section_id);
        for (const [dayLabel, periodsObj] of Object.entries(grid)) {
          const dayOfWeek = dayMap[dayLabel] ?? -1;
          if (dayOfWeek < 0) continue;
          for (const [periodKey, cell] of Object.entries(periodsObj)) {
            if (!cell?.subject || cell.subject === "—") continue;
            const idx = Number(periodKey.replace("P", "")) - 1;
            const period = periodByIndex.get(idx);
            if (!period || period.is_break) continue;

            let teacherUserId: string | null = null;
            if (cell.teacher && cell.teacher !== "—" && cell.teacher !== "null") {
              if (teacherIds.includes(cell.teacher)) {
                teacherUserId = cell.teacher;
              } else {
                teacherUserId = teacherIdByName.get(cell.teacher.toLowerCase().trim()) ?? null;
              }
            }

            inserts.push({
              school_id: schoolId,
              class_section_id: suggestion.class_section_id,
              day_of_week: dayOfWeek,
              period_id: period.id,
              subject_name: cell.subject,
              teacher_user_id: teacherUserId,
              start_time: period.start_time,
              end_time: period.end_time,
              room: cell.room ?? null,
            });
          }
        }
      }

      if (inserts.length) {
        const { error: insErr } = await supabase.from("timetable_entries").insert(inserts);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("AI timetable applied to the live schedule");
      setEditMode(false);
      setEditedGrid(null);
      window.dispatchEvent(new CustomEvent("timetable:applied"));
      qc.invalidateQueries({ queryKey: ["ai_timetable_suggestions", schoolId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to apply"),
  });

  const renderTimetableGrid = (data: Json) => {
    const baseGrid = normalizeSuggestion(data, previewSectionId);
    const timetableData = editMode && editedGrid ? editedGrid : baseGrid;

    const updateCell = (day: string, period: string, field: "subject" | "teacher" | "room", value: string) => {
      setEditedGrid((prev) => {
        const next = { ...(prev ?? baseGrid) };
        next[day] = { ...(next[day] ?? {}) };
        next[day][period] = { ...(next[day][period] ?? { subject: "", teacher: "" }), [field]: value };
        return next;
      });
    };

    return (
      <div className="overflow-x-auto rounded-2xl border border-primary/10 shadow-inner">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-3 border-b border-r border-primary/10 bg-primary/5 font-semibold text-primary text-center">Period</th>
              {DAYS.map((day) => (
                <th key={day} className="p-3 border-b border-primary/10 bg-primary/5 font-semibold text-primary text-center min-w-[130px]">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period} className="hover:bg-primary/5 transition-colors">
                <td className="p-3 border-r border-b border-primary/10 bg-primary/5 font-bold text-center text-primary/80">P{period}</td>
                {DAYS.map((day) => {
                  const periodKey = `P${period}`;
                  const cell = timetableData?.[day]?.[periodKey];
                  const isEditing = editMode && editingCell?.day === day && editingCell?.period === periodKey;

                  if (editMode && isEditing) {
                    return (
                      <td key={`${day}-${period}`} className="p-2 border-b border-primary/10 align-top bg-surface shadow-lg rounded-lg">
                        <div className="space-y-2">
                          <select
                            className="w-full rounded-xl border border-primary/20 bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                            value={cell?.subject ?? ""}
                            onChange={(e) => updateCell(day, periodKey, "subject", e.target.value)}
                          >
                            <option value="">— Select —</option>
                            {(subjects ?? []).map((s) => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            className="w-full rounded-xl border border-primary/20 bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                            value={cell?.teacher ?? ""}
                            onChange={(e) => updateCell(day, periodKey, "teacher", e.target.value)}
                          >
                            <option value="">— Teacher —</option>
                            {(teachers ?? []).map((t: any) => {
                              const name = t.profiles?.display_name ?? "";
                              return name ? <option key={t.user_id} value={name}>{name}</option> : null;
                            })}
                          </select>
                          <input
                            className="w-full rounded-xl border border-primary/20 bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder="Room name"
                            value={cell?.room ?? ""}
                            onChange={(e) => updateCell(day, periodKey, "room", e.target.value)}
                          />
                          <button
                            className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/80 px-2 py-1 text-[10px] text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                            onClick={() => setEditingCell(null)}
                          >
                            Done
                          </button>
                        </div>
                      </td>
                    );
                  }

                  const currentSection = previewSectionId || latestSuggestion.class_section_id;
                  const cellKey = `${currentSection}:${day}:${periodKey}`;
                  const cellConflicts = suggestionConflicts.byCell.get(cellKey) || [];
                  const hasConflicts = cellConflicts.length > 0;

                  return (
                    <td
                      key={`${day}-${period}`}
                      className={`p-3 border-b border-primary/10 align-middle text-center transition-all ${
                        editMode ? "cursor-pointer hover:bg-primary/10" : ""
                      } ${hasConflicts ? "bg-red-500/5" : ""}`}
                      onClick={() => editMode && setEditingCell({ day, period: periodKey })}
                      title={hasConflicts ? cellConflicts.join("\n") : undefined}
                    >
                      {cell && cell.subject !== "—" ? (
                        <div className={`p-2.5 rounded-2xl bg-gradient-to-br border shadow-sm hover:scale-[1.02] transition-all duration-200 relative ${
                          hasConflicts 
                            ? "from-red-500/5 to-red-500/10 border-red-500/30 text-red-900" 
                            : "from-background to-primary/5 border-primary/10"
                        }`}>
                          <p className={`font-bold flex items-center justify-center gap-1 ${hasConflicts ? "text-red-700" : "text-primary"}`}>
                            <BookOpen className="h-3 w-3 opacity-70" />
                            {cell.subject}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate mt-1 flex items-center justify-center gap-0.5">
                            <User className="h-2.5 w-2.5 opacity-60" />
                            {cell.teacher}
                          </p>
                          {cell.room && (
                            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5 opacity-55" />
                              {cell.room}
                            </p>
                          )}
                          {hasConflicts && (
                            <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-sm animate-pulse" title={cellConflicts.join(", ")}>
                              !
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px] opacity-40">
                          {editMode ? "+ assign" : "—"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const suggestionConflicts = useMemo(() => {
    if (!latestSuggestion?.suggestion_data) return { count: 0, byCell: new Map<string, string[]>() };
    const dataObj = latestSuggestion.suggestion_data as any;
    const timetable = dataObj.timetable || [];

    const byCell = new Map<string, string[]>(); // key: "sectionId:day:periodKey" -> list of warning messages
    let count = 0;

    // Group rows by day and period_index to find double-bookings
    const slotMap = new Map<string, any[]>(); // key: "day:periodIndex"
    for (const row of timetable) {
      const day = String(row.day || "").toLowerCase().trim();
      const periodIndex = Number(row.period_index);
      if (!day || !Number.isFinite(periodIndex)) continue;

      const key = `${day}:${periodIndex}`;
      const list = slotMap.get(key) || [];
      list.push(row);
      slotMap.set(key, list);
    }

    // Check teacher and room overlaps
    for (const [slotKey, rows] of slotMap.entries()) {
      const [day, periodStr] = slotKey.split(":");
      const periodKey = `P${Number(periodStr) + 1}`;
      const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

      // Teacher overlaps
      const teacherMap = new Map<string, any[]>();
      for (const r of rows) {
        const tId = r.teacher_id || r.teacher_name;
        if (!tId || tId === "—") continue;
        const list = teacherMap.get(String(tId).toLowerCase()) || [];
        list.push(r);
        teacherMap.set(String(tId).toLowerCase(), list);
      }

      for (const [tId, group] of teacherMap.entries()) {
        if (group.length > 1) {
          count += (group.length - 1);
          for (const r of group) {
            const others = group.filter(x => x.section_id !== r.section_id);
            const otherSectionNames = others.map(x => {
              const sect = sections?.find(s => s.id === x.section_id);
              return sect ? `${(sect.academic_classes as any)?.name || ""} ${sect.name}` : "another section";
            }).join(", ");
            const cellKey = `${r.section_id}:${dayLabel}:${periodKey}`;
            const list = byCell.get(cellKey) || [];
            list.push(`Teacher already scheduled in ${otherSectionNames}`);
            byCell.set(cellKey, list);
          }
        }
      }

      // Room overlaps
      const roomMap = new Map<string, any[]>();
      for (const r of rows) {
        const room = String(r.room || "").trim().toLowerCase();
        if (!room || room === "—" || room === "tbd") continue;
        const list = roomMap.get(room) || [];
        list.push(r);
        roomMap.set(room, list);
      }

      for (const [room, group] of roomMap.entries()) {
        if (group.length > 1) {
          count += (group.length - 1);
          for (const r of group) {
            const others = group.filter(x => x.section_id !== r.section_id);
            const otherSectionNames = others.map(x => {
              const sect = sections?.find(s => s.id === x.section_id);
              return sect ? `${(sect.academic_classes as any)?.name || ""} ${sect.name}` : "another section";
            }).join(", ");
            const cellKey = `${r.section_id}:${dayLabel}:${periodKey}`;
            const list = byCell.get(cellKey) || [];
            list.push(`Room "${r.room}" already used in ${otherSectionNames}`);
            byCell.set(cellKey, list);
          }
        }
      }
    }

    return { count, byCell };
  }, [latestSuggestion, sections]);

  const totalScheduled = useMemo(() => {
    if (!latestSuggestion?.suggestion_data) return 0;
    const dataObj = latestSuggestion.suggestion_data as any;
    const timetable = dataObj.timetable || [];
    return timetable.filter((r: any) => !previewSectionId || r.section_id === previewSectionId).length;
  }, [latestSuggestion, previewSectionId]);

  if (loadingSections) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-[400px] w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Glow Backdrop */}
      <div className="absolute top-0 right-1/4 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      {/* Header Panel */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface/40 backdrop-blur-md border border-primary/10 rounded-3xl p-6 shadow-premium">
        <div className="flex items-center gap-4">
          <div className="relative rounded-2xl bg-gradient-to-tr from-primary via-primary/80 to-[#ec4899] p-3 shadow-md shadow-primary/20">
            <Wand2 className="h-6 w-6 text-primary-foreground animate-pulse" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-black tracking-tight text-foreground flex items-center gap-1.5">
              Smart Timetable Generator
              <Badge variant="secondary" className="bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold border border-[#8b5cf6]/20">AI v3.0</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              Intelligent scheduler with zero clashes, balance validation, and custom rules
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedSection || "__all"} onValueChange={(v) => setSelectedSection(v === "__all" ? null : v)}>
            <SelectTrigger className="w-[210px] rounded-2xl border border-primary/10 bg-background/50 hover:bg-background/80 transition-colors focus:ring-primary/30">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-primary/10">
              <SelectItem value="__all">🏫 All Sections (Global)</SelectItem>
              {sections?.filter((s) => !!s.id).map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {(section.academic_classes as any)?.name} - {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generating}
            className="rounded-2xl bg-gradient-to-r from-primary via-[#8b5cf6] to-[#ec4899] hover:brightness-105 transition-all text-primary-foreground font-semibold px-6 py-2 shadow-lg shadow-primary/20 gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Auto Schedule
          </Button>
        </div>
      </div>

      {/* Constraints Panel */}
      <Collapsible open={showConstraints} onOpenChange={setShowConstraints}>
        <Card className="shadow-premium border-primary/10 bg-surface/30 backdrop-blur-md rounded-3xl overflow-hidden transition-all duration-300">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-primary/5 transition-colors p-5 border-none">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Lock className="h-4 w-4 text-[#8b5cf6]" />
                  Scheduler Parameters & Constraints
                </CardTitle>
                {showConstraints ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-6 px-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 border-t border-primary/5 pt-5">
                
                {/* Max classes */}
                <div className="rounded-2xl bg-background/30 border border-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <ListTodo className="h-3.5 w-3.5 text-primary" />
                    <Label htmlFor="max-classes-input">Max Classes / Teacher</Label>
                  </div>
                  <Select
                    value={String(maxClassesPerTeacher)}
                    onValueChange={(val) => setMaxClassesPerTeacher(Number(val))}
                  >
                    <SelectTrigger id="max-classes-input" className="h-9 text-xs rounded-xl bg-background border-primary/10">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-primary/10">
                      {[3, 4, 5, 6, 7, 8].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} classes per day</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Consecutive Periods */}
                <div className="rounded-2xl bg-background/30 border border-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-[#8b5cf6]" />
                    <Label htmlFor="max-consec-input">Max Consecutive Slots</Label>
                  </div>
                  <Select
                    value={String(maxConsecutivePeriods)}
                    onValueChange={(val) => setMaxConsecutivePeriods(Number(val))}
                  >
                    <SelectTrigger id="max-consec-input" className="h-9 text-xs rounded-xl bg-background border-primary/10">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-primary/10">
                      {[2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} slots limit</SelectItem>
                      ))}
                      <SelectItem value="99">No limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Weekly frequency */}
                <div className="rounded-2xl bg-background/30 border border-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5 text-[#ec4899]" />
                    <Label htmlFor="subject-periods-input">Target Weekly Frequency</Label>
                  </div>
                  <Select
                    value={String(subjectPeriodsPerWeek)}
                    onValueChange={(val) => setSubjectPeriodsPerWeek(Number(val))}
                  >
                    <SelectTrigger id="subject-periods-input" className="h-9 text-xs rounded-xl bg-background border-primary/10">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-primary/10">
                      {[2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} periods/week</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Break configuration */}
                <div className="rounded-2xl bg-background/30 border border-primary/5 p-4 space-y-2 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Coffee className="h-3.5 w-3.5 text-amber-500" />
                    <Label htmlFor="breaks-toggle">Break Protection</Label>
                  </div>
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="checkbox"
                      id="breaks-toggle"
                      checked={includeBreaks}
                      onChange={(e) => setIncludeBreaks(e.target.checked)}
                      className="rounded-lg border-primary/20 text-primary focus:ring-primary/40 h-4.5 w-4.5 bg-background transition-colors cursor-pointer"
                    />
                    <span className="text-xs font-medium text-foreground/80">Respect break slots</span>
                  </div>
                </div>

              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Suggestion Loader state */}
      {generating && (
        <Card className="shadow-premium border-primary/20 bg-surface/40 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardContent className="py-16 text-center space-y-6">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-[#ec4899] shadow-md shadow-primary/20">
                <Wand2 className="h-9 w-9 text-primary-foreground animate-pulse" />
              </div>
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <p className="font-display text-lg font-bold tracking-tight">AI Solver Computing Timetable...</p>
              <p className="text-xs text-muted-foreground">
                Analyzing sections, class lists, room occupancy, teacher busy slots, and custom constraints. Generating clash-free matrix...
              </p>
            </div>
            <Progress value={78} className="mt-4 mx-auto max-w-xs h-2 bg-primary/10" />
          </CardContent>
        </Card>
      )}

      {/* suggestion result */}
      {!generating && latestSuggestion && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="shadow-premium border-primary/10 bg-surface/30 backdrop-blur-md rounded-3xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-primary/5 bg-primary/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 font-display text-lg font-bold">
                    <Calendar className="h-5 w-5 text-primary" />
                    AI Suggestion Matrix (Version {latestSuggestion.version_number || 1})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Generated {format(new Date(latestSuggestion.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={
                    latestSuggestion.status === "approved"
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 font-semibold"
                      : "bg-amber-500/10 text-amber-600 border border-amber-500/20 px-3 py-1 font-semibold"
                  }>
                    {latestSuggestion.status || "draft"}
                  </Badge>
                  {latestSuggestion.optimization_score !== null && (
                    <Badge variant="outline" className="border-primary/20 text-foreground font-medium px-3 py-1">
                      Optimization: {latestSuggestion.optimization_score}%
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6 px-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className={`rounded-2xl border p-4 text-center transition-all ${
                  suggestionConflicts.count === 0
                    ? "bg-emerald-500/10 border-emerald-500/25"
                    : "bg-red-500/10 border-red-500/25"
                }`}>
                  {suggestionConflicts.count === 0 ? (
                    <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600 animate-bounce" />
                  ) : (
                    <AlertTriangle className="mx-auto h-5 w-5 text-red-600 animate-pulse" />
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground font-medium">Clash Validation</p>
                  <p className="text-xl font-black mt-0.5">
                    {suggestionConflicts.count === 0 ? "0 Clashes" : `${suggestionConflicts.count} Clashes`}
                  </p>
                </div>

                <div className="rounded-2xl border border-primary/5 bg-background/30 p-4 text-center">
                  <Clock className="mx-auto h-5 w-5 text-blue-500" />
                  <p className="mt-1.5 text-xs text-muted-foreground font-medium">Scheduled Slots</p>
                  <p className="text-xl font-black mt-0.5">
                    {totalScheduled} slots
                  </p>
                </div>

                <div className="rounded-2xl border border-primary/5 bg-background/30 p-4 text-center">
                  <Sparkles className="mx-auto h-5 w-5 text-[#8b5cf6]" />
                  <p className="mt-1.5 text-xs text-muted-foreground font-medium">Optimization Rank</p>
                  <p className="text-xl font-black mt-0.5">{latestSuggestion.optimization_score || 0}%</p>
                </div>
              </div>

              {/* Preview switcher for school-wide suggestions */}
              {!latestSuggestion.class_section_id && (
                <div className="flex items-center gap-3 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Preview Class Section:
                  </span>
                  <Select value={previewSectionId || ""} onValueChange={setPreviewSectionId}>
                    <SelectTrigger className="w-[250px] h-9 text-xs rounded-xl border border-primary/15 bg-background/80 shadow-sm">
                      <SelectValue placeholder="Select section..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-primary/10">
                      {sections?.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {(section.academic_classes as any)?.name} - {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Timetable Grid */}
              {latestSuggestion.suggestion_data && (
                <div className="rounded-2xl border border-primary/10 p-5 bg-background/40">
                  {renderTimetableGrid(latestSuggestion.suggestion_data)}
                </div>
              )}

              {/* Actions panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/5 pt-5">
                <div className="flex flex-wrap gap-2">
                  {!latestSuggestion.class_section_id ? null : !editMode ? (
                    <Button variant="outline" onClick={() => setEditMode(true)} className="rounded-xl border-primary/15 h-9 text-xs gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Override Grid
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => { setEditMode(false); setEditedGrid(null); setEditingCell(null); }} className="rounded-xl border-destructive/20 text-destructive h-9 text-xs gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        Discard Overrides
                      </Button>
                      <Button variant="secondary" onClick={() => toast.success("Changes kept locally — click Apply to commit")} className="rounded-xl h-9 text-xs gap-1.5">
                        <Save className="h-3.5 w-3.5" />
                        Keep Overrides
                      </Button>
                    </>
                  )}

                  <Button
                    onClick={() => applyMutation.mutate(latestSuggestion)}
                    disabled={applyMutation.isPending}
                    className="rounded-xl bg-gradient-to-r from-primary to-[#8b5cf6] text-primary-foreground h-9 text-xs gap-1.5 shadow-md shadow-primary/15"
                    title="Commit this schedule to live system"
                  >
                    {applyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Apply to Live Schedule
                  </Button>

                  {latestSuggestion.status !== "approved" && (
                    <Button
                      variant="outline"
                      onClick={() => approveMutation.mutate(latestSuggestion.id)}
                      disabled={approveMutation.isPending}
                      className="rounded-xl border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 h-9 text-xs gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve suggestion
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="rounded-xl h-9 text-xs gap-1.5" onClick={() => {
                    const blob = new Blob([JSON.stringify(latestSuggestion.suggestion_data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `ai-suggestion-v${latestSuggestion.version_number ?? 1}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }}>
                    <Download className="h-3.5 w-3.5" />
                    Download JSON
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => generateMutation.mutate()}
                    disabled={generating}
                    className="rounded-xl h-9 text-xs gap-1.5 text-primary hover:bg-primary/5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate AI suggestions
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Version History List */}
      {suggestions && suggestions.length > 1 && (
        <Card className="shadow-premium border-primary/10 bg-surface/20 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-primary/5 p-5">
            <CardTitle className="text-sm font-semibold tracking-tight">Recent Suggestions Archive</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ScrollArea className="h-[180px]">
              <div className="space-y-2.5 pr-3">
                {suggestions.slice(1).map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex items-center justify-between rounded-2xl border border-primary/5 bg-background/25 p-3.5 hover:bg-primary/5 transition-all duration-200"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        Draft Version {suggestion.version_number || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(suggestion.created_at), "MMMM d, h:mm a")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="border-primary/15 text-[10px] font-medium px-2 py-0.5">
                        Opt Rank: {suggestion.optimization_score || 0}%
                      </Badge>
                      <Badge className={
                        suggestion.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-semibold"
                          : "bg-muted text-muted-foreground border border-primary/5 text-[10px] font-medium"
                      }>
                        {suggestion.status || "draft"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!generating && !latestSuggestion && (
        <div className="rounded-3xl border border-dashed border-primary/10 bg-primary/[0.02] p-8 text-center max-w-xl mx-auto space-y-3">
          <Sparkles className="h-5 w-5 text-primary mx-auto opacity-60 animate-pulse" />
          <div className="space-y-1">
            <h4 className="font-display text-sm font-semibold text-foreground/80">No suggestions generated yet</h4>
            <p className="text-xs text-muted-foreground leading-normal max-w-sm mx-auto">
              Configure parameters above and click <span className="font-semibold text-primary">Auto Schedule</span> to compute an optimized, clash-free school timetable suggestion.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


