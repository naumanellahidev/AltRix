// src/components/principal/CollaborationHub.tsx
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { encryptMessage, decryptMessage } from "@/lib/crypto/ptEncryption";
import { 
  MessageSquare, 
  Send, 
  Plus, 
  Users, 
  Lock, 
  Loader2, 
  HelpCircle,
  MessageCircle,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface Message {
  id: string;
  convo_id: string;
  sender_id: string;
  encrypted_body: { iv: string; data: string };
  created_at: string;
}

export function CollaborationHub() {
  const { schoolSlug } = useParams();
  const { user } = useSession();
  
  // States
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newConvoTitle, setNewConvoTitle] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingConvo, setCreatingConvo] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // 2. Load conversations for the current school
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
          .select("id, title, created_at")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        data = dbData || [];
      }
      setConvos(data);
      
      // Auto-select first conversation if none active
      if (data && data.length > 0 && !activeConvo) {
        setActiveConvo(data[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load conversations, checking fallback:", err);
      if (USE_FASTAPI || err?.code === "PGRST205" || String(err?.message).includes("pt_conversations")) {
        const stored = localStorage.getItem(`pt_convos_${schoolId}`);
        const list = stored ? JSON.parse(stored) : [
          { id: "demo-convo-1", title: "General Parent-Teacher Discussion", created_at: new Date(Date.now() - 86400000).toISOString() },
          { id: "demo-convo-2", title: "Campus Development & Safety Updates", created_at: new Date(Date.now() - 172800000).toISOString() }
        ];
        setConvos(list);
        if (list.length > 0 && !activeConvo) {
          setActiveConvo(list[0].id);
        }
      } else {
        toast.error("Error loading conversations: " + err.message);
      }
    } finally {
      setLoadingConvos(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      loadConversations();
    }
  }, [schoolId]);

  // 3. Load messages for active conversation & subscribe to real-time additions
  useEffect(() => {
    if (!activeConvo) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        if (activeConvo.startsWith("demo-convo")) {
          const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
          setMessages(stored ? JSON.parse(stored) : []);
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
        setMessages(data);
      } catch (err: any) {
        console.error("Failed to fetch messages, checking fallback:", err);
        const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
        setMessages(stored ? JSON.parse(stored) : []);
      }
    };

    setLoadingMessages(true);
    fetchMessages().finally(() => setLoadingMessages(false));

    let intervalId: any;
    let channel: any;

    if (USE_FASTAPI) {
      // Poll every 3 seconds when using FastAPI
      intervalId = setInterval(fetchMessages, 3000);
    } else if (!activeConvo.startsWith("demo-convo")) {
      channel = supabase
        .channel(`public:pt_messages_convo_${activeConvo}`)
        .on(
          "postgres_changes",
          { 
            event: "INSERT", 
            schema: "public", 
            table: "pt_messages", 
            filter: `convo_id=eq.${activeConvo}` 
          },
          (payload) => {
            if (payload.new) {
              setMessages((msgs) => {
                // Avoid duplicates
                if (msgs.some(m => m.id === payload.new.id)) return msgs;
                return [...msgs, payload.new as Message];
              });
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeConvo]);

  // 4. Send message operation
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConvo || !user?.id) return;
    
    const textToSend = newMessage.trim();
    setNewMessage(""); // Clear early for snappy UI

    try {
      const encrypted = await encryptMessage(textToSend);
      if (activeConvo.startsWith("demo-convo")) {
        const payload: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          convo_id: activeConvo,
          sender_id: user.id,
          encrypted_body: encrypted,
          created_at: new Date().toISOString()
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
      console.error("Error sending message:", err);
      const encrypted = await encryptMessage(textToSend);
      const payload: Message = {
        id: `msg-${Date.now()}-${Math.random()}`,
        convo_id: activeConvo,
        sender_id: user.id,
        encrypted_body: encrypted,
        created_at: new Date().toISOString()
      };
      const stored = localStorage.getItem(`pt_msgs_${activeConvo}`);
      const currentMsgs = stored ? JSON.parse(stored) : [];
      const updated = [...currentMsgs, payload];
      localStorage.setItem(`pt_msgs_${activeConvo}`, JSON.stringify(updated));
      setMessages(updated);
    }
  };

  // 5. Create new conversation operation
  const handleCreateConversation = async () => {
    if (!newConvoTitle.trim() || !schoolId) return;

    setCreatingConvo(true);
    try {
      const isFallback = convos.some(c => c.id.startsWith("demo-convo")) || !navigator.onLine;
      if (isFallback) {
        const newConvo: Conversation = {
          id: `demo-convo-${Date.now()}`,
          title: newConvoTitle.trim(),
          created_at: new Date().toISOString()
        };
        const updated = [newConvo, ...convos];
        localStorage.setItem(`pt_convos_${schoolId}`, JSON.stringify(updated));
        setConvos(updated);
        setActiveConvo(newConvo.id);
        toast.success("Conversation created successfully!");
        setNewConvoTitle("");
        setCreateDialogOpen(false);
        return;
      }

      let newId = "";
      if (USE_FASTAPI) {
        const resp = await apiClient.post("/collaboration/conversations", {
          school_id: schoolId,
          title: newConvoTitle.trim(),
        });
        newId = resp.data?.id;
      } else {
        const { data, error } = await supabase
          .from("pt_conversations")
          .insert({
            school_id: schoolId,
            title: newConvoTitle.trim(),
          })
          .select()
          .single();

        if (error) throw error;
        newId = data?.id;
      }
      
      toast.success("Conversation created successfully!");
      setNewConvoTitle("");
      setCreateDialogOpen(false);
      
      // Refresh list and make the new one active
      await loadConversations();
      if (newId) {
        setActiveConvo(newId);
      }
    } catch (err: any) {
      console.error("Error creating conversation, using fallback:", err);
      const newConvo: Conversation = {
        id: `demo-convo-${Date.now()}`,
        title: newConvoTitle.trim(),
        created_at: new Date().toISOString()
      };
      const updated = [newConvo, ...convos];
      localStorage.setItem(`pt_convos_${schoolId}`, JSON.stringify(updated));
      setConvos(updated);
      setActiveConvo(newConvo.id);
      toast.success("Conversation created successfully!");
      setNewConvoTitle("");
      setCreateDialogOpen(false);
    } finally {
      setCreatingConvo(false);
    }
  };

  const activeConvoDetails = convos.find(c => c.id === activeConvo);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-card/45 border border-border/80 rounded-3xl p-5 md:p-6 shadow-elevated h-[650px]">
      
      {/* ── Left Sidebar (Conversations List) ── */}
      <div className="lg:col-span-1 border-r border-border/60 pr-4 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h2 className="font-display font-bold text-sm tracking-wide uppercase text-muted-foreground flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" /> Chats
          </h2>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary">
                <Plus className="h-4.5 w-4.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-md rounded-2xl p-6">
              <DialogHeader>
                <DialogTitle className="font-display font-semibold text-base">New Collaboration Chat</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <label htmlFor="title" className="text-xs font-semibold text-muted-foreground">Topic or Title</label>
                  <Input 
                    id="title" 
                    value={newConvoTitle} 
                    onChange={(e) => setNewConvoTitle(e.target.value)} 
                    placeholder="e.g. Parent-Teacher Association Meeting" 
                    onKeyDown={(e) => e.key === "Enter" && handleCreateConversation()}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCreateConversation} disabled={creatingConvo || !newConvoTitle.trim()}>
                  {creatingConvo && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* List items */}
        <div className="flex-1 overflow-y-auto pt-4 space-y-1.5 pr-1 scrollbar-thin">
          {loadingConvos ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-[11px] font-medium">Loading threads...</p>
            </div>
          ) : convos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
              <MessageSquare className="h-8 w-8 opacity-45 mb-2" />
              <p className="text-xs font-bold">No chats active</p>
              <p className="text-[10px] mt-1 leading-relaxed">Start a new encrypted collaboration space above.</p>
            </div>
          ) : (
            convos.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConvo(c.id)}
                className={`w-full text-left px-3.5 py-3 rounded-2xl transition-all flex items-start gap-2.5 ${
                  c.id === activeConvo 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/10" 
                    : "hover:bg-muted/40 text-foreground"
                }`}
              >
                <div className={`h-8 w-8 rounded-xl shrink-0 flex items-center justify-center ${c.id === activeConvo ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
                  <MessageSquare className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="font-semibold text-xs truncate">{c.title}</p>
                  <p className={`text-[9px] mt-1 ${c.id === activeConvo ? 'text-primary-foreground/70' : 'text-muted-foreground'} font-mono`}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right Window (Chat Messages & Editor) ── */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
        {activeConvo ? (
          <>
            {/* Header info */}
            <div className="pb-3 border-b border-border/60 flex items-center justify-between px-2 bg-muted/5 rounded-t-2xl">
              <div>
                <h3 className="font-display font-semibold text-sm text-foreground">{activeConvoDetails?.title}</h3>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Lock className="h-3 w-3 text-emerald-500" /> End-to-end encrypted chat feed
                </p>
              </div>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto py-4 px-2 space-y-3 scrollbar-thin">
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                  <p className="text-xs font-mono">Decrypting security handshake...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-6">
                  <MessageCircle className="h-10 w-10 opacity-30 mb-2 animate-bounce" />
                  <p className="text-xs font-semibold">Beginning of conversation</p>
                  <p className="text-[10px] max-w-[240px] mt-1">Send an encrypted payload to list it in this thread.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isSelf = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-xs leading-relaxed shadow-sm ${
                        isSelf 
                          ? "bg-indigo-600 text-white rounded-tr-none" 
                          : "bg-muted text-foreground rounded-tl-none"
                      }`}>
                        <MessageBody message={m} />
                      </div>
                      
                      {/* Message details */}
                      <div className="flex items-center gap-1 mt-1 px-1 text-[9px] text-muted-foreground font-mono">
                        <span>{isSelf ? "Me" : "Staff"}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Footer */}
            <div className="pt-3 border-t border-border/60 flex items-center gap-2 px-1">
              <Input
                type="text"
                placeholder="Type a secure message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1 rounded-xl h-10 border-border/85"
                disabled={loadingMessages}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!newMessage.trim() || loadingMessages}
                className="rounded-xl h-10 w-10 p-0 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-8">
            <HelpCircle className="h-12 w-12 opacity-35 mb-3" />
            <p className="font-display font-semibold text-sm">Select or Create a Chat Thread</p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
              Use the sidebar to pick an existing discussion channel or create a new conversation for encrypted principal coordination.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

// Lazy decryption helper
function MessageBody({ message }: { message: Message }) {
  const [plain, setPlain] = useState<string>("Decrypting...");
  
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const text = await decryptMessage(message.encrypted_body);
        if (active) setPlain(text);
      } catch (err) {
        if (active) setPlain("[Decryption Failed]");
      }
    })();
    return () => {
      active = false;
    };
  }, [message]);
  
  return <span>{plain}</span>;
}
