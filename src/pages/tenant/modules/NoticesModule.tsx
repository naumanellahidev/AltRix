import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pin, Plus, Trash2, Megaphone, Search, AlertTriangle, Users as UsersIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface Notice {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  priority: string;
  pinned: boolean;
  publish_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface Props {
  schoolId: string | null;
  canManage?: boolean;
}

const PRIORITY_TONE: Record<string, { dot: string; ring: string; text: string; label: string }> = {
  urgent: { dot: "bg-rose-500", ring: "ring-rose-500/30", text: "text-rose-600 dark:text-rose-400", label: "Urgent" },
  high:   { dot: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "High" },
  normal: { dot: "bg-sky-500",   ring: "ring-sky-500/30",   text: "text-sky-600 dark:text-sky-400",   label: "Normal" },
  low:    { dot: "bg-muted-foreground", ring: "ring-muted/40", text: "text-muted-foreground", label: "Low" },
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone", teachers: "Teachers", students: "Students", parents: "Parents", staff: "Staff",
};

export default function NoticesModule({ schoolId, canManage = false }: Props) {
  const { user } = useSession();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", priority: "normal", pinned: false });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pinned" | "urgent">("all");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("notices")
      .select("*")
      .eq("school_id", schoolId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load notices");
    setNotices(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId]);

  const submit = async () => {
    if (!schoolId || !user) return;
    if (!form.title.trim()) { toast.error("Title required"); return; }
    const { error } = await (supabase as any).from("notices").insert({
      school_id: schoolId,
      title: form.title,
      body: form.body || null,
      audience: form.audience,
      priority: form.priority,
      pinned: form.pinned,
      created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Notice posted");
    setForm({ title: "", body: "", audience: "all", priority: "normal", pinned: false });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("notices").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const togglePin = async (n: Notice) => {
    const { error } = await (supabase as any).from("notices").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const filtered = useMemo(() => {
    let list = notices;
    if (tab === "pinned") list = list.filter((n) => n.pinned);
    if (tab === "urgent") list = list.filter((n) => n.priority === "urgent" || n.priority === "high");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((n) =>
        n.title.toLowerCase().includes(q) ||
        (n.body || "").toLowerCase().includes(q) ||
        n.audience.toLowerCase().includes(q),
      );
    }
    return list;
  }, [notices, tab, search]);

  const counts = useMemo(() => ({
    total: notices.length,
    pinned: notices.filter((n) => n.pinned).length,
    urgent: notices.filter((n) => n.priority === "urgent" || n.priority === "high").length,
  }), [notices]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-7">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary/80 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Broadcast
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1.5">Notices</h2>
            <p className="text-sm text-muted-foreground mt-1">
              School-wide announcements · {counts.total} total
              {counts.pinned > 0 && <> · <span className="text-primary font-medium">{counts.pinned} pinned</span></>}
              {counts.urgent > 0 && <> · <span className="text-amber-600 dark:text-amber-400 font-medium">{counts.urgent} urgent</span></>}
            </p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="shadow-sm">
                  <Plus className="mr-2 h-4 w-4" /> New notice
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Post a notice</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <Textarea placeholder="Notice body..." rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={form.pinned}
                      onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                    />
                    <Pin className="h-3.5 w-3.5 text-primary" /> Pin to top
                  </label>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={submit}>Post notice</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
            <TabsTrigger value="pinned">
              <Pin className="h-3.5 w-3.5 mr-1" /> Pinned ({counts.pinned})
            </TabsTrigger>
            <TabsTrigger value="urgent">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Urgent ({counts.urgent})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="card-premium">
          <CardContent className="py-16 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-medium">No notices to show</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term." : canManage ? "Post your first announcement above." : "Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const tone = PRIORITY_TONE[n.priority] || PRIORITY_TONE.normal;
            return (
              <Card
                key={n.id}
                className={`card-premium card-premium-hover group relative overflow-hidden ${
                  n.pinned ? "ring-1 ring-primary/30" : ""
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${tone.dot}`} />
                <CardContent className="p-5 pl-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {n.pinned && (
                          <Pin className="h-3.5 w-3.5 text-primary" />
                        )}
                        <h3 className="text-base font-semibold tracking-tight truncate">{n.title}</h3>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`gap-1.5 ${tone.text}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                          {tone.label}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <UsersIcon className="h-3 w-3" />
                          {AUDIENCE_LABEL[n.audience] || n.audience}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          <span className="mx-1.5 opacity-40">·</span>
                          {format(new Date(n.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => togglePin(n)} title={n.pinned ? "Unpin" : "Pin"}>
                          <Pin className={`h-4 w-4 ${n.pinned ? "text-primary fill-primary" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(n.id)} title="Delete">
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-3 text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">
                      {n.body}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
