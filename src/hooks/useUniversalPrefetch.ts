import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  // Core caches
  cacheStudents, cacheEnrollments, cacheSubjects, cacheClassSections, cacheAcademicClasses,
  cacheTimetable, cacheTimetablePeriods, cacheAssignments, cacheHomework,
  cacheAttendance, cacheAttendanceSessions,
  // Academic caches
  cacheAssessments, cacheStudentMarks, cacheTeacherAssignments, cacheBehaviorNotes, cacheGradeThresholds,
  // HR caches
  cacheStaffMembers, cacheLeaveRequests, cacheContracts, cacheSalaryRecords, cacheHrDocuments,
  // Finance caches
  cacheInvoices, cachePayments, cacheExpenses, cacheFeePlans, cachePaymentMethods,
  // CRM caches
  cacheLeads, cacheCrmStages, cacheCrmPipelines, cacheCampaigns, cacheCrmActivities, cacheCallLogs,
  // Other caches
  cacheContacts, cacheNotifications, cacheStudentGuardians, cacheAdminMessages,
  // Types
  CachedStudent, CachedEnrollment, CachedSubject, CachedClassSection, CachedAcademicClass,
  CachedTimetableEntry, CachedTimetablePeriod, CachedAssignment, CachedHomework,
  CachedAttendance, CachedAttendanceSession,
  CachedAssessment, CachedStudentMark, CachedTeacherAssignment, CachedBehaviorNote, CachedGradeThreshold,
  CachedStaffMember, CachedLeaveRequest, CachedContract, CachedSalaryRecord, CachedHrDocument,
  CachedInvoice, CachedPayment, CachedExpense, CachedFeePlan, CachedPaymentMethod,
  CachedLead, CachedCrmStage, CachedCrmPipeline, CachedCampaign, CachedCrmActivity, CachedCallLog,
  CachedContact, CachedNotification, CachedStudentGuardian, CachedAdminMessage,
} from '@/lib/offline-db';

// ==================== Constants ====================

const PREFETCH_CACHE_KEY = 'eduverse_total_prefetch';
const PREFETCH_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_SIZE = 1000; // Max records per query

// ==================== Types ====================

interface UniversalPrefetchOptions {
  schoolId: string | null;
  userId: string | null;
  enabled?: boolean;
}

interface PrefetchProgress {
  total: number;
  completed: number;
  currentTask: string;
}

// ==================== Helpers ====================

function shouldPrefetch(schoolId: string): boolean {
  try {
    const cached = localStorage.getItem(`${PREFETCH_CACHE_KEY}_${schoolId}`);
    if (!cached) return true;
    const lastPrefetch = parseInt(cached, 10);
    return Date.now() - lastPrefetch > PREFETCH_INTERVAL;
  } catch {
    return true;
  }
}

function markPrefetched(schoolId: string) {
  try {
    localStorage.setItem(`${PREFETCH_CACHE_KEY}_${schoolId}`, Date.now().toString());
  } catch {
    // Ignore
  }
}

// Cache comprehensive stats
function cacheAllStats(schoolId: string, stats: Record<string, unknown>) {
  try {
    localStorage.setItem(`eduverse_stats_${schoolId}_all`, JSON.stringify({
      data: stats,
      cachedAt: Date.now(),
    }));
  } catch {
    // Ignore
  }
}

export function getCachedStats(schoolId: string, _role?: string): Record<string, unknown> | null {
  try {
    const cached = localStorage.getItem(`eduverse_stats_${schoolId}_all`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.cachedAt < 24 * 60 * 60 * 1000) {
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== Main Hook ====================

export function useUniversalPrefetch(options: UniversalPrefetchOptions) {
  const { schoolId, userId, enabled = true } = options;
  const prefetchedRef = useRef(false);
  const progressRef = useRef<PrefetchProgress>({ total: 0, completed: 0, currentTask: '' });

  const updateProgress = useCallback((task: string) => {
    progressRef.current.completed += 1;
    progressRef.current.currentTask = task;
  }, []);

  useEffect(() => {
    if (!enabled || !schoolId || !userId) return;
    if (!navigator.onLine) return;
    if (prefetchedRef.current) return;
    if (!shouldPrefetch(schoolId)) return;

    let cancelled = false;
    prefetchedRef.current = true;

    async function prefetchAllData() {
      try {
        console.log('[TotalPrefetch] Starting comprehensive background sync for school:', schoolId);
        const startTime = Date.now();

        // Run ALL prefetch tasks in parallel groups to maximize speed
        await Promise.allSettled([
          // Group 1: Core Academic Structure
          prefetchAcademicStructure(schoolId!, cancelled, updateProgress),
          
          // Group 2: Students & Enrollments
          prefetchStudentsAndEnrollments(schoolId!, cancelled, updateProgress),
          
          // Group 3: Timetable
          prefetchTimetableData(schoolId!, cancelled, updateProgress),
          
          // Group 4: Assignments & Homework
          prefetchAssignmentsAndHomework(schoolId!, cancelled, updateProgress),
          
          // Group 5: Attendance
          prefetchAttendanceData(schoolId!, cancelled, updateProgress),
          
          // Group 6: Assessments & Grades
          prefetchAssessmentsAndGrades(schoolId!, cancelled, updateProgress),
          
          // Group 7: HR Data
          prefetchHrData(schoolId!, cancelled, updateProgress),
          
          // Group 8: Finance Data
          prefetchFinanceData(schoolId!, cancelled, updateProgress),
          
          // Group 9: CRM/Marketing Data
          prefetchCrmData(schoolId!, cancelled, updateProgress),
          
          // Group 10: Messaging & Notifications
          prefetchMessagingData(schoolId!, userId!, cancelled, updateProgress),
          
          // Group 11: Support & Admin
          prefetchSupportData(schoolId!, cancelled, updateProgress),
          
          // Group 12: Comprehensive Stats
          prefetchAllStats(schoolId!, cancelled, updateProgress),
        ]);

        if (!cancelled) {
          markPrefetched(schoolId!);
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[TotalPrefetch] Complete in ${duration}s`);
        }
      } catch (error) {
        console.error('[TotalPrefetch] Error:', error);
      }
    }

    void prefetchAllData();

    return () => {
      cancelled = true;
    };
  }, [enabled, schoolId, userId, updateProgress]);
}

// ==================== Prefetch Functions ====================

async function prefetchAcademicStructure(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Academic Classes
  tasks.push((async () => {
    const { data } = await supabase
      .from('academic_classes')
      .select('id, name, grade_level, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedAcademicClass[] = data.map(c => ({
        id: c.id, schoolId: c.school_id, name: c.name, gradeLevel: c.grade_level, cachedAt: Date.now(),
      }));
      await cacheAcademicClasses(cached);
      onProgress('Academic Classes');
    }
  })());

  // Class Sections
  tasks.push((async () => {
    const { data } = await supabase
      .from('class_sections')
      .select('id, name, class_id, room, school_id, academic_classes(name)')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedClassSection[] = data.map((s: any) => ({
        id: s.id, schoolId: s.school_id, name: s.name, classId: s.class_id,
        className: s.academic_classes?.name || '', room: s.room, cachedAt: Date.now(),
      }));
      await cacheClassSections(cached);
      onProgress('Class Sections');
    }
  })());

  // Subjects
  tasks.push((async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name, code, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedSubject[] = data.map(s => ({
        id: s.id, schoolId: s.school_id, name: s.name, code: s.code, cachedAt: Date.now(),
      }));
      await cacheSubjects(cached);
      onProgress('Subjects');
    }
  })());

  // Grade Thresholds
  tasks.push((async () => {
    const { data } = await supabase
      .from('grade_thresholds')
      .select('id, grade_label, min_percentage, max_percentage, grade_points, sort_order, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedGradeThreshold[] = data.map(g => ({
        id: g.id, schoolId: g.school_id, gradeLabel: g.grade_label,
        minPercentage: g.min_percentage, maxPercentage: g.max_percentage,
        gradePoints: g.grade_points, sortOrder: g.sort_order, cachedAt: Date.now(),
      }));
      await cacheGradeThresholds(cached);
      onProgress('Grade Thresholds');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchStudentsAndEnrollments(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // All Students
  tasks.push((async () => {
    const { data } = await supabase
      .from('students')
      .select(`
        id, first_name, last_name, school_id, status, profile_id,
        student_enrollments(id, class_section_id, class_sections(name, academic_classes(name)))
      `)
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const students: CachedStudent[] = data.map((s: any) => {
        const enrollment = s.student_enrollments?.[0];
        return {
          id: s.id, schoolId: s.school_id, firstName: s.first_name, lastName: s.last_name,
          status: s.status, profileId: s.profile_id,
          classSectionId: enrollment?.class_section_id || '',
          classSectionName: enrollment?.class_sections?.name || '',
          className: enrollment?.class_sections?.academic_classes?.name || '',
          cachedAt: Date.now(),
        };
      });
      await cacheStudents(students);
      onProgress('Students');
    }
  })());

  // All Enrollments
  tasks.push((async () => {
    const { data } = await supabase
      .from('student_enrollments')
      .select('id, student_id, class_section_id, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedEnrollment[] = data.map(e => ({
        id: e.id, schoolId: e.school_id, studentId: e.student_id,
        classSectionId: e.class_section_id, cachedAt: Date.now(),
      }));
      await cacheEnrollments(cached);
      onProgress('Enrollments');
    }
  })());

  // Student Guardians
  tasks.push((async () => {
    const { data } = await supabase
      .from('student_guardians')
      .select('id, student_id, user_id, relationship, phone, email, students(school_id)')
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const filtered = data.filter((g: any) => g.students?.school_id === schoolId);
      const cached: CachedStudentGuardian[] = filtered.map((g: any) => ({
        id: g.id, schoolId: g.students?.school_id || schoolId, studentId: g.student_id,
        userId: g.user_id, relationship: g.relationship, phone: g.phone, email: g.email,
        cachedAt: Date.now(),
      }));
      await cacheStudentGuardians(cached);
      onProgress('Student Guardians');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchTimetableData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Timetable Periods
  tasks.push((async () => {
    const { data } = await supabase
      .from('timetable_periods')
      .select('id, label, start_time, end_time, sort_order, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedTimetablePeriod[] = data.map(p => ({
        id: p.id, schoolId: p.school_id, label: p.label,
        startTime: p.start_time, endTime: p.end_time, sortOrder: p.sort_order,
        cachedAt: Date.now(),
      }));
      await cacheTimetablePeriods(cached);
      onProgress('Timetable Periods');
    }
  })());

  // All Timetable Entries
  tasks.push((async () => {
    const { data } = await supabase
      .from('timetable_entries')
      .select(`
        id, day_of_week, period_id, subject_name, room, class_section_id, school_id,
        teacher_user_id, start_time, end_time,
        timetable_periods(label, sort_order, start_time, end_time),
        class_sections(name, academic_classes(name))
      `)
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedTimetableEntry[] = data.map((e: any) => ({
        id: e.id, schoolId: e.school_id, dayOfWeek: e.day_of_week, periodId: e.period_id,
        periodLabel: e.timetable_periods?.label || '', subjectName: e.subject_name,
        classSectionId: e.class_section_id,
        sectionLabel: e.class_sections ? `${e.class_sections.academic_classes?.name || ''} ${e.class_sections.name}` : null,
        room: e.room, teacherUserId: e.teacher_user_id,
        startTime: e.start_time || e.timetable_periods?.start_time || null,
        endTime: e.end_time || e.timetable_periods?.end_time || null,
        sortOrder: e.timetable_periods?.sort_order || 999,
        cachedAt: Date.now(),
      }));
      await cacheTimetable(cached);
      onProgress('Timetable Entries');
    }
  })());

  // Teacher Assignments
  tasks.push((async () => {
    const { data } = await supabase
      .from('teacher_assignments')
      .select(`
        id, teacher_user_id, class_section_id, subject_id, school_id,
        class_sections(name), subjects(name)
      `)
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedTeacherAssignment[] = data.map((a: any) => ({
        id: a.id, schoolId: a.school_id, teacherUserId: a.teacher_user_id,
        classSectionId: a.class_section_id, subjectId: a.subject_id,
        sectionName: a.class_sections?.name, subjectName: a.subjects?.name,
        cachedAt: Date.now(),
      }));
      await cacheTeacherAssignments(cached);
      onProgress('Teacher Assignments');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchAssignmentsAndHomework(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // All Assignments
  tasks.push((async () => {
    const { data } = await supabase
      .from('assignments')
      .select(`
        id, title, description, due_date, max_marks, status, teacher_user_id,
        class_section_id, school_id,
        class_sections(name, academic_classes(name))
      `)
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedAssignment[] = data.map((a: any) => ({
        id: a.id, schoolId: a.school_id, title: a.title, description: a.description,
        dueDate: a.due_date, maxMarks: a.max_marks, status: a.status,
        teacherUserId: a.teacher_user_id, classSectionId: a.class_section_id,
        sectionLabel: a.class_sections ? `${a.class_sections.academic_classes?.name || ''} ${a.class_sections.name}` : '',
        cachedAt: Date.now(),
      }));
      await cacheAssignments(cached);
      onProgress('Assignments');
    }
  })());

  // All Homework
  tasks.push((async () => {
    const { data } = await supabase
      .from('homework')
      .select(`
        id, title, description, due_date, status, teacher_user_id,
        class_section_id, school_id,
        class_sections(name, academic_classes(name))
      `)
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedHomework[] = data.map((h: any) => ({
        id: h.id, schoolId: h.school_id, title: h.title, description: h.description,
        dueDate: h.due_date, status: h.status, teacherUserId: h.teacher_user_id,
        classSectionId: h.class_section_id,
        sectionLabel: h.class_sections ? `${h.class_sections.academic_classes?.name || ''} ${h.class_sections.name}` : '',
        cachedAt: Date.now(),
      }));
      await cacheHomework(cached);
      onProgress('Homework');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchAttendanceData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tasks: Promise<void>[] = [];

  // Attendance Sessions
  tasks.push((async () => {
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, period_label, class_section_id, school_id')
      .eq('school_id', schoolId)
      .gte('session_date', cutoff)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedAttendanceSession[] = data.map(s => ({
        id: s.id, schoolId: s.school_id, classSectionId: s.class_section_id,
        sessionDate: s.session_date, periodLabel: s.period_label, cachedAt: Date.now(),
      }));
      await cacheAttendanceSessions(cached);
      onProgress('Attendance Sessions');

      // Then fetch entries for these sessions
      if (data.length > 0) {
        const sessionIds = data.map(s => s.id);
        const { data: entries } = await (supabase as any)
          .from('attendance_entries')
          .select('id, student_id, session_id, status, note, school_id')
          .eq('school_id', schoolId)
          .in('session_id', sessionIds);
        if (entries) {
          const sessionMap = new Map(data.map((s: any) => [s.id, s]));
          const cachedEntries: CachedAttendance[] = entries.map((e: any) => {
            const session = sessionMap.get(e.session_id) as any;
            return {
              id: e.id, schoolId: e.school_id, studentId: e.student_id,
              sessionId: e.session_id, sessionDate: session?.session_date || '',
              status: e.status, note: e.note, periodLabel: session?.period_label || '',
              classSectionId: session?.class_section_id || '', cachedAt: Date.now(),
            };
          });
          await cacheAttendance(cachedEntries);
          onProgress('Attendance Entries');
        }
      }
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchAssessmentsAndGrades(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Assessments
  tasks.push((async () => {
    const { data } = await supabase
      .from('academic_assessments')
      .select(`
        id, title, class_section_id, subject_id, assessment_date, max_marks, 
        is_published, term_label, school_id, subjects(name)
      `)
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedAssessment[] = data.map((a: any) => ({
        id: a.id, schoolId: a.school_id, title: a.title, classSectionId: a.class_section_id,
        subjectId: a.subject_id, subjectName: a.subjects?.name,
        assessmentDate: a.assessment_date, maxMarks: a.max_marks,
        isPublished: a.is_published, termLabel: a.term_label, cachedAt: Date.now(),
      }));
      await cacheAssessments(cached);
      onProgress('Assessments');
    }
  })());

  // Student Marks
  tasks.push((async () => {
    const { data } = await supabase
      .from('student_marks')
      .select('id, student_id, assessment_id, marks, computed_grade, grade_points, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedStudentMark[] = data.map(m => ({
        id: m.id, schoolId: m.school_id, studentId: m.student_id,
        assessmentId: m.assessment_id, marks: m.marks,
        computedGrade: m.computed_grade, gradePoints: m.grade_points, cachedAt: Date.now(),
      }));
      await cacheStudentMarks(cached);
      onProgress('Student Marks');
    }
  })());

  // Behavior Notes
  tasks.push((async () => {
    const { data } = await supabase
      .from('behavior_notes')
      .select('id, student_id, teacher_user_id, title, content, note_type, is_shared_with_parents, created_at, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedBehaviorNote[] = data.map(n => ({
        id: n.id, schoolId: n.school_id, studentId: n.student_id,
        teacherUserId: n.teacher_user_id, title: n.title, content: n.content,
        noteType: n.note_type, isSharedWithParents: n.is_shared_with_parents,
        createdAt: n.created_at, cachedAt: Date.now(),
      }));
      await cacheBehaviorNotes(cached);
      onProgress('Behavior Notes');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchHrData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Staff Members (from directory) — exclude students, parents, owners, super/platform admins
  tasks.push((async () => {
    const [dirRes, rolesRes, ownersRes, platformRes] = await Promise.all([
      supabase.from('school_user_directory')
        .select('user_id, email, display_name')
        .eq('school_id', schoolId)
        .limit(BATCH_SIZE),
      supabase.from('user_roles').select('user_id, role').eq('school_id', schoolId),
      supabase.from('school_owner_assignments').select('owner_user_id').eq('school_id', schoolId),
      supabase.from('platform_super_admins' as any).select('user_id'),
    ]);
    if (!cancelled && dirRes.data) {
      const NON_STAFF = new Set(['student', 'parent', 'owner', 'school_owner']);
      const excluded = new Set<string>();
      (rolesRes.data ?? []).forEach((r: any) => {
        if (r.user_id && NON_STAFF.has(String(r.role).toLowerCase())) excluded.add(r.user_id);
      });
      (ownersRes.data ?? []).forEach((o: any) => {
        if (o.owner_user_id) excluded.add(o.owner_user_id);
      });
      ((platformRes as any).data ?? []).forEach((p: any) => {
        if (p.user_id) excluded.add(p.user_id);
      });
      const cached: CachedStaffMember[] = dirRes.data
        .filter((s: any) => s.user_id && !excluded.has(s.user_id))
        .map(s => ({
          id: s.user_id, schoolId, userId: s.user_id,
          displayName: s.display_name || s.email || 'Unknown',
          email: s.email, role: null, status: 'active', cachedAt: Date.now(),
        }));
      await cacheStaffMembers(cached);
      onProgress('Staff Members');
    }
  })());

  // Leave Requests
  tasks.push((async () => {
    const { data } = await supabase
      .from('hr_leave_requests')
      .select('id, user_id, leave_type_id, start_date, end_date, days_count, status, reason, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedLeaveRequest[] = data.map(l => ({
        id: l.id, schoolId: l.school_id, userId: l.user_id,
        leaveTypeId: l.leave_type_id, startDate: l.start_date, endDate: l.end_date,
        daysCount: l.days_count, status: l.status, reason: l.reason, cachedAt: Date.now(),
      }));
      await cacheLeaveRequests(cached);
      onProgress('Leave Requests');
    }
  })());

  // Contracts
  tasks.push((async () => {
    const { data } = await supabase
      .from('hr_contracts')
      .select('id, user_id, contract_type, start_date, end_date, position, department, status, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedContract[] = data.map(c => ({
        id: c.id, schoolId: c.school_id, userId: c.user_id,
        contractType: c.contract_type, startDate: c.start_date, endDate: c.end_date,
        position: c.position, department: c.department, status: c.status, cachedAt: Date.now(),
      }));
      await cacheContracts(cached);
      onProgress('Contracts');
    }
  })());

  // Salary Records - Note: using salary_slips which is the actual table
  // Skip salary records if table doesn't exist in this schema

  // HR Documents
  tasks.push((async () => {
    const { data } = await supabase
      .from('hr_documents')
      .select('id, user_id, document_name, document_type, file_url, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedHrDocument[] = data.map(d => ({
        id: d.id, schoolId: d.school_id, userId: d.user_id,
        documentName: d.document_name, documentType: d.document_type, fileUrl: d.file_url,
        cachedAt: Date.now(),
      }));
      await cacheHrDocuments(cached);
      onProgress('HR Documents');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchFinanceData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Invoices - Do not permanently cache sensitive private/financial logs locally
  tasks.push((async () => {
    if (!cancelled) {
      await cacheInvoices([]);
      onProgress('Invoices');
    }
  })());

  // Payments - Do not permanently cache sensitive private/financial logs locally
  tasks.push((async () => {
    if (!cancelled) {
      await cachePayments([]);
      onProgress('Payments');
    }
  })());

  // Expenses - Do not permanently cache sensitive private/financial logs locally
  tasks.push((async () => {
    if (!cancelled) {
      await cacheExpenses([]);
      onProgress('Expenses');
    }
  })());

  // Fee Plans
  tasks.push((async () => {
    const { data } = await supabase
      .from('fee_plans')
      .select('id, name, currency, is_active, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedFeePlan[] = data.map(f => ({
        id: f.id, schoolId: f.school_id, name: f.name,
        currency: f.currency, isActive: f.is_active, cachedAt: Date.now(),
      }));
      await cacheFeePlans(cached);
      onProgress('Fee Plans');
    }
  })());

  // Payment Methods
  tasks.push((async () => {
    const { data } = await supabase
      .from('finance_payment_methods')
      .select('id, name, type, is_active, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedPaymentMethod[] = data.map(m => ({
        id: m.id, schoolId: m.school_id, name: m.name,
        type: m.type, isActive: m.is_active, cachedAt: Date.now(),
      }));
      await cachePaymentMethods(cached);
      onProgress('Payment Methods');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchCrmData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // CRM Pipelines
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_pipelines')
      .select('id, name, is_default, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedCrmPipeline[] = data.map(p => ({
        id: p.id, schoolId: p.school_id, name: p.name, isDefault: p.is_default, cachedAt: Date.now(),
      }));
      await cacheCrmPipelines(cached);
      onProgress('CRM Pipelines');
    }
  })());

  // CRM Stages
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_stages')
      .select('id, pipeline_id, name, sort_order, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedCrmStage[] = data.map(s => ({
        id: s.id, schoolId: s.school_id, pipelineId: s.pipeline_id,
        name: s.name, sortOrder: s.sort_order, cachedAt: Date.now(),
      }));
      await cacheCrmStages(cached);
      onProgress('CRM Stages');
    }
  })());

  // Leads
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, full_name, email, phone, source, status, stage_id, pipeline_id, score, assigned_to, next_follow_up_at, notes, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedLead[] = data.map(l => ({
        id: l.id, schoolId: l.school_id, fullName: l.full_name,
        email: l.email, phone: l.phone, source: l.source, status: l.status,
        stageId: l.stage_id, pipelineId: l.pipeline_id, score: l.score,
        assignedTo: l.assigned_to, nextFollowUpAt: l.next_follow_up_at, notes: l.notes,
        cachedAt: Date.now(),
      }));
      await cacheLeads(cached);
      onProgress('Leads');
    }
  })());

  // Campaigns
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_campaigns')
      .select('id, name, channel, status, budget, start_date, end_date, school_id')
      .eq('school_id', schoolId);
    if (!cancelled && data) {
      const cached: CachedCampaign[] = data.map(c => ({
        id: c.id, schoolId: c.school_id, name: c.name, channel: c.channel,
        status: c.status, budget: c.budget, startDate: c.start_date, endDate: c.end_date,
        cachedAt: Date.now(),
      }));
      await cacheCampaigns(cached);
      onProgress('Campaigns');
    }
  })());

  // CRM Activities
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_activities')
      .select('id, lead_id, activity_type, summary, due_at, completed_at, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedCrmActivity[] = data.map(a => ({
        id: a.id, schoolId: a.school_id, leadId: a.lead_id,
        activityType: a.activity_type, summary: a.summary,
        dueAt: a.due_at, completedAt: a.completed_at, cachedAt: Date.now(),
      }));
      await cacheCrmActivities(cached);
      onProgress('CRM Activities');
    }
  })());

  // Call Logs
  tasks.push((async () => {
    const { data } = await supabase
      .from('crm_call_logs')
      .select('id, lead_id, called_at, duration_seconds, outcome, notes, school_id')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedCallLog[] = data.map(c => ({
        id: c.id, schoolId: c.school_id, leadId: c.lead_id,
        calledAt: c.called_at, durationSeconds: c.duration_seconds,
        outcome: c.outcome, notes: c.notes, cachedAt: Date.now(),
      }));
      await cacheCallLogs(cached);
      onProgress('Call Logs');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchMessagingData(schoolId: string, userId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Contacts
  tasks.push((async () => {
    const { data } = await supabase
      .from('school_user_directory')
      .select('user_id, email, display_name')
      .eq('school_id', schoolId)
      .limit(BATCH_SIZE);
    if (!cancelled && data) {
      const cached: CachedContact[] = data.map(d => ({
        id: d.user_id, schoolId, userId: d.user_id,
        displayName: d.display_name || d.email || 'Unknown',
        email: d.email, role: null, canMessage: true, cachedAt: Date.now(),
      }));
      await cacheContacts(cached);
      onProgress('Contacts');
    }
  })());

  // User Notifications
  tasks.push((async () => {
    const { data } = await supabase
      .from('app_notifications')
      .select('id, user_id, type, title, body, entity_type, entity_id, read_at, created_at, school_id')
      .eq('school_id', schoolId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!cancelled && data) {
      const cached: CachedNotification[] = data.map(n => ({
        id: n.id, schoolId: n.school_id, userId: n.user_id,
        type: n.type, title: n.title, body: n.body,
        entityType: n.entity_type, entityId: n.entity_id,
        readAt: n.read_at, createdAt: n.created_at, cachedAt: Date.now(),
      }));
      await cacheNotifications(cached);
      onProgress('Notifications');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchSupportData(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const tasks: Promise<void>[] = [];

  // Admin Messages (Support Tickets)
  tasks.push((async () => {
    const { data } = await supabase
      .from('admin_messages')
      .select('id, sender_user_id, subject, content, status, priority, created_at, school_id')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!cancelled && data) {
      const cached: CachedAdminMessage[] = data.map(m => ({
        id: m.id, schoolId: m.school_id, senderUserId: m.sender_user_id,
        subject: m.subject, content: m.content, status: m.status,
        priority: m.priority, createdAt: m.created_at, cachedAt: Date.now(),
      }));
      await cacheAdminMessages(cached);
      onProgress('Admin Messages');
    }
  })());

  await Promise.allSettled(tasks);
}

async function prefetchAllStats(schoolId: string, cancelled: boolean, onProgress: (task: string) => void) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const d7Ago = new Date();
  d7Ago.setDate(d7Ago.getDate() - 7);

  const [
    studentsRes, staffRes, teachersRes, leadsRes, openLeadsRes,
    paymentsRes, pendingInvoicesRes, expensesRes,
    attendanceRes, presentRes,
    leavesRes, contractsRes, campaignsRes,
  ] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('school_memberships').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'teacher'),
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'open'),
    supabase.from('fee_payments').select('amount').eq('school_id', schoolId).eq('status', 'success').gte('paid_at', monthStart.toISOString()),
    supabase.from('fee_invoices').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).not('status', 'eq', 'paid').not('status', 'eq', 'cancelled'),
    supabase.from('finance_expenses').select('amount').eq('school_id', schoolId).gte('expense_date', monthStart.toISOString().split('T')[0]),
    supabase.from('attendance_entries').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).gte('created_at', d7Ago.toISOString()),
    supabase.from('attendance_entries').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'present').gte('created_at', d7Ago.toISOString()),
    supabase.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'pending'),
    supabase.from('hr_contracts').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('crm_campaigns').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
  ]);

  if (!cancelled) {
    const revenueMtd = (paymentsRes.data || []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const expensesMtd = (expensesRes.data || []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const totalAttendance = attendanceRes.count ?? 0;
    const presentAttendance = presentRes.count ?? 0;
    const attendanceRate = totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 0;

    const allStats = {
      // Student/Academic
      totalStudents: studentsRes.count ?? 0,
      totalTeachers: teachersRes.count ?? 0,
      attendanceRate7d: attendanceRate,
      
      // Staff/HR
      totalStaff: staffRes.count ?? 0,
      pendingLeaves: leavesRes.count ?? 0,
      activeContracts: contractsRes.count ?? 0,
      
      // Finance
      revenueMtd,
      expensesMtd,
      pendingInvoices: pendingInvoicesRes.count ?? 0,
      
      // CRM/Marketing
      totalLeads: leadsRes.count ?? 0,
      openLeads: openLeadsRes.count ?? 0,
      activeCampaigns: campaignsRes.count ?? 0,
    };

    cacheAllStats(schoolId, allStats);
    onProgress('All Stats');
  }
}
