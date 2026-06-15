import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase, USE_FASTAPI, setUseFastAPI } from "@/integrations/supabase/client";
import { apiClient, isNetworkOrProxyError } from "@/lib/api-client";
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
  AlertTriangle,
  PlayCircle,
  Eye,
  Settings,
  ShieldAlert,
  Sparkles,
  Search
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
  const [zoomRange, setZoomRange] = useState(200); // meters scale
  const [filter, setFilter] = useState<"all" | "on_campus" | "off_campus" | "late">("all");
  const [searchQuery, setSearchQuery] = useState("");

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

    // Map offsets to canvas bounds (with 15% padding)
    const paddingMultiplier = 1.15;
    const scale = (Math.min(width, height) / 2) / (maxOffset * paddingMultiplier);
    
    const x = width / 2 + xOffset * scale;
    const y = height / 2 - yOffset * scale; // Invert Y for canvas coordinate system
    
    return { x, y, scale };
  };

  const todayDate = useMemo(() => new Date().toLocaleDateString("sv-SE"), []); // YYYY-MM-DD

  // Fetch school details and today's attendance records
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      let schoolData: any = null;
      let attendanceRecords: any[] = [];

      const runSupabaseFetch = async () => {
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
          return;
        }
        setSchool(schoolData);

        // 2. Fetch today's attendance records
        const { data: baseData, error: baseErr } = await supabase
          .from("hr_staff_attendance")
          .select("id, user_id, status, created_at, attendance_date, clock_in, clock_out, latitude, longitude")
          .eq("school_id", schoolData.id)
          .eq("attendance_date", todayDate);

        if (baseErr) throw baseErr;

        if (!baseData || baseData.length === 0) {
          setRecords([]);
          return;
        }

        // Fetch user display names
        const userIds = baseData.map(r => r.user_id);
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);

        if (profErr) console.warn("Failed to fetch user profiles:", profErr.message);

        const profileMap = new globalThis.Map(profiles?.map(p => [p.id, p.display_name]) || []);
        
        attendanceRecords = baseData.map(rec => ({
          ...rec,
          userName: profileMap.get(rec.user_id) || `Staff Member (${rec.user_id.slice(0, 6)})`
        }));
        setRecords(attendanceRecords);
      };

      let useFastApiActive = USE_FASTAPI;
      if (useFastApiActive) {
        try {
          const schoolResp = await apiClient.get(`/schools/by-slug/${schoolSlug}`);
          schoolData = schoolResp.data;
          if (schoolData) {
            setSchool(schoolData);
            const todayDate = new Date().toLocaleDateString("sv-SE");
            const attResp = await apiClient.get(`/attendance/staff-today?school_id=${schoolData.id}&date=${todayDate}`);
            attendanceRecords = attResp.data;
            setRecords(attendanceRecords);
          }
        } catch (apiErr: any) {
          if (isNetworkOrProxyError(apiErr)) {
            console.warn("Failed to fetch staff attendance via FastAPI, falling back to Supabase", apiErr);
            setUseFastAPI(false);
            useFastApiActive = false;
          } else {
            throw apiErr;
          }
        }
      }

      if (!useFastApiActive) {
        await runSupabaseFetch();
      }
    } catch (err: any) {
      console.error("Error loading heatmap data:", err);
      toast.error(`Failed to load attendance records: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [schoolSlug, todayDate]);

  // Run initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription hook integration
  useEffect(() => {
    if (!school?.id) return;

    const unsub = subscribeAttendance(async (rec: AttendanceRecord) => {
      if (rec.school_id !== school.id) return;
      
      let displayName = `Staff Member (${rec.user_id.slice(0, 6)})`;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", rec.user_id)
          .single();
        if (profile?.display_name) {
          displayName = profile.display_name;
        }
      } catch (err) {
        console.warn("Failed to fetch profile for real-time attendance update:", err);
      }

      const newRecord = {
        ...rec,
        userName: displayName
      };

      setRecords(prev => {
        // Prevent duplicates
        const filtered = prev.filter(r => r.id !== rec.id && !(r.user_id === rec.user_id && r.attendance_date === rec.attendance_date));
        return [newRecord, ...filtered];
      });

      toast.success(`Real-time telemetry update for ${displayName}!`);
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

  // Compute final plotted points using static 800x500 bounds to bypass early canvas mount gotcha
  const plottedPoints = useMemo<ExtendedPoint[]>(() => {
    if (records.length === 0) return [];
    
    return records
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => {
        const { x, y } = latLngToCanvas(r.latitude, r.longitude, 800, 500, zoomRange);
        const distance = getDistance(schoolCenter.lat, schoolCenter.lng, r.latitude, r.longitude);
        
        return {
          id: r.id || String(Math.random()),
          x,
          y,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          timestamp: new Date(r.created_at || Date.now()).getTime(),
          userName: r.userName || "Staff Member",
          status: r.status,
          clockIn: r.clock_in,
          distance
        };
      });
  }, [records, schoolCenter, zoomRange]);

  // Filtered Points based on geofence & status and search text
  const filteredPoints = useMemo(() => {
    return plottedPoints.filter(p => {
      const isWithinGeofence = p.distance !== null && p.distance <= 100;
      
      // 1. Check Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!p.userName.toLowerCase().includes(q)) return false;
      }

      // 2. Check geofence status filter
      if (filter === "on_campus") return isWithinGeofence;
      if (filter === "off_campus") return !isWithinGeofence;
      if (filter === "late") return p.status === "late";
      return true;
    });
  }, [plottedPoints, filter, searchQuery]);

  // Handle canvas mouse move to detect hovered points
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || filteredPoints.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // Find closest point within a 16-pixel radius
    let found: ExtendedPoint | null = null;
    let minDistance = 16;

    filteredPoints.forEach(p => {
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

  // Render high fidelity HUD graphic on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Helper to dynamically read theme colors from document styles (supporting raw HSL parameters)
    const getThemeColor = (varName: string, opacity?: number) => {
      const el = canvasRef.current || document.documentElement;
      const val = getComputedStyle(el).getPropertyValue(varName).trim();
      if (val && !val.startsWith("hsl") && !val.startsWith("#") && !val.startsWith("rgb")) {
        return opacity !== undefined ? `hsl(${val} / ${opacity})` : `hsl(${val})`;
      }
      return val || "rgba(99, 102, 241, 1)";
    };

    const bgColor = getThemeColor("--card");
    const foregroundColor = getThemeColor("--foreground");
    const primaryColor = getThemeColor("--primary");
    const borderColor = getThemeColor("--border");
    const mutedForegroundColor = getThemeColor("--muted-foreground");
    const successColor = getThemeColor("--success", 1) || "#10b981";
    const warningColor = getThemeColor("--warning", 1) || "#f59e0b";

    // 1. Futuristic Theme-Aware BG
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Cyber grid background
    ctx.strokeStyle = getThemeColor("--border", 0.35);
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

    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate geofence bounds
    const sampleCoord = latLngToCanvas(schoolCenter.lat + 0.0009, schoolCenter.lng, width, height, zoomRange);
    const scale = sampleCoord.scale;
    const geofenceRadius = 100 * scale; // geofence is 100 meters

    // 3. Crosshairs
    ctx.strokeStyle = getThemeColor("--border", 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Degree coordinates
    ctx.fillStyle = mutedForegroundColor;
    ctx.font = "bold 8px monospace";
    ctx.fillText("000° N", centerX + 6, 14);
    ctx.fillText("090° E", width - 38, centerY - 6);
    ctx.fillText("180° S", centerX + 6, height - 8);
    ctx.fillText("270° W", 8, centerY - 6);

    // 4. Geofence aura circle filled green/success
    ctx.fillStyle = getThemeColor("--success", 0.03);
    ctx.beginPath();
    ctx.arc(centerX, centerY, geofenceRadius, 0, Math.PI * 2);
    ctx.fill();

    // 5. Radar Concentric Rings
    const rings = [50, 100, 200, 300, 400, 500, 1000];
    rings.forEach(dist => {
      const radius = dist * scale;
      if (radius > width) return;

      const isGeofence = dist === 100;
      ctx.strokeStyle = isGeofence 
        ? getThemeColor("--success", 0.45) 
        : getThemeColor("--border", 0.4);
      
      if (isGeofence) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isGeofence ? getThemeColor("--success", 0.8) : getThemeColor("--muted-foreground", 0.7);
      ctx.font = "8px monospace";
      ctx.fillText(`${dist}m`, centerX + radius + 4, centerY + 3);
    });
    ctx.setLineDash([]);

    // 6. Glowing Radar Sweep Line
    ctx.save();
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height));
    grad.addColorStop(0, getThemeColor("--primary", 0.22));
    grad.addColorStop(0.4, getThemeColor("--primary", 0.08));
    grad.addColorStop(1, "transparent");

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, Math.max(width, height), radarAngle - 0.25, radarAngle);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 7. Render Plotted Check-In Blips
    filteredPoints.forEach((p) => {
      const isWithinGeofence = p.distance !== null && p.distance <= 100;
      const colorHex = isWithinGeofence ? successColor : warningColor;
      const colorGlow = isWithinGeofence ? getThemeColor("--success", 0.25) : getThemeColor("--warning", 0.25);

      // Pulsing outer halo
      const pulseRate = Date.now() / 200 + p.timestamp;
      const pulsingRadius = 5 + (Math.sin(pulseRate) * 2.5);
      
      ctx.strokeStyle = colorGlow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulsingRadius * 2.2, 0, Math.PI * 2);
      ctx.stroke();

      // Targeting Reticle Ring
      ctx.strokeStyle = isWithinGeofence ? getThemeColor("--success", 0.18) : getThemeColor("--warning", 0.18);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Targeting reticle lines
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y);
      ctx.lineTo(p.x + 7, p.y);
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x, p.y + 7);
      ctx.stroke();

      // Glowing heat core
      const blipGrad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 7);
      blipGrad.addColorStop(0, "#ffffff");
      blipGrad.addColorStop(0.5, colorHex);
      blipGrad.addColorStop(1, "transparent");

      ctx.fillStyle = blipGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();

      // Solid central core dot
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Point Tag Text
      ctx.fillStyle = foregroundColor;
      ctx.font = "bold 9.5px monospace";
      ctx.shadowColor = bgColor;
      ctx.shadowBlur = 3;
      ctx.fillText(p.userName.split(" ")[0], p.x + 10, p.y - 4);
      
      ctx.fillStyle = isWithinGeofence ? successColor : warningColor;
      ctx.font = "8px monospace";
      ctx.fillText(`${p.distance ? Math.round(p.distance) : 0}m`, p.x + 10, p.y + 6);
      ctx.shadowBlur = 0;
    });

    // 8. Campus HQ center marker
    ctx.save();
    const hqPulse = 9 + Math.abs(Math.sin(Date.now() / 350) * 3);
    
    // Glowing central HQ gradient
    const hqGrad = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, hqPulse * 2.2);
    hqGrad.addColorStop(0, getThemeColor("--primary", 0.45));
    hqGrad.addColorStop(0.5, getThemeColor("--primary", 0.12));
    hqGrad.addColorStop(1, "transparent");
    ctx.fillStyle = hqGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, hqPulse * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Shield/Hex HQ Core
    ctx.strokeStyle = bgColor;
    ctx.fillStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let side = 0; side < 6; side++) {
      const angle = (side * Math.PI) / 3;
      const x = centerX + 7 * Math.cos(angle);
      const y = centerY + 7 * Math.sin(angle);
      if (side === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 9. Telemetry data feeds overlay
    ctx.fillStyle = getThemeColor("--muted-foreground", 0.7);
    ctx.font = "9px monospace";
    ctx.fillText("GRID RESOLUTION: HIGH-LATENCY", 16, 26);
    ctx.fillText(`GEO-LOCK: LAT ${schoolCenter.lat.toFixed(6)}`, 16, 39);
    ctx.fillText(`          LNG ${schoolCenter.lng.toFixed(6)}`, 16, 49);
    ctx.fillText(`SYS_SCAN_REFRESH: 60.12HZ`, 16, 62);

    ctx.fillText(`ZOOM_SCALE: ${zoomRange}M`, width - 128, 26);
    ctx.fillText(`SCAN_COUNT: ${filteredPoints.length}`, width - 128, 39);
    ctx.fillText(`WAVE_ANGLE: ${Math.round((radarAngle * 180) / Math.PI)}°`, width - 128, 49);

  }, [filteredPoints, radarAngle, schoolCenter, zoomRange]);

  // Demo simulator for checking in staff and showing it live on the radar
  const simulateCheckIn = () => {
    const firstNames = ["Prof. John", "Sarah", "Michael", "Ayesha", "Bilal", "Dr. Elizabeth", "Robert", "Maria"];
    const lastNames = ["Doe", "Jenkins", "Chang", "Malik", "Ahmed", "Stone", "Vance", "Garcia"];
    const randomName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    
    // 60% chance inside geofence (within 0.0008 deg), 40% chance outside
    const isInside = Math.random() > 0.4;
    const latOffset = (Math.random() - 0.5) * (isInside ? 0.0008 : 0.0035);
    const lngOffset = (Math.random() - 0.5) * (isInside ? 0.0008 : 0.0035);
    
    const simRecord = {
      id: `sim-${Math.random().toString(36).substr(2, 9)}`,
      user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
      userName: randomName,
      status: Math.random() > 0.25 ? "present" : "late",
      created_at: new Date().toISOString(),
      attendance_date: new Date().toLocaleDateString("sv-SE"),
      clock_in: new Date().toISOString(),
      clock_out: null,
      latitude: schoolCenter.lat + latOffset,
      longitude: schoolCenter.lng + lngOffset,
    };
    
    setRecords(prev => [simRecord, ...prev]);
    toast.success(`[SIMULATOR] Real-time georeferenced check-in received for ${randomName}!`);
  };

  const activeCheckIns = records.filter(r => r.latitude != null && r.longitude != null).length;

  return (
    <div className="space-y-6">
      {/* Overview Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium card-premium-hover p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Active Staff</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5 text-foreground">{activeCheckIns}</p>
          </div>
        </div>

        <div className="card-premium card-premium-hover p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">On-Campus (Safe)</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5 text-foreground">
              {plottedPoints.filter(p => p.distance !== null && p.distance <= 100).length}
            </p>
          </div>
        </div>

        <div className="card-premium card-premium-hover p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Off-Campus Range</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5 text-foreground">
              {plottedPoints.filter(p => p.distance !== null && p.distance > 100).length}
            </p>
          </div>
        </div>

        <div className="card-premium card-premium-hover p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0 border border-rose-500/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Scans (All Logs)</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5 text-foreground">{records.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Canvas Map Wrapper */}
        <div className="lg:col-span-2 relative card-premium overflow-hidden flex flex-col min-h-[520px]">
          {/* Map Header Status Bar */}
          <div className="p-4 border-b border-border bg-card flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <div>
                <span className="text-xs font-bold tracking-wider text-foreground uppercase font-mono">CAMPUS RADAR telemetry</span>
                <p className="text-[9px] text-muted-foreground font-mono">FEED STAT: GEOLOCKED // MULTI-SCAN ACTIVE</p>
              </div>
            </div>

            {/* Scale and zoom controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
                <span className="px-2 text-[9px] font-mono text-muted-foreground uppercase">Scale:</span>
                {[50, 100, 200, 500].map((rng) => (
                  <button
                    key={rng}
                    onClick={() => setZoomRange(rng)}
                    className={`px-2 py-1 text-[10px] font-mono rounded-md transition-all ${
                      zoomRange === rng 
                        ? 'bg-primary text-primary-foreground font-bold' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {rng}m
                  </button>
                ))}
              </div>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchData} 
                className="h-8 text-[11px] font-mono rounded-lg border-border bg-background text-foreground hover:bg-muted"
                disabled={loading}
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                SYNC
              </Button>
            </div>
          </div>

          {/* Interactive Tooltip Bubble */}
          {hoveredPoint && (
            <div 
              className="absolute z-20 bg-card/95 border border-primary/30 rounded-2xl shadow-2xl p-3.5 text-xs w-52 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 backdrop-blur-md"
              style={{ 
                left: `${Math.min(hoveredPoint.x / 800 * 100, 75)}%`, 
                top: `${Math.min(hoveredPoint.y / 500 * 100 + 4, 80)}%` 
              }}
            >
              <p className="font-bold flex items-center gap-2 text-foreground">
                <span className={`h-2 w-2 rounded-full ${hoveredPoint.status === "present" ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"}`} />
                {hoveredPoint.userName}
              </p>
              <div className="mt-2.5 space-y-1.5 text-muted-foreground font-mono text-[10px] leading-tight border-t border-border pt-2">
                <p className="flex justify-between"><span>Latitude:</span> <span className="text-foreground">{hoveredPoint.latitude.toFixed(6)}</span></p>
                <p className="flex justify-between"><span>Longitude:</span> <span className="text-foreground">{hoveredPoint.longitude.toFixed(6)}</span></p>
                <p className="flex justify-between"><span>Geodist:</span> <span className="text-primary font-semibold">{hoveredPoint.distance}m</span></p>
                <p className="flex justify-between"><span>Log Time:</span> <span className="text-foreground">{new Date(hoveredPoint.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></p>
              </div>
            </div>
          )}

          {/* Canvas Render Area */}
          <div className="relative flex-1 bg-card flex items-center justify-center p-0.5">
            {loading && records.length === 0 ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 text-foreground backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-semibold mt-3 font-mono text-primary">ESTABLISHING SATELLITE GEO-LINK...</p>
              </div>
            ) : filteredPoints.length === 0 ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/30 text-center px-8 text-foreground">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/25 mb-4 animate-pulse">
                  <Compass className="h-7 w-7" />
                </div>
                <p className="font-display font-bold text-sm text-foreground">NO GEO-REFERENCE LOGS MATCHED</p>
                <p className="text-xs text-muted-foreground mt-2 max-w-sm leading-relaxed">
                  No checked-in staff matched the current filter. Click the simulator below or check in staff via GPS coordinates to trigger radar feedback.
                </p>
              </div>
            ) : null}

            <canvas 
              ref={canvasRef} 
              width={800} 
              height={500} 
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
              className="w-full h-full aspect-[8/5] block cursor-crosshair rounded-xl"
            />
          </div>

          {/* Canvas Footer Coordinates */}
          <div className="p-3 border-t border-border bg-card flex justify-between items-center text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Center Anchor: {schoolCenter.lat.toFixed(6)}N, {schoolCenter.lng.toFixed(6)}E
            </span>
            <span className="text-[9px] text-primary/80 animate-pulse uppercase tracking-wider font-semibold">
              ● SCANNING RANGE: {zoomRange} METERS
            </span>
          </div>
        </div>

        {/* Sidebar Log Trail Panel */}
        <div className="lg:col-span-1 card-premium p-5 flex flex-col h-[520px]">
          {/* Sidebar Header */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2 text-foreground">
                <Compass className="h-4 w-4 text-primary animate-spin-slow" />
                Telemetry Logs
              </h3>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary font-mono text-[9px] px-2 py-0">
                LIVE TRAIL
              </Badge>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-all font-mono"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
              {[
                { id: "all", label: "All Scans" },
                { id: "on_campus", label: "On Campus" },
                { id: "off_campus", label: "Off Campus" },
                { id: "late", label: "Lates" },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id as any)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                    filter === item.id 
                      ? 'bg-primary/20 text-primary border border-primary/30 font-semibold' 
                      : 'bg-background text-muted-foreground border border-border hover:text-foreground'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Section */}
          <div className="flex-1 overflow-y-auto mt-3.5 space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-border">
            {filteredPoints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground font-mono">
                <Clock className="h-6 w-6 opacity-30 mb-2 text-primary animate-pulse" />
                <p className="text-[10px] font-semibold text-muted-foreground">NO LIVE FEEDS RECORDED</p>
                <p className="text-[9px] mt-1 text-muted-foreground/80">Georeferenced scans show up here in real time.</p>
              </div>
            ) : (
              filteredPoints.map((p) => {
                const isWithinGeofence = p.distance !== null && p.distance <= 100;
                return (
                  <div 
                    key={p.id}
                    className="p-3 rounded-2xl border transition-all duration-200 flex items-start justify-between gap-3 text-xs bg-background/60 border-border/80 hover:border-border hover:bg-muted shadow-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground truncate font-mono">{p.userName}</p>
                      
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0 text-primary" />
                          {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        
                        <span>•</span>
                        
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0 text-primary" />
                          {p.distance ? `${p.distance}m` : '0m'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge 
                        variant="outline" 
                        className={
                          p.status === "present" 
                            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500 text-[8px] font-mono px-2 py-0 h-4.5 rounded uppercase" 
                            : "border-rose-500/30 bg-rose-500/5 text-rose-400 text-[8px] font-mono px-2 py-0 h-4.5 rounded uppercase"
                        }
                      >
                        {p.status}
                      </Badge>
                      
                      <span className={`text-[9px] font-semibold font-mono ${isWithinGeofence ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {isWithinGeofence ? "CAMPUS ZONE" : "OUTSIDE RANGE"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Simulator Control for Demonstration/Testing */}
          <div className="border-t border-border pt-3 mt-3">
            <Button
              onClick={simulateCheckIn}
              className="w-full h-8.5 text-[10px] font-mono font-bold tracking-wider rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground flex items-center justify-center gap-1.5 border border-primary/20 shadow-md shadow-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground animate-pulse" />
              SIMULATE LIVE CHECK-IN
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
