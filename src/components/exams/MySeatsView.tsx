/**
 * A student's exam seats, for the student or their family.
 *
 * Both screens used to show every child the same invented seat — "Seat #A-1,
 * Main Auditorium Hall A, Prof. Tariq Mahmood" — so a family could send a
 * child to the wrong hall. This shows only seats the school has actually
 * allocated, and says plainly when none have been.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Grid, Loader2, MapPin, RefreshCw, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { date as formatDate } from "@/lib/documents/format";

interface Seat {
  student_id: string;
  student_name: string;
  roll_number?: string | null;
  section?: string | null;
  seat: string;
}

interface Plan {
  id: string;
  exam_name?: string | null;
  room_name?: string | null;
  exam_date?: string | null;
  start_time?: string | null;
  session_label?: string | null;
  invigilators?: Array<{ name?: string | null }>;
  seats: Seat[];
}

function time12(v?: string | null) {
  if (!v) return null;
  const [h, m] = v.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return v;
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function MySeatsView({ studentId, studentName, audience }: { studentId?: string | null; studentName?: string | null; audience: "parent" | "student" }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setPlans(null);
    setError(null);
    try {
      const res = await apiClient.get("/exams/seating-plans/my", { params: studentId ? { student_id: studentId } : {} });
      setPlans(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "unknown error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (plans ?? []).filter((p) => !p.exam_date || p.exam_date >= today);
  const past = (plans ?? []).filter((p) => p.exam_date && p.exam_date < today);

  const card = (p: Plan, muted = false) =>
    p.seats.map((s) => (
      <Card key={`${p.id}:${s.student_id}`} className={muted ? "opacity-70" : ""}>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge className="mb-1.5 bg-primary text-primary-foreground">Seat {s.seat}</Badge>
              <h3 className="text-lg font-bold">{p.exam_name ?? "Examination"}</h3>
              {p.session_label && <p className="text-sm text-muted-foreground">{p.session_label}</p>}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                <User className="h-3.5 w-3.5" /> {s.student_name}
              </div>
              {[s.roll_number ? `Roll ${s.roll_number}` : null, s.section].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-blue-50/60 p-3 dark:bg-blue-950/30">
              <div className="flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300"><MapPin className="h-3.5 w-3.5" /> Hall</div>
              <div className="font-bold">{p.room_name ?? "—"}</div>
            </div>
            <div className="rounded-lg border bg-violet-50/60 p-3 dark:bg-violet-950/30">
              <div className="flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300"><Clock className="h-3.5 w-3.5" /> Date & time</div>
              <div className="font-bold">{p.exam_date ? formatDate(p.exam_date) : "Date to be announced"}</div>
              {p.start_time && <div className="text-xs text-muted-foreground">Starts {time12(p.start_time)}</div>}
            </div>
            <div className="rounded-lg border bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Invigilator</div>
              <div className="font-bold">{(p.invigilators ?? []).map((v) => v.name).filter(Boolean).join(", ") || "Not yet assigned"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    ));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-white/20 bg-white/10 p-3"><Grid className="h-8 w-8 text-blue-100" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{audience === "parent" ? "Exam Seats" : "My Exam Seats"}</h1>
            <p className="mt-0.5 text-sm text-blue-100">
              {audience === "parent" ? `Hall and seat for ${studentName || "your child"} in each exam sitting.` : "Your hall and seat for each exam sitting."}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-destructive">Seats could not be loaded: {error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" /> Retry</Button>
          </CardContent>
        </Card>
      ) : plans === null ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Grid className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold">No seat has been allocated yet</p>
            <p className="mt-1 text-xs text-muted-foreground">The school publishes seating before each exam. Check back closer to the date.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && <div className="space-y-3">{upcoming.map((p) => card(p))}</div>}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Earlier sittings</h2>
              {past.map((p) => card(p, true))}
            </div>
          )}
          <Card>
            <CardContent className="flex gap-2 p-4 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              Arrive 15 minutes before the start time with the student ID card. Seats are fixed by the school and cannot be swapped.
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
