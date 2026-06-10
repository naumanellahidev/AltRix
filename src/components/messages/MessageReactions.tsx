import { useState, useEffect, useCallback } from "react";
import { Smile, Pin, PinOff, Heart, ThumbsUp, ThumbsDown, Star, Laugh, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ReactionGroup {
  emoji: string;
  count: number;
  userReacted: boolean;
}

interface Props {
  messageId: string;
  schoolId: string;
  currentUserId: string;
  isMine?: boolean;
}

const EMOJI_OPTIONS = [
  { emoji: "👍", label: "Like", icon: ThumbsUp },
  { emoji: "❤️", label: "Love", icon: Heart },
  { emoji: "😂", label: "Laugh", icon: Laugh },
  { emoji: "⭐", label: "Star", icon: Star },
  { emoji: "👎", label: "Dislike", icon: ThumbsDown },
];

export function MessageReactions({ messageId, schoolId, currentUserId, isMine = false }: Props) {
  const [reactions, setReactions] = useState<ReactionGroup[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const fetchReactionsAndPin = useCallback(async () => {
    if (!messageId || !currentUserId) return;

    const [{ data: reactionsData }, { data: pinData }] = await Promise.all([
      (supabase as any)
        .from("admin_message_reactions")
        .select("emoji, user_id")
        .eq("message_id", messageId),
      (supabase as any)
        .from("admin_message_pins")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", currentUserId)
        .maybeSingle(),
    ]);

    // Group reactions by emoji
    const emojiMap = new Map<string, { count: number; userReacted: boolean }>();
    (reactionsData || []).forEach((r) => {
      const existing = emojiMap.get(r.emoji) || { count: 0, userReacted: false };
      existing.count++;
      if (r.user_id === currentUserId) existing.userReacted = true;
      emojiMap.set(r.emoji, existing);
    });

    const grouped: ReactionGroup[] = [];
    emojiMap.forEach((val, emoji) => {
      grouped.push({ emoji, count: val.count, userReacted: val.userReacted });
    });
    // Sort by count descending
    grouped.sort((a, b) => b.count - a.count);
    setReactions(grouped);
    setIsPinned(!!pinData?.id);
  }, [messageId, currentUserId]);

  // Initial fetch
  useEffect(() => {
    fetchReactionsAndPin();
  }, [fetchReactionsAndPin]);

  // Real-time subscription for reactions
  useEffect(() => {
    if (!messageId) return;

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          // Refetch reactions when any change happens
          fetchReactionsAndPin();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, fetchReactionsAndPin]);

  // Real-time subscription for pins (for current user only)
  useEffect(() => {
    if (!messageId || !currentUserId) return;

    const channel = supabase
      .channel(`pins-${messageId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_message_pins",
          filter: `message_id=eq.${messageId}`,
        },
        (payload) => {
          // Check if this pin change is for the current user
          const data = payload.new as any;
          const oldData = payload.old as any;
          
          if (payload.eventType === "INSERT" && data?.user_id === currentUserId) {
            setIsPinned(true);
          } else if (payload.eventType === "DELETE" && oldData?.user_id === currentUserId) {
            setIsPinned(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, currentUserId]);

  const toggleReaction = async (emoji: string) => {
    if (!currentUserId || loading) return;
    setLoading(true);

    try {
      const existing = reactions.find((r) => r.emoji === emoji && r.userReacted);

      if (existing) {
        // Remove reaction
        await (supabase as any)
          .from("admin_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("emoji", emoji);
      } else {
        // Add reaction
        await (supabase as any).from("admin_message_reactions").insert({
          message_id: messageId,
          user_id: currentUserId,
          school_id: schoolId,
          emoji,
        });
      }

      // Realtime will update the UI, but we can also optimistically update
    } catch (error: any) {
      toast({ title: "Failed to update reaction", variant: "destructive" });
    } finally {
      setLoading(false);
      setShowPicker(false);
    }
  };

  const togglePin = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);

    try {
      if (isPinned) {
        await (supabase as any)
          .from("admin_message_pins")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId);
        toast({ title: "Message unpinned" });
      } else {
        await (supabase as any).from("admin_message_pins").insert({
          message_id: messageId,
          user_id: currentUserId,
          school_id: schoolId,
        });
        toast({ title: "Message pinned" });
      }

      // Realtime will update the UI
    } catch (error: any) {
      toast({ title: "Failed to update pin", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const hasReactions = reactions.length > 0;

  return (
    <div className={cn("flex items-center gap-1", isMine ? "flex-row-reverse" : "flex-row")}>
      {/* Display existing reactions */}
      {hasReactions && (
        <div className={cn("flex items-center gap-0.5 flex-wrap", isMine ? "justify-end" : "justify-start")}>
          {reactions.slice(0, 4).map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => toggleReaction(reaction.emoji)}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] transition-colors",
                reaction.userReacted
                  ? isMine
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/20 text-primary"
                  : isMine
                    ? "bg-primary-foreground/10 text-primary-foreground/70 hover:bg-primary-foreground/20"
                    : "bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
              )}
              disabled={loading}
            >
              <span>{reaction.emoji}</span>
              {reaction.count > 1 && <span className="font-medium">{reaction.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Actions on hover - with visible background on mobile */}
      <div className={cn(
        "flex items-center gap-0.5 rounded-lg bg-muted/80 p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity sm:bg-transparent sm:shadow-none",
        isMine ? "flex-row-reverse" : "flex-row"
      )}>
        {/* Pin button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={togglePin}
              disabled={loading}
              className={cn(
                "rounded p-1.5 transition-colors hover:bg-accent",
                isPinned
                  ? "text-amber-500"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isPinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isPinned ? "Unpin message" : "Pin message"}
          </TooltipContent>
        </Tooltip>

        {/* Emoji picker */}
        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button
              className="rounded p-1.5 transition-colors text-foreground/70 hover:text-foreground hover:bg-accent"
              disabled={loading}
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-auto p-2" align={isMine ? "end" : "start"}>
            <div className="flex items-center gap-1">
              {EMOJI_OPTIONS.map((opt) => {
                const userReacted = reactions.find((r) => r.emoji === opt.emoji)?.userReacted;
                return (
                  <Tooltip key={opt.emoji}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => toggleReaction(opt.emoji)}
                        disabled={loading}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-accent",
                          userReacted && "bg-primary/10 ring-1 ring-primary/20"
                        )}
                      >
                        {opt.emoji}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {opt.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function PinnedMessagesCount({ schoolId, currentUserId }: { schoolId: string; currentUserId: string }) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!schoolId || !currentUserId) return;
    
    const { count: pinnedCount } = await (supabase as any)
      .from("admin_message_pins")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("user_id", currentUserId);
    setCount(pinnedCount || 0);
  }, [schoolId, currentUserId]);

  // Initial fetch
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Real-time subscription for pins
  useEffect(() => {
    if (!schoolId || !currentUserId) return;

    const channel = supabase
      .channel(`user-pins-count-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_message_pins",
        },
        (payload) => {
          const data = payload.new as any;
          const oldData = payload.old as any;
          
          // Only react to changes for current user in this school
          if (payload.eventType === "INSERT" && data?.user_id === currentUserId && data?.school_id === schoolId) {
            setCount((prev) => prev + 1);
          } else if (payload.eventType === "DELETE" && oldData?.user_id === currentUserId && oldData?.school_id === schoolId) {
            setCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, currentUserId]);

  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Pin className="h-3 w-3" />
      {count} pinned
    </span>
  );
}
