import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Diary { id: string; entry_date: string; title: string; content: string | null; category: string; class_section_id: string | null; subject_id: string | null; teacher_user_id: string | null; }
interface Section { id: string; name: string; }
interface Subject { id: string; name: string; }

interface Props { schoolId: string | null; canManage?: boolean; studentSectionId?: string | null; }

export default function DiaryModule({ schoolId, canManage = false, studentSectionId }: Props) {
  const { user } = useSession();
  const [items, setItems] = useState<Diary[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: "", content: "", category: "homework", entry_date: today, class_section_id: "", subject_id: "" });

  const load = async () => {
    if (!schoolId) return;
    let q = (supabase as any).from("diary_entries").select("*").eq("school_id", schoolId).order("entry_date", { ascending: false });
    if (studentSectionId) q = q.eq("class_section_id", studentSectionId);
    const { data } = await q;
    setItems(data || []);
  };
  const loadMeta = async () => {
    if (!schoolId) return;
    const [s, sub] = await Promise.all([
      (supabase as any).from("class_sections").select("id,name").eq("school_id", schoolId),
      (supabase as any).from("subjects").select("id,name").eq("school_id", schoolId),
    ]);
    setSections(s.data || []); setSubjects(sub.data || []);
  };
  useEffect(() => { load(); if (canManage) loadMeta(); }, [schoolId, studentSectionId]);

  const submit = async () => {
    if (!schoolId || !user) return;
    if (!form.title.trim()) { toast.error("Title required"); return; }
    const { error } = await (supabase as any).from("diary_entries").insert({
      school_id: schoolId, teacher_user_id: user.id,
      title: form.title, content: form.content || null, category: form.category, entry_date: form.entry_date,
      class_section_id: form.class_section_id || null, subject_id: form.subject_id || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Diary entry added"); setOpen(false); load();
    setForm({ title: "", content: "", category: "homework", entry_date: today, class_section_id: "", subject_id: "" });
  };
  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("diary_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-semibold">Class Diary</h2>
        <p className="text-sm text-muted-foreground">Homework, announcements & reminders</p></div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add diary entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <Textarea placeholder="Content / instructions..." rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="homework">Homework</SelectItem>
                      <SelectItem value="announcement">Announcement</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                      <SelectItem value="activity">Activity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.class_section_id} onValueChange={(v) => setForm({ ...form, class_section_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                    <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                    <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <BookOpen className="mx-auto h-10 w-10 opacity-50" /><p className="mt-3">No diary entries yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{d.title}</CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{d.category}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(d.entry_date), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  {canManage && d.teacher_user_id === user?.id && (
                    <Button variant="ghost" size="icon" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </CardHeader>
              {d.content && <CardContent className="pt-0"><p className="text-sm whitespace-pre-wrap">{d.content}</p></CardContent>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
