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

  const filteredAlumni = alumni.filter(a =>
    a.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.current_company && a.current_company.toLowerCase().includes(search.toLowerCase())) ||
    (a.higher_education_uni && a.higher_education_uni.toLowerCase().includes(search.toLowerCase()))
  );

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
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowDonationModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20">
              <Heart className="h-4 w-4 mr-2 text-rose-300" /> Record Donation
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
              <Plus className="h-4 w-4 mr-2" /> Add Alumni
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Graduates</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{alumni.length} Alumni</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Building className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Universities Represented</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{new Set(alumni.map(a => a.higher_education_uni).filter(Boolean)).size} Unis</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming Reunions</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{events.length} Events</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <TabsTrigger value="directory" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-medium">
              <GraduationCap className="h-4 w-4 mr-2" /> Alumni Directory
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-medium">
              <Calendar className="h-4 w-4 mr-2" /> Reunions & Events
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Name, University, Company..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={loadData} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Directory Tab ──────────────────────────────── */}
        <TabsContent value="directory">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-blue-600" /> Master Alumni Graduate Roster
              </CardTitle>
              <Button onClick={() => setShowAddModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                <Plus className="h-4 w-4 mr-2" /> Register Alumni
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredAlumni.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Alumni Profiles Found</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Register Alumni" to populate your graduate directory.</p>
                </div>
              ) : (
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
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100">{a.full_name}</TableCell>
                        <TableCell><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{a.graduation_year}</Badge></TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{a.higher_education_uni || "N/A"}</TableCell>
                        <TableCell>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{a.current_company || "N/A"}</p>
                          <p className="text-xs text-slate-500">{a.designation}</p>
                        </TableCell>
                        <TableCell className="text-xs text-blue-600">{a.email || a.phone || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Events Tab ─────────────────────────────────── */}
        <TabsContent value="events">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" /> Alumni Reunions & Networking Events
              </CardTitle>
              <Button onClick={() => setShowEventModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                <Plus className="h-4 w-4 mr-2" /> Schedule Event
              </Button>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p>No alumni events scheduled yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Event Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>RSVP Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map(e => (
                      <TableRow key={e.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-bold text-blue-700 dark:text-blue-400">{e.event_title}</TableCell>
                        <TableCell>{e.event_date}</TableCell>
                        <TableCell>{e.location || "Main Campus"}</TableCell>
                        <TableCell className="font-semibold">{e.rsvp_count} Confirmed</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Register Alumni Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Register Alumni Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Full Name</Label>
              <Input value={newAlumni.full_name} onChange={e => setNewAlumni({ ...newAlumni, full_name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Graduation Year</Label>
                <Input type="number" value={newAlumni.graduation_year} onChange={e => setNewAlumni({ ...newAlumni, graduation_year: parseInt(e.target.value) || 2022 })} className="mt-1" />
              </div>
              <div>
                <Label>University</Label>
                <Input value={newAlumni.higher_education_uni} onChange={e => setNewAlumni({ ...newAlumni, higher_education_uni: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current Company</Label>
                <Input value={newAlumni.current_company} onChange={e => setNewAlumni({ ...newAlumni, current_company: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Designation</Label>
                <Input value={newAlumni.designation} onChange={e => setNewAlumni({ ...newAlumni, designation: e.target.value })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleRegisterAlumni} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Profile</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Donation Modal */}
      <Dialog open={showDonationModal} onOpenChange={setShowDonationModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Record Alumni Contribution / Donation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block">Select Alumni Graduate</Label>
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
              <Label>Contribution Amount (PKR)</Label>
              <Input type="number" value={donationData.amount} onChange={e => setDonationData({ ...donationData, amount: parseFloat(e.target.value) || 0 })} className="mt-1" />
            </div>
            <div>
              <Label>Fund Purpose</Label>
              <Input value={donationData.purpose} onChange={e => setDonationData({ ...donationData, purpose: e.target.value })} className="mt-1" />
            </div>
            <Button onClick={handleRecordDonation} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Log Contribution</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AlumniModule;
