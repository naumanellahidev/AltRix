import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Heart, Search } from "lucide-react";
import { format } from "date-fns";

interface ParentNote {
  id: string;
  student_id: string;
  note_date: string;
  behavior: string | null;
  routine: string | null;
  mood: string | null;
  parent_user_id: string;
  created_at: string;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string | null;
  class_section_id: string | null;
  class_label: string;
}

interface Props {
  schoolId: string | null;
  /** When set, only notes for students in these section ids show. Used by teachers. */
  restrictToSectionIds?: string[] | null;
  title?: string;
}

export function ParentBehaviorNotesView({
  schoolId,
  restrictToSectionIds = null,
  title = "Parent Behavior Notes",
}: Props) {
  const [notes, setNotes] = useState<ParentNote[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [parents, setParents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch students with class/section labels
        const { data: stu } = await supabase
          .from("students")
          .select(
            "id, first_name, last_name, student_enrollments!inner(class_section_id, end_date, class_sections(name, academic_classes(name)))"
          )
          .eq("school_id", schoolId)
          .is("student_enrollments.end_date", null);

        const studentRows: StudentRow[] = (stu ?? []).map((s: any) => {
          const e = s.student_enrollments?.[0];
          const sec = e?.class_sections;
          const cls = sec?.academic_classes;
          return {
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            class_section_id: e?.class_section_id ?? null,
            class_label:
              [cls?.name, sec?.name].filter(Boolean).join(" / ") || "Unassigned",
          };
        });

        // Fetch all parent_behavior_notes for school (RLS lets staff in)
        const { data: ns } = await (supabase as any)
          .from("parent_behavior_notes")
          .select(
            "id, student_id, note_date, behavior, routine, mood, parent_user_id, created_at"
          )
          .eq("school_id", schoolId)
          .order("note_date", { ascending: false })
          .limit(500);

        // Resolve parent display names
        const parentIds = Array.from(
          new Set((ns ?? []).map((n: any) => n.parent_user_id).filter(Boolean))
        );
        const parentMap: Record<string, string> = {};
        if (parentIds.length > 0) {
          const { data: dir } = await supabase.rpc("get_school_user_directory", {
            _school_id: schoolId,
          });
          (dir ?? []).forEach((d: any) => {
            if (parentIds.includes(d.user_id))
              parentMap[d.user_id] = d.display_name || d.email || "Parent";
          });
        }

        if (cancelled) return;
        setStudents(studentRows);
        setNotes((ns ?? []) as ParentNote[]);
        setParents(parentMap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const visibleStudents = useMemo(() => {
    if (!restrictToSectionIds) return students;
    const allow = new Set(restrictToSectionIds);
    return students.filter((s) => s.class_section_id && allow.has(s.class_section_id));
  }, [students, restrictToSectionIds]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    visibleStudents.forEach((s) => {
      if (s.class_section_id) map.set(s.class_section_id, s.class_label);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [visibleStudents]);

  const filteredStudents = useMemo(() => {
    return visibleStudents.filter(
      (s) => sectionFilter === "all" || s.class_section_id === sectionFilter
    );
  }, [visibleStudents, sectionFilter]);

  const filteredNotes = useMemo(() => {
    const allowedStudentIds = new Set(filteredStudents.map((s) => s.id));
    return notes.filter((n) => {
      if (!allowedStudentIds.has(n.student_id)) return false;
      if (studentFilter !== "all" && n.student_id !== studentFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const stu = studentMap.get(n.student_id);
        const name = `${stu?.first_name ?? ""} ${stu?.last_name ?? ""}`.toLowerCase();
        if (
          !name.includes(s) &&
          !(n.behavior ?? "").toLowerCase().includes(s) &&
          !(n.routine ?? "").toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [notes, filteredStudents, studentFilter, search, studentMap]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" /> {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          Daily home-life notes shared by parents about their children.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <Select value={sectionFilter} onValueChange={(v) => { setSectionFilter(v); setStudentFilter("all"); }}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by student" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              {filteredStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${filteredNotes.length} note${filteredNotes.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && filteredNotes.length === 0 && (
            <p className="text-sm text-muted-foreground">No parent notes match these filters.</p>
          )}
          {filteredNotes.map((n) => {
            const stu = studentMap.get(n.student_id);
            return (
              <div key={n.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">
                    {stu?.first_name} {stu?.last_name}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {stu?.class_label || "—"}
                  </Badge>
                  {n.mood && (
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {n.mood}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(n.note_date), "MMM d, yyyy")}
                  </span>
                </div>
                {n.behavior && (
                  <p className="mt-2 text-sm">
                    <strong>Behavior:</strong> {n.behavior}
                  </p>
                )}
                {n.routine && (
                  <p className="mt-1 text-sm">
                    <strong>Routine:</strong> {n.routine}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Shared by {parents[n.parent_user_id] || "Parent"}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
