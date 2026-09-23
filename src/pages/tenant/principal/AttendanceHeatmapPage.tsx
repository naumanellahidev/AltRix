/**
 * Where staff were when they marked themselves present.
 *
 * The banner this replaces announced "Live Security Feed", "Centroid Lock:
 * Verified", "Geofence Max: 100m Radius" and "WS Sync: Active" as fixed text.
 * Nothing measured any of them, so the page asserted a working geofence and a
 * live socket whether or not either was true. The map below reports what was
 * actually recorded; the head no longer claims anything on its behalf.
 */
import { MapPin } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { AttendanceHeatmap } from "@/components/principal/AttendanceHeatmap";

export default function AttendanceHeatmapPage() {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={MapPin}
        tone="teal"
        title="Staff check-in map"
        description="Where staff were standing when they marked themselves present, against the campus location the school has set."
      />
      <AttendanceHeatmap />
    </div>
  );
}
