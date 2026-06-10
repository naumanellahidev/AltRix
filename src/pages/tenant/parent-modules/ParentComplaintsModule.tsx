import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { ChildInfo } from "@/hooks/useMyChildren";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";

interface Complaint {
  id: string;
  subject: string;
  content: string;
  category: string | null;
  status: string;
  created_at: string;
  student_id: string | null;
  sender_user_id: string;
  resolution_note: string | null;
}

interface Props {
  child: ChildInfo | null;
  schoolId: string | null;
}

export default function ParentComplaintsModule({ child, schoolId }: Props) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});

  const load = async () => {
    if (!schoolId || !child) return;
    const { data } = await (supabase as any)
      .from("complaints")
      .select(
        "id, subject, content, category, status, created_at, student_id, sender_user_id, resolution_note"
      )
      .eq("school_id", schoolId)
      .eq("flow", "teacher_to_parent")
      .eq("student_id", child.student_id)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Complaint[];
    setItems(list);

    const ids = Array.from(new Set(list.map((c) => c.sender_user_id)));
    if (ids.length) {
      const { data: dir } = await supabase.rpc("get_school_user_directory", {
        _school_id: schoolId,
      });
      const map: Record<string, string> = {};
      (dir ?? []).forEach((d: any) => {
        if (ids.includes(d.user_id))
          map[d.user_id] = d.display_name || d.email || "Teacher";
      });
      setSenderNames(map);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId, child?.student_id]);

  const respond = async (c: Complaint) => {
    const note = responses[c.id]?.trim();
    if (!note) return toast.error("Write a response first");
    const { error } = await (supabase as any)
      .from("complaints")
      .update({ resolution_note: note, status: "in_review" })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Response sent");
    setResponses((p) => ({ ...p, [c.id]: "" }));
    load();
  };

  if (!child) return <p className="text-sm text-muted-foreground">Select a child first.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" /> Complaints from Teachers
        </h2>
        <p className="text-sm text-muted-foreground">
          Formal complaints filed by teachers about {child.first_name}. You can respond — the
          principal also sees these.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No complaints. 🎉
          </CardContent>
        </Card>
      ) : (
        items.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.subject}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>From {senderNames[c.sender_user_id] || "Teacher"}</span>
                {c.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {c.category}
                  </Badge>
                )}
                <Badge
                  variant={c.status === "resolved" ? "default" : "secondary"}
                  className="text-[10px] capitalize"
                >
                  {c.status.replace("_", " ")}
                </Badge>
                <span className="ml-auto">{format(new Date(c.created_at), "MMM d, yyyy")}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
              {c.resolution_note && (
                <p className="rounded bg-muted/50 p-2 text-sm">
                  <strong>Your response:</strong> {c.resolution_note}
                </p>
              )}
              {c.status !== "resolved" && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="Write a response to the teacher and principal…"
                    value={responses[c.id] ?? ""}
                    onChange={(e) =>
                      setResponses((p) => ({ ...p, [c.id]: e.target.value }))
                    }
                  />
                  <Button size="sm" onClick={() => respond(c)}>
                    Send response
                  </Button>
                </div>
              )}
              {schoolId && (
                <ComplaintThread
                  complaintId={c.id}
                  schoolId={schoolId}
                  authorRole="receiver"
                  nameLookup={senderNames}
                />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
