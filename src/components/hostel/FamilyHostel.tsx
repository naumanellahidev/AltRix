import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, Loader2, Phone, RefreshCw, Shield, Users, Utensils } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { date as formatDate } from "@/lib/documents/format";

/**
 * A boarder's hostel stay, for the student or their parent, from the school's
 * hostel records: room, building, warden, roommates, and the mess menu.
 *
 * Both screens used to show the same invented hall, room, bed, warden (with
 * a phone number), roommates and menu for every child, boarder or not, and a
 * "leave pass request submitted" message for a request sent nowhere.
 */

interface Stay {
  allocated: boolean;
  building?: string | null;
  room_number?: string | null;
  room_type?: string | null;
  capacity?: number | null;
  check_in_date?: string | null;
  warden_name?: string | null;
  warden_phone?: string | null;
  roommates?: string[];
}

interface MenuDay {
  id: string;
  day_of_week: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  special_notes?: string | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function FamilyHostel({ studentId, audience }: { studentId: string | null; audience: "student" | "parent" }) {
  const [stay, setStay] = useState<Stay | null>(null);
  const [menu, setMenu] = useState<MenuDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        apiClient.get<Stay>("/hostel/my-stay", { params: { student_id: studentId } }),
        apiClient.get<MenuDay[]>("/hostel/mess-menu"),
      ]);
      setStay(s.data);
      setMenu((m.data ?? []).slice().sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week)));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "The hostel details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!studentId) {
    return <p className="text-sm text-muted-foreground p-6">{audience === "parent" ? "Select a child to see their hostel stay." : "Your student record is not linked to this login yet."}</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-700 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl border border-white/20"><Home className="h-8 w-8 text-purple-100" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Hostel & Boarding</h1>
              <p className="text-purple-100 text-sm mt-0.5">Room, warden, roommates and the mess menu.</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading && !stay ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stay && !stay.allocated ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {audience === "parent" ? "Your child is not allocated a hostel room." : "You are not allocated a hostel room."}
          {" "}If this is wrong, please contact the school office.
        </Card>
      ) : stay ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border border-slate-200 p-6 space-y-5 shadow-sm">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 gap-2">
              <div>
                {stay.room_number && <Badge className="bg-purple-100 text-purple-800 font-mono mb-1">Room {stay.room_number}</Badge>}
                <h2 className="text-xl font-bold text-slate-900">{stay.building || "Building not recorded"}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[stay.room_type, stay.capacity ? `${stay.capacity}-bed` : null].filter(Boolean).join(" · ") || "Room details not recorded"}
                </p>
              </div>
              {stay.check_in_date && <span className="text-xs text-slate-500">Since {formatDate(stay.check_in_date)}</span>}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><Users className="h-4 w-4" /> Roommates</h3>
              {stay.roommates && stay.roommates.length ? (
                <ul className="text-sm text-slate-700 space-y-1">{stay.roommates.map((n) => <li key={n}>{n}</li>)}</ul>
              ) : (
                <p className="text-sm text-slate-500">No one else is allocated this room.</p>
              )}
            </div>
          </Card>
          <Card className="border border-slate-200 p-6 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Shield className="h-4 w-4" /> Warden</h3>
            <p className="text-base font-semibold text-slate-900">{stay.warden_name || "Not recorded"}</p>
            {stay.warden_phone ? (
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={`tel:${stay.warden_phone}`}><Phone className="h-4 w-4 mr-1" /> {stay.warden_phone}</a>
              </Button>
            ) : (
              <p className="text-xs text-slate-500">No phone number recorded.</p>
            )}
            <p className="text-xs text-slate-500">Leave and gate passes are arranged with the warden.</p>
          </Card>
        </div>
      ) : null}

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Utensils className="h-4 w-4" /> Mess menu</CardTitle></CardHeader>
        <CardContent>
          {menu.length === 0 ? (
            <p className="text-sm text-muted-foreground">The school has not published a mess menu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-4">Day</th><th className="py-2 pr-4">Breakfast</th><th className="py-2 pr-4">Lunch</th><th className="py-2">Dinner</th></tr></thead>
                <tbody>
                  {menu.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-semibold">{d.day_of_week}</td>
                      <td className="py-2 pr-4">{d.breakfast}</td>
                      <td className="py-2 pr-4">{d.lunch}</td>
                      <td className="py-2">{d.dinner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
