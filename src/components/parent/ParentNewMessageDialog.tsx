import { useEffect, useMemo, useState } from "react";
import { Send, MessageSquare, Search, GraduationCap, UserCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface User {
  user_id: string;
  display_name: string;
  role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string | null;
  studentId: string | null;
  childName: string;
  onSent?: () => void;
}

const STAFF_ROLES = ["teacher", "principal", "vice_principal", "academic_coordinator"];

export function ParentNewMessageDialog({
  open,
  onOpenChange,
  schoolId,
  studentId,
  childName,
  onSent,
}: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [recipient, setRecipient] = useState<User | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    if (!open || !schoolId) return;
    const fetchStaff = async () => {
      setLoading(true);
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("school_id", schoolId)
          .in("role", STAFF_ROLES);

        const { data: dir } = await supabase.rpc("get_school_user_directory", {
          _school_id: schoolId,
        });
        const dirMap = new Map<string, string>(
          (dir ?? []).map((d: any) => [d.user_id, d.display_name || d.email || "Member"])
        );

        const seen = new Set<string>();
        const list: User[] = [];
        (roles ?? []).forEach((r: any) => {
          if (seen.has(r.user_id)) return;
          seen.add(r.user_id);
          list.push({
            user_id: r.user_id,
            display_name: dirMap.get(r.user_id) || `Member ${r.user_id.slice(0, 6)}`,
            role: r.role,
          });
        });
        setUsers(list);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
    setRecipient(null);
    setSubject("");
    setContent("");
    setSearch("");
    setRoleFilter("all");
  }, [open, schoolId]);

  const filteredUsers = useMemo(() => {
    let f = users;
    if (roleFilter !== "all") f = f.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      f = f.filter(
        (u) =>
          u.display_name.toLowerCase().includes(s) || u.role.toLowerCase().includes(s)
      );
    }
    return f;
  }, [users, roleFilter, search]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = { all: users.length };
    users.forEach((u) => (c[u.role] = (c[u.role] || 0) + 1));
    return c;
  }, [users]);

  const handleSend = async () => {
    if (!recipient || !content.trim() || !schoolId || !studentId) {
      toast.error("Pick a recipient and write a message");
      return;
    }
    setSending(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      const senderId = ud.user?.id;
      if (!senderId) throw new Error("Not signed in");
      const { error } = await supabase.from("parent_messages").insert({
        school_id: schoolId,
        student_id: studentId,
        sender_user_id: senderId,
        recipient_user_id: recipient.user_id,
        subject: subject.trim() || null,
        content: content.trim(),
      });
      if (error) throw error;
      toast.success(`Message sent to ${recipient.display_name}`);
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            New message about {childName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 pb-4">
            {recipient && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground">To</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => setRecipient(null)}
                  >
                    {recipient.display_name}
                    <span className="ml-1 opacity-60">×</span>
                  </Badge>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Choose a teacher or staff member</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Tabs value={roleFilter} onValueChange={setRoleFilter}>
                <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="all"
                    className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    All ({roleCounts.all || 0})
                  </TabsTrigger>
                  {STAFF_ROLES.map(
                    (r) =>
                      (roleCounts[r] || 0) > 0 && (
                        <TabsTrigger
                          key={r}
                          value={r}
                          className="h-7 rounded-full px-3 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                        >
                          {r.replace("_", " ")} ({roleCounts[r]})
                        </TabsTrigger>
                      )
                  )}
                </TabsList>
              </Tabs>

              <div className="max-h-40 rounded-lg border overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading staff…
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No staff found.
                  </p>
                ) : (
                  <div className="space-y-1 p-2">
                    {filteredUsers.map((u) => {
                      const selected = recipient?.user_id === u.user_id;
                      return (
                        <button
                          key={u.user_id}
                          type="button"
                          onClick={() => setRecipient(u)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                            selected
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {selected && (
                                <span className="text-xs text-primary-foreground">✓</span>
                              )}
                            </div>
                            <span className="truncate text-sm">{u.display_name}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0 gap-1 text-xs capitalize">
                            {u.role === "teacher" ? (
                              <GraduationCap className="h-3 w-3" />
                            ) : (
                              <UserCheck className="h-3 w-3" />
                            )}
                            {u.role.replace("_", " ")}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="p-subject">Subject</Label>
                <Input
                  id="p-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Optional, e.g. Homework question"
                />
              </div>
              <div>
                <Label htmlFor="p-content">Message</Label>
                <Textarea
                  id="p-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type your message…"
                  rows={5}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !recipient || !content.trim()}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
