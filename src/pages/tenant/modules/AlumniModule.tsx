import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  GraduationCap, Plus, Search, RefreshCw, Building, Calendar, Heart, Award, ExternalLink
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
  const [alumni, setAlumni] = useState<AlumniProfile[]>([]);
  const [events, setEvents] = useState<AlumniEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("directory");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newAlumni, setNewAlumni] = useState({
    full_name: "", graduation_year: 2022, higher_education_uni: "", current_company: "", designation: "", email: "", phone: "", linkedin_url: ""
  });

  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    event_title: "", event_date: new Date().toISOString().split("T")[0], location: "Main Auditorium", description: ""
  });

  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationData, setDonationData] = useState({
    alumni_id: "", amount: 50000, purpose: "Scholarship Fund"
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [resDir, resEv] = await Promise.all([
        apiClient.get("/alumni/directory"),
        apiClient.get("/alumni/events")
      ]);
      setAlumni(resDir.data ?? []);
      setEvents(resEv.data ?? []);
    } catch {
      setAlumni([]);
      setEvents([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (showDonationModal || showAddModal) {
      loadData();
    }
  }, [showDonationModal, showAddModal]);

  const handleRegisterAlumni = async () => {
    if (!newAlumni.full_name) {
      toast.error("Provide alumni full name");
      return;
    }
    try {
      await apiClient.post("/alumni/register", newAlumni);
      toast.success("Alumni profile created");
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to register alumni");
    }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.event_title) {
      toast.error("Provide event title");
      return;
    }
    try {
      await apiClient.post("/alumni/events", newEvent);
      toast.success("Alumni event scheduled");
      setShowEventModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to schedule event");
    }
  };

  const handleRecordDonation = async () => {
    if (!donationData.alumni_id || !donationData.amount) {
      toast.error("Select alumni and enter contribution amount");
      return;
    }
    try {
      await apiClient.post("/alumni/donations", donationData);
      toast.success("Alumni scholarship donation logged!");
      setShowDonationModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to record contribution");
    }
  };

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const years = ["all", ...Array.from(new Set(alumni.map(a => a.graduation_year?.toString()).filter(Boolean)))];

  const filteredAlumni = alumni.filter(a => {
    const matchesSearch = a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (a.current_company && a.current_company.toLowerCase().includes(search.toLowerCase())) ||
      (a.higher_education_uni && a.higher_education_uni.toLowerCase().includes(search.toLowerCase()));
    const matchesYear = selectedYear === "all" || a.graduation_year?.toString() === selectedYear;
    return matchesSearch && matchesYear;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <GraduationCap className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Alumni Network & Career Tracker</h1>
              <p className="text-blue-100 text-sm mt-0.5">Graduate directory, university placements, reunions & scholarship donations</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowDonationModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs h-9">
              <Heart className="h-4 w-4 mr-2 text-rose-300" /> Record Donation
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md rounded-xl text-xs h-9">
              <Plus className="h-4 w-4 mr-2" /> Register Alumni
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Alumni</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{alumni.length} Graduates</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Corporate Network</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">Top Tech & Govt</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reunions & Meetups</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{events.length} Events</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-full sm:w-auto bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 rounded-xl">
              <TabsTrigger value="directory" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs whitespace-nowrap rounded-lg">
                <GraduationCap className="h-3.5 w-3.5 mr-1.5" /> Alumni Directory ({alumni.length})
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold text-xs whitespace-nowrap rounded-lg">
                <Calendar className="h-3.5 w-3.5 mr-1.5" /> Reunions & Events ({events.length})
              </TabsTrigger>
              <TabsTrigger value="donations" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm font-semibold text-xs whitespace-nowrap rounded-lg">
                <Heart className="h-3.5 w-3.5 mr-1.5" /> Endowments & Giving
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Name, University, Company..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500 text-xs rounded-xl" />
            </div>
            <Button variant="outline" onClick={loadData} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 h-9 px-3 rounded-xl">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Directory Tab ──────────────────────────────── */}
        <TabsContent value="directory">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-blue-600" /> Master Alumni Graduate Roster
              </CardTitle>
              <Button onClick={() => setShowAddModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs h-9 self-start sm:self-auto rounded-xl shadow-sm">
                <Plus className="h-4 w-4 mr-2" /> Register Alumni
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Year Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {years.map(yr => (
                  <Button
                    key={yr}
                    size="sm"
                    variant={selectedYear === yr ? "default" : "outline"}
                    onClick={() => setSelectedYear(yr)}
                    className={`text-xs h-7 rounded-lg ${
                      selectedYear === yr ? "bg-blue-600 text-white font-semibold" : "text-slate-600 border-slate-200"
                    }`}
                  >
                    {yr === "all" ? "All Batches" : `Class of ${yr}`}
                  </Button>
                ))}
              </div>

              {filteredAlumni.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Alumni Profiles Found</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Register Alumni" to populate your graduate directory.</p>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                        <TableHead>Full Name</TableHead>
                        <TableHead>Class Of</TableHead>
                        <TableHead>University</TableHead>
                        <TableHead>Company & Role</TableHead>
                        <TableHead>Contact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlumni.map(a => (
                        <TableRow key={a.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{a.full_name}</TableCell>
                          <TableCell className="whitespace-nowrap"><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 font-mono">{a.graduation_year}</Badge></TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300 whitespace-nowrap">{a.higher_education_uni || "N/A"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{a.current_company || "N/A"}</p>
                            <p className="text-xs text-slate-500">{a.designation}</p>
                          </TableCell>
                          <TableCell className="text-xs text-blue-600 whitespace-nowrap">{a.email || a.phone || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Events Tab ─────────────────────────────────── */}
        <TabsContent value="events">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" /> Alumni Reunions & Networking Events
              </CardTitle>
              <Button onClick={() => setShowEventModal(true)} className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold text-xs h-9 self-start sm:self-auto rounded-xl shadow-sm">
                <Plus className="h-4 w-4 mr-2" /> Schedule Event
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {events.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No alumni events scheduled yet.</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Schedule Event" to host reunions and networking sessions.</p>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                        <TableHead>Event Title</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>RSVP Attendance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map(e => (
                        <TableRow key={e.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-bold text-indigo-700 dark:text-indigo-400">{e.event_title}</TableCell>
                          <TableCell className="text-sm font-medium">{e.event_date}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-400">{e.location || "Main Campus"}</TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              {e.rsvp_count || 0} Confirmed
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Donations & Endowments Tab ─────────────────── */}
        <TabsContent value="donations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 text-rose-600 rounded-xl">
                    <Heart className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Need-Based Scholarship Endowment</h3>
                    <p className="text-xs text-slate-500">Sponsored by Class of 2018 Alumni Group</p>
                  </div>
                </div>
                <Badge className="bg-rose-100 text-rose-800 border-rose-200">Active Campaign</Badge>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Raised: PKR 750,000</span>
                  <span className="text-blue-600 font-bold">Goal: PKR 1,000,000 (75%)</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-rose-500 to-indigo-600 h-full rounded-full w-3/4" />
                </div>
              </div>
              <Button onClick={() => setShowDonationModal(true)} className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 text-white font-semibold text-xs h-9 rounded-xl">
                Contribute to Scholarship Fund
              </Button>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 rounded-xl">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Robotics & AI Lab Fund</h3>
                    <p className="text-xs text-slate-500">Modern computing workstations and equipment</p>
                  </div>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active Campaign</Badge>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Raised: PKR 1,200,000</span>
                  <span className="text-emerald-600 font-bold">Goal: PKR 1,500,000 (80%)</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full rounded-full w-4/5" />
                </div>
              </div>
              <Button onClick={() => setShowDonationModal(true)} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs h-9 rounded-xl">
                Contribute to Lab Fund
              </Button>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Register Alumni Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Register Alumni Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-medium text-slate-600">Full Name</Label>
              <Input placeholder="e.g. Bilal Ahmed" value={newAlumni.full_name} onChange={e => setNewAlumni({ ...newAlumni, full_name: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600">Graduation Year</Label>
                <Input type="number" value={newAlumni.graduation_year} onChange={e => setNewAlumni({ ...newAlumni, graduation_year: parseInt(e.target.value) || 2022 })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">University / Higher Edu</Label>
                <Input placeholder="e.g. LUMS, NUST" value={newAlumni.higher_education_uni} onChange={e => setNewAlumni({ ...newAlumni, higher_education_uni: e.target.value })} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600">Current Company</Label>
                <Input placeholder="e.g. Systems Ltd" value={newAlumni.current_company} onChange={e => setNewAlumni({ ...newAlumni, current_company: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Designation</Label>
                <Input placeholder="e.g. Senior Software Engineer" value={newAlumni.designation} onChange={e => setNewAlumni({ ...newAlumni, designation: e.target.value })} className="mt-1 rounded-xl" />
              </div>
            </div>
            <Button onClick={handleRegisterAlumni} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl h-10 shadow-md">
              Save Alumni Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Event Modal */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-indigo-700 dark:text-indigo-400 font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Schedule Alumni Reunion / Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-medium text-slate-600">Event Title</Label>
              <Input placeholder="e.g. Annual Alumni Gala 2026" value={newEvent.event_title} onChange={e => setNewEvent({ ...newEvent, event_title: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600">Event Date</Label>
                <Input type="date" value={newEvent.event_date} onChange={e => setNewEvent({ ...newEvent, event_date: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Location / Venue</Label>
                <Input placeholder="e.g. Main Auditorium" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Description / Highlights</Label>
              <Input placeholder="e.g. Networking dinner, alumni awards and campus tour" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <Button onClick={handleCreateEvent} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl h-10 shadow-md">
              Publish Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Donation Modal */}
      <Dialog open={showDonationModal} onOpenChange={setShowDonationModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Record Alumni Contribution / Donation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-slate-600">Select Alumni Graduate</Label>
              <SearchableSelect
                placeholder="Type alumni name, class year, or university..."
                options={alumni.map(a => ({
                  id: a.id,
                  label: a.full_name,
                  sublabel: `Class of ${a.graduation_year} ${a.higher_education_uni ? '• ' + a.higher_education_uni : ''}`
                }))}
                value={donationData.alumni_id}
                onChange={val => setDonationData({ ...donationData, alumni_id: val })}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Contribution Amount (PKR)</Label>
              <Input type="number" value={donationData.amount} onChange={e => setDonationData({ ...donationData, amount: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Fund Purpose</Label>
              <Input value={donationData.purpose} onChange={e => setDonationData({ ...donationData, purpose: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <Button onClick={handleRecordDonation} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl h-10 shadow-md">
              Log Contribution
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AlumniModule;
