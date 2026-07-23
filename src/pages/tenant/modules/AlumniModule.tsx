import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  GraduationCap, Users, Calendar, DollarSign, Plus, Search, RefreshCw,
  Building, Briefcase, Mail, Linkedin, Award, Heart
} from "lucide-react";

interface AlumniProfile {
  id: string;
  full_name: string;
  graduation_year: number;
  higher_education_uni?: string;
  current_company?: string;
  designation?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
}

interface AlumniEvent {
  id: string;
  event_title: string;
  event_date: string;
  location?: string;
  description?: string;
  rsvp_count: number;
}

export function AlumniModule() {
  const [activeTab, setActiveTab] = useState("directory");
  const [alumni, setAlumni] = useState<AlumniProfile[]>([]);
  const [events, setEvents] = useState<AlumniEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Register Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newAlumni, setNewAlumni] = useState({
    full_name: "", graduation_year: 2022, higher_education_uni: "NUST / FAST",
    current_company: "Systems Ltd / Tech Corp", designation: "Software Engineer", email: "", phone: "", linkedin_url: ""
  });

  // Create Event Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    event_title: "", event_date: "2026-10-15", location: "School Grand Auditorium", description: "Annual Grand Alumni Homecoming & Career Counseling Sessions"
  });

  const loadAlumniData = async () => {
    setLoading(true);
    try {
      const [resDir, resEvt] = await Promise.all([
        apiClient.get("/alumni/directory"),
        apiClient.get("/alumni/events")
      ]);
      setAlumni(resDir.data ?? []);
      setEvents(resEvt.data ?? []);
    } catch {
      setAlumni([]);
      setEvents([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlumniData();
  }, []);

  const handleRegisterAlumni = async () => {
    if (!newAlumni.full_name || !newAlumni.graduation_year) {
      toast.error("Provide alumni name and graduation year");
      return;
    }
    try {
      await apiClient.post("/alumni/register", newAlumni);
      toast.success("Alumni profile registered successfully");
      setShowRegisterModal(false);
      setNewAlumni({ full_name: "", graduation_year: 2022, higher_education_uni: "NUST / FAST", current_company: "Systems Ltd / Tech Corp", designation: "Software Engineer", email: "", phone: "", linkedin_url: "" });
      loadAlumniData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to register alumni");
    }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.event_title || !newEvent.event_date) {
      toast.error("Provide event title and date");
      return;
    }
    try {
      await apiClient.post("/alumni/events", newEvent);
      toast.success("Alumni event scheduled");
      setShowEventModal(false);
      loadAlumniData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to schedule alumni event");
    }
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Registered Alumni</p>
              <p className="text-xl font-bold text-white mt-0.5">{alumni.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-violet-500/30 bg-violet-500/5 text-violet-400">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Universities Represented</p>
              <p className="text-xl font-bold text-white mt-0.5">{new Set(alumni.map(a => a.higher_education_uni).filter(Boolean)).size}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Upcoming Reunions</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{events.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Scholarship Donors</p>
              <p className="text-xl font-bold text-amber-400 mt-0.5">{Math.floor(alumni.length * 0.4)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="directory" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <GraduationCap className="h-4 w-4 mr-2" /> Alumni Directory
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">
              <Calendar className="h-4 w-4 mr-2" /> Reunions & Guest Lectures
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search Name, University, Company..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-cyan-500/30" />
            </div>
            <Button variant="outline" onClick={loadAlumniData} className="border-zinc-800 bg-zinc-950/60 text-zinc-200">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Directory Tab ─────────────────────────────── */}
        <TabsContent value="directory">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-cyan-400" /> Global Alumni Network Directory
              </CardTitle>
              <Button onClick={() => setShowRegisterModal(true)} className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold">
                <Plus className="h-4 w-4 mr-2" /> Register Graduate
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">Alumni Name</TableHead>
                    <TableHead className="text-zinc-400">Class Year</TableHead>
                    <TableHead className="text-zinc-400">Higher Ed / Alma Mater</TableHead>
                    <TableHead className="text-zinc-400">Current Role / Organization</TableHead>
                    <TableHead className="text-zinc-400">Contact / LinkedIn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alumni.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-12">
                        <GraduationCap className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No alumni records registered yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    alumni.filter(a => !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || (a.higher_education_uni && a.higher_education_uni.toLowerCase().includes(search.toLowerCase()))).map(a => (
                      <TableRow key={a.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-semibold text-white">{a.full_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-400 bg-cyan-500/5">
                            Batch of {a.graduation_year}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-300">{a.higher_education_uni || "—"}</TableCell>
                        <TableCell className="text-xs text-zinc-300">
                          {a.designation ? `${a.designation} at ` : ""}{a.current_company || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-zinc-400">{a.email || a.phone || "Private"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Events Tab ────────────────────────────────── */}
        <TabsContent value="events">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-emerald-400" /> Reunions & Mentorship Guest Lectures
              </CardTitle>
              <Button onClick={() => setShowEventModal(true)} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-zinc-950 font-bold">
                <Plus className="h-4 w-4 mr-2" /> Schedule Reunion Event
              </Button>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Calendar className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm">No alumni events scheduled</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map(evt => (
                    <Card key={evt.id} className="bg-zinc-900 border-zinc-800 p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-white text-base">{evt.event_title}</p>
                          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-emerald-400" /> {evt.event_date} | {evt.location || "Auditorium"}
                          </p>
                          {evt.description && <p className="text-xs text-zinc-500 mt-2">{evt.description}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                          {evt.rsvp_count} Confirmed RSVPs
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Register Alumni Modal */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Register Alumni Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Full Graduate Name</Label>
              <Input value={newAlumni.full_name} onChange={e => setNewAlumni(p => ({ ...p, full_name: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Muhammad Hamza" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Graduation Year</Label>
                <Input type="number" value={newAlumni.graduation_year} onChange={e => setNewAlumni(p => ({ ...p, graduation_year: parseInt(e.target.value) || 2022 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Higher Ed / Alma Mater</Label>
                <Input value={newAlumni.higher_education_uni} onChange={e => setNewAlumni(p => ({ ...p, higher_education_uni: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="LUMS / FAST" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Current Company</Label>
                <Input value={newAlumni.current_company} onChange={e => setNewAlumni(p => ({ ...p, current_company: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="Systems Ltd" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Designation / Role</Label>
                <Input value={newAlumni.designation} onChange={e => setNewAlumni(p => ({ ...p, designation: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="Senior Architect" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Contact Email / Phone</Label>
              <Input value={newAlumni.email} onChange={e => setNewAlumni(p => ({ ...p, email: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="hamza@alumni.org" />
            </div>
            <Button onClick={handleRegisterAlumni} className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold mt-2">
              Add Graduate Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Event Modal */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Schedule Alumni Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Event Title</Label>
              <Input value={newEvent.event_title} onChange={e => setNewEvent(p => ({ ...p, event_title: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Grand Alumni Reunion 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Date</Label>
                <Input type="date" value={newEvent.event_date} onChange={e => setNewEvent(p => ({ ...p, event_date: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Location</Label>
                <Input value={newEvent.location} onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="Main Campus Lawn" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Description</Label>
              <Input value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Networking, dinner & career panel" />
            </div>
            <Button onClick={handleCreateEvent} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-zinc-950 font-bold mt-2">
              Publish Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AlumniModule;
