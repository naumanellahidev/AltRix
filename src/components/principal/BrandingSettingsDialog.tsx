import { useState, useEffect, useMemo } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Palette, Settings, MapPin, Compass, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

interface BrandingSettingsDialogProps {
  schoolId: string;
  trigger?: React.ReactNode;
}

const PRESET_COLORS = [
  { name: "Blue", hue: 210, saturation: 100, lightness: 50 },
  { name: "Indigo", hue: 240, saturation: 70, lightness: 55 },
  { name: "Purple", hue: 270, saturation: 65, lightness: 55 },
  { name: "Pink", hue: 330, saturation: 80, lightness: 55 },
  { name: "Red", hue: 0, saturation: 75, lightness: 50 },
  { name: "Orange", hue: 25, saturation: 90, lightness: 50 },
  { name: "Amber", hue: 40, saturation: 95, lightness: 50 },
  { name: "Green", hue: 145, saturation: 65, lightness: 42 },
  { name: "Teal", hue: 175, saturation: 70, lightness: 42 },
  { name: "Cyan", hue: 195, saturation: 85, lightness: 45 },
];

export function BrandingSettingsDialog({ schoolId, trigger }: BrandingSettingsDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [hue, setHue] = useState(210);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  
  // Geolocation states
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [altitude, setAltitude] = useState<string>("");
  const [detecting, setDetecting] = useState(false);
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    
    // Fetch branding
    (async () => {
      try {
        if (USE_FASTAPI) {
          const { data } = await apiClient.get(`/schools/${schoolId}/branding`);
          if (data) {
            setHue(data.accent_hue ?? 210);
            setSaturation(data.accent_saturation ?? 100);
            setLightness(data.accent_lightness ?? 50);
          }
        } else {
          const { data } = await supabase
            .from("school_branding")
            .select("accent_hue,accent_saturation,accent_lightness")
            .eq("school_id", schoolId)
            .maybeSingle();
          if (data) {
            setHue(data.accent_hue ?? 210);
            setSaturation(data.accent_saturation ?? 100);
            setLightness(data.accent_lightness ?? 50);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch branding:", err);
      }
    })();

    // Fetch school location safely
    (async () => {
      try {
        if (USE_FASTAPI) {
          const { data } = await apiClient.get(`/schools/${schoolId}`);
          if (data) {
            setLatitude(data.latitude !== null && data.latitude !== undefined ? String(data.latitude) : "");
            setLongitude(data.longitude !== null && data.longitude !== undefined ? String(data.longitude) : "");
            setAltitude(data.altitude !== null && data.altitude !== undefined ? String(data.altitude) : "");
          }
        } else {
          const { data, error } = await supabase
            .from("schools")
            .select("latitude,longitude,altitude")
            .eq("id", schoolId)
            .maybeSingle();
          if (error) {
            console.warn("Location columns missing in database:", error.message);
          } else if (data) {
            setLatitude(data.latitude !== null ? String(data.latitude) : "");
            setLongitude(data.longitude !== null ? String(data.longitude) : "");
            setAltitude(data.altitude !== null ? String(data.altitude) : "");
          }
        }
      } catch (err) {
        console.warn("Failed to fetch coordinates:", err);
      }
    })();
  }, [open, schoolId]);

  const previewColor = useMemo(
    () => `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    [hue, saturation, lightness]
  );

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setDetecting(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    const successCallback = (position: GeolocationPosition) => {
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
      if (position.coords.altitude !== null) {
        setAltitude(String(position.coords.altitude));
      } else {
        setAltitude("");
      }
      setDetecting(false);
      toast.success("Location locked with GPS!");
    };

    const errorCallback = (error: GeolocationPositionError) => {
      if (error.code === error.TIMEOUT && options.enableHighAccuracy) {
        console.warn("High accuracy GPS timed out. Retrying with standard accuracy...");
        toast.info("Calibrating GPS... Retrying with secondary sensors.");
        // Retry with standard accuracy
        navigator.geolocation.getCurrentPosition(
          successCallback,
          (err) => {
            setDetecting(false);
            console.error("Standard accuracy error:", err);
            toast.error(`Could not detect location: ${err.message}`);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
        );
      } else {
        setDetecting(false);
        console.error("Geolocation error:", error);
        toast.error(`Could not detect location: ${error.message}`);
      }
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  };

  const handleSave = async () => {
    setSaving(true);

    // Validate coordinates
    if (latitude.trim() === "") {
      toast.error("Latitude is required to configure campus geofencing");
      setSaving(false);
      return;
    }
    if (longitude.trim() === "") {
      toast.error("Longitude is required to configure campus geofencing");
      setSaving(false);
      return;
    }

    if (isNaN(Number(latitude))) {
      toast.error("Latitude must be a valid number");
      setSaving(false);
      return;
    }
    if (isNaN(Number(longitude))) {
      toast.error("Longitude must be a valid number");
      setSaving(false);
      return;
    }
    if (altitude.trim() !== "" && isNaN(Number(altitude))) {
      toast.error("Altitude must be a valid number");
      setSaving(false);
      return;
    }

    const latVal = Number(latitude);
    const lngVal = Number(longitude);
    const altVal = altitude.trim() !== "" ? Number(altitude) : null;

    // 1. Update branding - Always update Supabase first to ensure database persistent write bypasses any uvicorn reloading delay
    let brandingError = null;
    try {
      const { error: colorErr } = await supabase
        .from("school_branding")
        .update({
          accent_hue: hue,
          accent_saturation: saturation,
          accent_lightness: lightness,
        })
        .eq("school_id", schoolId);

      if (colorErr) {
        // If no row exists, try insert
        const { error: insertErr } = await supabase
          .from("school_branding")
          .insert({
            school_id: schoolId,
            accent_hue: hue,
            accent_saturation: saturation,
            accent_lightness: lightness,
          });
        if (insertErr) {
          brandingError = insertErr;
        }
      }
    } catch (err: any) {
      brandingError = err;
    }

    // Also call FastAPI if enabled to keep backend state in sync (non-blocking, don't fail if schema hasn't reloaded)
    if (USE_FASTAPI) {
      try {
        await apiClient.put(`/schools/${schoolId}/branding`, {
          accent_hue: hue,
          accent_saturation: saturation,
          accent_lightness: lightness,
        });
      } catch (err: any) {
        console.warn("FastAPI branding sync failed or was ignored:", err);
      }
    }

    // 2. Update school location coordinates safely
    let schoolErr = null;
    if (USE_FASTAPI) {
      try {
        await apiClient.patch(`/schools/${schoolId}`, {
          latitude: latVal,
          longitude: lngVal,
          altitude: altVal,
        });
      } catch (err: any) {
        schoolErr = err;
      }
    } else {
      try {
        const { error } = await supabase
          .from("schools")
          .update({
            latitude: latVal,
            longitude: lngVal,
            altitude: altVal,
          })
          .eq("id", schoolId);
        schoolErr = error;
      } catch (err: any) {
        schoolErr = err;
      }
    }

    if (brandingError || schoolErr) {
      const isMissingColumns = schoolErr?.message?.includes("column") || schoolErr?.message?.includes("altitude") || schoolErr?.message?.includes("latitude") || String(schoolErr).includes("altitude") || String(schoolErr).includes("latitude");
      
      if (isMissingColumns) {
        toast.error("Theme saved. However, database columns for geofencing are missing. Please deploy/sync the latest database migrations.");
      } else {
        toast.error(brandingError?.message || schoolErr?.message || "Failed to save settings");
      }
      setSaving(false);
      return;
    }

    // Apply color theme immediately
    const root = document.documentElement;
    root.style.setProperty("--brand", `${hue} ${saturation}% ${lightness}%`);

    // Update local storage cache to prevent default color flash or revert on page reload
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("eduverse_tenant_") && !key.startsWith("eduverse_tenant_basic_")) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.data && parsed.data.id === schoolId) {
              parsed.data.branding = {
                ...parsed.data.branding,
                accent_hue: hue,
                accent_saturation: saturation,
                accent_lightness: lightness,
              };
              parsed.timestamp = Date.now();
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to update tenant localStorage cache:", e);
    }

    // Invalidate react-query cache for the tenant
    queryClient.invalidateQueries({ queryKey: ["tenant"] });

    toast.success("Settings updated successfully!");
    setSaving(false);
    setOpen(false);
    
    // Refresh page after a short delay to refresh geofence coordinates and colors in all dashboard widgets
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
            <Settings className="h-4 w-4" /> School Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-md border-border/80 shadow-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary animate-pulse" />
            School Admin Settings
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Configure global portal options, brand guidelines, and campus geofencing limits.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="branding" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="branding" className="rounded-xl font-medium text-xs sm:text-sm">
              <Palette className="mr-1.5 h-3.5 w-3.5" />
              Portal Theme
            </TabsTrigger>
            <TabsTrigger value="geofence" className="rounded-xl font-medium text-xs sm:text-sm">
              <MapPin className="mr-1.5 h-3.5 w-3.5" />
              Campus Geofence
            </TabsTrigger>
          </TabsList>

          {/* BRANDING TAB CONTENT */}
          <TabsContent value="branding" className="space-y-5 py-4 focus:outline-none">
            {/* Live Preview */}
            <div className="flex items-center gap-4 bg-muted/20 border rounded-2xl p-4">
              <div
                className="h-14 w-14 rounded-2xl shadow-inner border transition-all duration-300"
                style={{ backgroundColor: previewColor }}
              />
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accent preview</p>
                <p className="text-sm font-mono font-medium">
                  HSL({hue}, {saturation}%, {lightness}%)
                </p>
                <Button
                  size="sm"
                  className="mt-1 h-7 text-xs rounded-lg shadow-sm font-medium transition-transform active:scale-95"
                  style={{ backgroundColor: previewColor, color: lightness > 60 ? "#000" : "#fff" }}
                >
                  Action Preview
                </Button>
              </div>
            </div>

            {/* Preset Colors */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2.5 block uppercase tracking-wider">Quick Color Presets</Label>
              <div className="grid grid-cols-5 gap-2.5">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.name}
                    className="h-9 rounded-xl border border-border/60 transition-all hover:scale-105 active:scale-95 hover:shadow focus:outline-none focus:ring-2 focus:ring-primary/40 flex items-center justify-center relative overflow-hidden group"
                    style={{
                      backgroundColor: `hsl(${preset.hue}, ${preset.saturation}%, ${preset.lightness}%)`,
                    }}
                    title={preset.name}
                    onClick={() => {
                      setHue(preset.hue);
                      setSaturation(preset.saturation);
                      setLightness(preset.lightness);
                    }}
                  >
                    {hue === preset.hue && saturation === preset.saturation && (
                      <span className="absolute inset-0 bg-black/15 flex items-center justify-center text-white text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Sliders */}
            <div className="space-y-4 pt-1">
              <div>
                <Label className="text-xs font-medium flex justify-between">
                  <span>Hue Angle</span>
                  <span className="font-mono text-primary font-semibold">{hue}°</span>
                </Label>
                <div
                  className="mt-2 h-2 rounded-full border border-black/10"
                  style={{
                    background:
                      "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
                  }}
                />
                <Slider
                  value={[hue]}
                  onValueChange={([v]) => setHue(v)}
                  min={0}
                  max={360}
                  step={1}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-xs font-medium flex justify-between">
                  <span>Saturation Intensity</span>
                  <span className="font-mono text-primary font-semibold">{saturation}%</span>
                </Label>
                <Slider
                  value={[saturation]}
                  onValueChange={([v]) => setSaturation(v)}
                  min={10}
                  max={100}
                  step={1}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-xs font-medium flex justify-between">
                  <span>Lightness / Brightness</span>
                  <span className="font-mono text-primary font-semibold">{lightness}%</span>
                </Label>
                <Slider
                  value={[lightness]}
                  onValueChange={([v]) => setLightness(v)}
                  min={25}
                  max={65}
                  step={1}
                  className="mt-2"
                />
              </div>
            </div>
          </TabsContent>

          {/* GEOFENCE TAB CONTENT */}
          <TabsContent value="geofence" className="space-y-5 py-4 focus:outline-none">
            <div className="flex gap-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5">
              <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Important Instructions</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-500/90 leading-relaxed">
                  These coordinates define the campus center. Staff can mark their daily presence only when within a 100m radius of these coordinates.
                </p>
              </div>
            </div>

            {/* GPS Lock Action */}
            <Button
              type="button"
              variant="soft"
              onClick={handleDetectLocation}
              disabled={detecting}
              className="w-full gap-2 py-5 rounded-2xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-all text-xs font-semibold"
            >
              {detecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Locking Geolocation Signals...
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4 text-primary animate-pulse" />
                  Auto-Detect Current GPS Coordinates
                </>
              )}
            </Button>

            {/* Input fields */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latitude</Label>
                <Input
                  type="text"
                  placeholder="e.g. 33.6844"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="rounded-xl border-border/80 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Longitude</Label>
                <Input
                  type="text"
                  placeholder="e.g. 73.0479"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="rounded-xl border-border/80 font-mono"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Altitude (Meters, Optional)</Label>
                <Input
                  type="text"
                  placeholder="e.g. 540"
                  value={altitude}
                  onChange={(e) => setAltitude(e.target.value)}
                  className="rounded-xl border-border/80 font-mono"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl text-xs font-semibold">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 shadow-md">
            {saving ? "Saving Settings..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
