import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { ChildInfo } from "@/hooks/useMyChildren";

interface Note {
  id: string; note_date: string; behavior: string | null; routine: string | null; mood: string | null;
}

interface Props { child: ChildInfo | null; schoolId: string | null; }

export default function ParentBehaviorModule({ child, schoolId }: Props) {
  const { user } = useSession();
  const [items, setItems] = useState<Note[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ note_date: today, behavior: "", routine: "", mood: "happy" });

  const load = async () => {
    if (!schoolId || !child) return;
    const { data } = await (supabase as any).from("parent_behavior_notes")
      .select("*").eq("school_id", schoolId).eq("student_id", child.student_id)
      .order("note_date", { ascending: false }).limit(50);
    setItems(data || []);
  };
  useEffect(() => { load(); }, [schoolId, child]);

  const submit = async () => {
    if (!schoolId || !child || !user) return;
    if (!form.behavior.trim() && !form.routine.trim()) return toast.error("Add behavior or routine details");
    const { error } = await (supabase as any).from("parent_behavior_notes").insert({
      school_id: schoolId, student_id: child.student_id, parent_user_id: user.id,
      note_date: form.note_date, behavior: form.behavior || null, routine: form.routine || null, mood: form.mood,
    });
    if (error) return toast.error(error.message);
    toast.success("Behavior note saved — visible to teachers & principal");
    setForm({ note_date: today, behavior: "", routine: "", mood: "happy" });
    load();
  };
  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("parent_behavior_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (!child) return <p className="text-sm text-muted-foreground">Select a child first.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Behavior & Routine</h2>
        <p className="text-sm text-muted-foreground">Daily notes about {child.first_name} {child.last_name} — visible to school staff</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Heart className="h-4 w-4" />New entry for today</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={form.note_date} onChange={(e) => setForm({ ...form, note_date: e.target.value })} />
            <Select value={form.mood} onValueChange={(v) => setForm({ ...form, mood: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="happy">😊 Happy</SelectItem>
                <SelectItem value="neutral">😐 Neutral</SelectItem>
                <SelectItem value="upset">😟 Upset</SelectItem>
                <SelectItem value="tired">😴 Tired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Behavior at home (e.g. helpful, focused, restless...)" rows={3} value={form.behavior} onChange={(e) => setForm({ ...form, behavior: e.target.value })} />
          <Textarea placeholder="Routine (study time, sleep, activities, meals...)" rows={3} value={form.routine} onChange={(e) => setForm({ ...form, routine: e.target.value })} />
          <Button onClick={submit} className="w-full">Save note</Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-sm font-medium">Recent notes</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          items.map((n) => (
            <Card key={n.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{format(new Date(n.note_date), "MMM d, yyyy")}</p>
                      {n.mood && <Badge variant="outline" className="text-[10px]">{n.mood}</Badge>}
                    </div>
                    {n.behavior && <p className="mt-2 text-sm"><strong>Behavior:</strong> {n.behavior}</p>}
                    {n.routine && <p className="mt-1 text-sm"><strong>Routine:</strong> {n.routine}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(n.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
