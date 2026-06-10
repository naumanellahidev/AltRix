import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const schoolId = body.schoolId ?? body.school_id;
    const constraints = body.constraints ?? body.Constraints ?? {};
    const classSectionId = body.classSectionId ?? body.class_section_id ?? null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch school data
    const [
      sectionsRes,
      subjectsRes,
      userRolesRes,
      periodsRes,
      sectionSubjectsRes,
      subjectAssignmentsRes,
      generalAssignmentsRes,
      existingEntriesRes,
    ] = await Promise.all([
      supabase
        .from("class_sections")
        .select("id, name, room, class_id, academic_classes(name)")
        .eq("school_id", schoolId),
      supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId),
      supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "teacher"),
      supabase
        .from("timetable_periods")
        .select("*")
        .eq("school_id", schoolId)
        .order("sort_order"),
      supabase
        .from("class_section_subjects")
        .select("class_section_id, subject_id")
        .eq("school_id", schoolId),
      supabase
        .from("teacher_subject_assignments")
        .select("teacher_user_id, class_section_id, subject_id")
        .eq("school_id", schoolId),
      supabase
        .from("teacher_assignments")
        .select("teacher_user_id, class_section_id, subject_id")
        .eq("school_id", schoolId),
      supabase
        .from("timetable_entries")
        .select("id, day_of_week, period_id, subject_name, teacher_user_id, room, class_section_id")
        .eq("school_id", schoolId),
    ]);

    if (sectionsRes.error) throw sectionsRes.error;
    if (subjectsRes.error) throw subjectsRes.error;
    if (userRolesRes.error) throw userRolesRes.error;
    if (periodsRes.error) throw periodsRes.error;
    if (sectionSubjectsRes.error) throw sectionSubjectsRes.error;
    if (subjectAssignmentsRes.error) throw subjectAssignmentsRes.error;
    if (generalAssignmentsRes.error) throw generalAssignmentsRes.error;
    if (existingEntriesRes.error) throw existingEntriesRes.error;

    const sections = sectionsRes.data || [];
    const subjects = subjectsRes.data || [];
    const teacherUserIds = (userRolesRes.data || []).map((t: any) => t.user_id);
    const periods = periodsRes.data || [];

    // Fetch profiles for the teacher user IDs
    let teachers: Array<{ user_id: string; profiles: { display_name: string | null } | null }> = [];
    if (teacherUserIds.length > 0) {
      const profilesRes = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", teacherUserIds);
      if (profilesRes.error) throw profilesRes.error;
      const profileMap = new Map<string, string>();
      (profilesRes.data || []).forEach((p: any) => {
        profileMap.set(p.id, p.display_name || "");
      });
      teachers = teacherUserIds.map((uid) => ({
        user_id: uid,
        profiles: { display_name: profileMap.get(uid) || null }
      }));
    }

    // Map teacher display name
    const teacherNameMap = new Map<string, string>();
    teachers.forEach((t: any) => {
      const name = t.profiles?.display_name || t.user_id;
      teacherNameMap.set(t.user_id, name);
    });

    // Merge subject assignments
    const mergedAssignments: Array<{ teacherId: string; sectionId: string; subjectId: string }> = [];
    const seenAssignments = new Set<string>();

    const addAssignment = (teacherId: string, sectionId: string, subjectId: string | null) => {
      if (!teacherId || !sectionId || !subjectId) return;
      const key = `${teacherId}:${sectionId}:${subjectId}`;
      if (seenAssignments.has(key)) return;
      seenAssignments.add(key);
      mergedAssignments.push({ teacherId, sectionId, subjectId });
    };

    (subjectAssignmentsRes.data || []).forEach((a: any) => {
      addAssignment(a.teacher_user_id, a.class_section_id, a.subject_id);
    });
    (generalAssignmentsRes.data || []).forEach((a: any) => {
      addAssignment(a.teacher_user_id, a.class_section_id, a.subject_id);
    });

    // Map which subjects are offered in each section
    const sectionSubjectsMap = new Map<string, string[]>();
    (sectionSubjectsRes.data || []).forEach((ss: any) => {
      const subject = subjects.find((s: any) => s.id === ss.subject_id);
      if (subject) {
        const list = sectionSubjectsMap.get(ss.class_section_id) || [];
        list.push(subject.name);
        sectionSubjectsMap.set(ss.class_section_id, list);
      }
    });

    // Also include subjects that have teacher assignments in that section
    mergedAssignments.forEach((a) => {
      const subject = subjects.find((s: any) => s.id === a.subjectId);
      if (subject) {
        const list = sectionSubjectsMap.get(a.sectionId) || [];
        if (!list.includes(subject.name)) {
          list.push(subject.name);
          sectionSubjectsMap.set(a.sectionId, list);
        }
      }
    });

    // Busy slots mapping for clash prevention
    const busyTeachers = new Map<string, string[]>();
    const busyRooms = new Map<string, string[]>();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    if (classSectionId) {
      // Single section generation: avoid conflicts with ALL OTHER sections
      const otherEntries = (existingEntriesRes.data || []).filter(
        (e: any) => e.class_section_id !== classSectionId
      );

      otherEntries.forEach((e: any) => {
        const dayLabel = dayNames[e.day_of_week];
        if (!dayLabel) return;

        const pIndex = periods.findIndex((p: any) => p.id === e.period_id);
        if (pIndex < 0) return;

        const slotKey = `${dayLabel} period_index ${pIndex}`;

        if (e.teacher_user_id) {
          const list = busyTeachers.get(e.teacher_user_id) || [];
          list.push(slotKey);
          busyTeachers.set(e.teacher_user_id, list);
        }

        if (e.room) {
          const roomKey = String(e.room).toLowerCase().trim();
          const list = busyRooms.get(roomKey) || [];
          list.push(slotKey);
          busyRooms.set(roomKey, list);
        }
      });
    }

    const teacherBusyConstraints = [];
    for (const [teacherId, slots] of busyTeachers.entries()) {
      const name = teacherNameMap.get(teacherId) || teacherId;
      teacherBusyConstraints.push(`- Teacher "${name}" [ID: ${teacherId}] is BUSY at: ${slots.join(", ")}`);
    }

    const roomBusyConstraints = [];
    for (const [room, slots] of busyRooms.entries()) {
      roomBusyConstraints.push(`- Room "${room}" is BUSY at: ${slots.join(", ")}`);
    }

    // Active days detection
    const activeDays = new Set([1, 2, 3, 4, 5]); // default Mon-Fri
    (existingEntriesRes.data || []).forEach((e: any) => {
      if (e.day_of_week !== null && e.day_of_week !== undefined) {
        activeDays.add(e.day_of_week);
      }
    });
    const targetDays = Array.from(activeDays).sort().map(d => dayNames[d]);

    // Active period templates
    const periodDefs = periods.map((p: any, idx: number) => ({
      index: idx,
      id: p.id,
      label: p.label,
      startTime: p.start_time,
      endTime: p.end_time,
      isBreak: p.is_break,
    }));

    const contextData = `
School Timetable Generation Request:

TARGET SECTION:
${classSectionId ? `- Only generate for section_id: ${classSectionId}` : "- All sections"}

SECTIONS TO SCHEDULE:
${sections
  .filter((s: any) => !classSectionId || s.id === classSectionId)
  .map((s: any) => {
    const offeredSubjects = sectionSubjectsMap.get(s.id) || [];
    return `- ${s.academic_classes?.name || ""} ${s.name} (Room: ${s.room || "TBD"}) [ID: ${s.id}]
  Offered Subjects: ${offeredSubjects.length > 0 ? offeredSubjects.join(", ") : "None assigned yet"}`;
  })
  .join("\n")}

ACTIVE DAYS OF THE WEEK:
${targetDays.join(", ")}

AVAILABLE PERIOD SLOTS PER DAY:
${periodDefs
  .map(
    (p) =>
      `- Index ${p.index}: ${p.label} (${p.startTime || "TBD"} - ${p.endTime || "TBD"})${
        p.isBreak ? " [BREAK - DO NOT SCHEDULE CLASSES HERE]" : ""
      }`
  )
  .join("\n")}

ALL AVAILABLE TEACHERS IN THE SCHOOL:
${teachers.map((t: any) => `- Teacher Name: "${t.profiles?.display_name || t.user_id}" [ID: ${t.user_id}]`).join("\n")}

ALL OFFERED SUBJECTS IN THE SCHOOL:
${subjects.map((s: any) => `- Subject Name: "${s.name}" [ID: ${s.id}]`).join("\n")}

TEACHER AVAILABILITY & ASSIGNMENTS:
${mergedAssignments
  .map((a: any) => {
    const tName = teacherNameMap.get(a.teacherId) || a.teacherId;
    const subj = subjects.find((s: any) => s.id === a.subjectId);
    const sect = sections.find((s: any) => s.id === a.sectionId);
    return `- Teacher "${tName}" [ID: ${a.teacherId}] is assigned to teach "${subj?.name || a.subjectId}" in section "${sect?.academic_classes?.name || ""} ${sect?.name || ""}" [Section ID: ${a.sectionId}]`;
  })
  .join("\n")}

CLASH CONSTRAINTS (BUSY TEACHERS/ROOMS FROM OTHER SECTIONS):
${teacherBusyConstraints.length > 0 ? teacherBusyConstraints.join("\n") : "- No teacher busy constraints."}
${roomBusyConstraints.length > 0 ? roomBusyConstraints.join("\n") : "- No room busy constraints."}

USER-DEFINED CONSTRAINTS:
- Max classes per teacher per day: ${constraints?.maxClassesPerTeacher || 6}
- Max consecutive periods for a teacher: ${constraints?.maxConsecutivePeriods || "No Limit"}
- Respect break periods: ${constraints?.includeBreaks !== false}
- Subject frequency (periods/week): Target around ${constraints?.subjectPeriodsPerWeek || 5} periods per subject per section.
`;

    const systemPrompt = `You are a professional, expert school timetable generator. Your task is to produce a fully optimized, clash-free schedule in valid JSON format.

JSON schema:
{
  "timetable": [
    {
      "section_id": "uuid",
      "day": "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
      "period_index": integer,
      "subject_name": "string",
      "teacher_id": "uuid or null",
      "teacher_name": "string or null",
      "room": "string"
    }
  ],
  "conflicts_found": integer,
  "optimization_score": integer (0 to 100),
  "notes": ["string"]
}

STRICT RULE CHECKLIST:
1. Teacher Double-Booking (CRITICAL): A teacher must NEVER be scheduled in two different sections at the same day/period_index in your generated timetable. For example, if Teacher A is scheduled in Section X on Monday at Period 0, Teacher A CANNOT be scheduled in Section Y on Monday at Period 0.
2. Room Double-Booking (CRITICAL): A room must NEVER be scheduled for two different sections at the same day/period_index.
3. Teacher Busy Slots: Do not schedule a teacher at any slot listed as BUSY for them in the "CLASH CONSTRAINTS" list.
4. Room Busy Slots: Do not schedule any room at a slot listed as BUSY for it in the "CLASH CONSTRAINTS" list.
5. Break Slots: Do not schedule any class during a period index designated as [BREAK - DO NOT SCHEDULE]. Leave these slots empty (do not include them in the JSON timetable array).
6. Subject Limits: Only schedule subjects that are listed in "Offered Subjects" for that section.
7. Teacher Assignments: For each subject in a section, assign the teacher defined in the "TEACHER AVAILABILITY & ASSIGNMENTS" list. If a subject has no pre-assigned teacher, you MUST dynamically assign one of the available school teachers from the school's teachers list who are available at that day and period, making sure they are not double-booked or busy.
8. Target Weekly Frequency: Schedule the target weekly frequency for each subject (usually ${constraints?.subjectPeriodsPerWeek || 5} periods per week per subject per section).
9. Even Distribution: Distribute the periods for a subject evenly across the days. Do not put multiple classes of the same subject on the same day unless target frequency exceeds active days.
10. Valid Slots: Only schedule on days listed in "ACTIVE DAYS OF THE WEEK" and period indexes defined in "AVAILABLE PERIOD SLOTS PER DAY" (from 0 to ${periodDefs.length - 1}).

Return ONLY the valid JSON block. Do not add markdown explanation, code blocks, or comments outside the JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextData },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "{}";
    
    let timetableData: any;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      timetableData = JSON.parse(jsonStr.trim());
    } catch {
      timetableData = { timetable: [] };
    }

    if (!timetableData || typeof timetableData !== "object" || !Array.isArray(timetableData.timetable)) {
      timetableData = { timetable: [] };
    }

    // --- Programmatic CSP Repair Solver ---
    const activeDaysList = targetDays.map(d => d.toLowerCase());
    const nonBreakPeriods = periodDefs.filter(p => !p.isBreak);

    // Map section subject correct teachers
    const sectionSubjectTeacher = new Map<string, { id: string | null; name: string | null }>();
    mergedAssignments.forEach((a) => {
      const correctTeacherId = a.teacherId;
      const tName = teacherNameMap.get(correctTeacherId) || correctTeacherId;
      sectionSubjectTeacher.set(`${a.sectionId}:${a.subjectId}`, { id: correctTeacherId, name: tName });
    });

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

    // Initialize trackers with busy slots from other sections (if single section scheduling)
    if (classSectionId) {
      const otherEntries = (existingEntriesRes.data || []).filter(
        (e: any) => e.class_section_id !== classSectionId
      );
      otherEntries.forEach((e: any) => {
        const dayLabel = dayNames[e.day_of_week]?.toLowerCase();
        const pIndex = periods.findIndex((p: any) => p.id === e.period_id);
        if (!dayLabel || pIndex < 0) return;

        const slotKey = `${dayLabel}:${pIndex}`;
        if (e.teacher_user_id) {
          teacherOccupiedSlots.add(`${String(e.teacher_user_id).toLowerCase()}:${slotKey}`);
        }
        if (e.room) {
          roomOccupiedSlots.add(`${String(e.room).toLowerCase().trim()}:${slotKey}`);
        }
      });
    }

    const sectionsToSchedule = sections.filter((s: any) => !classSectionId || s.id === classSectionId);

    // 1. Process and filter the AI suggestions to keep only the valid ones
    const rawEntries = timetableData.timetable || [];
    for (const entry of rawEntries) {
      const sId = entry.section_id;
      const day = String(entry.day || "").toLowerCase().trim();
      const pIdx = Number(entry.period_index);
      const subjName = String(entry.subject_name || "").trim();

      if (!sId || !day || !Number.isFinite(pIdx) || !subjName) continue;
      const sect = sectionsToSchedule.find(s => s.id === sId);
      if (!sect) continue;

      if (!activeDaysList.includes(day)) continue;
      const periodDef = nonBreakPeriods.find(p => p.index === pIdx);
      if (!periodDef) continue; // Skip break periods or invalid index

      // Check if subject is offered in section
      const offered = sectionSubjectsMap.get(sId) || [];
      const offeredSubjectName = offered.find(sName => sName.toLowerCase() === subjName.toLowerCase());
      if (!offeredSubjectName) continue; // Subject is not offered in this section

      // Get correct teacher assignment
      const subjectObj = subjects.find(s => s.name.toLowerCase() === offeredSubjectName.toLowerCase());
      const correctTeacher = subjectObj ? sectionSubjectTeacher.get(`${sId}:${subjectObj.id}`) : null;
      
      let teacherId = correctTeacher?.id || null;
      let teacherName = correctTeacher?.name || null;

      // If no pre-assigned teacher, resolve and use the AI's suggested teacher
      if (!teacherId && entry.teacher_name && entry.teacher_name !== "—" && entry.teacher_name !== "null") {
        const matched = teachers.find((t: any) => 
          (t.profiles?.display_name && t.profiles.display_name.toLowerCase().trim() === entry.teacher_name.toLowerCase().trim()) ||
          t.user_id === entry.teacher_id
        );
        if (matched) {
          teacherId = matched.user_id;
          teacherName = matched.profiles?.display_name || matched.user_id;
        }
      }

      // Check double-booking conflicts
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

      // Check weekly frequency limit
      const subjectKey = `${sId}:${offeredSubjectName.toLowerCase()}`;
      const currentCount = subjectWeeklyCount.get(subjectKey) || 0;
      const targetFrequency = constraints?.subjectPeriodsPerWeek || 5;
      if (currentCount >= targetFrequency) continue;

      // Accept this suggestion
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
      const offered = sectionSubjectsMap.get(sect.id) || [];
      for (const subjName of offered) {
        const subjectKey = `${sect.id}:${subjName.toLowerCase()}`;
        const scheduledCount = subjectWeeklyCount.get(subjectKey) || 0;
        const targetFrequency = constraints?.subjectPeriodsPerWeek || 5;
        const missingCount = Math.max(0, targetFrequency - scheduledCount);

        const subjectObj = subjects.find(s => s.name.toLowerCase() === subjName.toLowerCase());
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

    // Sort unplaced lessons: schedule lessons with teachers first (they are more constrained)
    unplacedLessons.sort((a, b) => {
      if (a.teacher_id && !b.teacher_id) return -1;
      if (!a.teacher_id && b.teacher_id) return 1;
      return 0;
    });

    // Backtracking CSP solver
    let backtrackCount = 0;
    const MAX_BACKTRACKS = 1000;

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

      // Find all empty slots for this section
      const emptySlots: Array<{ day: string; pIdx: number }> = [];
      for (const day of activeDaysList) {
        for (const periodDef of nonBreakPeriods) {
          const pIdx = periodDef.index;
          const sectionSlotKey = `${sId}:${day}:${pIdx}`;
          if (!sectionOccupiedSlots.has(sectionSlotKey)) {
            emptySlots.push({ day, pIdx });
          }
        }
      }

      // Shuffle empty slots to find balanced schedules
      emptySlots.sort(() => Math.random() - 0.5);

      for (const slot of emptySlots) {
        const { day, pIdx } = slot;
        const slotKey = `${day}:${pIdx}`;
        const sectionSlotKey = `${sId}:${slotKey}`;

        // If lesson has no pre-assigned teacher, find an available teacher dynamically
        let assignedTeacherId = lesson.teacher_id;
        let assignedTeacherName = lesson.teacher_name;

        if (!assignedTeacherId) {
          const availableTeacher = teachers.find((t: any) => {
            const teacherSlotKey = `${String(t.user_id).toLowerCase()}:${slotKey}`;
            return !teacherOccupiedSlots.has(teacherSlotKey);
          });
          if (availableTeacher) {
            assignedTeacherId = availableTeacher.user_id;
            assignedTeacherName = availableTeacher.profiles?.display_name || availableTeacher.user_id;
          }
        }

        const teacherSlotKey = assignedTeacherId ? `${String(assignedTeacherId).toLowerCase()}:${slotKey}` : null;
        const roomSlotKey = lesson.room && lesson.room !== "TBD" && lesson.room !== "none" && lesson.room !== "—"
          ? `${String(lesson.room).toLowerCase().trim()}:${slotKey}`
          : null;

        // Double-booking check
        if (teacherSlotKey && teacherOccupiedSlots.has(teacherSlotKey)) continue;
        if (roomSlotKey && roomOccupiedSlots.has(roomSlotKey)) continue;

        // Soft constraint check: spread subjects evenly (no double subject per day unless relaxed)
        if (!allowDoubleSubjectPerDay) {
          const sameSubjectOnDay = scheduledEntries.some(
            e => e.section_id === sId && e.day === day && e.subject_name.toLowerCase() === lesson.subject_name.toLowerCase()
          );
          if (sameSubjectOnDay) continue;
        }

        // Place lesson
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

        // Backtrack
        scheduledEntries.pop();
        sectionOccupiedSlots.delete(sectionSlotKey);
        if (teacherSlotKey) teacherOccupiedSlots.delete(teacherSlotKey);
        if (roomSlotKey) roomOccupiedSlots.delete(roomSlotKey);
      }

      return false;
    }

    // Run solver
    backtrackCount = 0;
    let solved = solve(0, false);

    if (!solved) {
      console.log("CSP solver under strict constraints failed. Retrying with relaxed day-spread constraint...");
      // Re-populate solvers with kept entries
      sectionOccupiedSlots.clear();
      teacherOccupiedSlots.clear();
      roomOccupiedSlots.clear();

      if (classSectionId) {
        const otherEntries = (existingEntriesRes.data || []).filter(
          (e: any) => e.class_section_id !== classSectionId
        );
        otherEntries.forEach((e: any) => {
          const dayLabel = dayNames[e.day_of_week]?.toLowerCase();
          const pIndex = periods.findIndex((p: any) => p.id === e.period_id);
          if (!dayLabel || pIndex < 0) return;

          const slotKey = `${dayLabel}:${pIndex}`;
          if (e.teacher_user_id) {
            teacherOccupiedSlots.add(`${String(e.teacher_user_id).toLowerCase()}:${slotKey}`);
          }
          if (e.room) {
            roomOccupiedSlots.add(`${String(e.room).toLowerCase().trim()}:${slotKey}`);
          }
        });
      }

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

    // Complete suggestion data overwrite
    timetableData.timetable = scheduledEntries;
    timetableData.conflicts_found = 0;
    timetableData.optimization_score = solved ? 100 : Math.round((scheduledEntries.length / (scheduledEntries.length + unplacedLessons.length)) * 100);

    try {
      await supabase.from("ai_timetable_suggestions").insert({
        school_id: schoolId,
        class_section_id: classSectionId,
        suggestion_data: timetableData,
        conflicts_found: 0,
        optimization_score: timetableData.optimization_score || 0,
        status: "draft",
      });
    } catch (dbErr) {
      console.warn("Failed to insert suggestion into database:", dbErr);
    }

    return new Response(JSON.stringify({ success: true, timetableData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-timetable-generator error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
