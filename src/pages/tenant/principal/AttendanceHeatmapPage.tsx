// src/pages/tenant/principal/AttendanceHeatmapPage.tsx
import { AttendanceHeatmap } from '@/components/principal/AttendanceHeatmap';

export default function AttendanceHeatmapPage() {
  return (
    <section className="p-4 lg:p-6">
      <h1 className="font-display text-2xl font-semibold mb-4">Real‑Time Attendance Heatmap</h1>
      <AttendanceHeatmap />
    </section>
  );
}
