import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  Calendar,
  Sparkles,
  Award,
  ListTodo,
  Camera,
  Heart,
  Plus,
  Users,
  CheckCircle,
  Inbox,
  AlertCircle,
  FileText,
  Bookmark,
  MessageSquare,
  Clock,
  Trash2,
  BookmarkCheck
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
  details: string | null;
}

interface PlanningTask {
  id: string;
  task_name: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface StudentGuardianInfo {
  student_id: string;
  student_name: string;
}

export default function EventsModule() {
  const { user } = useSession();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("parent");

  // Selection states
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null);

  // Modal control
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showRsvpDialog, setShowRsvpDialog] = useState(false);

  // Form states for creating event
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("general");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [location, setLocation] = useState("");
  const [audience, setAudience] = useState("all");
  const [rsvpEnabled, setRsvpEnabled] = useState(false);

  // RSVP Form state
  const [myChildren, setMyChildren] = useState<StudentGuardianInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState("going");
  const [rsvpNotes, setRsvpNotes] = useState("");

  // Event extensions details state
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [scores, setScores] = useState<SportsScorecard[]>([]);
  const [tasks, setTasks] = useState<PlanningTask[]>([]);

  // Score creation state
  const [scoreTitle, setScoreTitle] = useState("");
  const [houseName, setHouseName] = useState("Red House");
  const [points, setPoints] = useState(10);
  const [pos, setPos] = useState(1);

  // Task creation state
  const [taskName, setTaskName] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Photo creation state
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");

  const checkUserRole = async () => {
    try {
      // Decode JWT or fetch user details
      const { data: auth } = await apiClient.get("/users/me");
      // Find role for this school
      if (auth?.roles && auth.roles.length > 0) {
        const adminRoles = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "academic_coordinator"];
        const isAdmin = auth.roles.some((r: string) => adminRoles.includes(r));
        if (isAdmin) setRole("admin");
        else if (auth.roles.includes("teacher")) setRole("teacher");
        else setRole("parent");
      }
    } catch (e) {
      setRole("parent"); // fallback
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/school-events");
      setEvents(res.data || []);
      if (res.data && res.data.length > 0 && !selectedEventId) {
        setSelectedEventId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async () => {
    try {
      const res = await apiClient.get("/parents/children");
      setMyChildren(
        (res.data || []).map((c: any) => ({
          student_id: c.student_id || c.id,
          student_name: c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Student",
        }))
      );
      if (res.data && res.data.length > 0) {
        setSelectedChildId(res.data[0].student_id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    checkUserRole();
    loadEvents();
    loadChildren();
  }, []);

  // Fetch event specific extensions
  useEffect(() => {
    if (!selectedEventId) return;
    const selected = events.find((e) => e.id === selectedEventId);
    setSelectedEvent(selected || null);

    // Fetch photos
    apiClient
      .get(`/school-events/${selectedEventId}/photos`)
      .then((res) => setPhotos(res.data || []))
      .catch(console.error);

    // Fetch scores
    apiClient
      .get(`/school-events/${selectedEventId}/scorecard`)
      .then((res) => setScores(res.data || []))
      .catch(console.error);

    // Fetch tasks
    apiClient
      .get(`/school-events/${selectedEventId}/tasks`)
      .then((res) => setTasks(res.data || []))
      .catch(console.error);
  }, [selectedEventId, events]);

  const handleCreateEvent = async () => {
    if (!title || !eventDate) {
      toast.error("Event title and date are required");
      return;
    }
    try {
      await apiClient.post("/school-events", {
        title,
        description: description || null,
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        location: location || null,
        audience,
        rsvp_enabled: rsvpEnabled,
      });
      toast.success("Event created successfully!");
      setShowCreateEvent(false);
      setTitle("");
      setDescription("");
      loadEvents();
    } catch (err) {
      console.error(err);
      toast.error("Failed to create school event");
    }
  };

  const handleRsvpSubmit = async () => {
    if (!selectedEventId || !selectedChildId) return;
    try {
      await apiClient.post(`/school-events/${selectedEventId}/rsvp`, {
        student_id: selectedChildId,
        status: rsvpStatus,
        notes: rsvpNotes || null,
      });
      toast.success("RSVP status submitted successfully!");
      setShowRsvpDialog(false);
      loadEvents();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record RSVP response");
    }
  };

  const handleAddPhoto = async () => {
    if (!photoUrl) return;
    try {
      await apiClient.post(`/school-events/${selectedEventId}/photos`, {
        photo_url: photoUrl,
        caption: photoCaption || null,
      });
      toast.success("Event photo uploaded!");
      setPhotoUrl("");
      setPhotoCaption("");
      // refresh photos
      const res = await apiClient.get(`/school-events/${selectedEventId}/photos`);
      setPhotos(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add photo");
    }
  };

  const handleAddScore = async () => {
    if (!scoreTitle || !houseName) return;
    try {
      await apiClient.post(`/school-events/${selectedEventId}/scorecard`, {
        title: scoreTitle,
        house_name: houseName,
        points: points,
        position: pos,
      });
      toast.success("Scorecard points saved!");
      setScoreTitle("");
      const res = await apiClient.get(`/school-events/${selectedEventId}/scorecard`);
      setScores(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update sports scorecard");
    }
  };

  const handleAddTask = async () => {
    if (!taskName) return;
    try {
      await apiClient.post(`/school-events/${selectedEventId}/tasks`, {
        task_name: taskName,
        priority: taskPriority,
        due_date: taskDueDate || null,
      });
      toast.success("Workflow planning task assigned!");
      setTaskName("");
      const res = await apiClient.get(`/school-events/${selectedEventId}/tasks`);
      setTasks(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create planning task");
    }
  };

  const handleToggleTask = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "completed" ? "pending" : "completed";
    try {
      await apiClient.patch(`/school-events/tasks/${id}`, { status: nextStatus });
      toast.success("Task status updated");
      const res = await apiClient.get(`/school-events/${selectedEventId}/tasks`);
      setTasks(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update task status");
    }
  };

  const isEditor = role === "admin" || role === "teacher";

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Events Calendar</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Explore sports day house card updates, submit RSVPs, view event photo galleries, and track planning checklists.
          </p>
        </div>
        {isEditor && (
          <Button onClick={() => setShowCreateEvent(true)} className="bg-primary text-primary-foreground font-semibold">
            <Plus className="h-4 w-4 mr-2" /> Add Event
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Events Calendar list */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                All Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading calendar...</div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-1.5">
                  <Inbox className="h-8 w-8 text-slate-400" />
                  No upcoming events listed.
                </div>
              ) : (
                events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all flex flex-col gap-1 ${
                      selectedEventId === ev.id
                        ? "bg-primary text-primary-foreground font-semibold shadow-glow"
                        : "hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    <span className="text-sm line-clamp-1">{ev.title}</span>
                    <span className={`text-[10px] ${selectedEventId === ev.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {format(new Date(ev.event_date), "PP")}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Event Center */}
        <div className="lg:col-span-3 space-y-6">
          {selectedEvent ? (
            <div className="space-y-6">
              {/* Event card detail */}
              <Card className="relative overflow-hidden shadow-soft border-border/60">
                {selectedEvent.cover_image_url && (
                  <div className="h-48 w-full overflow-hidden relative">
                    <img
                      src={selectedEvent.cover_image_url}
                      alt={selectedEvent.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                )}
                <CardHeader className="pb-3 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge className="capitalize mb-2" variant="outline">{selectedEvent.event_type} event</Badge>
                      <CardTitle className="text-2xl font-bold font-display tracking-tight text-foreground">
                        {selectedEvent.title}
                      </CardTitle>
                    </div>
                    {selectedEvent.rsvp_enabled && (
                      <Button onClick={() => setShowRsvpDialog(true)} variant="default" className="bg-gradient-primary-strong">
                        <BookmarkCheck className="h-4 w-4 mr-1.5" /> RSVP Now
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1"><Clock className="h-4 w-4 text-primary" /> {format(new Date(selectedEvent.event_date), "PPP")}</span>
                    {selectedEvent.location && <span>📍 {selectedEvent.location}</span>}
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm leading-relaxed text-muted-foreground font-medium">
                    {selectedEvent.description || "No full event description provided."}
                  </p>
                </CardContent>
              </Card>

              {/* Event extensions Tabs */}
              <Tabs defaultValue="gallery" className="space-y-4">
                <TabsList className="bg-muted p-1 rounded-xl">
                  <TabsTrigger value="gallery" className="gap-2 rounded-lg">
                    <Camera className="h-4 w-4" /> Gallery ({photos.length})
                  </TabsTrigger>
                  <TabsTrigger value="scorecard" className="gap-2 rounded-lg">
                    <Award className="h-4 w-4" /> Sports Leaderboard ({scores.length})
                  </TabsTrigger>
                  <TabsTrigger value="planning" className="gap-2 rounded-lg">
                    <ListTodo className="h-4 w-4" /> Organization Tasks ({tasks.length})
                  </TabsTrigger>
                </TabsList>

                {/* Gallery Tab */}
                <TabsContent value="gallery" className="space-y-4">
                  {isEditor && (
                    <Card className="p-4 bg-muted/20 border border-border/80 flex flex-col md:flex-row gap-2">
                      <Input
                        placeholder="Image URL link..."
                        value={photoUrl}
                        onChange={(e) => setPhotoUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Caption description..."
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={handleAddPhoto} className="bg-primary text-primary-foreground font-semibold shrink-0">
                        Add Photo
                      </Button>
                    </Card>
                  )}

                  {photos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      No photos uploaded for this event.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photos.map((photo) => (
                        <div key={photo.id} className="relative rounded-xl overflow-hidden group border border-border/60">
                          <img
                            src={photo.photo_url}
                            alt="Event snapshot"
                            className="w-full h-36 object-cover group-hover:scale-105 transition duration-300"
                          />
                          {photo.caption && (
                            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-white p-2 truncate">
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Sports Scorecard Tab */}
                <TabsContent value="scorecard" className="space-y-4">
                  {isEditor && (
                    <Card className="p-4 bg-muted/20 border border-border/80 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <Label>Competition Title</Label>
                        <Input
                          placeholder="e.g. 100m Sprint Final"
                          value={scoreTitle}
                          onChange={(e) => setScoreTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>House Name</Label>
                        <select
                          value={houseName}
                          onChange={(e) => setHouseName(e.target.value)}
                          className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                        >
                          <option value="Red House">Red House</option>
                          <option value="Blue House">Blue House</option>
                          <option value="Yellow House">Yellow House</option>
                          <option value="Green House">Green House</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label>Points</Label>
                          <Input
                            type="number"
                            value={points}
                            onChange={(e) => setPoints(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Pos</Label>
                          <Input
                            type="number"
                            value={pos}
                            onChange={(e) => setPos(Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={handleAddScore} className="w-full bg-primary text-primary-foreground font-semibold">
                          Log Points
                        </Button>
                      </div>
                    </Card>
                  )}

                  {scores.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <Award className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      No sports scoreboard recorded.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scores.map((score) => (
                        <div key={score.id} className="flex justify-between items-center p-4 border rounded-xl hover:bg-muted/30">
                          <div>
                            <div className="font-bold text-foreground">{score.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">House representation: {score.house_name}</div>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-primary font-bold text-primary-foreground px-2 py-0.5 text-xs">
                              {score.points} Points
                            </Badge>
                            {score.position && (
                              <div className="text-xs font-semibold text-amber-600 mt-1">Rank Position #{score.position}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Organization/Planning checklist Tab */}
                <TabsContent value="planning" className="space-y-4">
                  {isEditor && (
                    <Card className="p-4 bg-muted/20 border border-border/80 flex flex-col md:flex-row gap-2">
                      <Input
                        placeholder="Task details..."
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        className="flex-1"
                      />
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        className="h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                      >
                        <option value="low">Low Priority</option>
                        <option value="medium">Medium</option>
                        <option value="high">High Priority</option>
                      </select>
                      <Button onClick={handleAddTask} className="bg-primary text-primary-foreground font-semibold">
                        Add Task
                      </Button>
                    </Card>
                  )}

                  {tasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <ListTodo className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      No planning checklist mapped for this event.
                    </div>
                  ) : (
                    <div className="border border-border/80 rounded-xl overflow-hidden shadow-soft">
                      <Table>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            <TableHead className="font-semibold pl-6">Checkbox</TableHead>
                            <TableHead className="font-semibold">Workflow Task</TableHead>
                            <TableHead className="font-semibold text-center">Priority</TableHead>
                            <TableHead className="font-semibold text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task) => (
                            <TableRow key={task.id} className="hover:bg-muted/30">
                              <TableCell className="pl-6">
                                <input
                                  type="checkbox"
                                  checked={task.status === "completed"}
                                  disabled={!isEditor}
                                  onChange={() => handleToggleTask(task.id, task.status)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                                />
                              </TableCell>
                              <TableCell className={`font-semibold ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {task.task_name}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "secondary" : "outline"} className="capitalize font-semibold">
                                  {task.priority}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-bold text-xs uppercase">
                                {task.status}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl text-muted-foreground text-center">
              <Calendar className="h-10 w-10 text-slate-400 mb-3" />
              <p>Select an event from the calendar grid to explore RSVPs, scorecards, and planner checklists.</p>
            </div>
          )}
        </div>
      </div>

      {/* RSVP Response Dialog */}
      <Dialog open={showRsvpDialog} onOpenChange={setShowRsvpDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Record RSVP Response</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Select Student Profile</Label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
              >
                {myChildren.map((c) => (
                  <option key={c.student_id} value={c.student_id}>{c.student_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Will you be attending?</Label>
              <select
                value={rsvpStatus}
                onChange={(e) => setRsvpStatus(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
              >
                <option value="going">Yes, definitely</option>
                <option value="maybe">Maybe (unsure)</option>
                <option value="not_going">No, cannot attend</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Add Notes / Dietary Requirements (Optional)</Label>
              <Input
                placeholder="e.g. Vegetarian diet, arriving with driver..."
                value={rsvpNotes}
                onChange={(e) => setRsvpNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRsvpDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleRsvpSubmit} className="bg-primary text-primary-foreground font-semibold">
              Save Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog (Staff/Admins only) */}
      <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Add Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Event Title</Label>
              <Input
                placeholder="e.g. Annual Sports Extravaganza"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="Brief event description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Event Type</Label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value="sports_day">Sports Day</option>
                  <option value="annual_function">Annual Function</option>
                  <option value="ptm">PTM Meeting</option>
                  <option value="general">General Activity</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  placeholder="e.g. 09:00"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  placeholder="e.g. 13:00"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  placeholder="e.g. Main Playground"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Audience Scope</Label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value="all">Everyone</option>
                  <option value="parents">Parents only</option>
                  <option value="students">Students only</option>
                  <option value="staff">Staff only</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="rsvp-enable"
                checked={rsvpEnabled}
                onChange={(e) => setRsvpEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="rsvp-enable" className="text-xs font-semibold cursor-pointer">
                Request RSVP responses from parent audience
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCreateEvent(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleCreateEvent} className="bg-primary text-primary-foreground font-semibold">
              Save Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
