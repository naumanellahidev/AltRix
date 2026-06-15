import { useState, useEffect, useMemo, useRef } from "react";
import { Send, MessageSquare, Search, Users, GraduationCap, Briefcase, UserCheck, Paperclip, X, FileText, Image, Loader2, AlertCircle } from "lucide-react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [dragActive, setDragActive] = useState(false);
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
    setPriority("normal");
    setDragActive(false);
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
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
    }
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
    if (type.startsWith("image/")) return <Image className="h-4 w-4 text-primary" />;
    return <FileText className="h-4 w-4 text-violet-500" />;
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
          priority: priority,
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
            priority: priority,
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

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (role: string) => {
    switch (role) {
      case "teacher":
        return "bg-primary/15 text-primary border-primary/20";
      case "principal":
      case "vice_principal":
        return "bg-violet-500/15 text-violet-600 border-violet-500/20";
      case "accountant":
        return "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
      case "hr":
        return "bg-amber-500/15 text-amber-600 border-amber-500/20";
      default:
        return "bg-blue-500/15 text-blue-600 border-blue-500/20";
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
      
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden rounded-3xl border border-muted-foreground/15 shadow-2xl bg-background">
        {/* Full Width Dialog Header */}
        <DialogHeader className="px-6 py-4 shrink-0 border-b flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base font-bold font-display">
            <MessageSquare className="h-5 w-5 text-primary animate-pulse" />
            <span>Campus Broadcast Composer</span>
          </DialogTitle>
        </DialogHeader>

        {/* Responsive Dual Pane Container */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Pane: Recipients Directory Selector (40%) */}
          <div className="md:w-[350px] border-r flex flex-col bg-muted/10 shrink-0 h-full overflow-hidden">
            
            {/* Search and Action Header */}
            <div className="p-4 space-y-3 shrink-0 border-b bg-background/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipients List</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllFiltered} className="h-6 text-[10px] px-2">
                    Select All
                  </Button>
                  {selectedUsers.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearSelection} className="h-6 text-[10px] px-2 text-destructive hover:text-destructive">
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Search Field */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search staff directory..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg bg-surface border-muted-foreground/20 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Scrollable Role Filters */}
            <div className="px-4 py-2 shrink-0 overflow-x-auto no-scrollbar border-b bg-background/30 flex gap-1">
              <button
                type="button"
                onClick={() => setRoleFilter("all")}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border shrink-0 transition-all ${
                  roleFilter === "all"
                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                    : "bg-surface text-muted-foreground hover:bg-muted"
                }`}
              >
                All ({roleCounts.all || 0})
              </button>
              {["teacher", "accountant", "hr", "marketing", "principal", "vice_principal"].map(
                (role) =>
                  (roleCounts[role] || 0) > 0 && (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleFilter(role)}
                      className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border shrink-0 capitalize transition-all ${
                        roleFilter === role
                          ? "bg-primary border-primary text-primary-foreground shadow-sm"
                          : "bg-surface text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {role.replace("_", " ")} ({roleCounts[role]})
                    </button>
                  )
              )}
            </div>

            {/* Checklist User Scroll Area */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading directory...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <AlertCircle className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">No contacts match filter</span>
                </div>
              ) : (
                <div className="p-3 space-y-1">
                  {filteredUsers.map((user) => {
                    const isSelected = selectedUsers.some((u) => u.user_id === user.user_id);
                    return (
                      <div
                        key={user.user_id}
                        onClick={() => toggleUser(user)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition-all border ${
                          isSelected
                            ? "bg-primary/[0.04] border-primary/25 hover:bg-primary/[0.06]"
                            : "bg-surface border-transparent hover:bg-muted/40 hover:border-muted-foreground/10"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            id={`user-${user.user_id}`}
                            checked={isSelected}
                            onCheckedChange={() => {}} // toggled by parent click handler
                            className="rounded h-4 w-4 shrink-0 border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <div className={`h-8 w-8 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 select-none ${getAvatarColor(user.role)}`}>
                            {getInitials(user.display_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{user.display_name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{user.role.replace("_", " ")}</p>
                          </div>
                        </div>
                        <span className="text-muted-foreground/30 text-xs shrink-0">
                          {isSelected ? "✓" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Pane: Message Compose Pane (60%) */}
          <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
            
            {/* Selected Recipients Tag Container */}
            <div className="p-4 border-b shrink-0 bg-muted/5 flex items-center justify-between min-h-[48px]">
              <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
                <span className="text-xs font-bold text-muted-foreground shrink-0 uppercase tracking-wider">To:</span>
                {selectedUsers.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No recipients selected</span>
                ) : (
                  <div className="flex flex-wrap gap-1 max-h-[36px] overflow-y-auto no-scrollbar">
                    {selectedUsers.map((user) => (
                      <Badge
                        key={user.user_id}
                        variant="secondary"
                        className="text-[10px] py-0.5 px-2 gap-1 rounded-md shrink-0 border bg-surface/50 border-muted-foreground/15 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25 transition-all cursor-pointer"
                        onClick={() => toggleUser(user)}
                      >
                        <span className="truncate max-w-[100px]">{user.display_name}</span>
                        <X className="h-2.5 w-2.5 opacity-60" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {selectedUsers.length > 0 && (
                <span className="text-xs font-bold text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">
                  {selectedUsers.length} selected
                </span>
              )}
            </div>

            {/* Composer Scroll Area */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                
                {/* Priority Selector Grid */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Priority Level</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "low", label: "Low", color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10", activeColor: "bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500 shadow-sm" },
                      { value: "normal", label: "Normal", color: "border-muted-foreground/25 bg-muted/40 text-muted-foreground hover:bg-muted/70", activeColor: "bg-muted-foreground text-background hover:bg-muted-foreground/90 border-muted-foreground shadow-sm" },
                      { value: "high", label: "High", color: "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10", activeColor: "bg-amber-500 text-white hover:bg-amber-600 border-amber-500 shadow-sm" },
                      { value: "urgent", label: "Urgent", color: "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10", activeColor: "bg-rose-500 text-white hover:bg-rose-600 border-rose-500 shadow-sm" },
                    ].map((p) => {
                      const isActive = priority === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(p.value as any)}
                          className={`py-1.5 px-3 rounded-xl border text-[11px] font-semibold transition-all duration-200 ${
                            isActive ? p.activeColor : p.color
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subject Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subject</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Broadcast Subject (Optional)"
                    className="h-10 text-xs rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 bg-surface/30"
                  />
                </div>

                {/* Message Body Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="content" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Message Content *</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={4}
                    placeholder="Write detailed broadcast message..."
                    className="text-xs rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 resize-none bg-surface/30 min-h-[100px]"
                  />
                </div>

                {/* Attachments Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Attachments</Label>
                    <span className="text-[10px] text-muted-foreground font-semibold">{attachments.length}/{MAX_ATTACHMENTS} max</span>
                  </div>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* Drag and Drop Zone */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all duration-200 select-none ${
                      dragActive
                        ? "border-primary bg-primary/[0.04] scale-[0.99]"
                        : "border-muted-foreground/15 bg-muted/5 hover:bg-muted/30 hover:border-muted-foreground/25"
                    }`}
                  >
                    <Paperclip className="h-5 w-5 mx-auto mb-1 text-muted-foreground/75" />
                    <p className="text-xs font-semibold text-foreground">Click or drag files here to attach</p>
                    <p className="text-[9px] text-muted-foreground font-medium mt-0.5">Images, PDFs, or Doc files up to 10MB each</p>
                  </div>

                  {/* Uploaded Attachments Checklist */}
                  {attachments.length > 0 && (
                    <div className="space-y-1 rounded-2xl border bg-muted/15 p-2">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs border border-muted-foreground/5 shadow-sm">
                          {getFileIcon(att.type)}
                          <span className="flex-1 truncate font-medium">{att.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{formatFileSize(att.size)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAttachment(idx);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>

            {/* Footer Broadcast Action */}
            <div className="shrink-0 border-t bg-background px-6 py-4 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium max-w-[60%] leading-relaxed">
                * Broadcasting to multiple recipients immediately dispatches app notifications & updates audit streams.
              </p>
              <Button
                onClick={handleSend}
                disabled={sending || uploadingFiles || !content.trim() || selectedUsers.length === 0}
                className="gap-2 px-5 py-2 shadow-sm rounded-xl"
              >
                {uploadingFiles ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>
                  {uploadingFiles ? "Uploading..." : sending ? "Sending..." : `Broadcast (${selectedUsers.length})`}
                </span>
              </Button>
            </div>

          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
