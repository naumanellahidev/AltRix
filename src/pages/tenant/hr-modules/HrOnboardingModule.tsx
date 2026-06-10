import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { format, addDays } from "date-fns";

type Tpl = { id: string; name: string; description: string | null; is_active: boolean };
type TplTask = { id: string; template_id: string; title: string; description: string | null; due_offset_days: number; sort_order: number; owner_role: string | null };
type Assignment = { id: string; employee_user_id: string; template_id: string | null; start_date: string; status: string; notes: string | null };
type TaskStatus = { id: string; assignment_id: string; title: string; description: string | null; due_date: string | null; is_done: boolean; sort_order: number; owner_user_id: string | null };
type Staff = { user_id: string; display_name: string | null; email: string };

export function HrOnboardingModule({ kind = "onboarding" as "onboarding" | "offboarding" }) {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [templateTasks, setTemplateTasks] = useState<TplTask[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    const [t, tt, a, ts, s] = await Promise.all([
      (supabase as any).from("hr_onboarding_templates").select("*").eq("school_id", schoolId).eq("kind", kind).order("name"),
      (supabase as any).from("hr_onboarding_template_tasks").select("*").eq("school_id", schoolId).order("sort_order"),
      (supabase as any).from("hr_onboarding_assignments").select("*").eq("school_id", schoolId).eq("kind", kind).order("start_date", { ascending: false }),
      (supabase as any).from("hr_onboarding_task_status").select("*").eq("school_id", schoolId).order("sort_order"),
      (supabase as any).rpc("get_school_staff_directory", { _school_id: schoolId }),
    ]);
    if (t.data) setTemplates(t.data);
    if (tt.data) setTemplateTasks(tt.data);
    if (a.data) setAssignments(a.data);
    if (ts.data) setTaskStatuses(ts.data);
    if (s.data) setStaff(s.data);
  }, [schoolId, kind]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!schoolId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const title = kind === "onboarding" ? "Onboarding" : "Offboarding";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {kind === "onboarding" ? "Welcome new hires with structured checklists." : "Manage exits, asset returns, and clearance."}
        </p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({assignments.filter(a => a.status === "in_progress").length})</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <AssignmentList items={assignments.filter(a => a.status === "in_progress")} staff={staff} tasks={taskStatuses} schoolId={schoolId} templates={templates} templateTasks={templateTasks} onChange={refresh} kind={kind} />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <AssignmentList items={assignments.filter(a => a.status === "completed")} staff={staff} tasks={taskStatuses} schoolId={schoolId} templates={templates} templateTasks={templateTasks} onChange={refresh} kind={kind} readOnly />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab templates={templates} tasks={templateTasks} schoolId={schoolId} kind={kind} onChange={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssignmentList({ items, staff, tasks, schoolId, templates, templateTasks, onChange, kind, readOnly = false }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_user_id: "", template_id: "", start_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const start = async () => {
    if (!form.employee_user_id) { toast.error("Pick employee"); return; }
    const { data: a, error } = await (supabase as any).from("hr_onboarding_assignments").insert({
      school_id: schoolId, employee_user_id: form.employee_user_id, template_id: form.template_id || null,
      kind, start_date: form.start_date, notes: form.notes || null,
    }).select().single();
    if (error || !a) { toast.error(error?.message || "Failed"); return; }
    if (form.template_id) {
      const tts = templateTasks.filter((t: TplTask) => t.template_id === form.template_id);
      if (tts.length) {
        const rows = tts.map((t: TplTask) => ({
          school_id: schoolId, assignment_id: a.id, title: t.title, description: t.description,
          due_date: format(addDays(new Date(form.start_date), t.due_offset_days), "yyyy-MM-dd"),
          sort_order: t.sort_order,
        }));
        await (supabase as any).from("hr_onboarding_task_status").insert(rows);
      }
    }
    toast.success("Started");
    setOpen(false);
    setForm({ employee_user_id: "", template_id: "", start_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    onChange();
  };

  const toggleTask = async (t: TaskStatus) => {
    const { error } = await (supabase as any).from("hr_onboarding_task_status").update({
      is_done: !t.is_done, done_at: !t.is_done ? new Date().toISOString() : null,
    }).eq("id", t.id);
    if (error) toast.error(error.message); else onChange();
  };

  const complete = async (id: string) => {
    const { error } = await (supabase as any).from("hr_onboarding_assignments").update({ status: "completed" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Completed"); onChange(); }
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Start {kind === "onboarding" ? "Onboarding" : "Offboarding"}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New {kind === "onboarding" ? "Onboarding" : "Offboarding"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Employee *</Label>
                  <Select value={form.employee_user_id} onValueChange={v => setForm({ ...form, employee_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent className="max-h-72">{staff.map((s: Staff) => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Template</Label>
                  <Select value={form.template_id || "__none"} onValueChange={v => setForm({ ...form, template_id: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {templates.map((t: Tpl) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={start}>Start</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {items.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</CardContent></Card> :
        items.map((a: Assignment) => {
          const empName = staff.find((s: Staff) => s.user_id === a.employee_user_id)?.display_name || "Unknown";
          const my = tasks.filter((t: TaskStatus) => t.assignment_id === a.id);
          const done = my.filter((t: TaskStatus) => t.is_done).length;
          const pct = my.length ? Math.round((done / my.length) * 100) : 0;
          return (
            <Card key={a.id}>
              <CardContent className="p-4">
                <button className="w-full flex justify-between items-center" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                  <div className="text-left">
                    <p className="font-medium">{empName}</p>
                    <p className="text-xs text-muted-foreground">Started {format(new Date(a.start_date), "PP")} • {done}/{my.length} tasks</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="w-24" />
                    <Badge variant={pct === 100 ? "default" : "secondary"}>{pct}%</Badge>
                    <ChevronRight className={`h-4 w-4 transition ${expanded === a.id ? "rotate-90" : ""}`} />
                  </div>
                </button>
                {expanded === a.id && (
                  <div className="mt-4 space-y-2">
                    {my.map((t: TaskStatus) => (
                      <div key={t.id} className="flex items-start gap-3 p-2 rounded border">
                        <Checkbox checked={t.is_done} onCheckedChange={() => !readOnly && toggleTask(t)} disabled={readOnly} className="mt-1" />
                        <div className="flex-1">
                          <p className={`text-sm ${t.is_done ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                          {t.due_date && <p className="text-xs text-muted-foreground">Due {format(new Date(t.due_date), "PP")}</p>}
                        </div>
                      </div>
                    ))}
                    {!readOnly && pct === 100 && a.status !== "completed" && (
                      <Button size="sm" onClick={() => complete(a.id)}>Mark Completed</Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      }
    </div>
  );
}

function TemplatesTab({ templates, tasks, schoolId, kind, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [newTask, setNewTask] = useState({ title: "", due_offset_days: 0 });

  const saveTemplate = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (editing) {
      await (supabase as any).from("hr_onboarding_templates").update({ name, description: desc || null }).eq("id", editing.id);
    } else {
      await (supabase as any).from("hr_onboarding_templates").insert({ school_id: schoolId, name, description: desc || null, kind });
    }
    toast.success("Saved");
    setOpen(false); setName(""); setDesc(""); setEditing(null); onChange();
  };

  const addTask = async (tplId: string) => {
    if (!newTask.title.trim()) return;
    const order = tasks.filter((t: TplTask) => t.template_id === tplId).length;
    await (supabase as any).from("hr_onboarding_template_tasks").insert({
      school_id: schoolId, template_id: tplId, title: newTask.title,
      due_offset_days: Number(newTask.due_offset_days) || 0, sort_order: order,
    });
    setNewTask({ title: "", due_offset_days: 0 });
    onChange();
  };
  const delTask = async (id: string) => { await (supabase as any).from("hr_onboarding_template_tasks").delete().eq("id", id); onChange(); };
  const delTpl = async (id: string) => { if (confirm("Delete template?")) { await (supabase as any).from("hr_onboarding_templates").delete().eq("id", id); onChange(); } };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditing(null); setName(""); setDesc(""); }}><Plus className="h-4 w-4 mr-2" />New Template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div><Label>Description</Label><Textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={saveTemplate}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No templates yet.</CardContent></Card> :
        templates.map((t: Tpl) => {
          const my = tasks.filter((x: TplTask) => x.template_id === t.id);
          return (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => delTpl(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <div className="space-y-1">
                  {my.map((task: TplTask) => (
                    <div key={task.id} className="flex justify-between items-center text-sm py-1">
                      <span>{task.title} <span className="text-muted-foreground text-xs">(day +{task.due_offset_days})</span></span>
                      <Button size="icon" variant="ghost" onClick={() => delTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input placeholder="New task title" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} className="flex-1" />
                  <Input type="number" placeholder="Day offset" value={newTask.due_offset_days} onChange={e => setNewTask({ ...newTask, due_offset_days: Number(e.target.value) })} className="w-28" />
                  <Button size="sm" onClick={() => addTask(t.id)}>Add</Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      }
    </div>
  );
}
