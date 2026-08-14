import type { SupabaseClient } from "@/lib/api";

type StudentRow = { id: string; first_name: string | null; last_name: string | null };
type EnrollmentRow = { student_id: string; class_section_id: string; start_date: string; end_date: string | null };
type SectionRow = { id: string; name: string; class_id: string };
type ClassRow = { id: string; name: string };

function formatName(first: string | null, last: string | null) {
  const full = [first ?? "", last ?? ""].join(" ").trim();
  return full || "Student";
}

export async function fetchStudentLabelMap(
  api: SupabaseClient,
  opts: { schoolId?: string; studentIds: string[] }
): Promise<Record<string, string>> {
  const studentIds = Array.from(new Set(opts.studentIds)).filter(Boolean);
  if (studentIds.length === 0) return {};

  // Students
  let studentsQuery = api.from("students").select("id,first_name,last_name").in("id", studentIds);
  if (opts.schoolId) studentsQuery = studentsQuery.eq("school_id", opts.schoolId);
  const { data: studentsData } = await studentsQuery;
  const students = (studentsData ?? []) as StudentRow[];
  const studentById = new Map(students.map((s) => [s.id, s]));

  // Enrollments (pick most recent, prefer active)
  let enrQuery = api
    .from("student_enrollments")
    .select("student_id,class_section_id,start_date,end_date")
    .in("student_id", studentIds)
    .order("start_date", { ascending: false });
  if (opts.schoolId) enrQuery = enrQuery.eq("school_id", opts.schoolId);
  const { data: enrData } = await enrQuery;
  const enrollments = (enrData ?? []) as EnrollmentRow[];

  const enrollmentByStudent = new Map<string, EnrollmentRow>();
  for (const e of enrollments) {
    if (!enrollmentByStudent.has(e.student_id)) enrollmentByStudent.set(e.student_id, e);
    // Prefer active enrollment (end_date null)
    if (e.end_date === null) enrollmentByStudent.set(e.student_id, e);
  }

  const sectionIds = Array.from(
    new Set(
      studentIds
        .map((id) => enrollmentByStudent.get(id)?.class_section_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  let sections: SectionRow[] = [];
  if (sectionIds.length) {
    let sectionQuery = api.from("class_sections").select("id,name,class_id").in("id", sectionIds);
    if (opts.schoolId) sectionQuery = sectionQuery.eq("school_id", opts.schoolId);
    const { data: sectionData } = await sectionQuery;
    sections = (sectionData ?? []) as SectionRow[];
  }
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const classIds = Array.from(new Set(sections.map((s) => s.class_id)));
  let classes: ClassRow[] = [];
  if (classIds.length) {
    let classQuery = api.from("academic_classes").select("id,name").in("id", classIds);
    if (opts.schoolId) classQuery = classQuery.eq("school_id", opts.schoolId);
    const { data: classData } = await classQuery;
    classes = (classData ?? []) as ClassRow[];
  }
  const classById = new Map(classes.map((c) => [c.id, c]));

  const out: Record<string, string> = {};
  for (const id of studentIds) {
    const s = studentById.get(id);
    const name = formatName(s?.first_name ?? null, s?.last_name ?? null);
    const enrollment = enrollmentByStudent.get(id);
    const section = enrollment ? sectionById.get(enrollment.class_section_id) : undefined;
    const clazz = section ? classById.get(section.class_id) : undefined;

    const classPart = clazz?.name;
    const sectionPart = section?.name;
    const meta = classPart && sectionPart ? `${classPart} / ${sectionPart}` : classPart ?? sectionPart;
    out[id] = meta ? `${name} • ${meta}` : name;
  }
  return out;
}
