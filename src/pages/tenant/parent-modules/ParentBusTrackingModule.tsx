import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, User, ShieldCheck, MapPin, Compass, AlertCircle, 
  Map, PhoneCall, RefreshCw, Navigation, Play, Pause
} from "lucide-react";
import { toast } from "sonner";
import BusTrackingMap from "@/components/parent/BusTrackingMap";

interface BusStop {
  id: string;
  stop_name: string;
  latitude: number | null;
  longitude: number | null;
  stop_order: number;
  estimated_arrival_time: string | null;
}

interface BusInfo {
  id: string;
  bus_number: string;
  license_plate: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_photo_url: string | null;
  conductor_name: string | null;
  conductor_phone: string | null;
  status: string | null;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  route: {
    id: string;
    route_name: string;
    start_location: string | null;
    end_location: string | null;
    stops: BusStop[];
  } | null;
}

interface ChildBusInfo {
  student_id: string;
  student_name: string;
  bus: BusInfo | null;
  stop: BusStop | null;
  pickup_type: string | null;
}

export default function ParentBusTrackingModule() {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const { user } = useSession();
  const [loading, setLoading] = useState(true);
  const [assignedBuses, setAssignedBuses] = useState<ChildBusInfo[]>([]);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [liveLat, setLiveLat] = useState<number | null>(null);
  const [liveLng, setLiveLng] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);

  const fetchBusInfo = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get<ChildBusInfo[]>("/transport/my-bus");
      setAssignedBuses(resp.data || []);
      
      // Select first child's bus
      const childBus = resp.data?.[0];
      if (childBus?.bus) {
        setLiveLat(childBus.bus.last_known_latitude);
        setLiveLng(childBus.bus.last_known_longitude);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load transport details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusInfo();
  }, []);

  // Poll for live GPS coordinates if not simulating
  useEffect(() => {
    if (isSimulating || assignedBuses.length === 0) return;
    const activeBus = assignedBuses[selectedChildIndex]?.bus;
    if (!activeBus) return;

    const interval = setInterval(async () => {
      try {
        const resp = await apiClient.get<{ latitude: number; longitude: number } | null>(
          `/transport/bus/${activeBus.id}/live`
        );
        if (resp.data) {
          setLiveLat(resp.data.latitude);
          setLiveLng(resp.data.longitude);
        }
      } catch (e) {
        // Silent catch
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [assignedBuses, selectedChildIndex, isSimulating]);

  // Simulation support since physical GPS devices aren't deployed yet
  useEffect(() => {
    if (!isSimulating) return;

    const childBus = assignedBuses[selectedChildIndex];
    const stops = childBus?.bus?.route?.stops || [];
    if (stops.length === 0) return;

    // Generate route interpolation points between stops
    const points: [number, number][] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i];
      const end = stops[i + 1];
      if (start.latitude && start.longitude && end.latitude && end.longitude) {
        // Interpolate 10 points between each stop
        for (let j = 0; j < 10; j++) {
          const ratio = j / 10;
          points.push([
            start.latitude + (end.latitude - start.latitude) * ratio,
            start.longitude + (end.longitude - start.longitude) * ratio,
          ]);
        }
      }
    }

    if (points.length === 0) return;

    const interval = setInterval(() => {
      setSimStep((prev) => {
        const next = (prev + 1) % points.length;
        setLiveLat(points[next][0]);
        setLiveLng(points[next][1]);
        return next;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isSimulating, assignedBuses, selectedChildIndex]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (assignedBuses.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-2" />
        <h3 className="font-display text-base font-bold text-slate-800">No assigned transport</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Your children are not currently registered for school transport. Contact administration to request a bus route.
        </p>
      </div>
    );
  }

  const selectedChildBus = assignedBuses[selectedChildIndex];
  const bus = selectedChildBus?.bus;
  const stops = bus?.route?.stops || [];
  const myStop = selectedChildBus?.stop;

  // Mock route points Lahore context if data is empty (safeguard)
  const defaultStops: BusStop[] = stops.length > 0 ? stops : [
    { id: "s1", stop_name: "School Campus", latitude: 31.5204, longitude: 74.3587, stop_order: 1, estimated_arrival_time: "07:30 AM" },
    { id: "s2", stop_name: "Model Town Stop", latitude: 31.4804, longitude: 74.3287, stop_order: 2, estimated_arrival_time: "07:45 AM" },
    { id: "s3", stop_name: "DHA H Block Stop", latitude: 31.4704, longitude: 74.3787, stop_order: 3, estimated_arrival_time: "08:05 AM" },
  ];

  const mapStops = defaultStops;
  const mapLat = liveLat || (bus ? bus.last_known_latitude : null) || (isSimulating ? defaultStops[0].latitude : 31.5004);
  const mapLng = liveLng || (bus ? bus.last_known_longitude : null) || (isSimulating ? defaultStops[0].longitude : 74.3487);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Bus Tracking</h1>
          <p className="text-xs text-slate-400">Live GPS tracking and transport details</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchBusInfo} className="h-8 gap-1.5 border-slate-200">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Child selector if multiple children */}
      {assignedBuses.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {assignedBuses.map((child, idx) => (
            <button
              key={child.student_id}
              onClick={() => {
                setSelectedChildIndex(idx);
                setIsSimulating(false);
                if (child.bus) {
                  setLiveLat(child.bus.last_known_latitude);
                  setLiveLng(child.bus.last_known_longitude);
                }
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold whitespace-nowrap transition-all border ${
                selectedChildIndex === idx
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-white border-slate-100 text-slate-655 hover:bg-slate-50"
              }`}
            >
              {child.student_name}
            </button>
          ))}
        </div>
      )}

      {!bus ? (
        <Card className="border-blue-50 shadow-sm">
          <CardContent className="p-12 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-slate-300 mb-2" />
            <h3 className="font-display text-sm font-bold text-slate-800">Transport Not Assigned</h3>
            <p className="text-xs text-slate-400 mt-1">
              No active bus route matches the records for {selectedChildBus.student_name}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-blue-50 overflow-hidden shadow-sm">
              <CardHeader className="py-4 border-b flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-slate-800">
                  <Map className="h-4 w-4 text-blue-600" />
                  Live Map View
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] py-0.5 border-slate-200 text-slate-500 font-bold bg-slate-50">
                    Route: {bus.route?.route_name || "School Bus Route"}
                  </Badge>
                  {/* Simulate GPS triggers */}
                  <Button
                    size="sm"
                    variant={isSimulating ? "destructive" : "secondary"}
                    onClick={() => {
                      setIsSimulating(!isSimulating);
                      if (!isSimulating) {
                        // Set mock coordinates to Lahore Model Town stop to begin simulation
                        setLiveLat(defaultStops[0].latitude);
                        setLiveLng(defaultStops[0].longitude);
                        setSimStep(0);
                      }
                    }}
                    className="h-7 text-[10px] font-bold px-2.5 rounded-lg flex items-center gap-1"
                  >
                    {isSimulating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {isSimulating ? "Stop Simulation" : "Demo GPS Tracker"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[350px] md:h-[450px]">
                <BusTrackingMap
                  stops={mapStops}
                  busLatitude={mapLat}
                  busLongitude={mapLng}
                  childStopId={myStop?.id || null}
                />
              </CardContent>
            </Card>
          </div>

          {/* Details Sidebar */}
          <div className="space-y-6">
            {/* Bus & Driver Profile */}
            <Card className="border-blue-50 shadow-sm overflow-hidden">
              <CardHeader className="py-4 border-b bg-gradient-to-tr from-slate-50 to-white">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-slate-800">
                  <Compass className="h-4 w-4 text-blue-600" />
                  Assigned Transport
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Vehicle Details */}
                <div className="flex justify-between items-center bg-blue-50/30 border border-blue-100/50 rounded-xl p-3.5">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bus Number</p>
                    <p className="font-display text-base font-black text-slate-800 mt-0.5">{bus.bus_number}</p>
                  </div>
                  {bus.license_plate && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">License Plate</p>
                      <Badge variant="outline" className="mt-1 border-blue-200 text-blue-700 bg-white font-mono font-bold text-xs uppercase px-2 py-0.5">
                        {bus.license_plate}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Driver */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-655">
                      <User className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Driver Contact</p>
                      <p className="text-xs font-bold text-slate-850 truncate mt-0.5">{bus.driver_name || "Not Assigned"}</p>
                    </div>
                    {bus.driver_phone && (
                      <a
                        href={`tel:${bus.driver_phone}`}
                        className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <PhoneCall className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  {/* Conductor */}
                  {bus.conductor_name && (
                    <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-655">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conductor Contact</p>
                        <p className="text-xs font-bold text-slate-850 truncate mt-0.5">{bus.conductor_name}</p>
                      </div>
                      {bus.conductor_phone && (
                        <a
                          href={`tel:${bus.conductor_phone}`}
                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <PhoneCall className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stop details */}
            {myStop && (
              <Card className="border-blue-50 shadow-sm">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-slate-800">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Pickup Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Child's Assigned Stop</p>
                    <p className="text-xs font-extrabold text-slate-800 leading-relaxed">{myStop.stop_name}</p>
                    {myStop.address && <p className="text-[10px] text-slate-500">{myStop.address}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Time</p>
                      <p className="text-xs font-black text-blue-700 mt-0.5">{myStop.estimated_arrival_time || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pickup Action</p>
                      <Badge className="mt-0.5 bg-blue-50 hover:bg-blue-50 text-blue-700 font-bold border border-blue-100 text-[10px] uppercase">
                        {selectedChildBus.pickup_type || "both"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Driver Disclaimer */}
            <div className="flex gap-2 items-start border border-blue-100/50 bg-blue-50/20 rounded-xl p-3.5">
              <Navigation className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-[10px] font-medium text-slate-655 leading-relaxed">
                Live location is active only when the bus driver registers the trip. In case of delay or queries, call the driver directly via the action button.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
