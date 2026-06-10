import { useState, useEffect, useMemo, useRef } from "react";
import { Send, MessageSquare, Search, Users, GraduationCap, Briefcase, UserCheck, Paperclip, X, FileText, Image, Loader2 } from "lucide-react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

interface User {
  user_id: string;
  display_name: string | null;
  role: string;
  email?: string;
}

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
  type: string;
  uploading?: boolean;
  url?: string;
}

interface SendMessageDialogProps {
  schoolId: string;
  trigger?: React.ReactNode;
  onMessageSent?: () => void;
}

export function SendMessageDialog({ schoolId, trigger, onMessageSent }: SendMessageDialogProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_ATTACHMENTS = 5;

  useEffect(() => {
    if (!open || !schoolId) return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        if (USE_FASTAPI) {
          const response = await apiClient.get("/schools/users-directory");
          setUsers((response.data ?? []) as User[]);
        } else {
          // Fetch all users with their roles in this school
          const { data: roles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .eq("school_id", schoolId);

          if (!roles || roles.length === 0) {
            setUsers([]);
            setLoading(false);
            return;
          }

          const userIds = [...new Set(roles.map((r) => r.user_id))];

          // Fetch profiles for these users
          const { data: profiles } = await (supabase as any)
            .from("profiles")
            .select("id, display_name")
            .in("id", userIds);

          const profileMap = new Map(
            ((profiles as any[]) ?? []).map((p: any) => [p.id, p.display_name])
          );

          // Build user list with roles
          const userList: User[] = roles.map((r) => ({
            user_id: r.user_id,
            display_name: profileMap.get(r.user_id) || "Unknown User",
            role: r.role,
          }));

          // Remove duplicates (keep first occurrence)
          const uniqueUsers = userList.reduce((acc, user) => {
            const existing = acc.find((u) => u.user_id === user.user_id);
            if (!existing) {
              acc.push(user);
            }
            return acc;
          }, [] as User[]);

          setUsers(uniqueUsers);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    setSelectedUsers([]);
    setSubject("");
    setContent("");
    setSearch("");
    setRoleFilter("all");
    setAttachments([]);
  }, [open, schoolId]);

  const filteredUsers = useMemo(() => {
    let filtered = users;

    if (roleFilter !== "all") {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.display_name?.toLowerCase().includes(searchLower) ||
          u.role.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [users, roleFilter, search]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length };
    users.forEach((u) => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return counts;
  }, [users]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.user_id === user.user_id);
      if (exists) {
        return prev.filter((u) => u.user_id !== user.user_id);
      }
      return [...prev, user];
    });
  };

  const selectAllFiltered = () => {
    setSelectedUsers((prev) => {
      const newSelected = [...prev];
      filteredUsers.forEach((user) => {
        if (!newSelected.find((u) => u.user_id === user.user_id)) {
          newSelected.push(user);
        }
      });
      return newSelected;
    });
  };

  const clearSelection = () => {
    setSelectedUsers([]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachmentFile[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + newFiles.length >= MAX_ATTACHMENTS) {
        toast({ title: `Maximum ${MAX_ATTACHMENTS} attachments allowed`, variant: "destructive" });
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: `${file.name} exceeds 10MB limit`, variant: "destructive" });
        continue;
      }
      newFiles.push({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }

    setAttachments((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (senderId: string): Promise<string[]> => {
    const urls: string[] = [];

    for (const attachment of attachments) {
      const fileExt = attachment.name.split(".").pop();
      const filePath = `${senderId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error } = await supabase.storage
        .from("message-attachments")
        .upload(filePath, attachment.file);

      if (error) {
        console.error("Upload error:", error);
        throw new Error(`Failed to upload ${attachment.name}`);
      }

      urls.push(filePath);
    }

    return urls;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const handleSend = async () => {
    if (!content.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }

    if (selectedUsers.length === 0) {
      toast({ title: "Please select at least one recipient", variant: "destructive" });
      return;
    }

    setSending(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const senderId = userData.user?.id;

      if (!senderId) {
        toast({ title: "Authentication error", variant: "destructive" });
        setSending(false);
        return;
      }

      // Upload attachments first
      let attachmentUrls: string[] = [];
      if (attachments.length > 0) {
        setUploadingFiles(true);
        try {
          attachmentUrls = await uploadAttachments(senderId);
        } catch (error: any) {
          toast({ title: "Failed to upload attachments", description: error.message, variant: "destructive" });
          setSending(false);
          setUploadingFiles(false);
          return;
        }
        setUploadingFiles(false);
      }

      if (USE_FASTAPI) {
        await apiClient.post("/messages", {
          subject: subject.trim() || "Message from Principal",
          content: content.trim(),
          priority: "normal",
          recipient_user_ids: selectedUsers.map((u) => u.user_id),
          attachment_urls: attachmentUrls,
        });
      } else {
        // Create a single admin message with attachments
        const { data: messageData, error: messageError } = await supabase
          .from("admin_messages")
          .insert({
            school_id: schoolId,
            sender_user_id: senderId,
            subject: subject.trim() || "Message from Principal",
            content: content.trim(),
            priority: "normal",
            status: "sent",
            attachment_urls: attachmentUrls,
          })
          .select("id")
          .single();

        if (messageError) {
          throw messageError;
        }

        // Create recipient records for tracking
        const recipientRecords = selectedUsers.map((user) => ({
          message_id: messageData.id,
          recipient_user_id: user.user_id,
        }));

        await supabase.from("admin_message_recipients").insert(recipientRecords);

        // Also create notifications for each recipient
        const notifications = selectedUsers.map((user) => ({
          school_id: schoolId,
          user_id: user.user_id,
          title: subject.trim() || "New Message from Principal",
          body: content.trim().substring(0, 100) + (content.length > 100 ? "..." : ""),
          type: "admin_message",
        }));

        await supabase.from("app_notifications").insert(notifications);
      }

      toast({
        title: "Message sent successfully",
        description: `Sent to ${selectedUsers.length} recipient(s)${attachmentUrls.length > 0 ? ` with ${attachmentUrls.length} attachment(s)` : ""}`,
      });

      onMessageSent?.();

      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "teacher":
        return <GraduationCap className="h-3 w-3" />;
      case "student":
        return <Users className="h-3 w-3" />;
      case "accountant":
      case "hr":
      case "marketing":
        return <Briefcase className="h-3 w-3" />;
      default:
        return <UserCheck className="h-3 w-3" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "teacher":
        return "default";
      case "principal":
      case "vice_principal":
        return "secondary";
      case "accountant":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="soft" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Send Message</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Send Message to Staff
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 pb-4">
            {/* Selected Recipients */}
            {selectedUsers.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground">
                    Selected Recipients ({selectedUsers.length})
                  </Label>
                  <Button variant="ghost" size="sm" onClick={clearSelection} className="h-6 text-xs">
                    Clear All
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.user_id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive/20"
                      onClick={() => toggleUser(user)}
                    >
                      {user.display_name}
                      <span className="ml-1 text-xs opacity-60">×</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* User Selection */}
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>Select Recipients</Label>
                <Button variant="outline" size="sm" onClick={selectAllFiltered} className="text-xs">
                  Select All Visible
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Role Filter Tabs */}
              <Tabs value={roleFilter} onValueChange={setRoleFilter}>
                <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger value="all" className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    All ({roleCounts.all || 0})
                  </TabsTrigger>
                  {["teacher", "accountant", "hr", "marketing", "principal", "vice_principal"].map(
                    (role) =>
                      (roleCounts[role] || 0) > 0 && (
                        <TabsTrigger
                          key={role}
                          value={role}
                          className="h-7 rounded-full px-3 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                        >
                          {role.replace("_", " ")} ({roleCounts[role]})
                        </TabsTrigger>
                      )
                  )}
                </TabsList>
              </Tabs>

              {/* User List */}
              <div className="max-h-32 rounded-lg border overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">Loading users...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredUsers.map((user) => {
                      const isSelected = selectedUsers.some((u) => u.user_id === user.user_id);
                      return (
                        <div
                          key={user.user_id}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleUser(user)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                                isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                              }`}
                            >
                              {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                            </div>
                            <span className="text-sm truncate">{user.display_name}</span>
                          </div>
                          <Badge variant={getRoleBadgeVariant(user.role)} className="shrink-0 gap-1 text-xs capitalize">
                            {getRoleIcon(user.role)}
                            {user.role.replace("_", " ")}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Message Form */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Message subject (optional)"
                />
              </div>

              <div>
                <Label htmlFor="content">Message *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  placeholder="Write your message..."
                  className="resize-none"
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attachments</Label>
                  <span className="text-xs text-muted-foreground">{attachments.length}/{MAX_ATTACHMENTS}</span>
                </div>
                
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {/* Attachment list */}
                {attachments.length > 0 && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm">
                        {getFileIcon(att.type)}
                        <span className="flex-1 truncate">{att.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeAttachment(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add attachment button */}
                {attachments.length < MAX_ATTACHMENTS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                    Add Attachment
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Send Button - Fixed at bottom */}
        <div className="shrink-0 border-t bg-background px-6 py-4">
          <Button
            onClick={handleSend}
            disabled={sending || uploadingFiles || !content.trim() || selectedUsers.length === 0}
            className="w-full"
          >
            {uploadingFiles ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {uploadingFiles ? "Uploading..." : sending ? "Sending..." : `Send to ${selectedUsers.length} recipient(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
