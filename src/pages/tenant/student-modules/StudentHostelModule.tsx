import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, Users, Utensils, Shield, Phone } from "lucide-react";
import { toast } from "sonner";

export function StudentHostelModule() {
  const [hostelData] = useState({
    hall_name: "Jinnah Residential Hall (Block B)",
    room_number: "Room #204",
    bed_allocated: "Bed B (Window Side)",
    warden_name: "Dr. Shaheen Akhtar",
    warden_phone: "+92 301 5554321",
    roommates: [
      { name: "Bilal Hassan", class_name: "Grade 10-B", roll: "STU-10B-04" },
      { name: "Hamza Malik", class_name: "Grade 10-B", roll: "STU-10B-08" },
    ],
    mess_menu: [
      { day: "Monday", breakfast: "Egg & Paratha, Tea", lunch: "Chicken Karahi, Rice", dinner: "Daal Fry, Naan" },
      { day: "Tuesday", breakfast: "Halwa Puri, Chana", lunch: "Mix Veg Curry, Roti", dinner: "Chicken Pulao, Raita" },
      { day: "Wednesday", breakfast: "French Toast, Milk", lunch: "Beef Qeema, Naan", dinner: "Kadhi Pakora, Rice" },
    ]
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-700 text-white rounded-2xl p-6 shadow-lg border border-purple-400/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
            <Home className="h-8 w-8 text-purple-100" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Hostel & Boarding Desk</h1>
            <p className="text-purple-100 text-sm mt-0.5">View your room allocation, roommate details, hostel warden contact, and weekly mess menu.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Room Info */}
        <Card className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <Badge className="bg-purple-100 text-purple-800 font-mono mb-1">{hostelData.room_number}</Badge>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{hostelData.hall_name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Assigned Bed: <span className="font-semibold text-purple-600">{hostelData.bed_allocated}</span></p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold text-purple-600 border-purple-300">
              Boarder Active
            </Badge>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" /> Roommates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hostelData.roommates.map((rm, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{rm.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{rm.class_name} • {rm.roll}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Warden Info */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-600" /> Hostel Warden
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{hostelData.warden_name}</p>
            <p className="text-xs text-slate-500">Chief Resident Superintendent</p>
            <button
              onClick={() => toast.info(`Calling Warden: ${hostelData.warden_phone}`)}
              className="w-full mt-2 py-2 px-3 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-1.5"
            >
              <Phone className="h-3.5 w-3.5" /> Call {hostelData.warden_phone}
            </button>
          </div>
        </Card>

        {/* Mess Menu Schedule */}
        <Card className="md:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-4 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-amber-500" /> Weekly Mess Meal Menu
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hostelData.mess_menu.map((menu, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
                <Badge variant="secondary" className="font-bold">{menu.day}</Badge>
                <div className="text-xs space-y-1 pt-1">
                  <p><span className="font-semibold text-slate-500">Breakfast:</span> {menu.breakfast}</p>
                  <p><span className="font-semibold text-slate-500">Lunch:</span> {menu.lunch}</p>
                  <p><span className="font-semibold text-slate-500">Dinner:</span> {menu.dinner}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default StudentHostelModule;
