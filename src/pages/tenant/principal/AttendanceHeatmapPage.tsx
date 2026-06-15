// src/pages/tenant/principal/AttendanceHeatmapPage.tsx
import { AttendanceHeatmap } from '@/components/principal/AttendanceHeatmap';
import { Compass } from 'lucide-react';

export default function AttendanceHeatmapPage() {
  return (
    <section className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Premium Banner Header */}
      <div className="relative overflow-hidden bg-slate-950 border border-slate-800 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-10 h-40 w-40 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none" />
        
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest">Live Security Feed</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Compass className="h-8 w-8 text-indigo-400 animate-spin-slow" />
            Geofenced Heat Radar
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Monitor real-time geographical presence and campus proximity for checked-in school staff. 
            All coordinates are verified against the campus centroid via modern geofencing policies.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 backdrop-blur-md">
          <div className="text-xs font-mono text-slate-400 space-y-1">
            <p className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />Centroid Lock: <span className="text-white font-bold">Verified</span></p>
            <p className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Geofence Max: <span className="text-emerald-400 font-bold">100m Radius</span></p>
            <p className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />WS Sync: <span className="text-white font-bold">Active</span></p>
          </div>
        </div>
      </div>

      <AttendanceHeatmap />
    </section>
  );
}
