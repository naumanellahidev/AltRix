// src/components/principal/AttendanceHeatmap.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import subscribeAttendance from "@/lib/realtime/attendance";
type AttendanceRecord = any;
import { 
  MapPin, 
  Users, 
  Clock, 
  Activity, 
  Loader2, 
  RefreshCw, 
  Compass, 
  CheckCircle2, 
  AlertTriangle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ExtendedPoint {
  id: string;
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  userName: string;
  status: string;
  clockIn: string | null;
  distance: number | null;
}

export function AttendanceHeatmap() {
  const { schoolSlug } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // App States
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<{ id: string; name: string; latitude: number | null; longitude: number | null } | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<ExtendedPoint | null>(null);
  const [radarAngle, setRadarAngle] = useState(0);

  // Compute school center coords
  const schoolCenter = useMemo(() => {
    if (school?.latitude && school?.longitude) {
      return { lat: school.latitude, lng: school.longitude };
    }
    // Fallback to average of records with lat/lng
    const validRecords = records.filter(r => r.latitude != null && r.longitude != null);
    if (validRecords.length > 0) {
      const avgLat = validRecords.reduce((sum, r) => sum + r.latitude, 0) / validRecords.length;
      const avgLng = validRecords.reduce((sum, r) => sum + r.longitude, 0) / validRecords.length;
      return { lat: avgLat, lng: avgLng };
    }
    // Final fallback: Lahore, Pakistan
    return { lat: 31.5204, lng: 74.3587 };
  }, [school, records]);

  // Calculate distance in meters using Haversine formula
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  };

  // Convert geographic coords (lat/lng) to canvas pixels centered at schoolCenter
  const latLngToCanvas = (lat: number, lng: number, width: number, height: number, customMaxOffset?: number) => {
    const dLat = lat - schoolCenter.lat;
    const dLng = lng - schoolCenter.lng;
    
    // 1 degree lat = 111,139 meters
    // 1 degree lng = 111,139 * cos(lat) meters
    const yOffset = dLat * 111139;
    const xOffset = dLng * 111139 * Math.cos((schoolCenter.lat * Math.PI) / 180);

    // Compute range mapping
    // We want the campus to show at least 200m range
    let maxOffset = customMaxOffset || 200;
    
    // Auto-scale logic: adjust maxOffset if any point is further out
    if (!customMaxOffset) {
      records.forEach(r => {
        if (r.latitude != null && r.longitude != null) {
          const dy = (r.latitude - schoolCenter.lat) * 111139;
          const dx = (r.longitude - schoolCenter.lng) * 111139 * Math.cos((schoolCenter.lat * Math.PI) / 180);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxOffset && dist < 10000) { // cap auto-scale to 10km to avoid outlier breaks
            maxOffset = dist;
          }
        }
      });
    }

    // Map offsets to canvas bounds (with 15% padding)
    const paddingMultiplier = 1.15;
    const scale = (Math.min(width, height) / 2) / (maxOffset * paddingMultiplier);
    
    const x = width / 2 + xOffset * scale;
    const y = height / 2 - yOffset * scale; // Invert Y for canvas coordinate system
    
    return { x, y, scale };
  };

  // Fetch school details and today's attendance records
  const fetchData = async () => {
    try {
      setLoading(true);
      
      let schoolData: any = null;
      let attendanceRecords: any[] = [];

      if (USE_FASTAPI) {
        // Resolve school using FastAPI
        const schoolResp = await apiClient.get(`/schools/by-slug/${schoolSlug}`);
        schoolData = schoolResp.data;
        if (schoolData) {
          setSchool(schoolData);
          // Resolve staff attendance records
          const attResp = await apiClient.get(`/attendance/staff-today?school_id=${schoolData.id}`);
          attendanceRecords = attResp.data;
        }
      } else {
        // 1. Resolve school from slug via Supabase
        const { data, error: schoolErr } = await supabase
          .from("schools")
          .select("id, name, latitude, longitude")
          .eq("slug", schoolSlug || "")
          .maybeSingle();

        if (schoolErr) throw schoolErr;
        schoolData = data;
        if (!schoolData) {
          console.error("School not found for slug:", schoolSlug);
          setLoading(false);
          return;
        }
        setSchool(schoolData);

        // 2. Fetch today's attendance records — Phase 1: base columns always present
        const todayDate = new Date().toLocaleDateString("sv-SE");
        const { data: baseData, error: baseErr } = await supabase
          .from("hr_staff_attendance")
          .select("id, user_id, status, created_at, attendance_date")
          .eq("school_id", schoolData.id)
          .eq("attendance_date", todayDate);

        if (baseErr) throw baseErr;

        if (!baseData || baseData.length === 0) {
          setRecords([]);
          return;
        }

        // Phase 2: Try to enrich with clock_in/clock_out & lat/lng (fail silently if columns missing)
        let enrichedData: any[] = baseData;
        try {
          const { data: fullData, error: fullErr } = await supabase
            .from("hr_staff_attendance")
            .select("id, clock_in, clock_out, latitude, longitude")
            .eq("school_id", schoolData.id)
            .eq("attendance_date", todayDate);

          if (!fullErr && fullData) {
            const enrichMap = new globalThis.Map<string, any>(fullData.map((r: any) => [r.id, r]));
            enrichedData = baseData.map(r => ({
              ...r,
              clock_in: enrichMap.get(r.id)?.clock_in ?? null,
              clock_out: enrichMap.get(r.id)?.clock_out ?? null,
              latitude: enrichMap.get(r.id)?.latitude ?? null,
              longitude: enrichMap.get(r.id)?.longitude ?? null,
            }));
          } else {
            // Columns may not exist yet — try legacy column names (check_in_time / check_out_time)
            const { data: legacyData } = await supabase
              .from("hr_staff_attendance")
              .select("id, check_in_time, check_out_time")
              .eq("school_id", schoolData.id)
              .eq("attendance_date", todayDate);

            if (legacyData) {
              const legacyMap = new globalThis.Map<string, any>(legacyData.map((r: any) => [r.id, r]));
              enrichedData = baseData.map(r => ({
                ...r,
                clock_in: legacyMap.get(r.id)?.check_in_time ?? null,
                clock_out: legacyMap.get(r.id)?.check_out_time ?? null,
                latitude: null,
                longitude: null,
              }));
            }
          }
        } catch (enrichErr) {
          console.warn("Could not enrich with coordinates — columns may not exist yet:", enrichErr);
        }

        // 3. Fetch user display names
        const userIds = enrichedData.map(r => r.user_id);
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);

        if (profErr) console.warn("Failed to fetch user profiles:", profErr.message);

        const profileMap = new globalThis.Map(profiles?.map(p => [p.id, p.display_name]) || []);
        
        attendanceRecords = enrichedData.map(rec => ({
          ...rec,
          userName: profileMap.get(rec.user_id) || `Staff Member (${rec.user_id.slice(0, 6)})`
        }));
      }

      setRecords(attendanceRecords);
    } catch (err: any) {
      console.error("Error loading heatmap data:", err);
      toast.error(`Failed to load attendance records: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // Run initial fetch
  useEffect(() => {
    fetchData();
  }, [schoolSlug]);

  // Real-time subscription hook integration
  useEffect(() => {
    if (!school?.id) return;

    const unsub = subscribeAttendance((rec: AttendanceRecord) => {
      // Check if it belongs to this school
      if (rec.school_id !== school.id) return;
      
      toast.info("Real-time check-in recorded! Updating map...");
      // Re-fetch everything to ensure display name and latest data are loaded correctly
      fetchData();
    });

    return () => unsub();
  }, [school?.id]);

  // Radar sweeping animation logic
  useEffect(() => {
    let animationFrameId: number;
    
    const updateRadar = () => {
      setRadarAngle((angle) => (angle + 0.015) % (Math.PI * 2));
      animationFrameId = requestAnimationFrame(updateRadar);
    };
    
    animationFrameId = requestAnimationFrame(updateRadar);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Compute final plotted points with canvas coordinates
  const plottedPoints = useMemo<ExtendedPoint[]>(() => {
    const canvas = canvasRef.current;
    if (!canvas || records.length === 0) return [];
    
    return records
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => {
        const { x, y } = latLngToCanvas(r.latitude, r.longitude, canvas.width, canvas.height);
        const distance = getDistance(schoolCenter.lat, schoolCenter.lng, r.latitude, r.longitude);
        
        return {
          id: r.id || String(Math.random()),
          x,
          y,
          latitude: r.latitude,
          longitude: r.longitude,
          timestamp: new Date(r.created_at || Date.now()).getTime(),
          userName: r.userName || "Staff Member",
          status: r.status,
          clockIn: r.clock_in,
          distance
        };
      });
  }, [records, schoolCenter]);

  // Handle canvas mouse move to detect hovered points
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || plottedPoints.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    // Translate client mouse coordinates to canvas pixels
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // Find closest point within a 16-pixel radius
    let found: ExtendedPoint | null = null;
    let minDistance = 16;

    plottedPoints.forEach(p => {
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        found = p;
      }
    });

    setHoveredPoint(found);
  };

  // Render visual graphic on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear background
    ctx.clearRect(0, 0, width, height);

    // 2. Draw modern digital blueprint/grid background
    ctx.strokeStyle = "rgba(99, 102, 241, 0.06)";
    ctx.lineWidth = 1;
    const gridSize = 40;
    
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Draw radar target concentric rings (centered at campus coordinates)
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Scale mapping for geofence circle
    // Check-in coordinates mapped to canvas to obtain scale
    const sampleCoord = latLngToCanvas(schoolCenter.lat + 0.0009, schoolCenter.lng, width, height);
    const scale = sampleCoord.scale; // pixels per meter
    const geofenceRadius = 100 * scale; // 100 meters geofence mapped to pixels

    // Concentric ring guides
    ctx.lineWidth = 1;
    [0.5, 1.0, 1.5, 2.0].forEach(multiplier => {
      ctx.strokeStyle = multiplier === 1.0 
        ? "rgba(16, 185, 129, 0.25)" // Geofence ring colored green
        : "rgba(99, 102, 241, 0.12)";
        
      ctx.setLineDash(multiplier === 1.0 ? [4, 4] : []);
      ctx.beginPath();
      ctx.arc(centerX, centerY, geofenceRadius * multiplier, 0, Math.PI * 2);
      ctx.stroke();

      // Draw text indicator for 100m ring
      if (multiplier === 1.0) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.5)";
        ctx.font = "9px monospace";
        ctx.fillText("100m Geofence", centerX + geofenceRadius + 6, centerY + 3);
      }
    });
    ctx.setLineDash([]); // Reset dashed lines

    // 4. Draw moving Radar sweep line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, width, radarAngle - 0.2, radarAngle);
    ctx.closePath();
    
    const sweepGradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, width / 2);
    sweepGradient.addColorStop(0, "rgba(99, 102, 241, 0.12)");
    sweepGradient.addColorStop(1, "rgba(99, 102, 241, 0)");
    ctx.fillStyle = sweepGradient;
    ctx.fill();
    ctx.restore();

    // 5. Render heat points with gradient overlay
    plottedPoints.forEach((p) => {
      const isPresent = p.status === "present";
      const colorHex = isPresent ? "16, 185, 129" : "239, 68, 68"; // Emerald or Rose
      
      const pointGradient = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 42);
      pointGradient.addColorStop(0, `rgba(${colorHex}, 0.5)`);
      pointGradient.addColorStop(0.3, `rgba(${colorHex}, 0.2)`);
      pointGradient.addColorStop(1, `rgba(${colorHex}, 0)`);
      
      ctx.fillStyle = pointGradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 42, 0, Math.PI * 2);
      ctx.fill();

      // Inner solid core dot
      ctx.fillStyle = isPresent ? "#10b981" : "#ef4444";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Ring border around dot
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 6. Draw Campus Center Point (Pin)
    ctx.fillStyle = "#6366f1";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Small pulsing outer ring for center pin
    const pulsingRadius = 6 + Math.abs(Math.sin(radarAngle * 2) * 5);
    ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulsingRadius, 0, Math.PI * 2);
    ctx.stroke();

  }, [plottedPoints, radarAngle, schoolCenter]);

  const activeCheckIns = plottedPoints.length;

  return (
    <div className="space-y-6">
      {/* Overview Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active Staff Checked-In</p>
            <p className="text-2xl font-bold font-display tracking-tight mt-0.5">{activeCheckIns}</p>
          </div>
        </div>

        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Inside 100m Geofence</p>
            <p className="text-2xl font-bold font-display tracking-tight mt-0.5">
              {plottedPoints.filter(p => p.distance !== null && p.distance <= 100).length}
            </p>
          </div>
        </div>

        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Outside Geofence</p>
            <p className="text-2xl font-bold font-display tracking-tight mt-0.5">
              {plottedPoints.filter(p => p.distance !== null && p.distance > 100).length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Canvas Map Wrapper */}
        <div className="lg:col-span-2 relative bg-card/65 backdrop-blur-md border border-border/80 rounded-3xl overflow-hidden shadow-elevated flex flex-col min-h-[500px]">
          {/* Map Header Status Bar */}
          <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              <span className="text-xs font-semibold tracking-wide text-foreground uppercase">Campus Radar Feed</span>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchData} 
                className="h-8 text-[11px] font-medium rounded-lg border-border/85"
                disabled={loading}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Fetch Status
              </Button>
            </div>
          </div>

          {/* Interactive Tooltip Bubble */}
          {hoveredPoint && (
            <div 
              className="absolute z-20 bg-card/95 border border-border/90 rounded-2xl shadow-xl p-3 text-xs w-48 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
              style={{ 
                left: `${Math.min(hoveredPoint.x / 800 * 100, 75)}%`, 
                top: `${Math.min(hoveredPoint.y / 500 * 100 + 4, 80)}%` 
              }}
            >
              <p className="font-bold flex items-center gap-1.5 text-foreground truncate">
                <span className={`h-2 w-2 rounded-full ${hoveredPoint.status === "present" ? "bg-emerald-500" : "bg-rose-500"}`} />
                {hoveredPoint.userName}
              </p>
              <div className="mt-2 space-y-1 text-muted-foreground font-mono text-[10px] leading-tight">
                <p>Lat: {hoveredPoint.latitude.toFixed(5)}</p>
                <p>Lng: {hoveredPoint.longitude.toFixed(5)}</p>
                <p>Range: {hoveredPoint.distance} meters</p>
                <p>Time: {new Date(hoveredPoint.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          )}

          {/* Canvas Render Area */}
          <div className="relative flex-1 bg-slate-950 flex items-center justify-center p-2">
            {loading && records.length === 0 ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/70 text-slate-300">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-medium mt-3 font-mono">Initializing Heat Radar...</p>
              </div>
            ) : plottedPoints.length === 0 ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/40 text-center px-6 text-slate-300">
                <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 mb-4 animate-pulse">
                  <Compass className="h-7 w-7" />
                </div>
                <p className="font-display font-semibold text-sm">No Location Heatmaps Generated Today</p>
                <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                  There are no verified coordinates logged for staff check-ins yet. Live updates will sync here in real time as staff check in via the mobile app.
                </p>
              </div>
            ) : null}

            <canvas 
              ref={canvasRef} 
              width={800} 
              height={500} 
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
              className="w-full h-full aspect-[8/5] block cursor-crosshair rounded-xl border border-white/5"
            />
          </div>

          {/* Canvas Footer Coordinates */}
          <div className="p-3 border-t border-border/60 bg-muted/10 flex justify-between items-center text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Center: {schoolCenter.lat.toFixed(4)}°, {schoolCenter.lng.toFixed(4)}°
            </span>
            <span>Scale bounds: dynamic autofit</span>
          </div>
        </div>

        {/* Recent Sidebar Checkins List */}
        <div className="lg:col-span-1 bg-card/65 backdrop-blur-md border border-border/80 rounded-3xl p-5 flex flex-col h-[560px] shadow-elevated">
          <div>
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Compass className="h-4.5 w-4.5 text-primary" />
              Recent Logs
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Today's geo-referenced check-in trail</p>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-2.5 scrollbar-thin">
            {plottedPoints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
                <Clock className="h-8 w-8 opacity-40 mb-2" />
                <p className="text-xs font-semibold">No logs parsed today</p>
                <p className="text-[10px] mt-1">Check-in trails will appear here dynamically.</p>
              </div>
            ) : (
              plottedPoints.map((p) => {
                const isVerified = p.distance !== null && p.distance <= 100;
                return (
                  <div 
                    key={p.id}
                    className="p-3 rounded-2xl border bg-muted/15 hover:bg-muted/30 transition-all border-border/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground truncate">{p.userName}</p>
                      
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        
                        <span>•</span>
                        
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {p.distance ? `${p.distance}m` : '0m'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge 
                        variant="outline" 
                        className={p.status === "present" ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-600 text-[9px] px-1.5 py-0 h-4.5 rounded-md uppercase" : "border-rose-500/50 bg-rose-500/5 text-rose-600 text-[9px] px-1.5 py-0 h-4.5 rounded-md uppercase"}
                      >
                        {p.status}
                      </Badge>
                      
                      <span className={`text-[9px] font-semibold ${isVerified ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {isVerified ? "On Campus" : "Off Campus"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
