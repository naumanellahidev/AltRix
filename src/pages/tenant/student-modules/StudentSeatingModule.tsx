import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grid, ShieldCheck, MapPin, Clock, Calendar, AlertTriangle } from "lucide-react";

export function StudentSeatingModule({ myStudent }: { myStudent?: any }) {
  const [seatingInfo] = useState({
    exam_title: "Mid-Term Physics & Mathematics Assessment",
    room_name: "Main Auditorium Hall A",
    seat_number: "Seat #A-1",
    row: 1,
    col: 1,
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
            <h1 className="text-2xl font-bold tracking-tight">Student Exam Seat Locator</h1>
            <p className="text-blue-100 text-sm mt-0.5">Find your candidate seat number, exam hall location, date & time slot, and invigilator details.</p>
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
              <p className="text-xs text-slate-500 mt-0.5">Candidate: <span className="font-semibold text-slate-800 dark:text-slate-200">{seatingInfo.roll_number} ({seatingInfo.class_name})</span></p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 border-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verified Candidate
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

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Assigned Hall Invigilator:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{seatingInfo.invigilator_name}</span>
          </div>
        </Card>

        {/* Anti Cheating Notice */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Exam Regulations
          </h3>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 leading-relaxed">
            <li>• Arrive at the exam hall 15 minutes before scheduled start time.</li>
            <li>• Bring your official Student ID Card for door verification.</li>
            <li>• Electronic devices and calculators must be approved before entry.</li>
            <li>• Strict 2D checkerboard arrangement prohibits seat swapping.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default StudentSeatingModule;
