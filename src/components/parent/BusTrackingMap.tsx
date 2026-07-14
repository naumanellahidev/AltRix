import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

interface Stop {
  id: string;
  stop_name: string;
  latitude: number | null;
  longitude: number | null;
  stop_order: number;
}

interface BusTrackingMapProps {
  stops: Stop[];
  busLatitude: number | null;
  busLongitude: number | null;
  childStopId: string | null;
}

export default function BusTrackingMap({
  stops,
  busLatitude,
  busLongitude,
  childStopId,
}: BusTrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const busMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);

  // Load Leaflet from unpkg CDN dynamically to keep bundle size small and avoid bundler issues
  useEffect(() => {
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    cssLink.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    cssLink.crossOrigin = "";

    const jsScript = document.createElement("script");
    jsScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    jsScript.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    jsScript.crossOrigin = "";

    cssLink.onload = () => {
      document.head.appendChild(jsScript);
    };

    jsScript.onload = () => {
      setLeafletLoaded(true);
    };

    jsScript.onerror = () => {
      setMapError(true);
    };

    document.head.appendChild(cssLink);

    return () => {
      // Clean up script tags if needed (optional, usually fine to keep cached)
    };
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || mapRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Use Lahore center by default
    const defaultLat = 31.5204;
    const defaultLng = 74.3587;

    const map = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], 13);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Re-render markers if props exist
    updateMapElements();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Update markers, bus position, and route lines when dependencies change
  useEffect(() => {
    if (mapRef.current && leafletLoaded) {
      updateMapElements();
    }
  }, [stops, busLatitude, busLongitude, childStopId, leafletLoaded]);

  const updateMapElements = () => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    const map = mapRef.current;

    // Clear previous markers
    Object.values(markersRef.current).forEach((marker: any) => map.removeLayer(marker));
    markersRef.current = {};

    if (busMarkerRef.current) {
      map.removeLayer(busMarkerRef.current);
      busMarkerRef.current = null;
    }

    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const latlngs: [number, number][] = [];

    // Filter valid stops
    const validStops = stops.filter(s => s.latitude && s.longitude) as (Stop & { latitude: number, longitude: number })[];

    // Plot Route Stops
    validStops.forEach((stop) => {
      const isChildStop = stop.id === childStopId;
      
      // Simple custom icon or default pin
      const markerColor = isChildStop ? "#ef4444" : "#2563eb"; // Red for child stop, Blue for others
      const markerHtml = `
        <div style="
          background-color: ${markerColor};
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
          font-weight: bold;
        ">
          ${stop.stop_order}
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: "custom-leaflet-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([stop.latitude, stop.longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>Stop ${stop.stop_order}: ${stop.stop_name}</b>${isChildStop ? "<br/><span style='color:red; font-weight:bold;'>Your Child's Stop</span>" : ""}`);

      markersRef.current[stop.id] = marker;
      latlngs.push([stop.latitude, stop.longitude]);
    });

    // Draw route polyline
    if (latlngs.length > 1) {
      const polyline = L.polyline(latlngs, { color: "#3b82f6", weight: 4, opacity: 0.7 }).addTo(map);
      polylineRef.current = polyline;
    }

    // Plot Bus Marker
    if (busLatitude && busLongitude) {
      const busHtml = `
        <div style="
          background-color: #10b981;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          animation: pulse 1.5s infinite;
        ">
          🚌
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
        </style>
      `;

      const busIcon = L.divIcon({
        html: busHtml,
        className: "custom-leaflet-bus",
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const busMarker = L.marker([busLatitude, busLongitude], { icon: busIcon })
        .addTo(map)
        .bindPopup("<b>School Bus (Live Location)</b>");

      busMarkerRef.current = busMarker;
      
      // Auto pan/zoom to fit the bus and stops
      const boundsArray = [...latlngs, [busLatitude, busLongitude] as [number, number]];
      if (boundsArray.length > 0) {
        map.fitBounds(boundsArray, { padding: [50, 50] });
      }
    } else if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [50, 50] });
    }
  };

  if (mapError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 border border-red-100 rounded-2xl p-6 text-center">
        <MapPin className="h-10 w-10 text-red-400 mb-2 animate-bounce" />
        <p className="text-sm font-bold text-slate-800">Failed to load Map services</p>
        <p className="text-xs text-slate-400 mt-1">Please check your internet connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[300px] md:min-h-[450px] rounded-2xl overflow-hidden border border-blue-50 shadow-inner">
      {!leafletLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-xs font-bold text-slate-500">Loading Map View...</p>
          </div>
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px] md:min-h-[450px] z-0" />
    </div>
  );
}
