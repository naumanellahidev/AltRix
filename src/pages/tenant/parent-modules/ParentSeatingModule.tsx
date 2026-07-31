import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grid, ShieldCheck, MapPin, Clock, AlertTriangle } from "lucide-react";

export function ParentSeatingModule({ child }: { child?: any }) {
  const [seatingInfo] = useState({
    exam_title: "Mid-Term Physics & Mathematics Assessment",
    room_name: "Main Auditorium Hall A",
    seat_number: "Seat #A-1",
    invigilator_name: "Prof. Tariq Mahmood",
    date: "2026-08-15",
    time_slot: "09:00 AM - 12:00 PM",
    class_name: "Grade 9-A",
    roll_number: "STU-9A-01",
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600 text-white rounded-2xl p-6 shadow-lg border border-blue-400/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
            <Grid className="h-8 w-8 text-blue-100" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Parent Exam Desk Locator</h1>
            <p className="text-blue-100 text-sm mt-0.5">
              Candidate seating position and exam hall details for <span className="font-semibold text-white">{child?.full_name || "your child"}</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Seat Ticket Card */}
        <Card className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <Badge className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 mb-1.5">{seatingInfo.seat_number}</Badge>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{seatingInfo.exam_title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Candidate: <span className="font-semibold text-slate-800 dark:text-slate-200">{child?.full_name || seatingInfo.roll_number}</span></p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 border-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Seat Verified
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-1">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> Exam Hall Location
              </span>
              <p className="font-bold text-slate-900 dark:text-slate-100 text-base">{seatingInfo.room_name}</p>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-1">
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Date & Time Slot
              </span>
              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{seatingInfo.date}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">{seatingInfo.time_slot}</p>
            </div>
          </div>
        </Card>

        {/* Guidelines */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Parent Information
          </h3>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 leading-relaxed">
            <li>• Ensure your child arrives 15 minutes prior to the exam start time.</li>
            <li>• Ensure your child brings their official Student ID card.</li>
            <li>• Anti-cheating 2D seating prevents seat adjustments.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default ParentSeatingModule;
