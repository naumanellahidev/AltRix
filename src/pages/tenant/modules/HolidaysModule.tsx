import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Plus, Trash2, Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isBefore, startOfToday } from "date-fns";

interface Holiday {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  holiday_type: string;
}

interface Props { schoolId: string | null; canManage?: boolean }

const typeLabel: Record<string, string> = {
  public: "Public Holiday",
  school: "School Holiday",
  exam_break: "Exam Break",
  other: "Other",
};

const typeTone: Record<string, string> = {
  public: "bg-blue-500/10 text-blue-700 border-blue-200",
  school: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  exam_break: "bg-amber-500/10 text-amber-700 border-amber-200",
  other: "bg-slate-500/10 text-slate-700 border-slate-200",
};

export default function HolidaysModule({ schoolId, canManage = false }: Props) {
  const { user } = useSession();
  const [items, setItems] = useState<Holiday[]>([]);
  const [open, setOpen] = useState(false);
  const today = startOfToday();
  const todayStr = today.toISOString().slice(0, 10);
  const blank = { title: "", description: "", start_date: todayStr, end_date: todayStr, holiday_type: "public" };
  const [form, setForm] = useState<any>(blank);
  const [editing, setEditing] = useState<Holiday | null>(null);

  const load = async () => {
    if (!schoolId) return;
    const { data } = await (supabase as any)
      .from("holidays")
      .select("*")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: true });
    setItems(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId]);

  const { upcoming, past } = useMemo(() => {
    const up: Holiday[] = [];
    const pa: Holiday[] = [];
    for (const h of items) {
      // A holiday is "past" once its end_date is before today.
      const end = parseISO(h.end_date || h.start_date);
      if (isBefore(end, today)) pa.push(h);
      else up.push(h);
    }
    pa.sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
    return { upcoming: up, past: pa };
  }, [items, today]);

  const submit = async () => {
    if (!schoolId || !user) return;
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (form.end_date < form.start_date) { toast.error("End date must be after start date"); return; }
    let error;
    if (editing) {
      ({ error } = await (supabase as any).from("holidays").update(form).eq("id", editing.id));
    } else {
      ({ error } = await (supabase as any).from("holidays").insert({ school_id: schoolId, ...form, created_by: user.id }));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Holiday updated" : "Holiday added");
    setForm(blank); setEditing(null); setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this holiday?")) return;
    const { error } = await (supabase as any).from("holidays").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setForm({
      title: h.title,
      description: h.description || "",
      start_date: h.start_date,
      end_date: h.end_date,
      holiday_type: h.holiday_type || "public",
    });
    setOpen(true);
  };

  const renderHolidayCard = (h: Holiday, archived = false) => (
    <Card key={h.id} className={archived ? "opacity-70" : "hover:shadow-md transition-shadow"}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{h.title}</p>
            <Badge variant="outline" className={`text-[10px] ${typeTone[h.holiday_type] || ""}`}>
              {typeLabel[h.holiday_type] || h.holiday_type}
            </Badge>
            {archived && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Archive className="h-3 w-3" /> Past
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(parseISO(h.start_date), "MMM d, yyyy")}
            {h.start_date !== h.end_date && ` → ${format(parseISO(h.end_date), "MMM d, yyyy")}`}
          </p>
          {h.description && <p className="mt-2 text-sm whitespace-pre-wrap">{h.description}</p>}
        </div>
        {canManage && (
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(h)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(h.id)} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">
            Upcoming holidays and breaks. Past holidays auto-archive below.
          </p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(blank); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add holiday</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Title (e.g. Eid Holiday)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Start</label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">End</label>
                    <Input
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <Select value={form.holiday_type} onValueChange={(v) => setForm({ ...form, holiday_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public Holiday</SelectItem>
                    <SelectItem value="school">School Holiday</SelectItem>
                    <SelectItem value="exam_break">Exam Break</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>{editing ? "Save changes" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming <Badge variant="secondary" className="ml-2">{upcoming.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="past">
            Archive <Badge variant="secondary" className="ml-2">{past.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {upcoming.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="mx-auto h-10 w-10 opacity-50" />
              <p className="mt-3">No upcoming holidays.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {upcoming.map((h) => renderHolidayCard(h))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {past.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
              No past holidays archived yet.
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {past.map((h) => renderHolidayCard(h, true))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
