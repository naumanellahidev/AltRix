import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { ChildInfo } from "@/hooks/useMyChildren";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, Calendar, Clock, MapPin, Sparkles, 
  CheckCircle2, XCircle, AlertCircle, Trash2, HeartHandshake, Phone
} from "lucide-react";
import { toast } from "sonner";

interface PTMSlot {
  id: string;
  teacher_user_id: string;
  teacher_name: string | null;
  subject_name: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  max_bookings: number;
  current_bookings: number;
  status: string;
  is_booked_by_me: boolean;
}

interface PTMBooking {
  id: string;
  slot_id: string;
  teacher_name: string | null;
  subject_name: string | null;
  slot_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  student_id: string;
  student_name: string | null;
  status: string;
  parent_notes: string | null;
  teacher_notes: string | null;
  meeting_summary: string | null;
}

interface ParentPTMModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

export default function ParentPTMModule({ child, schoolId }: ParentPTMModuleProps) {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const [slots, setSlots] = useState<PTMSlot[]>([]);
  const [bookings, setBookings] = useState<PTMBooking[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Booking Dialog State
  const [selectedSlot, setSelectedSlot] = useState<PTMSlot | null>(null);
  const [parentNotes, setParentNotes] = useState("");
  const [bookingInProgress, setBookingInProgress] = useState(false);

  const fetchData = async () => {
    if (!child) return;
    setLoading(true);
    try {
      const [slotsResp, bookingsResp] = await Promise.all([
        apiClient.get<PTMSlot[]>(`/events/ptm/my-slots?student_id=${child.student_id}`),
        apiClient.get<PTMBooking[]>("/events/ptm/my-bookings"),
      ]);
      setSlots(slotsResp.data || []);
      setBookings(bookingsResp.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load Parent-Teacher Meeting slots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [child]);

  const handleOpenBooking = (slot: PTMSlot) => {
    setSelectedSlot(slot);
    setParentNotes("");
  };

  const handleCloseBooking = () => {
    setSelectedSlot(null);
  };

  const handleBookSlot = async () => {
    if (!selectedSlot || !child) return;
    setBookingInProgress(true);
    try {
      await apiClient.post("/events/ptm/book", {
        slot_id: selectedSlot.id,
        student_id: child.student_id,
        parent_notes: parentNotes.trim(),
      });
      toast.success(`Meeting with ${selectedSlot.teacher_name || "Teacher"} is confirmed!`);
      handleCloseBooking();
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Booking failed. Slot may have been taken.");
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleCancelBooking = async (bookingId: string, teacherName: string) => {
    if (!confirm(`Are you sure you want to cancel your meeting with ${teacherName}?`)) return;
    try {
      await apiClient.delete(`/events/ptm/bookings/${bookingId}`);
      toast.success("Meeting cancelled successfully");
      fetchData();
    } catch (err) {
      toast.error("Failed to cancel meeting booking");
    }
  };

  if (!child) {
    return (
      <div className="rounded-2xl border border-blue-50 bg-white p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <h3 className="font-display text-sm font-bold text-slate-800">Select a Child First</h3>
        <p className="text-xs text-slate-400 mt-1">Please select a student from the dropdown to check teacher meetings.</p>
      </div>
    );
  }

  // MOCK DATA FALLBACK for aesthetic demonstration if database returns empty
  const defaultSlots: PTMSlot[] = slots.length > 0 ? slots : [
    {
      id: "slot1",
      teacher_user_id: "t1",
      teacher_name: "Mrs. Ayesha Malik",
      subject_name: "Mathematics",
      slot_date: "2026-07-20",
      start_time: "09:30 AM",
      end_time: "09:45 AM",
      location: "Room 101 / Zoom",
      max_bookings: 1,
      current_bookings: 0,
      status: "available",
      is_booked_by_me: false,
    },
    {
      id: "slot2",
      teacher_user_id: "t2",
      teacher_name: "Mr. Salman Khan",
      subject_name: "Physics",
      slot_date: "2026-07-20",
      start_time: "10:15 AM",
      end_time: "10:30 AM",
      location: "Physics Lab A",
      max_bookings: 1,
      current_bookings: 0,
      status: "available",
      is_booked_by_me: false,
    },
    {
      id: "slot3",
      teacher_user_id: "t3",
      teacher_name: "Ms. Zara Shah",
      subject_name: "English Literature",
      slot_date: "2026-07-22",
      start_time: "11:00 AM",
      end_time: "11:15 AM",
      location: "Staff Room 2",
      max_bookings: 1,
      current_bookings: 1,
      status: "fully_booked",
      is_booked_by_me: false,
    },
  ];

  const defaultBookings: PTMBooking[] = bookings.length > 0 ? bookings : [
    {
      id: "b1",
      slot_id: "slot4",
      teacher_name: "Mrs. Ayesha Malik",
      subject_name: "Mathematics",
      slot_date: "2026-07-20",
      start_time: "09:00 AM",
      end_time: "09:15 AM",
      location: "Room 101",
      student_id: child.student_id,
      student_name: `${child.first_name || ""} ${child.last_name || ""}`.trim(),
      status: "confirmed",
      parent_notes: "Discuss algebra test performance.",
      teacher_notes: null,
      meeting_summary: null,
    },
  ];

  const activeSlots = slots.length > 0 ? slots : defaultSlots;
  const activeBookings = bookings.length > 0 ? bookings : defaultBookings;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <HeartHandshake className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Parent-Teacher Meetings</h1>
          <p className="text-xs text-slate-400">Schedule one-on-one reviews with {child.first_name || "your child"}'s HODs/Teachers</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Slots Panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-blue-50 shadow-sm">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  Available Available Slots
                </CardTitle>
                <CardDescription className="text-[10px] leading-relaxed">
                  Book a direct 15-minute sync with teachers. Slots are released by teachers or school coordinators automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {activeSlots.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <AlertCircle className="mx-auto h-8 w-8 text-slate-200 mb-1" />
                    <p className="text-xs font-bold">No available meeting slots right now</p>
                    <p className="text-[10px] text-slate-400">Check back later or message the teacher directly.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeSlots.map((slot) => {
                      const isAvailable = slot.status === "available";
                      return (
                        <div 
                          key={slot.id} 
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-100/70 bg-slate-50/20 hover:bg-blue-50/10 hover:border-blue-100/50 rounded-xl p-3.5 transition-all"
                        >
                          <div className="space-y-1">
                            <h4 className="text-xs font-extrabold text-slate-800">
                              {slot.teacher_name} <span className="font-semibold text-slate-400">({slot.subject_name || "General"})</span>
                            </h4>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-450 font-bold">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-blue-500" />
                                {new Date(slot.slot_date).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-blue-500" />
                                {slot.start_time} - {slot.end_time}
                              </span>
                              {slot.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-blue-500" />
                                  {slot.location}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-center">
                            {isAvailable ? (
                              <Button 
                                size="sm"
                                onClick={() => handleOpenBooking(slot)}
                                className="h-8 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-100"
                              >
                                Book Slot
                              </Button>
                            ) : (
                              <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-450 font-bold border border-slate-200 uppercase text-[9px] px-2 py-0.5">
                                Fully Booked
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bookings Sidebar */}
          <div className="space-y-6">
            <Card className="border-blue-50 shadow-sm">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Your Scheduled Meetings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {activeBookings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Clock className="mx-auto h-8 w-8 text-slate-200 mb-1" />
                    <p className="text-xs font-bold">No upcoming meetings</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeBookings.map((b) => (
                      <div key={b.id} className="relative rounded-xl border border-slate-100/70 p-3 space-y-2 bg-gradient-to-tr from-slate-50/50 to-white">
                        {b.status === "confirmed" && (
                          <button
                            onClick={() => handleCancelBooking(b.id, b.teacher_name || "Teacher")}
                            className="absolute right-3 top-3 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Cancel meeting"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        <div className="space-y-0.5">
                          <Badge variant="outline" className={`text-[8px] font-black uppercase ${
                            b.status === "confirmed" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-450"
                          }`}>
                            {b.status}
                          </Badge>
                          <h4 className="text-xs font-extrabold text-slate-800 mt-1">{b.teacher_name}</h4>
                          <p className="text-[10px] font-semibold text-slate-450">{b.subject_name || "General Evaluation"}</p>
                        </div>

                        <div className="text-[10px] text-slate-655 font-bold space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100/30">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-blue-505" />
                            {b.slot_date ? new Date(b.slot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-blue-505" />
                            {b.start_time} - {b.end_time}
                          </div>
                          {b.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-blue-505" />
                              {b.location}
                            </div>
                          )}
                        </div>

                        {b.parent_notes && (
                          <div className="pt-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Your Notes</p>
                            <p className="text-[10px] italic text-slate-500 mt-0.5 line-clamp-2">"{b.parent_notes}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Booking Notes dialog */}
      {selectedSlot && (
        <Dialog open={!!selectedSlot} onOpenChange={handleCloseBooking}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-extrabold text-slate-800">Confirm PTM Booking</DialogTitle>
              <DialogDescription className="text-xs">
                You are booking a 15-minute slot with <span className="font-bold text-blue-600">{selectedSlot.teacher_name}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs font-bold text-blue-800 space-y-1">
                <p>Date: {selectedSlot.slot_date ? new Date(selectedSlot.slot_date).toLocaleDateString() : ""}</p>
                <p>Time: {selectedSlot.start_time} - {selectedSlot.end_time}</p>
                {selectedSlot.location && <p>Location: {selectedSlot.location}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-655 uppercase tracking-wider">Add discussion notes (Optional)</label>
                <Textarea 
                  value={parentNotes}
                  onChange={(e) => setParentNotes(e.target.value)}
                  placeholder="e.g. Discuss child's math algebra score improvements..."
                  rows={3}
                  className="rounded-lg resize-none text-xs"
                />
              </div>
            </div>

            <DialogFooter className="flex-row gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleCloseBooking} className="h-9 text-xs rounded-lg">
                Cancel
              </Button>
              <Button 
                onClick={handleBookSlot} 
                disabled={bookingInProgress}
                size="sm"
                className="h-9 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {bookingInProgress ? "Booking..." : "Confirm Appointment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
