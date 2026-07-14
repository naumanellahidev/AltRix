import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, Image as ImageIcon, Calendar, MapPin, 
  ChevronLeft, Download, Maximize2, X, Share2, Play
} from "lucide-react";
import { toast } from "sonner";

interface EventPhoto {
  id: string;
  photo_url: string;
  thumbnail_url: string | null;
  caption: string | null;
}

interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  location: string | null;
  cover_image_url: string | null;
  photo_count: number;
}

export default function ParentGalleryModule() {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  
  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get<SchoolEvent[]>("/events");
      setEvents(resp.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load school event records");
    } finally {
      setLoading(false);
    }
  };

  const fetchEventPhotos = async (eventId: string) => {
    setLoadingPhotos(true);
    try {
      const resp = await apiClient.get<EventPhoto[]>(`/events/${eventId}/photos`);
      setPhotos(resp.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load photos for this event");
    } finally {
      setLoadingPhotos(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSelectEvent = (event: SchoolEvent) => {
    setSelectedEvent(event);
    fetchEventPhotos(event.id);
  };

  const handleBackToEvents = () => {
    setSelectedEvent(null);
    setPhotos([]);
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Photo download initiated");
    } catch (err) {
      // Fallback
      window.open(url, "_blank");
    }
  };

  const handleShare = async (url: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Check out this photo from school event: ${title}`,
          url: url
        });
      } catch (err) {
        // Ignore aborts
      }
    } else {
      // Copy link
      await navigator.clipboard.writeText(url);
      toast.success("Photo URL copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // MOCK DATA FALLBACK for aesthetic demonstration if database is empty
  const defaultEvents: SchoolEvent[] = events.length > 0 ? events : [
    {
      id: "ev1",
      title: "Annual Sports Day Gala 2026",
      description: "Celebrating athletic excellence, teamwork, and high spirit across campuses.",
      event_type: "sports_day",
      event_date: "2026-03-12",
      location: "Main Ground",
      cover_image_url: "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80",
      photo_count: 6
    },
    {
      id: "ev2",
      title: "Science & STEAM Exhibition",
      description: "Young innovators displaying science projects, robotics, and creative models.",
      event_type: "competition",
      event_date: "2026-04-20",
      location: "Auditorium",
      cover_image_url: "https://images.unsplash.com/photo-1564069114053-6996d9803d57?w=800&auto=format&fit=crop&q=80",
      photo_count: 4
    },
    {
      id: "ev3",
      title: "Milad & Quran Recitation",
      description: "Annual religious blessings gatherings at the school auditorium.",
      event_type: "cultural",
      event_date: "2026-05-02",
      location: "School Mosque Hall",
      cover_image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80",
      photo_count: 3
    }
  ];

  const defaultPhotos: Record<string, EventPhoto[]> = {
    ev1: [
      { id: "p1", photo_url: "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80", caption: "Opening ceremony March Past" },
      { id: "p2", photo_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80", caption: "100m sprint finals" },
      { id: "p3", photo_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&auto=format&fit=crop&q=80", caption: "High jump contest" },
      { id: "p4", photo_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&auto=format&fit=crop&q=80", caption: "Award ceremony champions" }
    ],
    ev2: [
      { id: "p5", photo_url: "https://images.unsplash.com/photo-1564069114053-6996d9803d57?w=800&auto=format&fit=crop&q=80", caption: "Robotics demonstration booth" },
      { id: "p6", photo_url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800&auto=format&fit=crop&q=80", caption: "Chemistry volcano experiment" }
    ],
    ev3: [
      { id: "p7", photo_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80", caption: "Quran Recitation Contest Winners" }
    ]
  };

  const activeEventList = events.length > 0 ? events : defaultEvents;
  const activePhotos = selectedEvent 
    ? (photos.length > 0 ? photos : (defaultPhotos[selectedEvent.id] || []))
    : [];

  return (
    <div className="space-y-6">
      {!selectedEvent ? (
        <>
          {/* Cover Header */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Photo Gallery</h1>
              <p className="text-xs text-slate-400">Glimpses of school life, sports, and cultural events</p>
            </div>
          </div>

          {/* Grid of Events */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeEventList.map((event) => (
              <Card 
                key={event.id}
                onClick={() => handleSelectEvent(event)}
                className="group overflow-hidden border-blue-50 hover:border-blue-100 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  {event.cover_image_url ? (
                    <img 
                      src={event.cover_image_url} 
                      alt={event.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <ImageIcon className="h-10 w-10" />
                    </div>
                  )}
                  <span className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {event.photo_count || 12} Photos
                  </span>
                  <span className="absolute top-3 left-3 rounded-lg bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white tracking-wide">
                    {event.event_type.replace("_", " ")}
                  </span>
                </div>
                <CardHeader className="p-4 space-y-1">
                  <CardTitle className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {event.title}
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-450 line-clamp-2 leading-relaxed">
                    {event.description || "No description provided."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 flex items-center justify-between text-[10px] font-bold text-slate-400 border-t border-slate-50 mt-2">
                  <span className="flex items-center gap-1 mt-2">
                    <Calendar className="h-3 w-3 text-blue-500" />
                    {new Date(event.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1 mt-2 truncate max-w-[120px]">
                      <MapPin className="h-3 w-3 text-blue-500" />
                      {event.location}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleBackToEvents} 
                className="h-8 w-8 p-0 rounded-lg border-slate-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="font-display text-lg font-bold text-slate-800">{selectedEvent.title}</h1>
                <p className="text-xs text-slate-400">{selectedEvent.description || "School Gallery"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="border-blue-100 text-blue-700 bg-blue-50 font-bold text-[10px] uppercase">
                {selectedEvent.event_type.replace("_", " ")}
              </Badge>
            </div>
          </div>

          {loadingPhotos ? (
            <div className="flex h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : activePhotos.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <ImageIcon className="mx-auto h-10 w-10 text-slate-200 mb-2" />
              <p className="text-xs font-bold">No photos posted in this event album yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {activePhotos.map((photo, index) => (
                <div 
                  key={photo.id}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-100/50 shadow-sm cursor-pointer"
                >
                  <img 
                    src={photo.photo_url} 
                    alt={photo.caption || "Event image"}
                    className="w-full h-full object-cover"
                    onClick={() => setLightboxIndex(index)}
                  />
                  
                  {/* Hover overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                    <div className="flex justify-end gap-1.5">
                      <button 
                        onClick={() => handleDownload(photo.photo_url, `altrix-photo-${photo.id}.jpg`)}
                        className="rounded-lg bg-white/20 hover:bg-white/40 p-1.5 text-white backdrop-blur-sm transition-all"
                        title="Download photo"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => handleShare(photo.photo_url, selectedEvent.title)}
                        className="rounded-lg bg-white/20 hover:bg-white/40 p-1.5 text-white backdrop-blur-sm transition-all"
                        title="Share photo"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {photo.caption && (
                      <p className="text-[10px] text-white font-semibold line-clamp-1 leading-snug">
                        {photo.caption}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lightbox Modal */}
          {lightboxIndex !== null && (
            <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
              {/* Close Button */}
              <button 
                onClick={() => setLightboxIndex(null)}
                className="absolute right-4 top-4 rounded-full bg-white/10 hover:bg-white/25 p-2.5 text-white transition-all"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Main Image */}
              <div className="relative max-w-4xl max-h-[80vh] w-full flex items-center justify-center">
                <img 
                  src={activePhotos[lightboxIndex].photo_url} 
                  alt={activePhotos[lightboxIndex].caption || "Event image"}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                />

                {/* Left/Right buttons */}
                {lightboxIndex > 0 && (
                  <button 
                    onClick={() => setLightboxIndex(lightboxIndex - 1)}
                    className="absolute left-2 rounded-full bg-white/10 hover:bg-white/20 p-2.5 text-white transition-all"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}
                {lightboxIndex < activePhotos.length - 1 && (
                  <button 
                    onClick={() => setLightboxIndex(lightboxIndex + 1)}
                    className="absolute right-2 rounded-full bg-white/10 hover:bg-white/20 p-2.5 text-white transition-all"
                  >
                    {/* Reuse chevron right directionally */}
                    <ChevronLeft className="h-6 w-6 rotate-180" />
                  </button>
                )}
              </div>

              {/* Image Details */}
              <div className="text-center mt-4 max-w-md px-4 text-white">
                {activePhotos[lightboxIndex].caption && (
                  <p className="text-sm font-semibold text-slate-100">{activePhotos[lightboxIndex].caption}</p>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  Photo {lightboxIndex + 1} of {activePhotos.length}
                </p>

                {/* Action Row */}
                <div className="flex justify-center gap-3 mt-4">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 rounded-lg bg-transparent text-white border-white/20 hover:bg-white/10 text-xs font-bold gap-1.5"
                    onClick={() => handleDownload(activePhotos[lightboxIndex!].photo_url, `photo-${lightboxIndex!}.jpg`)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 rounded-lg bg-transparent text-white border-white/20 hover:bg-white/10 text-xs font-bold gap-1.5"
                    onClick={() => handleShare(activePhotos[lightboxIndex!].photo_url, selectedEvent.title)}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" width="24" height="24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
