import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, Shield, Phone, Utensils, Send } from "lucide-react";
import { toast } from "sonner";

export function ParentHostelModule({ child }: { child?: any }) {
  const [hostelData] = useState({
    hall_name: "Jinnah Residential Hall (Block B)",
    room_number: "Room #204",
    bed_allocated: "Bed B (Window Side)",
    warden_name: "Dr. Shaheen Akhtar",
    warden_phone: "+92 301 5554321",
    mess_menu: [
      { day: "Monday", breakfast: "Egg & Paratha, Tea", lunch: "Chicken Karahi, Rice", dinner: "Daal Fry, Naan" },
      { day: "Tuesday", breakfast: "Halwa Puri, Chana", lunch: "Mix Veg Curry, Roti", dinner: "Chicken Pulao, Raita" },
      { day: "Wednesday", breakfast: "French Toast, Milk", lunch: "Beef Qeema, Naan", dinner: "Kadhi Pakora, Rice" },
    ]
  });

  const handleRequestPass = () => {
    toast.success("Weekend leave pass request submitted!", {
      description: "The hostel warden will review your request and issue a gate pass clearance code."
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-700 text-white rounded-2xl p-6 shadow-lg border border-purple-400/20">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Home className="h-8 w-8 text-purple-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Parent Hostel Desk</h1>
              <p className="text-purple-100 text-sm mt-0.5">
                Hostel residence details for <span className="font-semibold text-white">{child?.full_name || "your child"}</span>, warden contact, and weekend pass requests.
              </p>
            </div>
          </div>
          <Button onClick={handleRequestPass} className="bg-white text-purple-700 hover:bg-purple-50 font-bold shrink-0 shadow-md">
            <Send className="h-4 w-4 mr-2" /> Request Weekend Pass
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Room Info */}
        <Card className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <Badge className="bg-purple-100 text-purple-800 font-mono mb-1">{hostelData.room_number}</Badge>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{hostelData.hall_name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Assigned Bed: <span className="font-semibold text-purple-600">{hostelData.bed_allocated}</span></p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold text-purple-600 border-purple-300">
              Boarder Registered
            </Badge>
          </div>

          <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
            * Boarding welfare check is conducted nightly at 09:30 PM by hall wardens. Weekend passes must be requested 24 hours in advance.
          </div>
        </Card>

        {/* Warden Contact */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-600" /> Hostel Warden
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{hostelData.warden_name}</p>
            <p className="text-xs text-slate-500">Superintendent Warden</p>
            <button
              onClick={() => toast.info(`Contacting Warden: ${hostelData.warden_phone}`)}
              className="w-full mt-2 py-2 px-3 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-1.5"
            >
              <Phone className="h-3.5 w-3.5" /> Call Warden {hostelData.warden_phone}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default ParentHostelModule;
