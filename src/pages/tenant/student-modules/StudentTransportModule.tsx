import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bus, MapPin, Clock, Phone, UserCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function StudentTransportModule() {
  const [routeInfo] = useState({
    bus_number: "Bus #04",
    route_name: "Gulberg / DHA Express Loop",
    driver_name: "Muhammad Tariq",
    driver_phone: "+92 300 9876543",
    conductor_name: "Asif Mahmood",
    pickup_stop: "Stop #12 — Main Boulevard Gate A",
    pickup_time: "07:15 AM",
    drop_time: "02:30 PM",
    seat_allocated: "Seat #14 (Window)",
    status: "Active Route",
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-600 to-blue-700 text-white rounded-2xl p-6 shadow-lg border border-emerald-400/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
            <Bus className="h-8 w-8 text-emerald-100" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Transport Desk</h1>
            <p className="text-emerald-100 text-sm mt-0.5">View your assigned bus route, pickup stop location, timings, and driver details.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Bus Card */}
        <Card className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <Badge className="bg-emerald-100 text-emerald-800 font-mono mb-1">{routeInfo.bus_number}</Badge>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{routeInfo.route_name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Assigned Seat: <span className="font-semibold text-emerald-600">{routeInfo.seat_allocated}</span></p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 border-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> {routeInfo.status}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <MapPin className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-400">Designated Bus Stop</span>
                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{routeInfo.pickup_stop}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-400">Pickup & Drop Schedule</span>
                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                  Pickup: <span className="text-emerald-600">{routeInfo.pickup_time}</span> | Drop: <span className="text-blue-600">{routeInfo.drop_time}</span>
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Crew Contact */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Bus Crew Contacts</h3>
          
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Bus Driver</span>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{routeInfo.driver_name}</p>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => toast.info(`Contacting Driver: ${routeInfo.driver_phone}`)}
              className="w-full mt-2 text-xs font-semibold"
            >
              <Phone className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Call {routeInfo.driver_phone}
            </Button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Bus Attendant</span>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{routeInfo.conductor_name}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default StudentTransportModule;
