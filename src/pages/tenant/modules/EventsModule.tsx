import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths
} from "date-fns";
import {
  Calendar as CalendarIcon, Sparkles, Award, ListTodo, Camera, Plus, Users,
  CheckCircle, Inbox, Clock, Trash2, BookmarkCheck, ChevronLeft, ChevronRight,
  MapPin, Flag, Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";

interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  cover_image_url: string | null;
  status: string;
  audience: string;
  rsvp_enabled: boolean;
  rsvp_count: number;
  photo_count: number;
}

interface EventPhoto {
  id: string;
  photo_url: string;
  caption: string | null;
}

interface SportsScorecard {
  id: string;
  title: string;
  house_name: string;
  points: number;
  position: number | null;
}

interface PlanningTask {
  id: string;
  task_name: string;
  status: string;
  priority: string;
}

export default function EventsModule() {
  const { user } = useSession();
  const [events, setEvents] = useState<SchoolEvent[]>([
    {
      id: "event-1",
      title: "Annual Sports Gala 2026",
      description: "Inter-house athletics competitions, relay races, football finals, and prize distribution ceremony.",
      event_type: "sports",
      event_date: new Date().toISOString().slice(0, 10),
      start_time: "08:30 AM",
      end_time: "02:00 PM",
      location: "Main Sports Complex Ground",
      cover_image_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80",
      status: "upcoming",
      audience: "all",
      rsvp_enabled: true,
      rsvp_count: 48,
      photo_count: 12
    },
    {
      id: "event-2",
      title: "Parent-Teacher Meeting (Q3 Evaluation)",
      description: "Individual academic performance review and term result card discussion.",
      event_type: "ptm",
      event_date: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
      start_time: "09:00 AM",
      end_time: "01:30 PM",
      location: "Auditorium Hall A",
      cover_image_url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1200&q=80",
      status: "upcoming",
      audience: "parents",
      rsvp_enabled: true,
      rsvp_count: 92,
      photo_count: 0
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>("event-1");
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(events[0]);

  // Calendar month state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Modal controls
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showRsvpDialog, setShowRsvpDialog] = useState(false);

  // Form states for creating event
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("general");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00 AM");
  const [endTime, setEndTime] = useState("12:00 PM");
  const [location, setLocation] = useState("Main Campus Auditorium");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [audience, setAudience] = useState("all");
  const [rsvpEnabled, setRsvpEnabled] = useState(true);

  // Sub-items for selected event
  const [photos, setPhotos] = useState<EventPhoto[]>([
    { id: "p1", photo_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80", caption: "Relay Race 100m Sprint" },
    { id: "p2", photo_url: "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=600&q=80", caption: "Trophy Ceremony" }
  ]);
  const [scores, setScores] = useState<SportsScorecard[]>([
    { id: "s1", title: "Football Championship", house_name: "Red Jinnah House", points: 50, position: 1 },
    { id: "s2", title: "Football Championship", house_name: "Green Iqbal House", points: 30, position: 2 }
  ]);
  const [tasks, setTasks] = useState<PlanningTask[]>([
    { id: "t1", task_name: "Confirm Sound & PA System Setup", status: "completed", priority: "high" },
    { id: "t2", task_name: "Arrange Chief Guest & Trophies", status: "pending", priority: "high" }
  ]);

  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [scoreTitle, setScoreTitle] = useState("");
  const [houseName, setHouseName] = useState("Red Jinnah House");
  const [points, setPoints] = useState(10);
  const [taskName, setTaskName] = useState("");

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/school-events");
      if (res.data && res.data.length > 0) {
        setEvents(res.data);
        if (!selectedEventId) {
          setSelectedEventId(res.data[0].id);
        }
      }
    } catch {
      // keep initial fallback list
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const ev = events.find(e => e.id === selectedEventId);
    if (ev) setSelectedEvent(ev);
  }, [selectedEventId, events]);

  const handleCreateEvent = async () => {
    if (!title || !eventDate) {
      toast.error("Event title and date are required");
      return;
    }
    const newEvent: SchoolEvent = {
      id: `event-${Date.now()}`,
      title,
      description: description || null,
      event_type: eventType,
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      location: location || null,
      cover_image_url: coverImageUrl || "https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=80",
      status: "upcoming",
      audience,
      rsvp_enabled: rsvpEnabled,
      rsvp_count: 0,
      photo_count: 0
    };

    setEvents(prev => [newEvent, ...prev]);
    setSelectedEventId(newEvent.id);
    setSelectedEvent(newEvent);
    setShowCreateEvent(false);
    toast.success("Event created successfully!");

    // Reset form
    setTitle("");
    setDescription("");
    setCoverImageUrl("");

    try {
      await apiClient.post("/school-events", {
        title,
        description,
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        location,
        cover_image_url: coverImageUrl,
        audience,
        rsvp_enabled: rsvpEnabled
      });
    } catch {
      // Saved locally
    }
  };

  const handleAddPhoto = () => {
    if (!photoUrl) return;
    setPhotos(prev => [...prev, { id: `p-${Date.now()}`, photo_url: photoUrl, caption: photoCaption || null }]);
    setPhotoUrl("");
    setPhotoCaption("");
    toast.success("Photo added to gallery");
  };

  const handleAddScore = () => {
    if (!scoreTitle) return;
    setScores(prev => [...prev, { id: `s-${Date.now()}`, title: scoreTitle, house_name: houseName, points, position: 1 }]);
    setScoreTitle("");
    toast.success("Score saved to leaderboard");
  };

  const handleAddTask = () => {
    if (!taskName) return;
    setTasks(prev => [...prev, { id: `t-${Date.now()}`, task_name: taskName, status: "pending", priority: "medium" }]);
    setTaskName("");
    toast.success("Task added to planning checklist");
  };

  // Calendar days grid calculation
  const calendarDays = useMemo(() => {
    const monthStartDay = startOfMonth(currentMonth);
    const monthEndDay = endOfMonth(monthStartDay);
    const startDate = startOfWeek(monthStartDay);
    const endDate = endOfWeek(monthEndDay);
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto p-3 sm:p-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg border border-blue-400/20">
        <div className="space-y-1 sm:space-y-1.5">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 sm:h-7 sm:w-7 text-blue-200 shrink-0" />
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Events & Sports Calendar</h1>
          </div>
          <p className="text-blue-100 font-medium text-xs sm:text-sm">
            Interactive month calendar, instant event publisher, house sports leaderboards, and gallery photo uploads.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateEvent(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md rounded-xl text-xs h-9">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add New Event
        </Button>
      </div>

      {/* 🌟 INTERACTIVE MONTH CALENDAR GRID */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl sm:rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <Badge variant="secondary" className="font-semibold bg-blue-50 text-blue-700 border-blue-200 text-[10px] sm:text-xs">
              {events.length} Events
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} variant="outline" size="sm" className="h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button onClick={() => setCurrentMonth(new Date())} variant="outline" size="sm" className="font-semibold text-xs h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg">
              Today
            </Button>
            <Button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} variant="outline" size="sm" className="h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-2 sm:p-4 overflow-x-auto">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 text-center font-bold text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider py-2 border-b border-slate-100 dark:border-slate-800 min-w-[320px]">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar 7x5 Days Cells Grid */}
          <div className="grid grid-cols-7 gap-1 pt-1 min-w-[320px]">
            {calendarDays.map((day, idx) => {
              const dayStr = format(day, "yyyy-MM-dd");
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const dayEvents = events.filter(e => e.event_date === dayStr);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (dayEvents.length > 0) {
                      setSelectedEventId(dayEvents[0].id);
                    } else {
                      setEventDate(dayStr);
                      setShowCreateEvent(true);
                    }
                  }}
                  className={`min-h-[60px] sm:min-h-[90px] p-1 sm:p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    !isCurrentMonth 
                      ? "bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 text-slate-300 dark:border-slate-800/50" 
                      : isToday 
                      ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-sm" 
                      : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800 hover:border-blue-300"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] sm:text-xs font-bold ${
                      isToday ? "h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs" : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {format(day, "d")}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {dayEvents.map(e => (
                      <div
                        key={e.id}
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setSelectedEventId(e.id);
                        }}
                        className={`text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded truncate transition-all ${
                          selectedEventId === e.id
                            ? "bg-blue-600 text-white"
                            : "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200"
                        }`}
                      >
                        {e.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Sidebar Event Selector */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                All Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1 max-h-[300px] lg:max-h-[500px] overflow-y-auto">
              {events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEventId(e.id)}
                  className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all flex items-center justify-between ${
                    selectedEventId === e.id
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-muted/80 text-foreground"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs sm:text-sm font-bold truncate">{e.title}</div>
                    <div className={`text-[10px] sm:text-xs ${selectedEventId === e.id ? "text-blue-100" : "text-muted-foreground"}`}>
                      {e.event_date}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-70 shrink-0" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Selected Event Details Container */}
        <div className="lg:col-span-3 space-y-6">
          {selectedEvent ? (
            <div className="space-y-6">
              <Card className="relative overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl">
                {selectedEvent.cover_image_url && (
                  <div className="h-36 sm:h-48 w-full overflow-hidden relative">
                    <img
                      src={selectedEvent.cover_image_url}
                      alt={selectedEvent.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    <div className="absolute bottom-3 sm:bottom-4 left-4 sm:left-6 text-white pr-4">
                      <Badge className="capitalize mb-1 bg-blue-600 text-[10px]">{selectedEvent.event_type} event</Badge>
                      <h2 className="text-lg sm:text-2xl font-bold truncate">{selectedEvent.title}</h2>
                    </div>
                  </div>
                )}
                
                <CardContent className="p-4 sm:p-6 space-y-4">
                  <div className="flex flex-wrap gap-3 sm:gap-4 text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" /> Date: {selectedEvent.event_date} ({selectedEvent.start_time} - {selectedEvent.end_time})</span>
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-600" /> Location: {selectedEvent.location || "Campus Hall"}</span>
                    <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" /> Audience: {selectedEvent.audience.toUpperCase()}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedEvent.description || "No full event description provided."}
                  </p>
                </CardContent>
              </Card>

              {/* Event Modules Tabs */}
              <Tabs defaultValue="gallery" className="space-y-4">
                <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
                  <TabsList className="inline-flex w-max min-w-full sm:w-auto p-1 rounded-xl bg-muted">
                    <TabsTrigger value="gallery" className="gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                      <Camera className="h-3.5 w-3.5 text-blue-600" /> Photo Gallery ({photos.length})
                    </TabsTrigger>
                    <TabsTrigger value="scorecard" className="gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                      <Award className="h-3.5 w-3.5 text-amber-600" /> Sports Leaderboard ({scores.length})
                    </TabsTrigger>
                    <TabsTrigger value="planning" className="gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                      <ListTodo className="h-3.5 w-3.5 text-emerald-600" /> Planning Tasks ({tasks.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Gallery Tab */}
                <TabsContent value="gallery" className="space-y-4">
                  <Card className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-2">
                    <Input
                      placeholder="Image URL link..."
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Photo caption..."
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleAddPhoto} className="bg-blue-600 text-white font-semibold">Add Photo</Button>
                  </Card>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photos.map(p => (
                      <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 h-40">
                        <img src={p.photo_url} alt={p.caption || "Event Photo"} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                        {p.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-[11px] text-white font-medium">
                            {p.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Leaderboard Tab */}
                <TabsContent value="scorecard" className="space-y-4">
                  <Card className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Input placeholder="Activity title..." value={scoreTitle} onChange={e => setScoreTitle(e.target.value)} />
                    <Input placeholder="House name..." value={houseName} onChange={e => setHouseName(e.target.value)} />
                    <Input type="number" placeholder="Points..." value={points} onChange={e => setPoints(parseInt(e.target.value) || 0)} />
                    <Button onClick={handleAddScore} className="bg-amber-600 text-white font-semibold">Save Score</Button>
                  </Card>

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                        <TableHead>Competition</TableHead>
                        <TableHead>House Team</TableHead>
                        <TableHead>Points Awarded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scores.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-bold">{s.title}</TableCell>
                          <TableCell><Badge className="bg-amber-100 text-amber-800">{s.house_name}</Badge></TableCell>
                          <TableCell className="font-bold text-amber-600">{s.points} Pts</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* Tasks Tab */}
                <TabsContent value="planning" className="space-y-4">
                  <Card className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex gap-2">
                    <Input placeholder="Task title..." value={taskName} onChange={e => setTaskName(e.target.value)} className="flex-1" />
                    <Button onClick={handleAddTask} className="bg-emerald-600 text-white font-semibold">Add Task</Button>
                  </Card>

                  <div className="space-y-2">
                    {tasks.map(t => (
                      <div key={t.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                        <span className="font-semibold text-sm">{t.task_name}</span>
                        <Badge className="bg-emerald-100 text-emerald-800">Ready</Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>

      {/* 🌟 ADD EVENT DIALOG */}
      <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Plus className="h-5 w-5" /> Schedule New School Event
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label>Event Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Annual Sports Gala 2026" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Event</SelectItem>
                    <SelectItem value="sports">Sports Competition</SelectItem>
                    <SelectItem value="ptm">Parent-Teacher Meeting</SelectItem>
                    <SelectItem value="academic">Academic Contest</SelectItem>
                    <SelectItem value="cultural">Cultural Festival</SelectItem>
                    <SelectItem value="holiday">Holiday Notice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Audience</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All School Community</SelectItem>
                    <SelectItem value="students">Students Only</SelectItem>
                    <SelectItem value="parents">Parents Only</SelectItem>
                    <SelectItem value="staff">Faculty & Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Event Date</Label>
                <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Start Time</Label>
                <Input value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Location / Venue</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Auditorium Ground" className="mt-1" />
            </div>

            <div>
              <Label>Cover Image Banner URL</Label>
              <Input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." className="mt-1" />
            </div>

            <div>
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief summary of program schedule..." className="mt-1" />
            </div>

            <Button onClick={handleCreateEvent} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 shadow-md">
              <Sparkles className="h-4 w-4 mr-2" /> Publish Event to Calendar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
