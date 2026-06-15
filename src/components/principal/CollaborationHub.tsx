import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { encryptMessage, decryptMessage } from "@/lib/crypto/ptEncryption";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { 
  MessageSquare, 
  Send, 
  Plus, 
  Users, 
  Lock, 
  Loader2, 
  HelpCircle,
  MessageCircle,
  Clock,
  Search,
  Hash,
  User,
  Check,
  Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Conversation {
  id: string;
  title: string;
  type: "channel" | "dm" | "group";
  participants: string[] | null;
  created_at: string;
}

interface Message {
  id: string;
  convo_id: string;
  sender_id: string;
  encrypted_body: { iv: string; data: string };
  created_at: string;
  decryptedText?: string;
}

interface SchoolMember {
  user_id: string;
  display_name: string;
  email: string;
  role?: string;
}

export function CollaborationHub() {
  const { schoolSlug } = useParams();
  const { user } = useSession();
  
  // School Context
  const [schoolId, setSchoolId] = useState<string | null>(null);
  
  // Lists & Directory
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Input & UI States
  const [newMessage, setNewMessage] = useState("");
  const [convoSearch, setConvoSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeTab, setActiveTab] = useState<"channel" | "dm">("channel");
  
  // Create Dialogue States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newChatType, setNewChatType] = useState<"channel" | "dm" | "group">("channel");
  const [newConvoTitle, setNewConvoTitle] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingConvo, setCreatingConvo] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Map school members for easy lookup
  const membersMap = useMemo(() => new Map(members.map(m => [m.user_id, m])), [members]);

  // Initials generator for avatars
  const getInitials = (name: string) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get conversation display title (especially for DMs)
  const getConvoTitle = (c: Conversation) => {
    if (c.type === "dm" && c.participants && user?.id) {
      const otherId = c.participants.find(p => p !== user.id);
      if (otherId) {
        const member = membersMap.get(otherId);
        if (member) return member.display_name;
      }
    }
    return c.title;
  };

  // 1. Fetch school ID from slug
  useEffect(() => {
    if (!schoolSlug) return;
    const fetchSchoolId = async () => {
      try {
        const { data, error } = await supabase
          .from("schools")
          .select("id")
          .eq("slug", schoolSlug)
          .maybeSingle();

        if (error) throw error;
        if (data?.id) {
          setSchoolId(data.id);
        }
      } catch (err) {
        console.error("Error fetching school ID:", err);
      }
    };
    fetchSchoolId();
  }, [schoolSlug]);

  // 2. Fetch Directory and Roles
  useEffect(() => {
    if (!schoolId) return;
    const fetchDirectory = async () => {
      try {
        const { data: dirData, error: dirError } = await supabase.rpc("get_school_user_directory", {
          _school_id: schoolId
        });
        if (dirError) throw dirError;

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("school_id", schoolId);
        
        const rMap = new Map<string, string>();
        if (roleData) {
          roleData.forEach((r: any) => rMap.set(r.user_id, r.role));
        }

        const list = (dirData || []).map((m: any) => ({
          user_id: m.user_id,
          display_name: m.display_name || m.email?.split("@")[0] || "School Member",
          email: m.email || "",
          role: rMap.get(m.user_id) || "Member"
        }));
        setMembers(list);
      } catch (err) {
        console.error("Error loading school user directory:", err);
      }
    };
    fetchDirectory();
  }, [schoolId]);

  // 3. Fetch Online Users
  const loadOnlineUsers = async () => {
    if (!schoolId) return;
    try {
      let activeIds: string[] = [];
      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/collaboration/online-users?school_id=${schoolId}`);
        activeIds = resp.data || [];
      }
      setOnlineUserIds(new Set(activeIds));
    } catch (err) {
      console.error("Failed to load online users:", err);
    }
  };

  useEffect(() => {
    if (schoolId) {
      loadOnlineUsers();
    }
  }, [schoolId]);

  // 4. Load conversations
  const loadConversations = async () => {
    if (!schoolId) return;
    try {
      setLoadingConvos(true);
      let data: Conversation[] = [];
      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/collaboration/conversations?school_id=${schoolId}`);
        data = resp.data || [];
      } else {
        const { data: dbData, error } = await supabase
          .from("pt_conversations")
          .select("id, title, type, participants, created_at")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        data = (dbData || []).map((c: any) => ({
          ...c,
          type: (c.type || "channel") as any,
          participants: c.participants ? c.participants.map(String) : null
        }));
      }
      setConvos(data);
      
      // Auto-select first conversation of active type
      const filtered = data.filter(c => {
        if (activeTab === "channel") return c.type === "channel" || c.type === "group";
        return c.type === "dm";
      });
      if (filtered.length > 0 && !activeConvo) {
        setActiveConvo(filtered[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load conversations, using local storage fallback:", err);
      const stored = localStorage.getItem(`pt_convos_${schoolId}`);
      const list = stored ? JSON.parse(stored) : [
        { id: "demo-convo-1", title: "General Parent-Teacher Discussion", type: "channel", participants: null, created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: "demo-convo-2", title: "Campus Development & Safety Updates", type: "channel", participants: null, created_at: new Date(Date.now() - 172800000).toISOString() }
      ];
      setConvos(list);
      if (list.length > 0 && !activeConvo) {
        setActiveConvo(list[0].id);
      }
    } finally {
      setLoadingConvos(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      loadConversations();
    }
  }, [schoolId, activeTab]);

  // Helper to decrypt a single message
  const decryptMsgObj = async (m: any): Promise<Message> => {
    try {
      const text = await decryptMessage(m.encrypted_body);
      return { ...m, decryptedText: text };
    } catch (e) {
      return { ...m, decryptedText: "[Decryption Failed]" };
    }
  };

  // 5. Load messages for active conversation
  const fetchMessages = async () => {
    if (!activeConvo) return;
    try {
      if (activeConvo.startsWith("demo-convo")) {
        const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
        const list = stored ? JSON.parse(stored) : [];
        const decrypted = await Promise.all(list.map(decryptMsgObj));
        setMessages(decrypted);
        return;
      }

      let data: Message[] = [];
      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/collaboration/messages?convo_id=${activeConvo}`);
        data = resp.data || [];
      } else {
        const { data: dbData, error } = await supabase
          .from("pt_messages")
          .select("id, convo_id, sender_id, encrypted_body, created_at")
          .eq("convo_id", activeConvo)
          .order("created_at", { ascending: true });

        if (error) throw error;
        data = dbData || [];
      }
      
      const decrypted = await Promise.all(data.map(decryptMsgObj));
      setMessages(decrypted);
    } catch (err: any) {
      console.error("Failed to fetch messages, checking local storage:", err);
      const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
      const list = stored ? JSON.parse(stored) : [];
      const decrypted = await Promise.all(list.map(decryptMsgObj));
      setMessages(decrypted);
    }
  };

  useEffect(() => {
    if (!activeConvo) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    fetchMessages().finally(() => setLoadingMessages(false));
  }, [activeConvo]);

  // 6. Real-time WebSocket hook integration
  useRealtimeSocket(
    // onNewConversation callback
    (newConvo) => {
      // Validate school context and visibility
      if (newConvo.school_id && newConvo.school_id !== schoolId) return;
      if (newConvo.type !== "channel" && newConvo.participants && user?.id && !newConvo.participants.includes(user.id)) {
        return; // Ignore private chats we are not part of
      }
      setConvos(prev => {
        if (prev.some(c => c.id === newConvo.id)) return prev;
        return [newConvo, ...prev];
      });
    },
    // onNewMessage callback
    async (newMsg) => {
      // Ignore if not belonging to school conversations we can access
      if (newMsg.participants && user?.id && !newMsg.participants.includes(user.id)) {
        return;
      }
      
      const decryptedMsg = await decryptMsgObj(newMsg);

      if (newMsg.convo_id === activeConvo) {
        setMessages(prev => {
          if (prev.some(m => m.id === decryptedMsg.id)) return prev;
          return [...prev, decryptedMsg];
        });
      } else {
        // Find convo details for notification
        const convo = convos.find(c => c.id === newMsg.convo_id);
        const nameOfConvo = convo ? getConvoTitle(convo) : "New Conversation";
        const sender = membersMap.get(newMsg.sender_id);
        const senderLabel = sender ? sender.display_name : "Someone";
        
        toast(`${senderLabel} in #${nameOfConvo}`, {
          description: decryptedMsg.decryptedText?.slice(0, 60),
          icon: <Bell className="h-4 w-4 text-primary animate-bounce" />,
          action: {
            label: "Open",
            onClick: () => {
              // Swap tab if needed
              if (convo) {
                setActiveTab(convo.type === "dm" ? "dm" : "channel");
              }
              setActiveConvo(newMsg.convo_id);
            }
          }
        });
      }
    },
    // onPresenceUpdate callback
    (presenceEvent) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (presenceEvent.status === "online") {
          next.add(presenceEvent.user_id);
        } else {
          next.delete(presenceEvent.user_id);
        }
        return next;
      });
    }
  );

  // 7. Send message operation
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConvo || !user?.id) return;
    
    const textToSend = newMessage.trim();
    setNewMessage(""); // Snippy UI

    try {
      const encrypted = await encryptMessage(textToSend);
      if (activeConvo.startsWith("demo-convo")) {
        const payload: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          convo_id: activeConvo,
          sender_id: user.id,
          encrypted_body: encrypted,
          created_at: new Date().toISOString(),
          decryptedText: textToSend
        };
        const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
        const currentMsgs = stored ? JSON.parse(stored) : [];
        const updated = [...currentMsgs, payload];
        localStorage.setItem(`pt_msgs_${activeConvo}`, JSON.stringify(updated));
        setMessages(updated);
        return;
      }

      if (USE_FASTAPI) {
        await apiClient.post("/collaboration/messages", {
          convo_id: activeConvo,
          sender_id: user.id,
          encrypted_body: encrypted,
        });
      } else {
        const { error } = await supabase.from("pt_messages").insert({
          convo_id: activeConvo,
          sender_id: user.id,
          encrypted_body: encrypted,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Error sending message, saving to local store:", err);
      // Failover to local store
      const encrypted = await encryptMessage(textToSend);
      const payload: Message = {
        id: `msg-${Date.now()}-${Math.random()}`,
        convo_id: activeConvo,
        sender_id: user.id,
        encrypted_body: encrypted,
        created_at: new Date().toISOString(),
        decryptedText: textToSend
      };
      const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
      const currentMsgs = stored ? JSON.parse(stored) : [];
      const updated = [...currentMsgs, payload];
      localStorage.setItem(`pt_msgs_${activeConvo}`, JSON.stringify(updated));
      setMessages(updated);
    }
  };

  // 8. Create new conversation operation
  const handleCreateConversation = async () => {
    if (!schoolId || !user?.id) return;
    if (newChatType !== "dm" && !newConvoTitle.trim()) {
      toast.error("Please provide a name/title for the channel or group.");
      return;
    }

    setCreatingConvo(true);
    try {
      const typeStr = newChatType;
      let titleVal = newConvoTitle.trim();
      let participantList: string[] | null = null;

      if (typeStr === "dm") {
        if (selectedMembers.length !== 1) {
          toast.error("Please select exactly one participant for a DM.");
          setCreatingConvo(false);
          return;
        }
        participantList = [user.id, selectedMembers[0]];
        titleVal = `DM-${user.id.slice(0,4)}-${selectedMembers[0].slice(0,4)}`;
      } else if (typeStr === "group") {
        participantList = [user.id, ...selectedMembers];
      }

      const isFallback = convos.some(c => c.id.startsWith("demo-convo")) || !navigator.onLine;
      if (isFallback) {
        const newConvo: Conversation = {
          id: `demo-convo-${Date.now()}`,
          title: typeStr === "dm" ? (membersMap.get(selectedMembers[0])?.display_name || "Direct Message") : titleVal,
          type: typeStr,
          participants: participantList,
          created_at: new Date().toISOString()
        };
        const updated = [newConvo, ...convos];
        localStorage.setItem(`pt_convos_${schoolId}`, JSON.stringify(updated));
        setConvos(updated);
        setActiveConvo(newConvo.id);
        toast.success("Chat created successfully!");
        resetCreateForm();
        return;
      }

      let newId = "";
      if (USE_FASTAPI) {
        const resp = await apiClient.post("/collaboration/conversations", {
          school_id: schoolId,
          title: titleVal,
          type: typeStr,
          participants: participantList
        });
        newId = resp.data?.id;
      } else {
        const { data, error } = await supabase
          .from("pt_conversations")
          .insert({
            school_id: schoolId,
            title: titleVal,
            type: typeStr,
            participants: participantList
          })
          .select()
          .single();

        if (error) throw error;
        newId = data?.id;
      }
      
      toast.success("Chat created successfully!");
      resetCreateForm();
      
      await loadConversations();
      if (newId) {
        setActiveConvo(newId);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create conversation");
    } finally {
      setCreatingConvo(false);
    }
  };

  const resetCreateForm = () => {
    setNewConvoTitle("");
    setSelectedMembers([]);
    setMemberSearchQuery("");
    setCreateDialogOpen(false);
  };

  // Filter Conversations based on Active Tab and Search
  const filteredConvos = useMemo(() => {
    return convos.filter(c => {
      // Tabs categorization
      const isConvoTabType = activeTab === "channel" 
        ? (c.type === "channel" || c.type === "group")
        : c.type === "dm";

      if (!isConvoTabType) return false;

      // Sidebar text filter
      if (!convoSearch.trim()) return true;
      const term = convoSearch.toLowerCase();
      const resolvedTitle = getConvoTitle(c).toLowerCase();
      return resolvedTitle.includes(term);
    });
  }, [convos, activeTab, convoSearch, membersMap]);

  // Filter Messages based on Decrypted Body Text
  const filteredMessages = useMemo(() => {
    if (!messageSearch.trim()) return messages;
    const term = messageSearch.toLowerCase();
    return messages.filter(m => m.decryptedText?.toLowerCase().includes(term));
  }, [messages, messageSearch]);

  // Filter Members in directory selector
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return members.filter(m => m.user_id !== user?.id);
    const term = memberSearchQuery.toLowerCase();
    return members.filter(m => 
      m.user_id !== user?.id &&
      (m.display_name.toLowerCase().includes(term) || 
       m.email.toLowerCase().includes(term) || 
       m.role?.toLowerCase().includes(term))
    );
  }, [members, memberSearchQuery, user]);

  const activeConvoDetails = convos.find(c => c.id === activeConvo);

  // Toggle member selection in Group Create Mode
  const toggleMemberSelection = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-surface border border-border/60 rounded-3xl p-5 md:p-6 shadow-soft h-[700px] overflow-hidden">
      
      {/* ── Left Sidebar (Conversations List & Search) ── */}
      <div className="lg:col-span-1 border-r border-border/60 pr-4 flex flex-col h-full overflow-hidden">
        
        {/* Navigation Tabs (Channels / Direct Messages) */}
        <div className="mb-4">
          <Tabs value={activeTab} onValueChange={(val: any) => {
            setActiveTab(val);
            setActiveConvo(null);
          }} className="w-full">
            <TabsList className="grid grid-cols-2 rounded-xl bg-muted p-1 border border-border/40">
              <TabsTrigger value="channel" className="rounded-lg text-xs font-semibold py-2">Channels</TabsTrigger>
              <TabsTrigger value="dm" className="rounded-lg text-xs font-semibold py-2">DMs</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Sidebar Header & Add Button */}
        <div className="flex items-center justify-between pb-3">
          <h2 className="font-display font-bold text-xs tracking-wide uppercase text-foreground/80 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" /> 
            {activeTab === "channel" ? "Spaces & Groups" : "Direct Chats"}
          </h2>
          
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            if (open) resetCreateForm();
            setCreateDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary transition-all">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-surface border border-border rounded-3xl p-6 text-foreground shadow-elevated">
              <DialogHeader>
                <DialogTitle className="font-display font-semibold text-lg text-foreground">Create New Chat Space</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                
                {/* Chat type picker */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">Type</span>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      size="sm" 
                      variant={newChatType === "channel" ? "default" : "outline"}
                      onClick={() => { setNewChatType("channel"); setSelectedMembers([]); }}
                      className="text-xs rounded-xl"
                    >
                      Public Space
                    </Button>
                    <Button 
                      size="sm" 
                      variant={newChatType === "dm" ? "default" : "outline"}
                      onClick={() => { setNewChatType("dm"); setSelectedMembers([]); }}
                      className="text-xs rounded-xl"
                    >
                      Direct Chat
                    </Button>
                    <Button 
                      size="sm" 
                      variant={newChatType === "group" ? "default" : "outline"}
                      onClick={() => { setNewChatType("group"); setSelectedMembers([]); }}
                      className="text-xs rounded-xl"
                    >
                      Private Group
                    </Button>
                  </div>
                </div>

                {/* Title Input for Channels / Groups */}
                {newChatType !== "dm" && (
                  <div className="space-y-1.5">
                    <label htmlFor="topic-title" className="text-xs font-semibold text-muted-foreground">Title</label>
                    <Input 
                      id="topic-title" 
                      value={newConvoTitle} 
                      onChange={(e) => setNewConvoTitle(e.target.value)} 
                      placeholder={newChatType === "channel" ? "e.g. PTA Committee" : "e.g. Science Fair Sync"} 
                      className="bg-background border-border focus:border-primary rounded-xl"
                      onKeyDown={(e) => e.key === "Enter" && handleCreateConversation()}
                    />
                  </div>
                )}

                {/* Member Search & Selection for DMs & Groups */}
                {newChatType !== "channel" && (
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {newChatType === "dm" ? "Select Participant" : "Select Group Members"}
                    </label>
                    
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        value={memberSearchQuery} 
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="Search members by name or role..."
                        className="pl-9 bg-background border-border rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background p-2 space-y-1 scrollbar-thin">
                      {filteredMembers.length === 0 ? (
                        <p className="text-[11px] text-center text-muted-foreground py-6">No matching school members found.</p>
                      ) : (
                        filteredMembers.map((m) => {
                          const isSelected = selectedMembers.includes(m.user_id);
                          const isOnline = onlineUserIds.has(m.user_id);

                          return (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() => {
                                if (newChatType === "dm") {
                                  setSelectedMembers([m.user_id]);
                                } else {
                                  toggleMemberSelection(m.user_id);
                                }
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors ${
                                isSelected 
                                  ? "bg-primary/10 border border-primary/25 text-primary" 
                                  : "hover:bg-muted/65 text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="relative h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {getInitials(m.display_name)}
                                  {isOnline && (
                                    <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-550 ring-1 ring-background" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold truncate">{m.display_name}</p>
                                  <p className="text-[9px] text-muted-foreground truncate capitalize">{m.role?.replace("_", " ")}</p>
                                </div>
                              </div>
                              
                              {newChatType === "group" ? (
                                <Checkbox 
                                  checked={isSelected}
                                  onCheckedChange={() => toggleMemberSelection(m.user_id)}
                                  className="rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0"
                                />
                              ) : (
                                isSelected && <Check className="h-4 w-4 text-primary shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={resetCreateForm} className="rounded-xl">Cancel</Button>
                <Button 
                  size="sm" 
                  onClick={handleCreateConversation} 
                  disabled={creatingConvo || (newChatType !== "dm" && !newConvoTitle.trim()) || (newChatType !== "channel" && selectedMembers.length === 0)}
                  className="rounded-xl"
                >
                  {creatingConvo && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Sidebar Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Filter conversations..." 
            value={convoSearch}
            onChange={(e) => setConvoSearch(e.target.value)}
            className="pl-9 bg-muted/40 border-border text-foreground placeholder-muted-foreground rounded-xl h-9 text-xs focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
          />
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
          {loadingConvos ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2.5">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-[10px] font-mono tracking-widest uppercase">Syncing channels...</p>
            </div>
          ) : filteredConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/80 p-4">
              <MessageSquare className="h-8 w-8 opacity-30 mb-2" />
              <p className="text-xs font-bold">No chats found</p>
              <p className="text-[10px] mt-1 leading-relaxed max-w-[140px] mx-auto">Create a new secure channel above.</p>
            </div>
          ) : (
            filteredConvos.map((c) => {
              const isSelected = c.id === activeConvo;
              const titleText = getConvoTitle(c);
              
              // Resolve active indicator for DMs
              let isConvoOnline = false;
              if (c.type === "dm" && c.participants && user?.id) {
                const otherId = c.participants.find(p => p !== user.id);
                if (otherId && onlineUserIds.has(otherId)) {
                  isConvoOnline = true;
                }
              }

              return (
                <button
                  key={c.id}
                  onClick={() => setActiveConvo(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl transition-all flex items-start gap-2.5 border ${
                    isSelected 
                      ? "bg-primary/10 border-primary/25 text-primary shadow-xs" 
                      : "hover:bg-muted/40 border-transparent text-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-xl shrink-0 flex items-center justify-center relative ${
                    isSelected ? 'bg-primary/20 border border-primary/30 text-primary' : 'bg-muted border border-border text-muted-foreground'
                  }`}>
                    {c.type === "dm" ? (
                      <User className="h-4 w-4" />
                    ) : c.type === "group" ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      <Hash className="h-4 w-4" />
                    )}
                    {isConvoOnline && (
                      <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-550 ring-2 ring-background animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0 leading-tight flex-1">
                    <p className="font-semibold text-xs truncate">{titleText}</p>
                    <p className={`text-[9px] mt-0.5 ${isSelected ? 'text-primary/80' : 'text-muted-foreground'} font-mono`}>
                      {c.type === "group" ? "Private Group" : c.type === "dm" ? "Direct Message" : "Public Space"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Window (Chat Messages & Editor) ── */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden bg-accent/20 border border-border/40 rounded-2xl p-4 shadow-xs">
        {activeConvo ? (
          <>
            {/* Header info */}
            <div className="pb-3 border-b border-border flex items-center justify-between px-2 rounded-t-2xl">
              <div>
                <h3 className="font-display font-semibold text-sm text-foreground flex items-center gap-1.5">
                  {activeConvoDetails?.type === "dm" ? (
                    <User className="h-4 w-4 text-primary" />
                  ) : activeConvoDetails?.type === "group" ? (
                    <Users className="h-4 w-4 text-primary" />
                  ) : (
                    <Hash className="h-4 w-4 text-primary" />
                  )}
                  {activeConvoDetails ? getConvoTitle(activeConvoDetails) : ""}
                </h3>
                <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5 font-medium">
                  <Lock className="h-3 w-3" /> End-to-end encrypted chat feed
                </p>
              </div>

              {/* Message Search Filter */}
              <div className="relative w-44 md:w-56">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="text" 
                  placeholder="Filter messages..."
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="pl-8 bg-muted/40 border-border text-foreground placeholder-muted-foreground rounded-lg h-7 text-[10px] focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
                />
              </div>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto py-4 px-2 space-y-3.5 scrollbar-thin">
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                  <p className="text-xs font-mono text-muted-foreground/80">Decrypting secure channel handshake...</p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-6">
                  <MessageCircle className="h-9 w-9 opacity-20 mb-2 text-primary" />
                  <p className="text-xs font-semibold">Beginning of conversation</p>
                  <p className="text-[10px] max-w-[240px] mt-1 leading-relaxed">Encrypted payloads list securely below.</p>
                </div>
              ) : (
                filteredMessages.map((m) => {
                  const isSelf = m.sender_id === user?.id;
                  const sender = membersMap.get(m.sender_id);
                  const senderName = sender?.display_name || "Unknown Member";
                  const senderRole = sender?.role || "staff";
                  const initials = getInitials(senderName);
                  const isOnline = onlineUserIds.has(m.sender_id);

                  return (
                    <div key={m.id} className={`flex items-start gap-3 ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
                      {/* Avatar */}
                      <div className="relative shrink-0 mt-0.5">
                        <div className={`h-7 w-7 rounded-lg text-[10px] font-bold flex items-center justify-center ${
                          isSelf 
                            ? "bg-primary/10 text-primary border border-primary/20" 
                            : "bg-muted text-muted-foreground border border-border"
                        }`}>
                          {initials}
                        </div>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-555 ring-1 ring-background animate-pulse" />
                        )}
                      </div>

                      {/* Bubble content */}
                      <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} min-w-0 max-w-[70%]`}>
                        <div className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-xs min-w-0 break-words ${
                          isSelf 
                            ? "bg-primary text-primary-foreground rounded-tr-none" 
                            : "bg-muted border border-border text-foreground rounded-tl-none"
                        }`}>
                          {m.decryptedText || "[Decrypting...]"}
                        </div>
                        
                        {/* Time & Sender Details */}
                        <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px] text-muted-foreground font-mono">
                          <span className="truncate max-w-[100px]">{isSelf ? "Me" : senderName}</span>
                          <span className="opacity-50">•</span>
                          <span className="capitalize">{senderRole.replace("_", " ")}</span>
                          <span className="opacity-50">•</span>
                          <span className="flex items-center gap-0.5 shrink-0">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Footer */}
            <div className="pt-3 border-t border-border flex items-center gap-2 px-1">
              <Input
                type="text"
                placeholder="Send secure encrypted payload..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1 bg-muted/40 border-border text-foreground placeholder-muted-foreground rounded-xl h-10 focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
                disabled={loadingMessages}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!newMessage.trim() || loadingMessages}
                className="rounded-xl h-10 w-10 p-0 flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-soft transition-all"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-8">
            <HelpCircle className="h-10 w-10 opacity-30 mb-3 text-primary" />
            <p className="font-display font-semibold text-sm text-foreground">Select or Start a Collaboration Space</p>
            <p className="text-xs text-muted-foreground/80 max-w-sm mt-1.5 leading-relaxed">
              Use the sidebar to pick an existing discussion channel or create a new DM / group space for end-to-end encrypted staff & parent collaboration.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
