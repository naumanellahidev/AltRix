import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface AdminMessage {
  id: string;
  subject: string;
  content: string;
  priority: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function TeacherAdminInboxModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const [newMessage, setNewMessage] = useState({
    subject: "",
    content: "",
    priority: "normal",
  });

  useEffect(() => {
    if (tenant.status !== "ready") return;
    fetchMessages();
  }, [tenant.status, tenant.schoolId]);

  const fetchMessages = async () => {
    setLoading(true);

    const { data: user } = await api.auth.getUser();

    const { data } = await api
      .from("admin_messages")
      .select("*")
      .eq("school_id", tenant.schoolId)
      .eq("sender_user_id", user.user?.id)
      .order("created_at", { ascending: false });

    setMessages(data || []);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!newMessage.subject.trim() || !newMessage.content.trim()) {
      toast({ title: "Subject and content are required", variant: "destructive" });
      return;
    }

    const { data: user } = await api.auth.getUser();

    const { error } = await api.from("admin_messages").insert({
      school_id: tenant.schoolId,
      sender_user_id: user.user?.id,
      subject: newMessage.subject.trim(),
      content: newMessage.content.trim(),
      priority: newMessage.priority,
    });

    if (error) {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Message sent to admin" });
    setComposeOpen(false);
    setNewMessage({ subject: "", content: "", priority: "normal" });
    fetchMessages();
  };

  const priorityColors: Record<string, string> = {
    low: "bg-gray-100 text-gray-700",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };

  const statusColors: Record<string, string> = {
    open: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-700",
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Compose Button */}
      <div className="flex justify-end">
        <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Message to Admin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Message Administration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Subject *</Label>
                <Input
                  value={newMessage.subject}
                  onChange={(e) => setNewMessage((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief description of your request"
                />
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={newMessage.priority}
                  onValueChange={(v) => setNewMessage((p) => ({ ...p, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message *</Label>
                <Textarea
                  value={newMessage.content}
                  onChange={(e) => setNewMessage((p) => ({ ...p, content: e.target.value }))}
                  rows={5}
                  placeholder="Describe your request or issue in detail..."
                />
              </div>
              <Button onClick={sendMessage} className="w-full">
                Send to Admin
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Messages List */}
      <Card>
        <CardHeader>
          <CardTitle>My Admin Messages ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet. Use the button above to send a message to school administration.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{m.subject}</p>
                        <span className={`rounded px-2 py-0.5 text-xs ${priorityColors[m.priority]}`}>
                          {m.priority}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs ${statusColors[m.status]}`}>
                          {m.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">{m.content}</p>
                    </div>
                    {m.status === "resolved" && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sent: {new Date(m.created_at).toLocaleDateString()}</span>
                    {m.resolved_at && (
                      <span>Resolved: {new Date(m.resolved_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Tip:</strong> Use this feature to report issues, request resources, or communicate
            with school administration. Messages marked as "urgent" are prioritized.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
