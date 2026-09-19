/**
 * Exam halls and seating plans.
 *
 * Everything here is the school's real data: the halls it has registered, and
 * plans generated on the server from the students actually enrolled in the
 * chosen sections. It used to show invented halls and a plan full of invented
 * students whenever the server returned nothing, generate "Grade 9-A Candidate
 * #3" placeholders itself, post them to an endpoint that did not exist, and
 * report success regardless.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Building, Download, Grid, LayoutGrid, Loader2, MessageCircle, Printer, RefreshCw, ShieldCheck, Sparkles, Trash2, UserPlus, X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/hooks/useTenant";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { describeShare } from "@/lib/documents/deliver";
import { date as formatDate } from "@/lib/documents/format";
import {
  type SeatingPlanDoc,
  downloadSeatingPlans,
  printSeatingPlans,
  shareSeatingPlans,
} from "@/lib/documents/seating-plan";

interface Room {
  id: string;
  room_name: string;
  capacity_rows: number;
  capacity_cols: number;
  total_capacity: number;
}

interface Plan extends SeatingPlanDoc {
  exam_id: string;
  room_id: string;
  invigilators: Array<{ staff_user_id: string; role: string; name?: string | null }>;
}

const errorText = (e: any) => e?.response?.data?.detail ?? e?.message ?? "unknown error";

export function ExamSeatingPlanModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [exams, setExams] = useState<Array<{ id: string; name: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  const [staff, setStaff] = useState<Array<{ user_id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [examFilter, setExamFilter] = useState<string>("__all");
  const [busy, setBusy] = useState<string | null>(null);

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomData, setRoomData] = useState({ room_name: "", capacity_rows: 5, capacity_cols: 6 });

  const [showGenerate, setShowGenerate] = useState(false);
  const [gen, setGen] = useState({
    exam_id: "",
    section_ids: [] as string[],
    room_ids: [] as string[],
    exam_date: "",
    start_time: "09:00",
    session_label: "",
  });

  const [invigilatorFor, setInvigilatorFor] = useState<Plan | null>(null);
  const [invigilatorId, setInvigilatorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [roomsRes, plansRes] = await Promise.all([apiClient.get("/exams/rooms"), apiClient.get("/exams/seating-plans")]);
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : []);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Exams, sections and staff for the generator and invigilator pickers.
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const [examRes, secRes, classRes, staffRes] = await Promise.all([
          apiClient.get("/exams"),
          api.from("class_sections").select("id, name, class_id").eq("school_id", schoolId),
          api.from("academic_classes").select("id, name").eq("school_id", schoolId),
          api.rpc("get_school_staff_directory", { _school_id: schoolId }),
        ]);
        setExams((examRes.data ?? []).map((e: any) => ({ id: e.id, name: e.name })));
        const classNames = new Map((classRes.data ?? []).map((c: any) => [c.id, c.name]));
        setSections(
          (secRes.data ?? [])
            .map((s: any) => ({ id: s.id, label: [classNames.get(s.class_id), s.name].filter(Boolean).join(" — ") }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label, undefined, { numeric: true })),
        );
        setStaff(((staffRes as any).data ?? []).map((s: any) => ({ user_id: s.user_id, name: s.display_name || s.email })));
      } catch (e) {
        toast.error(`Could not load exams and sections: ${errorText(e)}`);
      }
    })();
  }, [schoolId]);

  const visiblePlans = useMemo(
    () => (examFilter === "__all" ? plans : plans.filter((p) => p.exam_id === examFilter)),
    [plans, examFilter],
  );
  const selected = visiblePlans.find((p) => p.id === selectedId) ?? visiblePlans[0] ?? null;

  const planTitle = (p: Plan) =>
    [p.exam_name, p.session_label, p.room_name].filter(Boolean).join(" · ") || "Seating plan";

  const addRoom = async () => {
    if (!roomData.room_name.trim()) return toast.error("Give the hall a name");
    setBusy("room");
    try {
      await apiClient.post("/exams/rooms", { ...roomData, room_name: roomData.room_name.trim() });
      toast.success(`${roomData.room_name.trim()} added`);
      setShowAddRoom(false);
      setRoomData({ room_name: "", capacity_rows: 5, capacity_cols: 6 });
      await load();
    } catch (e) {
      toast.error(`The hall could not be added: ${errorText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const deleteRoom = async (room: Room) => {
    if (!confirm(`Remove ${room.room_name}?`)) return;
    try {
      await apiClient.delete(`/exams/rooms/${room.id}`);
      toast.success(`${room.room_name} removed`);
      await load();
    } catch (e) {
      toast.error(`The hall could not be removed: ${errorText(e)}`);
    }
  };

  const seatsChosen = rooms.filter((r) => gen.room_ids.includes(r.id)).reduce((n, r) => n + r.capacity_rows * r.capacity_cols, 0);

  const generate = async () => {
    if (!gen.exam_id) return toast.error("Choose the exam");
    if (!gen.section_ids.length) return toast.error("Choose at least one class section");
    if (!gen.room_ids.length) return toast.error("Choose at least one hall");
    setBusy("generate");
    try {
      const res = await apiClient.post("/exams/seating-plans/generate", {
        exam_id: gen.exam_id,
        class_section_ids: gen.section_ids,
        room_ids: gen.room_ids,
        exam_date: gen.exam_date || null,
        start_time: gen.start_time || null,
        session_label: gen.session_label || null,
      });
      toast.success(res.data?.message ?? "Seating plan generated");
      setShowGenerate(false);
      setExamFilter(gen.exam_id);
      await load();
      if (res.data?.plans?.[0]) setSelectedId(String(res.data.plans[0]));
    } catch (e) {
      toast.error(`The seating plan could not be generated: ${errorText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const deletePlan = async (p: Plan) => {
    if (!confirm(`Delete the seating plan for ${planTitle(p)}?`)) return;
    try {
      await apiClient.delete(`/exams/seating-plans/${p.id}`);
      toast.success("Seating plan deleted");
      if (selectedId === p.id) setSelectedId(null);
      await load();
    } catch (e) {
      toast.error(`The plan could not be deleted: ${errorText(e)}`);
    }
  };

  const addInvigilator = async () => {
    if (!invigilatorFor || !invigilatorId) return;
    try {
      await apiClient.post(`/exams/seating-plans/${invigilatorFor.id}/invigilators`, { staff_user_id: invigilatorId, role: "primary" });
      toast.success("Invigilator assigned");
      setInvigilatorFor(null);
      setInvigilatorId("");
      await load();
    } catch (e) {
      toast.error(`The invigilator could not be assigned: ${errorText(e)}`);
    }
  };

  const removeInvigilator = async (p: Plan, staffId: string) => {
    try {
      await apiClient.delete(`/exams/seating-plans/${p.id}/invigilators/${staffId}`);
      await load();
    } catch (e) {
      toast.error(`The invigilator could not be removed: ${errorText(e)}`);
    }
  };

  /** Door sheet(s) as a PDF: one hall, or every hall of the exam shown. */
  const produce = async (kind: "print" | "download" | "share", list: Plan[], key: string) => {
    if (!list.length) return;
    setBusy(`${key}:${kind}`);
    const id = toast.loading("Preparing the seating plan…");
    try {
      if (kind === "share") {
        const outcome = await shareSeatingPlans(list);
        const { tone, message } = describeShare(outcome);
        const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
        if (tone === "error") toast.error(message + note, { id });
        else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
        else toast.success(message + note, { id });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printSeatingPlans(list) : await downloadSeatingPlans(list);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e) {
      toast.error(`The seating plan could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
    } finally {
      setBusy(null);
    }
  };

  const docButtons = (list: Plan[], key: string, labels = true) =>
    ([
      ["share", MessageCircle, "WhatsApp"],
      ["download", Download, "PDF"],
      ["print", Printer, "Print door sheet"],
    ] as const).map(([kind, Icon, label]) => (
      <Button
        key={kind}
        size="sm"
        variant="outline"
        disabled={!!busy || !list.length}
        onClick={() => produce(kind, list, key)}
        title={label}
        className={labels ? "" : "h-8 w-8 p-0"}
      >
        {busy === `${key}:${kind}` ? <Loader2 className={`h-4 w-4 animate-spin ${labels ? "mr-1" : ""}`} /> : <Icon className={`h-4 w-4 ${labels ? "mr-1" : ""}`} />}
        {labels ? label : null}
      </Button>
    ));

  const grid = (p: Plan) => {
    const rows = Math.max(p.rows ?? 0, ...p.seats.map((s) => s.row + 1), 1);
    const cols = Math.max(p.cols ?? 0, ...p.seats.map((s) => s.col + 1), 1);
    const at = new Map(p.seats.map((s) => [`${s.row}:${s.col}`, s]));
    const sectionsInPlan = [...new Set(p.seats.map((s) => s.section ?? ""))];
    const tone = (sec?: string | null) =>
      ["bg-blue-50 border-blue-200", "bg-emerald-50 border-emerald-200", "bg-amber-50 border-amber-200", "bg-violet-50 border-violet-200"][
        Math.max(0, sectionsInPlan.indexOf(sec ?? "")) % 4
      ];
    return (
      <div className="overflow-x-auto">
        <div className="mx-auto mb-3 w-2/5 rounded bg-primary py-1 text-center text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
          Front — Invigilator
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(92px, 1fr))` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const seat = at.get(`${r}:${c}`);
            return (
              <div key={i} className={`min-h-[64px] rounded-md border p-1.5 text-[11px] ${seat ? tone(seat.section) : "border-dashed bg-background"}`}>
                <div className="font-bold text-primary">{seat?.seat ?? `${String.fromCharCode(65 + (r % 26))}-${c + 1}`}</div>
                {seat && (
                  <>
                    <div className="truncate font-semibold">{seat.student_name}</div>
                    <div className="truncate text-muted-foreground">
                      {[seat.roll_number ? `Roll ${seat.roll_number}` : null, seat.section].filter(Boolean).join(" · ")}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 p-6 text-white shadow-lg">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <Grid className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Exam Seating Plans</h1>
              <p className="mt-0.5 text-sm text-blue-100">
                Seat enrolled students across your halls — sections alternate seat by seat so neighbours never share a class.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowAddRoom(true)} variant="outline" className="border-white/30 bg-white/10 font-semibold text-white hover:bg-white/20">
              <Building className="mr-2 h-4 w-4" /> Add Hall
            </Button>
            <Button onClick={() => setShowGenerate(true)} className="bg-white font-semibold text-blue-700 shadow-md hover:bg-blue-50">
              <Sparkles className="mr-2 h-4 w-4" /> Generate Seating
            </Button>
          </div>
        </div>
      </div>

      {loadError && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-destructive">Seating plans could not be loaded: {loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="visualizer" className="space-y-6">
        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger value="visualizer" className="gap-2 rounded-lg font-semibold">
            <LayoutGrid className="h-4 w-4 text-blue-600" /> Hall Layout
          </TabsTrigger>
          <TabsTrigger value="halls" className="gap-2 rounded-lg font-semibold">
            <Building className="h-4 w-4 text-indigo-600" /> Exam Halls ({rooms.length})
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 rounded-lg font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Seating Plans ({plans.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visualizer" className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visiblePlans.length === 0 ? (
            <Card className="border-dashed p-12 text-center">
              <LayoutGrid className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="font-semibold">No seating plans yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {rooms.length ? "Generate a plan for an exam sitting." : "Add your exam halls first, then generate a plan."}
              </p>
              <Button onClick={() => (rooms.length ? setShowGenerate(true) : setShowAddRoom(true))} className="mt-4">
                {rooms.length ? "Generate Seating" : "Add Hall"}
              </Button>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
                  <SelectTrigger className="w-full font-semibold md:w-96"><SelectValue placeholder="Choose a hall" /></SelectTrigger>
                  <SelectContent>
                    {visiblePlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{planTitle(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && docButtons([selected], selected.id)}
              </div>
              {selected && (
                <Card>
                  <CardHeader className="border-b bg-muted/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{selected.room_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {[selected.exam_name, selected.session_label, selected.exam_date ? formatDate(selected.exam_date) : null, selected.start_time]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{selected.seats.length} candidates</Badge>
                        {selected.invigilators.map((v) => (
                          <Badge key={v.staff_user_id} variant="outline" className="gap-1">
                            {v.name ?? "Invigilator"}
                            <button aria-label="Remove invigilator" onClick={() => removeInvigilator(selected, v.staff_user_id)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <Button size="sm" variant="ghost" onClick={() => setInvigilatorFor(selected)}>
                          <UserPlus className="mr-1 h-4 w-4" /> Invigilator
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">{grid(selected)}</CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="halls">
          <Card>
            <CardContent className="p-0">
              {rooms.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No halls registered yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hall</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Columns</TableHead>
                      <TableHead>Seats</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold">{r.room_name}</TableCell>
                        <TableCell>{r.capacity_rows}</TableCell>
                        <TableCell>{r.capacity_cols}</TableCell>
                        <TableCell className="font-semibold">{r.total_capacity}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => deleteRoom(r)} aria-label={`Remove ${r.room_name}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={examFilter} onValueChange={setExamFilter}>
              <SelectTrigger className="w-full md:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All exams</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {docButtons(visiblePlans, "all")}
          </div>
          <Card>
            <CardContent className="p-0">
              {visiblePlans.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No seating plans for this selection.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Sitting</TableHead>
                      <TableHead>Hall</TableHead>
                      <TableHead>Date & time</TableHead>
                      <TableHead>Invigilator</TableHead>
                      <TableHead>Candidates</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePlans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold">{p.exam_name ?? "—"}</TableCell>
                        <TableCell>{p.session_label ?? "—"}</TableCell>
                        <TableCell>{p.room_name ?? "—"}</TableCell>
                        <TableCell>{[p.exam_date ? formatDate(p.exam_date) : null, p.start_time].filter(Boolean).join(" · ") || "—"}</TableCell>
                        <TableCell>{p.invigilators.map((v) => v.name).filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell>{p.seats.length}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {docButtons([p], p.id, false)}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => deletePlan(p)} aria-label="Delete plan">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add an exam hall</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Hall name</Label>
              <Input value={roomData.room_name} onChange={(e) => setRoomData({ ...roomData, room_name: e.target.value })} placeholder="e.g. Hall A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Rows of desks</Label>
                <Input type="number" min={1} max={60} value={roomData.capacity_rows}
                  onChange={(e) => setRoomData({ ...roomData, capacity_rows: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div className="space-y-1">
                <Label>Desks per row</Label>
                <Input type="number" min={1} max={60} value={roomData.capacity_cols}
                  onChange={(e) => setRoomData({ ...roomData, capacity_cols: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{roomData.capacity_rows * roomData.capacity_cols} seats</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRoom(false)}>Cancel</Button>
            <Button onClick={addRoom} disabled={busy === "room"}>
              {busy === "room" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Add hall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Generate a seating plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Exam</Label>
              <Select value={gen.exam_id} onValueChange={(v) => setGen({ ...gen, exam_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose the exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={gen.exam_date} onChange={(e) => setGen({ ...gen, exam_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input type="time" value={gen.start_time} onChange={(e) => setGen({ ...gen, start_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Sitting (optional)</Label>
              <Input value={gen.session_label} onChange={(e) => setGen({ ...gen, session_label: e.target.value })} placeholder="e.g. Paper 1 — Mathematics" />
            </div>
            <div className="space-y-1">
              <Label>Class sections sitting together</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {sections.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={gen.section_ids.includes(s.id)}
                      onCheckedChange={(v) =>
                        setGen({ ...gen, section_ids: v ? [...gen.section_ids, s.id] : gen.section_ids.filter((x) => x !== s.id) })
                      }
                    />
                    {s.label}
                  </label>
                ))}
                {!sections.length && <p className="text-xs text-muted-foreground">No sections found.</p>}
              </div>
              <p className="text-[11px] text-muted-foreground">Choose two or more to alternate classes seat by seat.</p>
            </div>
            <div className="space-y-1">
              <Label>Halls</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {rooms.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={gen.room_ids.includes(r.id)}
                      onCheckedChange={(v) =>
                        setGen({ ...gen, room_ids: v ? [...gen.room_ids, r.id] : gen.room_ids.filter((x) => x !== r.id) })
                      }
                    />
                    {r.room_name} <span className="text-muted-foreground">({r.total_capacity} seats)</span>
                  </label>
                ))}
                {!rooms.length && <p className="text-xs text-muted-foreground">Add a hall first.</p>}
              </div>
              {gen.room_ids.length > 0 && <p className="text-[11px] text-muted-foreground">{seatsChosen} seats selected</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={generate} disabled={busy === "generate"}>
              {busy === "generate" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invigilatorFor} onOpenChange={(o) => !o && setInvigilatorFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign an invigilator</DialogTitle></DialogHeader>
          <Select value={invigilatorId} onValueChange={setInvigilatorId}>
            <SelectTrigger><SelectValue placeholder="Choose a staff member" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvigilatorFor(null)}>Cancel</Button>
            <Button onClick={addInvigilator} disabled={!invigilatorId}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExamSeatingPlanModule;
