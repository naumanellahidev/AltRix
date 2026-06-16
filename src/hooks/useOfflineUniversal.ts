import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, rawSupabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  addToOfflineQueue,
  getPendingQueueItems,
  markQueueItemSynced,
  incrementRetryCount,
  getQueueStats,
  clearSyncedItems,
  getAllSyncMetadata,
  getStorageEstimate,
  OfflineQueueItem,
  OfflineActionType,
  SyncMetadata,
} from "@/lib/offline-db";

export type { OfflineActionType } from "@/lib/offline-db";

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

interface UseOfflineUniversalOptions {
  schoolId: string | null;
  userId: string | null;
  role: string;
  autoSync?: boolean;
  syncIntervalMs?: number;
}

export function useOfflineUniversal({
  schoolId,
  userId,
  role,
  autoSync = true,
  syncIntervalMs = 30000,
}: UseOfflineUniversalOptions) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<OfflineStats>({ pending: 0, synced: 0, failed: 0, byType: {} });
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata[]>([]);

  const syncInProgress = useRef(false);

  // Update stats
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



  // Sync single item
  const syncItem = useCallback(async (item: OfflineQueueItem): Promise<boolean> => {
    if (!schoolId || !userId) return false;

    try {
      switch (item.type) {
        case 'attendance': {
          const { session_id, student_id, status, note } = item.data as any;
          const { error } = await rawSupabase.from("attendance_entries").upsert(
            { school_id: schoolId, session_id, student_id, status, note: note || null, created_by: userId },
            { onConflict: "school_id,session_id,student_id" }
          );
          if (error) throw error;
          break;
        }
        
        case 'period_log': {
          const { timetable_entry_id, logged_at, topic_covered, notes, status } = item.data as any;
          const { error } = await rawSupabase.from("teacher_period_logs").upsert(
            { school_id: schoolId, timetable_entry_id, logged_at, topic_covered: topic_covered || "", notes: notes || null, status: status || "completed", teacher_user_id: userId },
            { onConflict: "school_id,timetable_entry_id,logged_at" }
          );
          if (error) throw error;
          break;
        }
        
        case 'behavior_note': {
          const { student_id, title, content, note_type, is_shared_with_parents } = item.data as any;
          const { error } = await rawSupabase.from("behavior_notes").insert({
            school_id: schoolId, student_id, title, content, note_type, is_shared_with_parents, teacher_user_id: userId, created_by: userId,
          });
          if (error) throw error;
          break;
        }
        
        case 'homework': {
          const { class_section_id, title, description, due_date, attachment_urls } = item.data as any;
          const { error } = await rawSupabase.from("homework").insert({
            school_id: schoolId, class_section_id, title, description: description || null, due_date, attachment_urls: attachment_urls || null, teacher_user_id: userId, created_by: userId,
          });
          if (error) throw error;
          break;
        }
        
        case 'quick_grade': {
          const { assessment_id, student_id, marks } = item.data as any;
          const { error } = await rawSupabase.from("student_marks").upsert(
            { school_id: schoolId, assessment_id, student_id, marks, created_by: userId },
            { onConflict: "school_id,assessment_id,student_id" }
          );
          if (error) throw error;
          break;
        }
        
        case 'message': {
          const { recipient_user_ids, subject, content, priority } = item.data as any;
          const { data: message, error: msgError } = await rawSupabase
            .from("admin_messages")
            .insert({ school_id: schoolId, sender_user_id: userId, subject, content, priority: priority || "normal", created_by: userId })
            .select("id")
            .single();
          if (msgError) throw msgError;
          
          const recipients = (recipient_user_ids as string[]).map(recipientId => ({
            message_id: message.id,
            recipient_user_id: recipientId,
          }));
          const { error: recError } = await rawSupabase.from("admin_message_recipients").insert(recipients);
          if (recError) throw recError;
          break;
        }

        case 'support_ticket': {
          const { subject, message: ticketMessage, priority } = item.data as any;
          const { error } = await rawSupabase.from("admin_messages").insert({
            school_id: schoolId, sender_user_id: userId, subject, content: ticketMessage, priority: priority || "normal", status: "open", created_by: userId,
          });
          if (error) throw error;
          break;
        }

        case 'expense': {
          const { description, amount, category, expense_date, vendor, reference } = item.data as any;
          const { error } = await rawSupabase.from("finance_expenses").insert({
            school_id: schoolId, description, amount, category: category || "general", expense_date: expense_date || new Date().toISOString().split('T')[0], vendor, reference, created_by: userId,
          });
          if (error) throw error;
          break;
        }

        case 'payment': {
          const { invoice_id, student_id, amount, paid_at, reference, notes, method } = item.data as any;
          const { error } = await rawSupabase.from("fee_payments").insert({
            school_id: schoolId,
            invoice_id,
            student_id,
            amount,
            paid_at: paid_at || new Date().toISOString(),
            transaction_ref: reference || null,
            notes: notes || null,
            recorded_by_user_id: userId,
            status: 'success',
            method: (method || 'cash') as any
          });
          if (error) throw error;
          break;
        }

        case 'leave_request': {
          const { leave_type_id, start_date, end_date, days_count, reason } = item.data as any;
          const { error } = await rawSupabase.from("hr_leave_requests").insert({
            school_id: schoolId, user_id: userId, leave_type_id, start_date, end_date, days_count, reason, status: "pending", created_by: userId,
          });
          if (error) throw error;
          break;
        }

        case 'lead_update': {
          const { lead_id, status, notes, score, next_follow_up_at } = item.data as any;
          const updates: any = {};
          if (status) updates.status = status;
          if (notes !== undefined) updates.notes = notes;
          if (score !== undefined) updates.score = score;
          if (next_follow_up_at) updates.next_follow_up_at = next_follow_up_at;
          
          const { error } = await rawSupabase.from("crm_leads").update(updates).eq("id", lead_id).eq("school_id", schoolId);
          if (error) throw error;
          break;
        }

        case 'call_log': {
          const { lead_id, outcome, duration_seconds, notes, called_at } = item.data as any;
          const { error } = await rawSupabase.from("crm_call_logs").insert({
            school_id: schoolId, lead_id, outcome: outcome || "completed", duration_seconds: duration_seconds || 0, notes, called_at: called_at || new Date().toISOString(), created_by: userId,
          });
          if (error) throw error;
          break;
        }

        case 'generic_mutation': {
          const { table, action, payload, filters } = item.data as {
            table: string;
            action: 'insert' | 'update' | 'upsert' | 'delete';
            payload: any;
            filters?: { method: string; args: any[] }[];
          };
          
          let query = rawSupabase.from(table);
          if (action === 'insert') {
            query = query.insert(payload) as any;
          } else if (action === 'update') {
            query = query.update(payload) as any;
          } else if (action === 'delete') {
            query = query.delete() as any;
          } else if (action === 'upsert') {
            query = query.upsert(payload) as any;
          }
          
          if (filters && filters.length > 0) {
            for (const filter of filters) {
              if (typeof (query as any)[filter.method] === 'function') {
                query = (query as any)[filter.method](...filter.args);
              }
            }
          }
          
          const { error } = await query;
          if (error) throw error;
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

  // Sync all pending items
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
        
        if (item.retryCount >= 5) {
          failCount++;
          continue;
        }
        
        setSyncProgress({ current: i + 1, total: pending.length, currentType: item.type });
        
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
      
      setLastSyncAt(new Date());
      await refreshStats();
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

  // Queue offline action
  const queueOfflineAction = useCallback(async (
    type: OfflineActionType,
    data: Record<string, unknown>,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<string> => {
    const id = await addToOfflineQueue({ type: type as any, data, priority });
    await refreshStats();
    
    if (navigator.onLine && autoSync) {
      syncPendingItems();
    } else {
      toast.info("Saved offline. Will sync when connected.");
    }
    
    return id;
  }, [refreshStats, autoSync, syncPendingItems]);

  // Queue offline message (convenience wrapper)
  const queueOfflineMessage = useCallback(async (
    recipientUserIds: string[],
    subject: string,
    content: string,
    priority: string = "normal"
  ): Promise<string> => {
    return queueOfflineAction('message', {
      recipient_user_ids: recipientUserIds,
      subject,
      content,
      priority,
    }, 'high');
  }, [queueOfflineAction]);

  // Monitor online status and custom sync triggers
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online! Syncing pending changes...");
      if (autoSync) syncPendingItems();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline. Changes will be saved locally.");
    };

    const handleQueueChanged = () => {
      refreshStats();
      if (navigator.onLine && autoSync) {
        syncPendingItems();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("eduverse:offline-queue-changed", handleQueueChanged);
    
    refreshStats();
    
    const interval = setInterval(refreshStats, syncIntervalMs);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("eduverse:offline-queue-changed", handleQueueChanged);
      clearInterval(interval);
    };
  }, [refreshStats, autoSync, syncIntervalMs, syncPendingItems]);

  return {
    isOnline,
    isSyncing,
    stats,
    lastSyncAt,
    syncProgress,
    storageInfo,
    syncMetadata,
    role,
    syncPendingItems,
    refreshStats,
    queueOfflineAction,
    queueOfflineMessage,
  };
}
