import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  addToOfflineQueue,
  getPendingQueueItems,
  markQueueItemSynced,
  incrementRetryCount,
  getQueueStats,
  clearSyncedItems,
  cacheStudents,
  getCachedStudents,
  cacheTimetable,
  getCachedTimetable,
  cacheAssignments,
  getCachedAssignments,
  cacheSubjects,
  cacheClassSections,
  getCachedClassSections,
  getAllSyncMetadata,
  getStorageEstimate,
  OfflineQueueItem,
  CachedStudent,
  CachedTimetableEntry,
  CachedAssignment,
  SyncMetadata,
} from "@/lib/offline-db";

interface OfflineStats {
  pending: number;
  synced: number;
  failed: number;
  byType: Record<string, number>;
}

interface StorageInfo {
  usageFormatted: string;
  quotaFormatted: string;
  percentUsed: number;
}

interface SyncProgress {
  current: number;
  total: number;
  currentType: string;
}

export function useOfflineEnhanced(schoolId: string | null, userId: string | null) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<OfflineStats>({ pending: 0, synced: 0, failed: 0, byType: {} });
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata[]>([]);
  const [cachedData, setCachedData] = useState<{
    students: CachedStudent[];
    timetable: CachedTimetableEntry[];
    assignments: CachedAssignment[];
  }>({ students: [], timetable: [], assignments: [] });

  const syncInProgress = useRef(false);
  const retryTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Update stats periodically
  const refreshStats = useCallback(async () => {
    const queueStats = await getQueueStats();
    setStats(queueStats);
    
    const storage = await getStorageEstimate();
    setStorageInfo({
      usageFormatted: storage.usageFormatted,
      quotaFormatted: storage.quotaFormatted,
      percentUsed: storage.percentUsed,
    });
    
    const metadata = await getAllSyncMetadata();
    setSyncMetadata(metadata);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online! Syncing pending changes...");
      syncPendingItems();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline. Changes will be saved locally.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    // Initial stats load
    refreshStats();
    
    // Periodic stats refresh
    const interval = setInterval(refreshStats, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
      retryTimeouts.current.forEach(timeout => clearTimeout(timeout));
    };
  }, [refreshStats]);

  // Load cached data for current school
  useEffect(() => {
    if (!schoolId) return;
    
    const loadCachedData = async () => {
      const [students, timetable, assignments] = await Promise.all([
        getCachedStudents(schoolId),
        getCachedTimetable(schoolId),
        getCachedAssignments(schoolId),
      ]);
      
      setCachedData({ students, timetable, assignments });
    };
    
    loadCachedData();
  }, [schoolId]);

  // Sync single item with retry logic
  const syncItem = useCallback(async (item: OfflineQueueItem): Promise<boolean> => {
    if (!schoolId || !userId) return false;

    try {
      switch (item.type) {
        case 'attendance': {
          const { session_id, student_id, status, note } = item.data as {
            session_id: string;
            student_id: string;
            status: string;
            note?: string;
          };
          
          const { error } = await api.from("attendance_entries").upsert(
            {
              school_id: schoolId,
              session_id,
              student_id,
              status,
              note: note || null,
              created_by: userId,
            },
            { onConflict: "school_id,session_id,student_id" }
          );
          
          if (error) throw error;
          break;
        }
        
        case 'period_log': {
          const { timetable_entry_id, logged_at, topic_covered, notes, status } = item.data as {
            timetable_entry_id: string;
            logged_at: string;
            topic_covered?: string;
            notes?: string;
            status?: string;
          };
          
          const { error } = await api.from("teacher_period_logs").upsert(
            {
              school_id: schoolId,
              timetable_entry_id,
              logged_at,
              topic_covered: topic_covered || "",
              notes: notes || null,
              status: status || "completed",
              teacher_user_id: userId,
            },
            { onConflict: "school_id,timetable_entry_id,logged_at" }
          );
          
          if (error) throw error;
          break;
        }
        
        case 'behavior_note': {
          const { student_id, title, content, note_type, is_shared_with_parents } = item.data as {
            student_id: string;
            title: string;
            content: string;
            note_type: string;
            is_shared_with_parents: boolean;
          };
          
          const { error } = await api.from("behavior_notes").insert({
            school_id: schoolId,
            student_id,
            title,
            content,
            note_type,
            is_shared_with_parents,
            teacher_user_id: userId,
            created_by: userId,
          });
          
          if (error) throw error;
          break;
        }
        
        case 'homework': {
          const { class_section_id, title, description, due_date, attachment_urls } = item.data as {
            class_section_id: string;
            title: string;
            description?: string;
            due_date: string;
            attachment_urls?: string[];
          };
          
          const { error } = await api.from("homework").insert({
            school_id: schoolId,
            class_section_id,
            title,
            description: description || null,
            due_date,
            attachment_urls: attachment_urls || null,
            teacher_user_id: userId,
            created_by: userId,
          });
          
          if (error) throw error;
          break;
        }
        
        case 'quick_grade': {
          const { assessment_id, student_id, marks } = item.data as {
            assessment_id: string;
            student_id: string;
            marks: number;
          };
          
          const { error } = await api.from("student_marks").upsert(
            {
              school_id: schoolId,
              assessment_id,
              student_id,
              marks,
              created_by: userId,
            },
            { onConflict: "school_id,assessment_id,student_id" }
          );
          
          if (error) throw error;
          break;
        }
        
        case 'message': {
          const { recipient_user_ids, subject, content, priority } = item.data as {
            recipient_user_ids: string[];
            subject: string;
            content: string;
            priority?: string;
          };
          
          const { data: message, error: msgError } = await api
            .from("admin_messages")
            .insert({
              school_id: schoolId,
              sender_user_id: userId,
              subject,
              content,
              priority: priority || "normal",
              created_by: userId,
            })
            .select("id")
            .single();
          
          if (msgError) throw msgError;
          
          const recipients = recipient_user_ids.map(recipientId => ({
            message_id: message.id,
            recipient_user_id: recipientId,
          }));
          
          const { error: recError } = await api
            .from("admin_message_recipients")
            .insert(recipients);
          
          if (recError) throw recError;
          break;
        }
      }
      
      return true;
    } catch (error: any) {
      console.error(`Failed to sync ${item.type}:`, error);
      await incrementRetryCount(item.id, error.message);
      return false;
    }
  }, [schoolId, userId]);

  // Sync all pending items with exponential backoff
  const syncPendingItems = useCallback(async () => {
    if (!schoolId || !userId || syncInProgress.current || !navigator.onLine) return;
    
    syncInProgress.current = true;
    setIsSyncing(true);
    
    try {
      const pending = await getPendingQueueItems();
      
      if (pending.length === 0) {
        setIsSyncing(false);
        syncInProgress.current = false;
        return;
      }
      
      setSyncProgress({ current: 0, total: pending.length, currentType: '' });
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        
        // Skip items that have exceeded retry limit
        if (item.retryCount >= 5) {
          failCount++;
          continue;
        }
        
        setSyncProgress({ current: i + 1, total: pending.length, currentType: item.type });
        
        // Exponential backoff delay if retrying
        if (item.retryCount > 0) {
          const delay = Math.min(1000 * Math.pow(2, item.retryCount), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const success = await syncItem(item);
        
        if (success) {
          await markQueueItemSynced(item.id);
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Update last sync time
      setLastSyncAt(new Date());
      
      // Refresh stats
      await refreshStats();
      
      // Clear old synced items
      await clearSyncedItems(24);
      
      if (successCount > 0) {
        toast.success(`Synced ${successCount} item${successCount > 1 ? 's' : ''}`);
      }
      
      if (failCount > 0) {
        toast.warning(`${failCount} item${failCount > 1 ? 's' : ''} failed to sync`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Sync failed. Will retry automatically.");
    } finally {
      setSyncProgress(null);
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [schoolId, userId, syncItem, refreshStats]);

  // ==================== Prefetch Functions ====================

  const prefetchStudents = useCallback(async () => {
    if (!schoolId || !userId) return;
    
    try {
      // Get teacher's assigned sections
      const { data: assignments } = await api
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", userId);
      
      if (!assignments || assignments.length === 0) return;
      
      const sectionIds = assignments.map(a => a.class_section_id);
      
      // Get enrollments for those sections
      const { data: enrollments } = await api
        .from("student_enrollments")
        .select("student_id, class_section_id")
        .eq("school_id", schoolId)
        .in("class_section_id", sectionIds);
      
      if (!enrollments || enrollments.length === 0) return;
      
      const studentIds = [...new Set(enrollments.map(e => e.student_id))];
      
      // Get student details
      const { data: students } = await api
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId)
        .in("id", studentIds);
      
      // Get section details
      const { data: sections } = await api
        .from("class_sections")
        .select("id, name, class_id, academic_classes(name)")
        .in("id", sectionIds);
      
      if (!students || !sections) return;
      
      const sectionMap = new Map<string, { name: string; className: string }>();
      sections.forEach((s: any) => {
        sectionMap.set(s.id, {
          name: s.name,
          className: s.academic_classes?.name || "Class",
        });
      });
      
      const enrollmentMap = new Map<string, string>();
      enrollments.forEach(e => {
        enrollmentMap.set(e.student_id, e.class_section_id);
      });
      
      const cachedStudents: CachedStudent[] = students.map(s => {
        const sectionId = enrollmentMap.get(s.id) || "";
        const sectionInfo = sectionMap.get(sectionId);
        return {
          id: s.id,
          schoolId,
          firstName: s.first_name,
          lastName: s.last_name,
          classSectionId: sectionId,
          classSectionName: sectionInfo?.name || "",
          className: sectionInfo?.className || "",
          cachedAt: Date.now(),
        };
      });
      
      await cacheStudents(cachedStudents);
      await refreshStats();
      
      toast.success(`Cached ${cachedStudents.length} students for offline use`);
    } catch (error) {
      console.error("Failed to prefetch students:", error);
    }
  }, [schoolId, userId, refreshStats]);

  const prefetchTimetable = useCallback(async () => {
    if (!schoolId || !userId) return;
    
    try {
      // Get timetable entries
      const { data: entries } = await api
        .from("timetable_entries")
        .select(`
          id,
          day_of_week,
          period_id,
          subject_name,
          class_section_id,
          room,
          start_time,
          end_time
        `)
        .eq("school_id", schoolId)
        .eq("teacher_user_id", userId);
      
      if (!entries || entries.length === 0) return;
      
      // Get period details
      const periodIds = [...new Set(entries.map(e => e.period_id).filter(Boolean))];
      const { data: periods } = await api
        .from("timetable_periods")
        .select("id, label, sort_order")
        .in("id", periodIds);
      
      // Get section details
      const sectionIds = [...new Set(entries.map(e => e.class_section_id).filter(Boolean))];
      const { data: sections } = await api
        .from("class_sections")
        .select("id, name, academic_classes(name)")
        .in("id", sectionIds);
      
      const periodMap = new Map<string, { label: string; sortOrder: number }>();
      (periods || []).forEach((p: any) => {
        periodMap.set(p.id, { label: p.label, sortOrder: p.sort_order });
      });
      
      const sectionMap = new Map<string, string>();
      (sections || []).forEach((s: any) => {
        sectionMap.set(s.id, `${s.academic_classes?.name || ""} • ${s.name}`);
      });
      
      const cachedEntries: CachedTimetableEntry[] = entries.map(e => {
        const period = e.period_id ? periodMap.get(e.period_id) : null;
        return {
          id: e.id,
          schoolId,
          dayOfWeek: e.day_of_week,
          periodId: e.period_id || "",
          periodLabel: period?.label || "",
          subjectName: e.subject_name,
          classSectionId: e.class_section_id,
          sectionLabel: e.class_section_id ? sectionMap.get(e.class_section_id) || null : null,
          room: e.room,
          startTime: e.start_time,
          endTime: e.end_time,
          sortOrder: period?.sortOrder || 999,
          cachedAt: Date.now(),
        };
      });
      
      await cacheTimetable(cachedEntries);
      await refreshStats();
      
      toast.success(`Cached ${cachedEntries.length} timetable entries`);
    } catch (error) {
      console.error("Failed to prefetch timetable:", error);
    }
  }, [schoolId, userId, refreshStats]);

  const prefetchAssignments = useCallback(async () => {
    if (!schoolId || !userId) return;
    
    try {
      const { data: assignments } = await api
        .from("assignments")
        .select(`
          id,
          title,
          description,
          due_date,
          class_section_id,
          max_marks,
          status
        `)
        .eq("school_id", schoolId)
        .eq("teacher_user_id", userId)
        .gte("due_date", new Date().toISOString().split("T")[0]);
      
      if (!assignments || assignments.length === 0) return;
      
      const sectionIds = [...new Set(assignments.map(a => a.class_section_id))];
      const { data: sections } = await api
        .from("class_sections")
        .select("id, name, academic_classes(name)")
        .in("id", sectionIds);
      
      const sectionMap = new Map<string, string>();
      (sections || []).forEach((s: any) => {
        sectionMap.set(s.id, `${s.academic_classes?.name || ""} • ${s.name}`);
      });
      
      const cachedAssignments: CachedAssignment[] = assignments.map(a => ({
        id: a.id,
        schoolId,
        title: a.title,
        description: a.description,
        dueDate: a.due_date,
        classSectionId: a.class_section_id,
        sectionLabel: sectionMap.get(a.class_section_id) || "",
        maxMarks: a.max_marks,
        status: a.status,
        cachedAt: Date.now(),
      }));
      
      await cacheAssignments(cachedAssignments);
      await refreshStats();
      
      toast.success(`Cached ${cachedAssignments.length} assignments`);
    } catch (error) {
      console.error("Failed to prefetch assignments:", error);
    }
  }, [schoolId, userId, refreshStats]);

  const prefetchClassSections = useCallback(async () => {
    if (!schoolId || !userId) return;
    
    try {
      const { data: assignments } = await api
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", userId);
      
      if (!assignments || assignments.length === 0) return;
      
      const sectionIds = [...new Set(assignments.map(a => a.class_section_id))];
      
      const { data: sections } = await api
        .from("class_sections")
        .select("id, name, class_id, room, academic_classes(name)")
        .in("id", sectionIds);
      
      if (!sections) return;
      
      const cachedSections = sections.map((s: any) => ({
        id: s.id,
        schoolId,
        name: s.name,
        classId: s.class_id,
        className: s.academic_classes?.name || "",
        room: s.room,
        cachedAt: Date.now(),
      }));
      
      await cacheClassSections(cachedSections);
      await refreshStats();
    } catch (error) {
      console.error("Failed to prefetch class sections:", error);
    }
  }, [schoolId, userId, refreshStats]);

  const prefetchAll = useCallback(async () => {
    if (!schoolId || !userId || !navigator.onLine) {
      toast.error("Cannot prefetch while offline");
      return;
    }
    
    toast.info("Prefetching data for offline use...");
    
    await Promise.all([
      prefetchStudents(),
      prefetchTimetable(),
      prefetchAssignments(),
      prefetchClassSections(),
    ]);
    
    toast.success("All data prefetched successfully!");
  }, [prefetchStudents, prefetchTimetable, prefetchAssignments, prefetchClassSections, schoolId, userId]);

  // ==================== Offline Action Helpers ====================

  const saveAttendanceOffline = useCallback(
    async (sessionId: string, studentId: string, status: string, note?: string) => {
      const id = await addToOfflineQueue({
        type: 'attendance',
        data: { session_id: sessionId, student_id: studentId, status, note },
        priority: 'high',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  const savePeriodLogOffline = useCallback(
    async (
      timetableEntryId: string,
      loggedAt: string,
      topicCovered?: string,
      notes?: string,
      status?: string
    ) => {
      const id = await addToOfflineQueue({
        type: 'period_log',
        data: { timetable_entry_id: timetableEntryId, logged_at: loggedAt, topic_covered: topicCovered, notes, status },
        priority: 'medium',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  const saveBehaviorNoteOffline = useCallback(
    async (
      studentId: string,
      title: string,
      content: string,
      noteType: string,
      isSharedWithParents: boolean
    ) => {
      const id = await addToOfflineQueue({
        type: 'behavior_note',
        data: {
          student_id: studentId,
          title,
          content,
          note_type: noteType,
          is_shared_with_parents: isSharedWithParents,
        },
        priority: 'medium',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  const saveHomeworkOffline = useCallback(
    async (
      classSectionId: string,
      title: string,
      description: string | undefined,
      dueDate: string,
      attachmentUrls?: string[]
    ) => {
      const id = await addToOfflineQueue({
        type: 'homework',
        data: {
          class_section_id: classSectionId,
          title,
          description,
          due_date: dueDate,
          attachment_urls: attachmentUrls,
        },
        priority: 'medium',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  const saveQuickGradeOffline = useCallback(
    async (assessmentId: string, studentId: string, marks: number) => {
      const id = await addToOfflineQueue({
        type: 'quick_grade',
        data: { assessment_id: assessmentId, student_id: studentId, marks },
        priority: 'medium',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  const saveMessageOffline = useCallback(
    async (
      recipientUserIds: string[],
      subject: string,
      content: string,
      priority?: string
    ) => {
      const id = await addToOfflineQueue({
        type: 'message',
        data: { recipient_user_ids: recipientUserIds, subject, content, priority },
        priority: 'low',
      });
      await refreshStats();
      
      if (navigator.onLine) {
        syncPendingItems();
      }
      
      return id;
    },
    [refreshStats, syncPendingItems]
  );

  return {
    // Status
    isOnline,
    isSyncing,
    stats,
    lastSyncAt,
    syncProgress,
    storageInfo,
    syncMetadata,
    cachedData,
    
    // Actions
    syncPendingItems,
    refreshStats,
    
    // Prefetch
    prefetchAll,
    prefetchStudents,
    prefetchTimetable,
    prefetchAssignments,
    
    // Offline saves
    saveAttendanceOffline,
    savePeriodLogOffline,
    saveBehaviorNoteOffline,
    saveHomeworkOffline,
    saveQuickGradeOffline,
    saveMessageOffline,
    
    // Cached data getters
    getCachedStudents: (sectionId?: string) => 
      schoolId ? getCachedStudents(schoolId, sectionId) : Promise.resolve([]),
    getCachedTimetable: (dayOfWeek?: number) => 
      schoolId ? getCachedTimetable(schoolId, dayOfWeek) : Promise.resolve([]),
    getCachedClassSections: () => 
      schoolId ? getCachedClassSections(schoolId) : Promise.resolve([]),
  };
}
