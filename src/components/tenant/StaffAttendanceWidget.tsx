import { useState, useEffect, useMemo } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Compass,
  Wifi,
  Navigation,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffAttendanceWidgetProps {
  schoolId: string;
}

interface SchoolLocation {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

interface AttendanceRecord {
  id?: string;
  status: string;
  clock_in: string | null;
  clock_out: string | null;
  attendance_date: string;
}

// Calculate distance in meters using Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // returns distance in meters
}

const formatClockTime = (timeStr: string | null) => {
  if (!timeStr) return "";
  try {
    if (timeStr.includes("T") || timeStr.includes("-")) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }
    }
    return timeStr.slice(0, 5);
  } catch {
    return timeStr.slice(0, 5);
  }
};

export function StaffAttendanceWidget({ schoolId }: StaffAttendanceWidgetProps) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [schoolLoc, setSchoolLoc] = useState<SchoolLocation | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User position states
  const [userCoords, setUserCoords] = useState<GeolocationCoordinates | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"disabled" | "weak" | "locked">("disabled");
  const [gpsError, setGpsError] = useState<string | null>(null);

  const todayDate = useMemo(() => new Date().toLocaleDateString("sv-SE"), []); // YYYY-MM-DD

  // Fetch school location & current attendance status
  const fetchData = async () => {
    try {
      // 1. Fetch location coordinates
      if (USE_FASTAPI) {
        try {
          const { data: schoolData } = await apiClient.get(`/schools/${schoolId}`);
          if (schoolData) {
            setSchoolLoc({
              latitude: schoolData.latitude ?? null,
              longitude: schoolData.longitude ?? null,
              altitude: schoolData.altitude ?? null,
            });
          } else {
            setSchoolLoc({ latitude: null, longitude: null, altitude: null });
          }
        } catch (err) {
          console.warn("Failed to fetch coordinates via FastAPI, falling back:", err);
          setSchoolLoc({ latitude: null, longitude: null, altitude: null });
        }
      } else {
        try {
          const { data: schoolData, error: schoolErr } = await supabase
            .from("schools")
            .select("latitude,longitude,altitude")
            .eq("id", schoolId)
            .maybeSingle();

          if (schoolErr) {
            console.warn("Location columns missing in database schools table:", schoolErr.message);
            setSchoolLoc({ latitude: null, longitude: null, altitude: null });
          } else {
            setSchoolLoc(schoolData);
          }
        } catch (err) {
          console.warn("Failed to fetch coordinates, falling back:", err);
          setSchoolLoc({ latitude: null, longitude: null, altitude: null });
        }
      }

      // 2. Fetch today's attendance for the logged-in staff
      if (user?.id) {
        const { data: attData, error: attErr } = await supabase
          .from("hr_staff_attendance")
          .select("id, status, clock_in, clock_out, attendance_date")
          .eq("school_id", schoolId)
          .eq("user_id", user.id)
          .eq("attendance_date", todayDate)
          .maybeSingle();

        if (attErr) throw attErr;
        setAttendance(attData);
      }
    } catch (e: any) {
      console.error("Error fetching attendance data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId, user?.id, todayDate]);

  // Subscribe to live geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by this browser.");
      setGpsStatus("disabled");
      return;
    }

    let watchId: number | null = null;
    let fallbackWatchId: number | null = null;

    const handleSuccess = (position: GeolocationPosition) => {
      setUserCoords(position.coords);
      setGpsError(null);
      // If accuracy <= 35m, we trust the location; standard sensors (Wi-Fi, cell tower) will be around 15-40m
      if (position.coords.accuracy <= 35) {
        setGpsStatus("locked");
      } else {
        setGpsStatus("weak");
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn("GPS watch position error:", error.message);
      
      // If high accuracy failed or timed out, attempt standard accuracy fallback
      if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
        if (!fallbackWatchId) {
          console.warn("Retrying watchPosition with standard accuracy...");
          setGpsError("High accuracy GPS timed out. Calibrating with standard accuracy...");
          
          fallbackWatchId = navigator.geolocation.watchPosition(
            handleSuccess,
            (err) => {
              console.error("Fallback GPS error:", err);
              setGpsError(`GPS Error: ${err.message}`);
              setGpsStatus("disabled");
            },
            {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 10000,
            }
          );
        }
      } else {
        setGpsError(error.message);
        setGpsStatus("disabled");
      }
    };

    // Start with high accuracy, timeout after 10 seconds to prompt fallback
    watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (fallbackWatchId !== null) navigator.geolocation.clearWatch(fallbackWatchId);
    };
  }, []);

  // Compute live distance
  const { distance, inRange, isLocationConfigured } = useMemo(() => {
    if (!schoolLoc || schoolLoc.latitude === null || schoolLoc.longitude === null) {
      return { distance: null, inRange: false, isLocationConfigured: false };
    }
    if (!userCoords) {
      return { distance: null, inRange: false, isLocationConfigured: true };
    }
    const dist = getDistance(
      schoolLoc.latitude,
      schoolLoc.longitude,
      userCoords.latitude,
      userCoords.longitude
    );
    return {
      distance: Math.round(dist),
      inRange: dist <= 100,
      isLocationConfigured: true,
    };
  }, [schoolLoc, userCoords]);

  // Attendance update operation
  const logAttendance = async (status: "present" | "absent" | "leave") => {
    if (!user?.id) return;
    
    // Safety check for location boundaries
    if (status === "present" && isLocationConfigured) {
      if (!userCoords) {
        toast.error("Location Error: Unable to verify your location. Please check your GPS signal or enable location permissions.");
        return;
      }
      if (!inRange) {
        toast.error(`Verification Failed: You are currently ${distance ? `${distance}m` : "unknown distance"} away from the campus (allowable limit: 100m).`);
        return;
      }
    }

    setSaving(true);
    
    try {
      const payload: any = {
        school_id: schoolId,
        user_id: user.id,
        attendance_date: todayDate,
        status,
        recorded_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (status === "present") {
        payload.clock_in = new Date().toISOString();
      }

      // Record check-in location details
      if (userCoords) {
        payload.latitude = userCoords.latitude;
        payload.longitude = userCoords.longitude;
        payload.altitude = userCoords.altitude;
      }

      const { error } = await supabase
        .from("hr_staff_attendance")
        .upsert(payload, { onConflict: "school_id,user_id,attendance_date" });

      if (error) throw error;

      toast.success(`Attendance successfully logged as ${status.toUpperCase()}!`);
      await fetchData();
      setOpen(false); // Close dialog on success
    } catch (e: any) {
      console.error("Upsert attendance error:", e);
      toast.error(e.message || "Failed to sync attendance.");
    } finally {
      setSaving(false);
    }
  };

  // Clock Out operation
  const handleClockOut = async () => {
    if (!attendance?.id || !user?.id) return;
    
    if (isLocationConfigured) {
      if (!userCoords) {
        toast.error("Location Error: Unable to verify your location. Please enable location permissions to clock out.");
        return;
      }
      if (!inRange) {
        toast.error(`Verification Failed: You must be inside the 100m campus boundary to clock out (currently ${distance ? `${distance}m` : "unknown distance"} away).`);
        return;
      }
    }

    setSaving(true);
    
    try {
      const updates: any = {
        clock_out: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Record clock-out location details
      if (userCoords) {
        updates.latitude = userCoords.latitude;
        updates.longitude = userCoords.longitude;
        updates.altitude = userCoords.altitude;
      }

      const { error } = await supabase
        .from("hr_staff_attendance")
        .update(updates)
        .eq("id", attendance.id);

      if (error) throw error;

      toast.success("Clock-out successfully logged! Have a nice day.");
      await fetchData();
      setOpen(false); // Close dialog on success
    } catch (e: any) {
      console.error("Clock out error:", e);
      toast.error(e.message || "Failed to log clock out.");
    } finally {
      setSaving(false);
    }
  };

  const hasBothClocks = attendance?.clock_in != null && attendance?.clock_out != null;

  if (loading) {
    return (
      <Button variant="ghost" size="icon" className="rounded-xl opacity-60 cursor-not-allowed">
        <UserCheck className="h-4.5 w-4.5 text-muted-foreground animate-pulse" />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="soft"
          size="icon"
          title="Staff Attendance Console"
          aria-label="Staff Attendance Console"
          className={cn(
            "rounded-xl relative transition-all duration-300 hover:scale-105 active:scale-95",
            attendance
              ? (attendance.status === "present"
                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15"
                  : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/15")
              : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 animate-pulse"
          )}
        >
          <UserCheck className="h-4.5 w-4.5" />
          
          {/* Status Indicator Dot */}
          <span className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
            attendance
              ? (attendance.status === "present"
                  ? "bg-emerald-500"
                  : "bg-blue-500")
              : "bg-amber-500 animate-ping"
          )} />
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md bg-card/95 backdrop-blur-md border-border/80 shadow-2xl rounded-3xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold font-display tracking-tight flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Staff Attendance Console
            </DialogTitle>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border">
              {new Date(todayDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>
        </DialogHeader>

        {/* Geofence Status Alert Panel */}
        {!attendance && (
          <div className="mt-3">
            {!isLocationConfigured ? (
              <p className="text-xs text-muted-foreground bg-muted/40 border rounded-2xl p-4 flex items-start gap-2 leading-relaxed">
                <Compass className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <span>
                  <strong>Campus Geofence coordinates not configured by Principal.</strong> Attendance check-ins will operate in offline/global mode. To configure settings, log in as the school principal.
                </span>
              </p>
            ) : !userCoords ? (
              <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                <span>
                  <strong>Acquiring GPS Signal...</strong> Calibrating live distance verification. Please ensure location permissions are enabled.
                </span>
              </p>
            ) : !inRange ? (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 animate-bounce" />
                <span>
                  <strong>Verification Failed:</strong> You are currently <strong>{distance}m</strong> away from the campus center. Attendance check-ins are restricted to a <strong>100m</strong> geofence.
                </span>
              </p>
            ) : (
              <p className="text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-2 leading-relaxed">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Location Verified:</strong> You are within the 100m campus boundary. Ready to check in.
                </span>
              </p>
            )}
          </div>
        )}

        {/* GPS Signal Strength Badge if configured */}
        {isLocationConfigured && (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between bg-muted/30 border border-border/40 rounded-xl px-3 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Wifi className="h-3.5 w-3.5 text-primary" /> GPS Sensor Status
              </span>
              <Badge variant="outline" className={cn(
                "text-[9px] font-semibold border-none px-2 h-5 rounded-md",
                gpsStatus === "locked" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                gpsStatus === "weak" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                "bg-destructive/10 text-destructive dark:text-red-400"
              )}>
                {gpsStatus === "locked" ? `High Accuracy (±${userCoords?.accuracy ? Math.round(userCoords.accuracy) : 5}m)` :
                 gpsStatus === "weak" ? "Weak Signal" : "No GPS Signal"}
              </Badge>
            </div>
            
            {/* Real-time coordinates readout */}
            <div className="flex flex-col gap-1.5 bg-muted/20 border border-border/30 rounded-xl p-3 text-[10px] font-mono text-muted-foreground">
              <div className="flex justify-between items-center">
                <span>Campus Center:</span>
                <span className="text-foreground font-semibold">
                  {schoolLoc?.latitude !== null && schoolLoc?.longitude !== null
                    ? `${Number(schoolLoc.latitude).toFixed(6)}, ${Number(schoolLoc.longitude).toFixed(6)}`
                    : "Not Configured"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Your Position:</span>
                <span className="text-foreground font-semibold">
                  {userCoords
                    ? `${userCoords.latitude.toFixed(6)}, ${userCoords.longitude.toFixed(6)}`
                    : "Acquiring..."}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* GPS Error Alert */}
        {gpsError && (
          <p className="mt-3 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-2.5 flex items-center gap-1.5 leading-tight">
            <AlertTriangle className="h-4 w-4" />
            GPS: {gpsError}
          </p>
        )}

        {/* Interactive Clickable Icons Console */}
        <div className="mt-5 border-t border-b border-dashed border-border/80 py-6 flex justify-around items-center">
          
          {/* PRESENT ICON */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => logAttendance("present")}
              disabled={saving || (isLocationConfigured && !inRange) || (attendance && attendance.status === "present") || hasBothClocks}
              className={cn(
                "h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                attendance?.status === "present"
                  ? "bg-emerald-500 text-white cursor-default shadow-emerald-500/20"
                  : ((isLocationConfigured && !inRange) || hasBothClocks)
                    ? "bg-muted text-muted-foreground border border-muted-foreground/20 cursor-not-allowed opacity-50"
                    : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20"
              )}
            >
              <CheckCircle className="h-8 w-8" />
            </button>
            <span className="text-[11px] font-semibold tracking-tight">Present</span>
          </div>

          {/* ABSENT ICON */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => logAttendance("absent")}
              disabled={saving || (attendance && attendance.status === "absent") || hasBothClocks}
              className={cn(
                "h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                attendance?.status === "absent"
                  ? "bg-destructive text-white cursor-default shadow-destructive/20"
                  : hasBothClocks
                    ? "bg-muted text-muted-foreground border border-muted-foreground/20 cursor-not-allowed opacity-50"
                    : "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
              )}
            >
              <XCircle className="h-8 w-8" />
            </button>
            <span className="text-[11px] font-semibold tracking-tight">Absent</span>
          </div>

          {/* LEAVE ICON */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => logAttendance("leave")}
              disabled={saving || (attendance && attendance.status === "leave") || hasBothClocks}
              className={cn(
                "h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                attendance?.status === "leave"
                  ? "bg-blue-500 text-white cursor-default shadow-blue-500/20"
                  : hasBothClocks
                    ? "bg-muted text-muted-foreground border border-muted-foreground/20 cursor-not-allowed opacity-50"
                    : "bg-blue-500/10 text-blue-600 border border-blue-500/30 hover:bg-blue-500/20"
              )}
            >
              <FileText className="h-8 w-8" />
            </button>
            <span className="text-[11px] font-semibold tracking-tight">Leave</span>
          </div>

        </div>

        {/* Bottom Status Panel */}
        <div className="mt-4 flex flex-col gap-2">
          {attendance ? (
            <div className="flex flex-wrap items-center justify-between text-xs bg-muted/40 p-3 rounded-2xl border font-mono">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  attendance.status === "present" ? "bg-emerald-500 animate-pulse" :
                  attendance.status === "leave" ? "bg-blue-500" : "bg-destructive"
                )} />
                <span className="font-semibold capitalize text-foreground">Logged: {attendance.status}</span>
              </div>
              <div className="flex gap-2">
                {attendance.clock_in && (
                  <span className="bg-muted/80 px-2 py-0.5 rounded border text-[10px]">In: {formatClockTime(attendance.clock_in)}</span>
                )}
                {attendance.clock_out && (
                  <span className="bg-muted/80 px-2 py-0.5 rounded border text-[10px]">Out: {formatClockTime(attendance.clock_out)}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/5 p-3 rounded-2xl border border-dashed border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>You have not recorded your attendance for today yet.</span>
            </div>
          )}

          {/* Clock Out triggers inside the modal */}
          {attendance && attendance.status === "present" && !attendance.clock_out && (
            <div className="flex items-center justify-between bg-muted/20 border border-dashed rounded-2xl p-3 mt-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 animate-pulse text-emerald-500" /> Duty active
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClockOut}
                disabled={saving || (isLocationConfigured && !inRange)}
                className={cn(
                  "rounded-xl text-[11px] font-semibold h-8 active:scale-95",
                  (isLocationConfigured && !inRange)
                    ? "border-muted text-muted-foreground bg-muted/20 cursor-not-allowed opacity-50"
                    : "border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                )}
              >
                Clock Out
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
