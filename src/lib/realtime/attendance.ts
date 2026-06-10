// src/lib/realtime/attendance.ts
import { supabase } from '@/integrations/supabase/client';
type AttendanceRecord = any;

// Subscribe to real‑time changes on the hr_staff_attendance table
export const subscribeAttendance = (callback: (record: AttendanceRecord) => void) => {
  const channel = supabase
    .channel('public:hr_staff_attendance')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hr_staff_attendance' },
      (payload) => {
        if (payload.new) {
          callback(payload.new as AttendanceRecord);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export default subscribeAttendance;
