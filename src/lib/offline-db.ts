import { openDB, IDBPDatabase } from 'idb';

// ==================== Types ====================

export type OfflineActionType = 
  | 'attendance' 
  | 'period_log' 
  | 'behavior_note' 
  | 'homework' 
  | 'quick_grade' 
  | 'message'
  | 'support_ticket'
  | 'expense'
  | 'payment'
  | 'leave_request'
  | 'lead_update'
  | 'call_log'
  | 'generic_mutation';

export interface OfflineQueueItem {
  id: string;
  type: OfflineActionType;
  data: Record<string, unknown>;
  timestamp: number;
  synced: boolean;
  retryCount: number;
  priority: 'high' | 'medium' | 'low';
  error?: string;
}

export interface CachedStudent {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string | null;
  classSectionId: string;
  classSectionName: string;
  className: string;
  status?: string;
  profileId?: string;
  cachedAt: number;
}

export interface CachedTimetableEntry {
  id: string;
  schoolId: string;
  dayOfWeek: number;
  periodId: string;
  periodLabel: string;
  subjectName: string;
  classSectionId: string | null;
  sectionLabel: string | null;
  room: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherUserId?: string | null;
  teacherName?: string | null;
  sortOrder: number;
  cachedAt: number;
}

export interface CachedAssignment {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  classSectionId: string;
  sectionLabel: string;
  maxMarks: number;
  status: string;
  teacherUserId?: string;
  subjectId?: string;
  cachedAt: number;
}

export interface CachedSubject {
  id: string;
  schoolId: string;
  name: string;
  code: string | null;
  cachedAt: number;
}

export interface CachedClassSection {
  id: string;
  schoolId: string;
  name: string;
  classId: string;
  className: string;
  room: string | null;
  cachedAt: number;
}

export interface CachedAcademicClass {
  id: string;
  schoolId: string;
  name: string;
  gradeLevel: number | null;
  cachedAt: number;
}

export interface CachedAttendance {
  id: string;
  schoolId: string;
  studentId: string;
  sessionId: string;
  sessionDate: string;
  status: string;
  note: string | null;
  periodLabel: string;
  classSectionId: string;
  cachedAt: number;
}

export interface CachedAttendanceSession {
  id: string;
  schoolId: string;
  classSectionId: string;
  sessionDate: string;
  periodLabel: string;
  cachedAt: number;
}

export interface CachedHomework {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  classSectionId: string;
  sectionLabel: string;
  teacherUserId?: string;
  cachedAt: number;
}

export interface SyncMetadata {
  key: string;
  lastSyncAt: number;
  itemCount: number;
}

// ==================== Messaging Types ====================

export interface CachedConversation {
  id: string;
  schoolId: string;
  recipientId: string;
  recipientName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  hasAttachment: boolean;
  lastSenderName: string;
  isSentByMe: boolean;
  cachedAt: number;
}

export interface CachedMessage {
  id: string;
  schoolId: string;
  conversationPartnerId: string;
  content: string;
  senderUserId: string;
  createdAt: string;
  isMine: boolean;
  isRead: boolean;
  attachmentUrls: string[];
  subject: string | null;
  replyToId: string | null;
  cachedAt: number;
  isPending?: boolean;
  localId?: string;
}

export interface CachedContact {
  id: string;
  schoolId: string;
  userId: string;
  displayName: string;
  email: string | null;
  role: string | null;
  canMessage: boolean;
  cachedAt: number;
}

// ==================== HR Types ====================

export interface CachedStaffMember {
  id: string;
  schoolId: string;
  userId: string;
  displayName: string;
  email: string | null;
  role: string | null;
  department?: string | null;
  status: string;
  cachedAt: number;
}

export interface CachedLeaveRequest {
  id: string;
  schoolId: string;
  userId: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  reason: string | null;
  cachedAt: number;
}

export interface CachedContract {
  id: string;
  schoolId: string;
  userId: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  position: string | null;
  department: string | null;
  status: string;
  cachedAt: number;
}

export interface CachedSalaryRecord {
  id: string;
  schoolId: string;
  userId: string;
  baseSalary: number;
  month: number;
  year: number;
  status: string;
  cachedAt: number;
}

export interface CachedHrDocument {
  id: string;
  schoolId: string;
  userId: string;
  documentName: string;
  documentType: string;
  fileUrl: string;
  cachedAt: number;
}

// ==================== Finance Types ====================

export interface CachedInvoice {
  id: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  total: number;
  subtotal: number;
  status: string;
  cachedAt: number;
}

export interface CachedPayment {
  id: string;
  schoolId: string;
  studentId: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
  reference: string | null;
  methodId?: string | null;
  cachedAt: number;
}

export interface CachedExpense {
  id: string;
  schoolId: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
  vendor: string | null;
  cachedAt: number;
}

export interface CachedFeePlan {
  id: string;
  schoolId: string;
  name: string;
  currency: string;
  isActive: boolean;
  cachedAt: number;
}

export interface CachedPaymentMethod {
  id: string;
  schoolId: string;
  name: string;
  type: string;
  isActive: boolean;
  cachedAt: number;
}

// ==================== Marketing/CRM Types ====================

export interface CachedLead {
  id: string;
  schoolId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  stageId: string;
  stageName?: string;
  pipelineId: string;
  score: number;
  assignedTo: string | null;
  nextFollowUpAt: string | null;
  notes?: string | null;
  cachedAt: number;
}

export interface CachedCrmStage {
  id: string;
  schoolId: string;
  pipelineId: string;
  name: string;
  sortOrder: number;
  cachedAt: number;
}

export interface CachedCrmPipeline {
  id: string;
  schoolId: string;
  name: string;
  isDefault: boolean;
  cachedAt: number;
}

export interface CachedCampaign {
  id: string;
  schoolId: string;
  name: string;
  channel: string;
  status: string;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  cachedAt: number;
}

export interface CachedCrmActivity {
  id: string;
  schoolId: string;
  leadId: string;
  activityType: string;
  summary: string;
  dueAt: string | null;
  completedAt: string | null;
  cachedAt: number;
}

export interface CachedCallLog {
  id: string;
  schoolId: string;
  leadId: string;
  calledAt: string;
  durationSeconds: number;
  outcome: string;
  notes: string | null;
  cachedAt: number;
}

// ==================== Academic Types ====================

export interface CachedAssessment {
  id: string;
  schoolId: string;
  title: string;
  classSectionId: string;
  subjectId: string | null;
  subjectName?: string | null;
  assessmentDate: string;
  maxMarks: number;
  isPublished: boolean;
  termLabel?: string | null;
  cachedAt: number;
}

export interface CachedStudentMark {
  id: string;
  schoolId: string;
  studentId: string;
  assessmentId: string;
  marks: number | null;
  computedGrade: string | null;
  gradePoints?: number | null;
  cachedAt: number;
}

export interface CachedTeacherAssignment {
  id: string;
  schoolId: string;
  teacherUserId: string;
  teacherName?: string;
  classSectionId: string;
  sectionName?: string;
  subjectId: string | null;
  subjectName?: string | null;
  cachedAt: number;
}

export interface CachedBehaviorNote {
  id: string;
  schoolId: string;
  studentId: string;
  teacherUserId: string;
  title: string;
  content: string;
  noteType: string;
  isSharedWithParents: boolean;
  createdAt: string;
  cachedAt: number;
}

export interface CachedGradeThreshold {
  id: string;
  schoolId: string;
  gradeLabel: string;
  minPercentage: number;
  maxPercentage: number;
  gradePoints: number | null;
  sortOrder: number;
  cachedAt: number;
}

// ==================== Notification Types ====================

export interface CachedNotification {
  id: string;
  schoolId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
  cachedAt: number;
}

// ==================== Student Guardian Types ====================

export interface CachedStudentGuardian {
  id: string;
  schoolId: string;
  studentId: string;
  userId: string | null;
  guardianName?: string;
  relationship?: string;
  phone?: string | null;
  email?: string | null;
  cachedAt: number;
}

// ==================== Enrollment Types ====================

export interface CachedEnrollment {
  id: string;
  schoolId: string;
  studentId: string;
  classSectionId: string;
  academicYear?: string;
  cachedAt: number;
}

// ==================== Support/Admin Message Types ====================

export interface CachedAdminMessage {
  id: string;
  schoolId: string;
  senderUserId: string;
  senderName?: string;
  subject: string;
  content: string;
  status: string;
  priority: string;
  createdAt: string;
  cachedAt: number;
}

// ==================== Timetable Period Types ====================

export interface CachedTimetablePeriod {
  id: string;
  schoolId: string;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  cachedAt: number;
}

// ==================== Database Instance ====================

const DB_NAME = 'eduverse-offline-db';
const DB_VERSION = 4; // Bumped for comprehensive stores

let dbPromise: Promise<IDBPDatabase> | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // ==================== Core Stores ====================
        
        // Offline Queue Store
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id' });
          queueStore.createIndex('by-synced', 'synced');
          queueStore.createIndex('by-type', 'type');
          queueStore.createIndex('by-priority', 'priority');
          queueStore.createIndex('by-timestamp', 'timestamp');
        }

        // Students Cache Store
        if (!db.objectStoreNames.contains('students')) {
          const studentsStore = db.createObjectStore('students', { keyPath: 'id' });
          studentsStore.createIndex('by-school', 'schoolId');
          studentsStore.createIndex('by-section', 'classSectionId');
        }

        // Timetable Cache Store
        if (!db.objectStoreNames.contains('timetable')) {
          const timetableStore = db.createObjectStore('timetable', { keyPath: 'id' });
          timetableStore.createIndex('by-school', 'schoolId');
          timetableStore.createIndex('by-day', 'dayOfWeek');
          timetableStore.createIndex('by-section', 'classSectionId');
        }

        // Assignments Cache Store
        if (!db.objectStoreNames.contains('assignments')) {
          const assignmentsStore = db.createObjectStore('assignments', { keyPath: 'id' });
          assignmentsStore.createIndex('by-school', 'schoolId');
          assignmentsStore.createIndex('by-section', 'classSectionId');
        }

        // Subjects Cache Store
        if (!db.objectStoreNames.contains('subjects')) {
          const subjectsStore = db.createObjectStore('subjects', { keyPath: 'id' });
          subjectsStore.createIndex('by-school', 'schoolId');
        }

        // Class Sections Cache Store
        if (!db.objectStoreNames.contains('classSections')) {
          const sectionsStore = db.createObjectStore('classSections', { keyPath: 'id' });
          sectionsStore.createIndex('by-school', 'schoolId');
        }

        // Academic Classes Store
        if (!db.objectStoreNames.contains('academicClasses')) {
          const classesStore = db.createObjectStore('academicClasses', { keyPath: 'id' });
          classesStore.createIndex('by-school', 'schoolId');
        }

        // Sync Metadata Store
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'key' });
        }

        // ==================== Messaging Stores ====================
        
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-school', 'schoolId');
          convStore.createIndex('by-time', 'lastMessageTime');
        }

        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-school', 'schoolId');
          msgStore.createIndex('by-partner', 'conversationPartnerId');
          msgStore.createIndex('by-pending', 'isPending');
        }

        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactStore.createIndex('by-school', 'schoolId');
        }

        // ==================== Attendance Stores ====================
        
        if (!db.objectStoreNames.contains('attendance')) {
          const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id' });
          attendanceStore.createIndex('by-school', 'schoolId');
          attendanceStore.createIndex('by-student', 'studentId');
          attendanceStore.createIndex('by-date', 'sessionDate');
          attendanceStore.createIndex('by-session', 'sessionId');
        }

        if (!db.objectStoreNames.contains('attendanceSessions')) {
          const sessionsStore = db.createObjectStore('attendanceSessions', { keyPath: 'id' });
          sessionsStore.createIndex('by-school', 'schoolId');
          sessionsStore.createIndex('by-section', 'classSectionId');
          sessionsStore.createIndex('by-date', 'sessionDate');
        }

        if (!db.objectStoreNames.contains('homework')) {
          const homeworkStore = db.createObjectStore('homework', { keyPath: 'id' });
          homeworkStore.createIndex('by-school', 'schoolId');
          homeworkStore.createIndex('by-section', 'classSectionId');
        }

        // ==================== HR Stores ====================
        
        if (!db.objectStoreNames.contains('staffMembers')) {
          const staffStore = db.createObjectStore('staffMembers', { keyPath: 'id' });
          staffStore.createIndex('by-school', 'schoolId');
        }

        if (!db.objectStoreNames.contains('leaveRequests')) {
          const leaveStore = db.createObjectStore('leaveRequests', { keyPath: 'id' });
          leaveStore.createIndex('by-school', 'schoolId');
          leaveStore.createIndex('by-user', 'userId');
        }

        if (!db.objectStoreNames.contains('contracts')) {
          const contractStore = db.createObjectStore('contracts', { keyPath: 'id' });
          contractStore.createIndex('by-school', 'schoolId');
          contractStore.createIndex('by-user', 'userId');
        }

        if (!db.objectStoreNames.contains('salaryRecords')) {
          const salaryStore = db.createObjectStore('salaryRecords', { keyPath: 'id' });
          salaryStore.createIndex('by-school', 'schoolId');
          salaryStore.createIndex('by-user', 'userId');
        }

        if (!db.objectStoreNames.contains('hrDocuments')) {
          const docStore = db.createObjectStore('hrDocuments', { keyPath: 'id' });
          docStore.createIndex('by-school', 'schoolId');
          docStore.createIndex('by-user', 'userId');
        }

        // ==================== Finance Stores ====================
        
        if (!db.objectStoreNames.contains('invoices')) {
          const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
          invStore.createIndex('by-school', 'schoolId');
          invStore.createIndex('by-student', 'studentId');
          invStore.createIndex('by-status', 'status');
        }

        if (!db.objectStoreNames.contains('payments')) {
          const payStore = db.createObjectStore('payments', { keyPath: 'id' });
          payStore.createIndex('by-school', 'schoolId');
          payStore.createIndex('by-student', 'studentId');
        }

        if (!db.objectStoreNames.contains('expenses')) {
          const expStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expStore.createIndex('by-school', 'schoolId');
          expStore.createIndex('by-date', 'expenseDate');
        }

        if (!db.objectStoreNames.contains('feePlans')) {
          const feeStore = db.createObjectStore('feePlans', { keyPath: 'id' });
          feeStore.createIndex('by-school', 'schoolId');
        }

        if (!db.objectStoreNames.contains('paymentMethods')) {
          const pmStore = db.createObjectStore('paymentMethods', { keyPath: 'id' });
          pmStore.createIndex('by-school', 'schoolId');
        }

        // ==================== CRM/Marketing Stores ====================
        
        if (!db.objectStoreNames.contains('leads')) {
          const leadStore = db.createObjectStore('leads', { keyPath: 'id' });
          leadStore.createIndex('by-school', 'schoolId');
          leadStore.createIndex('by-stage', 'stageId');
          leadStore.createIndex('by-status', 'status');
        }

        if (!db.objectStoreNames.contains('crmStages')) {
          const stageStore = db.createObjectStore('crmStages', { keyPath: 'id' });
          stageStore.createIndex('by-school', 'schoolId');
          stageStore.createIndex('by-pipeline', 'pipelineId');
        }

        if (!db.objectStoreNames.contains('crmPipelines')) {
          const pipeStore = db.createObjectStore('crmPipelines', { keyPath: 'id' });
          pipeStore.createIndex('by-school', 'schoolId');
        }

        if (!db.objectStoreNames.contains('campaigns')) {
          const campStore = db.createObjectStore('campaigns', { keyPath: 'id' });
          campStore.createIndex('by-school', 'schoolId');
        }

        if (!db.objectStoreNames.contains('crmActivities')) {
          const actStore = db.createObjectStore('crmActivities', { keyPath: 'id' });
          actStore.createIndex('by-school', 'schoolId');
          actStore.createIndex('by-lead', 'leadId');
        }

        if (!db.objectStoreNames.contains('callLogs')) {
          const callStore = db.createObjectStore('callLogs', { keyPath: 'id' });
          callStore.createIndex('by-school', 'schoolId');
          callStore.createIndex('by-lead', 'leadId');
        }

        // ==================== Academic Stores ====================
        
        if (!db.objectStoreNames.contains('assessments')) {
          const assStore = db.createObjectStore('assessments', { keyPath: 'id' });
          assStore.createIndex('by-school', 'schoolId');
          assStore.createIndex('by-section', 'classSectionId');
        }

        if (!db.objectStoreNames.contains('studentMarks')) {
          const marksStore = db.createObjectStore('studentMarks', { keyPath: 'id' });
          marksStore.createIndex('by-school', 'schoolId');
          marksStore.createIndex('by-student', 'studentId');
          marksStore.createIndex('by-assessment', 'assessmentId');
        }

        if (!db.objectStoreNames.contains('teacherAssignments')) {
          const taStore = db.createObjectStore('teacherAssignments', { keyPath: 'id' });
          taStore.createIndex('by-school', 'schoolId');
          taStore.createIndex('by-teacher', 'teacherUserId');
        }

        if (!db.objectStoreNames.contains('behaviorNotes')) {
          const bnStore = db.createObjectStore('behaviorNotes', { keyPath: 'id' });
          bnStore.createIndex('by-school', 'schoolId');
          bnStore.createIndex('by-student', 'studentId');
        }

        if (!db.objectStoreNames.contains('gradeThresholds')) {
          const gtStore = db.createObjectStore('gradeThresholds', { keyPath: 'id' });
          gtStore.createIndex('by-school', 'schoolId');
        }

        // ==================== Notification Store ====================
        
        if (!db.objectStoreNames.contains('notifications')) {
          const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
          notifStore.createIndex('by-school', 'schoolId');
          notifStore.createIndex('by-user', 'userId');
        }

        // ==================== Guardian Store ====================
        
        if (!db.objectStoreNames.contains('studentGuardians')) {
          const sgStore = db.createObjectStore('studentGuardians', { keyPath: 'id' });
          sgStore.createIndex('by-school', 'schoolId');
          sgStore.createIndex('by-student', 'studentId');
        }

        // ==================== Enrollment Store ====================
        
        if (!db.objectStoreNames.contains('enrollments')) {
          const enStore = db.createObjectStore('enrollments', { keyPath: 'id' });
          enStore.createIndex('by-school', 'schoolId');
          enStore.createIndex('by-student', 'studentId');
        }

        // ==================== Admin Messages Store ====================
        
        if (!db.objectStoreNames.contains('adminMessages')) {
          const amStore = db.createObjectStore('adminMessages', { keyPath: 'id' });
          amStore.createIndex('by-school', 'schoolId');
        }

        // ==================== Timetable Periods Store ====================
        
        if (!db.objectStoreNames.contains('timetablePeriods')) {
          const tpStore = db.createObjectStore('timetablePeriods', { keyPath: 'id' });
          tpStore.createIndex('by-school', 'schoolId');
        }
      },
    });
  }
  return dbPromise;
}

// ==================== Generic Cache Helper ====================

async function cacheToStore<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains(storeName)) return;
  
  const tx = db.transaction(storeName, 'readwrite');
  const now = Date.now();
  
  for (const item of items) {
    await tx.store.put({ ...item, cachedAt: now });
  }
  
  await tx.done;
  await updateSyncMetadata(storeName, items.length);
}

async function getFromStore<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains(storeName)) return [];
  return db.getAllFromIndex(storeName, indexName, key) as Promise<T[]>;
}

async function getAllFromStore<T>(storeName: string, schoolId: string): Promise<T[]> {
  return getFromStore<T>(storeName, 'by-school', schoolId);
}

// ==================== Queue Operations ====================

export async function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'synced' | 'retryCount'>): Promise<string> {
  const db = await getOfflineDB();
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const queueItem: OfflineQueueItem = {
    ...item,
    id,
    timestamp: Date.now(),
    synced: false,
    retryCount: 0,
  };
  await db.put('offlineQueue', queueItem);
  return id;
}

export async function getPendingQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await getOfflineDB();
  const allItems = await db.getAll('offlineQueue');
  const items = allItems.filter((item: OfflineQueueItem) => !item.synced);
  return items.sort((a: OfflineQueueItem, b: OfflineQueueItem) => {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.timestamp - b.timestamp;
  });
}

export async function markQueueItemSynced(id: string): Promise<void> {
  const db = await getOfflineDB();
  const item = await db.get('offlineQueue', id);
  if (item) {
    item.synced = true;
    await db.put('offlineQueue', item);
  }
}

export async function incrementRetryCount(id: string, error?: string): Promise<void> {
  const db = await getOfflineDB();
  const item = await db.get('offlineQueue', id);
  if (item) {
    item.retryCount += 1;
    item.error = error;
    await db.put('offlineQueue', item);
  }
}

export async function getQueueStats(): Promise<{
  pending: number;
  synced: number;
  failed: number;
  byType: Record<string, number>;
}> {
  const db = await getOfflineDB();
  const allItems = await db.getAll('offlineQueue');
  
  const stats = {
    pending: 0,
    synced: 0,
    failed: 0,
    byType: {} as Record<string, number>,
  };
  
  for (const item of allItems) {
    if (item.synced) {
      stats.synced++;
    } else if (item.retryCount >= 3) {
      stats.failed++;
    } else {
      stats.pending++;
    }
    stats.byType[item.type] = (stats.byType[item.type] || 0) + (item.synced ? 0 : 1);
  }
  
  return stats;
}

export async function clearSyncedItems(olderThanHours: number = 24): Promise<number> {
  const db = await getOfflineDB();
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  const tx = db.transaction('offlineQueue', 'readwrite');
  const items = await tx.store.getAll();
  let deleted = 0;
  
  for (const item of items) {
    if (item.synced && item.timestamp < cutoff) {
      await tx.store.delete(item.id);
      deleted++;
    }
  }
  
  await tx.done;
  return deleted;
}

// ==================== Student Cache ====================

export async function cacheStudents(students: CachedStudent[]): Promise<void> {
  await cacheToStore('students', students);
}

export async function getCachedStudents(schoolId: string, sectionId?: string): Promise<CachedStudent[]> {
  if (sectionId) {
    return getFromStore<CachedStudent>('students', 'by-section', sectionId);
  }
  return getAllFromStore<CachedStudent>('students', schoolId);
}

// ==================== Timetable Cache ====================

export async function cacheTimetable(entries: CachedTimetableEntry[]): Promise<void> {
  await cacheToStore('timetable', entries);
}

export async function getCachedTimetable(schoolId: string, dayOfWeek?: number): Promise<CachedTimetableEntry[]> {
  const db = await getOfflineDB();
  if (dayOfWeek !== undefined) {
    const entries = await db.getAllFromIndex('timetable', 'by-day', dayOfWeek);
    return entries.filter((e: CachedTimetableEntry) => e.schoolId === schoolId);
  }
  return getAllFromStore<CachedTimetableEntry>('timetable', schoolId);
}

// ==================== Timetable Periods Cache ====================

export async function cacheTimetablePeriods(periods: CachedTimetablePeriod[]): Promise<void> {
  await cacheToStore('timetablePeriods', periods);
}

export async function getCachedTimetablePeriods(schoolId: string): Promise<CachedTimetablePeriod[]> {
  return getAllFromStore<CachedTimetablePeriod>('timetablePeriods', schoolId);
}

// ==================== Assignment Cache ====================

export async function cacheAssignments(assignments: CachedAssignment[]): Promise<void> {
  await cacheToStore('assignments', assignments);
}

export async function getCachedAssignments(schoolId: string, sectionId?: string): Promise<CachedAssignment[]> {
  if (sectionId) {
    return getFromStore<CachedAssignment>('assignments', 'by-section', sectionId);
  }
  return getAllFromStore<CachedAssignment>('assignments', schoolId);
}

// ==================== Subject Cache ====================

export async function cacheSubjects(subjects: CachedSubject[]): Promise<void> {
  await cacheToStore('subjects', subjects);
}

export async function getCachedSubjects(schoolId: string): Promise<CachedSubject[]> {
  return getAllFromStore<CachedSubject>('subjects', schoolId);
}

// ==================== Class Section Cache ====================

export async function cacheClassSections(sections: CachedClassSection[]): Promise<void> {
  await cacheToStore('classSections', sections);
}

export async function getCachedClassSections(schoolId: string): Promise<CachedClassSection[]> {
  return getAllFromStore<CachedClassSection>('classSections', schoolId);
}

// ==================== Academic Class Cache ====================

export async function cacheAcademicClasses(classes: CachedAcademicClass[]): Promise<void> {
  await cacheToStore('academicClasses', classes);
}

export async function getCachedAcademicClasses(schoolId: string): Promise<CachedAcademicClass[]> {
  return getAllFromStore<CachedAcademicClass>('academicClasses', schoolId);
}

// ==================== Attendance Cache ====================

export async function cacheAttendance(entries: CachedAttendance[]): Promise<void> {
  await cacheToStore('attendance', entries);
}

export async function getCachedAttendance(schoolId: string, studentId?: string): Promise<CachedAttendance[]> {
  if (studentId) {
    return getFromStore<CachedAttendance>('attendance', 'by-student', studentId);
  }
  return getAllFromStore<CachedAttendance>('attendance', schoolId);
}

// ==================== Attendance Sessions Cache ====================

export async function cacheAttendanceSessions(sessions: CachedAttendanceSession[]): Promise<void> {
  await cacheToStore('attendanceSessions', sessions);
}

export async function getCachedAttendanceSessions(schoolId: string): Promise<CachedAttendanceSession[]> {
  return getAllFromStore<CachedAttendanceSession>('attendanceSessions', schoolId);
}

// ==================== Homework Cache ====================

export async function cacheHomework(homework: CachedHomework[]): Promise<void> {
  await cacheToStore('homework', homework);
}

export async function getCachedHomework(schoolId: string, sectionId?: string): Promise<CachedHomework[]> {
  if (sectionId) {
    return getFromStore<CachedHomework>('homework', 'by-section', sectionId);
  }
  return getAllFromStore<CachedHomework>('homework', schoolId);
}

// ==================== HR Cache Functions ====================

export async function cacheStaffMembers(staff: CachedStaffMember[]): Promise<void> {
  await cacheToStore('staffMembers', staff);
}

export async function getCachedStaffMembers(schoolId: string): Promise<CachedStaffMember[]> {
  return getAllFromStore<CachedStaffMember>('staffMembers', schoolId);
}

export async function cacheLeaveRequests(requests: CachedLeaveRequest[]): Promise<void> {
  await cacheToStore('leaveRequests', requests);
}

export async function getCachedLeaveRequests(schoolId: string): Promise<CachedLeaveRequest[]> {
  return getAllFromStore<CachedLeaveRequest>('leaveRequests', schoolId);
}

export async function cacheContracts(contracts: CachedContract[]): Promise<void> {
  await cacheToStore('contracts', contracts);
}

export async function getCachedContracts(schoolId: string): Promise<CachedContract[]> {
  return getAllFromStore<CachedContract>('contracts', schoolId);
}

export async function cacheSalaryRecords(records: CachedSalaryRecord[]): Promise<void> {
  await cacheToStore('salaryRecords', records);
}

export async function getCachedSalaryRecords(schoolId: string): Promise<CachedSalaryRecord[]> {
  return getAllFromStore<CachedSalaryRecord>('salaryRecords', schoolId);
}

export async function cacheHrDocuments(docs: CachedHrDocument[]): Promise<void> {
  await cacheToStore('hrDocuments', docs);
}

export async function getCachedHrDocuments(schoolId: string): Promise<CachedHrDocument[]> {
  return getAllFromStore<CachedHrDocument>('hrDocuments', schoolId);
}

// ==================== Finance Cache Functions ====================

export async function cacheInvoices(invoices: CachedInvoice[]): Promise<void> {
  await cacheToStore('invoices', invoices);
}

export async function getCachedInvoices(schoolId: string): Promise<CachedInvoice[]> {
  return getAllFromStore<CachedInvoice>('invoices', schoolId);
}

export async function cachePayments(payments: CachedPayment[]): Promise<void> {
  await cacheToStore('payments', payments);
}

export async function getCachedPayments(schoolId: string): Promise<CachedPayment[]> {
  return getAllFromStore<CachedPayment>('payments', schoolId);
}

export async function cacheExpenses(expenses: CachedExpense[]): Promise<void> {
  await cacheToStore('expenses', expenses);
}

export async function getCachedExpenses(schoolId: string): Promise<CachedExpense[]> {
  return getAllFromStore<CachedExpense>('expenses', schoolId);
}

export async function cacheFeePlans(plans: CachedFeePlan[]): Promise<void> {
  await cacheToStore('feePlans', plans);
}

export async function getCachedFeePlans(schoolId: string): Promise<CachedFeePlan[]> {
  return getAllFromStore<CachedFeePlan>('feePlans', schoolId);
}

export async function cachePaymentMethods(methods: CachedPaymentMethod[]): Promise<void> {
  await cacheToStore('paymentMethods', methods);
}

export async function getCachedPaymentMethods(schoolId: string): Promise<CachedPaymentMethod[]> {
  return getAllFromStore<CachedPaymentMethod>('paymentMethods', schoolId);
}

// ==================== CRM Cache Functions ====================

export async function cacheLeads(leads: CachedLead[]): Promise<void> {
  await cacheToStore('leads', leads);
}

export async function getCachedLeads(schoolId: string): Promise<CachedLead[]> {
  return getAllFromStore<CachedLead>('leads', schoolId);
}

export async function cacheCrmStages(stages: CachedCrmStage[]): Promise<void> {
  await cacheToStore('crmStages', stages);
}

export async function getCachedCrmStages(schoolId: string): Promise<CachedCrmStage[]> {
  return getAllFromStore<CachedCrmStage>('crmStages', schoolId);
}

export async function cacheCrmPipelines(pipelines: CachedCrmPipeline[]): Promise<void> {
  await cacheToStore('crmPipelines', pipelines);
}

export async function getCachedCrmPipelines(schoolId: string): Promise<CachedCrmPipeline[]> {
  return getAllFromStore<CachedCrmPipeline>('crmPipelines', schoolId);
}

export async function cacheCampaigns(campaigns: CachedCampaign[]): Promise<void> {
  await cacheToStore('campaigns', campaigns);
}

export async function getCachedCampaigns(schoolId: string): Promise<CachedCampaign[]> {
  return getAllFromStore<CachedCampaign>('campaigns', schoolId);
}

export async function cacheCrmActivities(activities: CachedCrmActivity[]): Promise<void> {
  await cacheToStore('crmActivities', activities);
}

export async function getCachedCrmActivities(schoolId: string): Promise<CachedCrmActivity[]> {
  return getAllFromStore<CachedCrmActivity>('crmActivities', schoolId);
}

export async function cacheCallLogs(logs: CachedCallLog[]): Promise<void> {
  await cacheToStore('callLogs', logs);
}

export async function getCachedCallLogs(schoolId: string): Promise<CachedCallLog[]> {
  return getAllFromStore<CachedCallLog>('callLogs', schoolId);
}

// ==================== Academic Cache Functions ====================

export async function cacheAssessments(assessments: CachedAssessment[]): Promise<void> {
  await cacheToStore('assessments', assessments);
}

export async function getCachedAssessments(schoolId: string): Promise<CachedAssessment[]> {
  return getAllFromStore<CachedAssessment>('assessments', schoolId);
}

export async function cacheStudentMarks(marks: CachedStudentMark[]): Promise<void> {
  await cacheToStore('studentMarks', marks);
}

export async function getCachedStudentMarks(schoolId: string): Promise<CachedStudentMark[]> {
  return getAllFromStore<CachedStudentMark>('studentMarks', schoolId);
}

export async function cacheTeacherAssignments(assignments: CachedTeacherAssignment[]): Promise<void> {
  await cacheToStore('teacherAssignments', assignments);
}

export async function getCachedTeacherAssignments(schoolId: string): Promise<CachedTeacherAssignment[]> {
  return getAllFromStore<CachedTeacherAssignment>('teacherAssignments', schoolId);
}

export async function cacheBehaviorNotes(notes: CachedBehaviorNote[]): Promise<void> {
  await cacheToStore('behaviorNotes', notes);
}

export async function getCachedBehaviorNotes(schoolId: string): Promise<CachedBehaviorNote[]> {
  return getAllFromStore<CachedBehaviorNote>('behaviorNotes', schoolId);
}

export async function cacheGradeThresholds(thresholds: CachedGradeThreshold[]): Promise<void> {
  await cacheToStore('gradeThresholds', thresholds);
}

export async function getCachedGradeThresholds(schoolId: string): Promise<CachedGradeThreshold[]> {
  return getAllFromStore<CachedGradeThreshold>('gradeThresholds', schoolId);
}

// ==================== Notification Cache ====================

export async function cacheNotifications(notifications: CachedNotification[]): Promise<void> {
  await cacheToStore('notifications', notifications);
}

export async function getCachedNotifications(schoolId: string, userId?: string): Promise<CachedNotification[]> {
  if (userId) {
    return getFromStore<CachedNotification>('notifications', 'by-user', userId);
  }
  return getAllFromStore<CachedNotification>('notifications', schoolId);
}

// ==================== Guardian Cache ====================

export async function cacheStudentGuardians(guardians: CachedStudentGuardian[]): Promise<void> {
  await cacheToStore('studentGuardians', guardians);
}

export async function getCachedStudentGuardians(schoolId: string): Promise<CachedStudentGuardian[]> {
  return getAllFromStore<CachedStudentGuardian>('studentGuardians', schoolId);
}

// ==================== Enrollment Cache ====================

export async function cacheEnrollments(enrollments: CachedEnrollment[]): Promise<void> {
  await cacheToStore('enrollments', enrollments);
}

export async function getCachedEnrollments(schoolId: string): Promise<CachedEnrollment[]> {
  return getAllFromStore<CachedEnrollment>('enrollments', schoolId);
}

// ==================== Admin Message Cache ====================

export async function cacheAdminMessages(messages: CachedAdminMessage[]): Promise<void> {
  await cacheToStore('adminMessages', messages);
}

export async function getCachedAdminMessages(schoolId: string): Promise<CachedAdminMessage[]> {
  return getAllFromStore<CachedAdminMessage>('adminMessages', schoolId);
}

// ==================== Sync Metadata ====================

export async function updateSyncMetadata(key: string, itemCount: number): Promise<void> {
  const db = await getOfflineDB();
  await db.put('syncMetadata', {
    key,
    lastSyncAt: Date.now(),
    itemCount,
  });
}

export async function getSyncMetadata(key: string): Promise<SyncMetadata | undefined> {
  const db = await getOfflineDB();
  return db.get('syncMetadata', key);
}

export async function getAllSyncMetadata(): Promise<SyncMetadata[]> {
  const db = await getOfflineDB();
  return db.getAll('syncMetadata');
}

// ==================== Storage Info ====================

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  usageFormatted: string;
  quotaFormatted: string;
  percentUsed: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    
    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    
    return {
      usage,
      quota,
      usageFormatted: formatBytes(usage),
      quotaFormatted: formatBytes(quota),
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
    };
  }
  
  return {
    usage: 0,
    quota: 0,
    usageFormatted: 'Unknown',
    quotaFormatted: 'Unknown',
    percentUsed: 0,
  };
}

// ==================== Clear All Data ====================

export async function clearAllOfflineData(): Promise<void> {
  const db = await getOfflineDB();
  const storeNames = Array.from(db.objectStoreNames);
  
  const tx = db.transaction(storeNames, 'readwrite');
  await Promise.all(storeNames.map(name => tx.objectStore(name).clear()));
  await tx.done;
}

// ==================== Messaging Cache Operations ====================

export async function cacheConversations(conversations: CachedConversation[]): Promise<void> {
  await cacheToStore('conversations', conversations);
}

export async function getCachedConversations(schoolId: string): Promise<CachedConversation[]> {
  const all = await getAllFromStore<CachedConversation>('conversations', schoolId);
  return all.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
}

export async function updateCachedConversation(conv: Partial<CachedConversation> & { id: string; schoolId: string }): Promise<void> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('conversations')) return;
  
  const existing = await db.get('conversations', conv.id);
  if (existing) {
    await db.put('conversations', { ...existing, ...conv, cachedAt: Date.now() });
  } else {
    await db.put('conversations', { ...conv, cachedAt: Date.now() });
  }
}

export async function cacheMessages(messages: CachedMessage[]): Promise<void> {
  await cacheToStore('messages', messages);
}

export async function getCachedMessages(schoolId: string, partnerId: string): Promise<CachedMessage[]> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('messages')) return [];
  
  const all = await db.getAllFromIndex('messages', 'by-partner', partnerId);
  return (all as CachedMessage[])
    .filter(m => m.schoolId === schoolId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function addPendingMessage(message: CachedMessage): Promise<void> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('messages')) return;
  await db.put('messages', { ...message, isPending: true, cachedAt: Date.now() });
}

export async function markMessageSynced(localId: string, realId: string): Promise<void> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('messages')) return;
  
  const pending = await db.get('messages', localId);
  if (pending) {
    await db.delete('messages', localId);
    await db.put('messages', { ...pending, id: realId, isPending: false, localId: undefined });
  }
}

export async function getPendingMessages(schoolId: string): Promise<CachedMessage[]> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('messages')) return [];
  
  const all = await db.getAll('messages');
  return (all as CachedMessage[]).filter(m => m.schoolId === schoolId && m.isPending === true);
}

export async function cacheContacts(contacts: CachedContact[]): Promise<void> {
  await cacheToStore('contacts', contacts);
}

export async function getCachedContacts(schoolId: string): Promise<CachedContact[]> {
  return getAllFromStore<CachedContact>('contacts', schoolId);
}

export async function clearMessagesForConversation(schoolId: string, partnerId: string): Promise<void> {
  const db = await getOfflineDB();
  if (!db.objectStoreNames.contains('messages')) return;
  
  const tx = db.transaction('messages', 'readwrite');
  const all = await tx.store.index('by-partner').getAll(partnerId);
  
  for (const msg of all) {
    if ((msg as CachedMessage).schoolId === schoolId) {
      await tx.store.delete(msg.id);
    }
  }
  
  await tx.done;
}
