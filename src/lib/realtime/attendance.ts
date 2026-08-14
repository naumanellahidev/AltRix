// src/lib/realtime/attendance.ts
import { api } from '@/lib/api';
type AttendanceRecord = any;

// Subscribe to real-time changes on the hr_staff_attendance table
export const subscribeAttendance = (callback: (record: AttendanceRecord) => void) => {
  const randomId = Math.random().toString(36).substring(2, 10);
  const channel = api
    .channel(`attendance-changes-${randomId}`)
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
    api.removeChannel(channel);
  };
};

export default subscribeAttendance;
