import { useState, useMemo } from "react";
import { Search, Loader2, MessageCircle, X, Filter, Calendar, User, Eye, EyeOff, ArrowRight } from "lucide-react";
import { format, parseISO, startOfDay, endOfDay, isAfter, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  subject: string | null;
  content: string;
  sender_user_id: string;
  created_at: string;
  is_sent: boolean;
  relevance: number;
}

interface Props {
  schoolId: string;
  currentUserId: string;
  profileMap: Record<string, string>;
  onSelectMessage?: (messageId: string, partnerId: string) => void;
}

export function MessageSearchDialog({ schoolId, currentUserId, profileMap, onSelectMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Get unique senders from profileMap for filter dropdown
  const senderOptions = useMemo(() => {
    const options = Object.entries(profileMap).map(([userId, name]) => ({
      value: userId,
      label: name,
    }));
    return [{ value: "all", label: "All senders" }, ...options];
  }, [profileMap]);

  const handleSearch = async () => {
    if (!query.trim() || query.trim().length < 2) return;
    
    setSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await (supabase as any).rpc("search_messages", {
        _school_id: schoolId,
        _user_id: currentUserId,
        _query: query.trim(),
        _limit: 100,
      });

      if (error) throw error;
      setResults((data as unknown as SearchResult[]) || []);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Apply local filters
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // Sender filter
      if (senderFilter !== "all") {
        if (r.is_sent && senderFilter !== currentUserId) return false;
        if (!r.is_sent && r.sender_user_id !== senderFilter) return false;
      }

      // Read filter (approximate - sent messages are considered "read" for this filter)
      if (readFilter === "unread" && r.is_sent) return false;
      if (readFilter === "sent" && !r.is_sent) return false;
      if (readFilter === "received" && r.is_sent) return false;

      // Date range
      const msgDate = parseISO(r.created_at);
      if (dateFrom && isBefore(msgDate, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(msgDate, endOfDay(dateTo))) return false;

      return true;
    });
  }, [results, senderFilter, readFilter, dateFrom, dateTo, currentUserId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    // Determine the conversation partner ID
    const partnerId = result.is_sent ? "" : result.sender_user_id;
    onSelectMessage?.(result.id, partnerId);
    setOpen(false);
    setQuery("");
    setResults([]);
    setHasSearched(false);
    resetFilters();
  };

  const resetFilters = () => {
    setSenderFilter("all");
    setReadFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = senderFilter !== "all" || readFilter !== "all" || dateFrom || dateTo;

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    try {
      const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"));
      return parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <mark key={i} className="bg-primary/20 text-primary px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return text;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Messages
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Search input row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search message content..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 pr-9"
                autoFocus
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setHasSearched(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button onClick={handleSearch} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {/* Filters collapsible */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      Active
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
                  Clear filters
                </Button>
              )}
            </div>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Sender filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Sender
                  </Label>
                  <Select value={senderFilter} onValueChange={setSenderFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All senders" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {senderOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Read filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Eye className="h-3 w-3" /> Type
                  </Label>
                  <Select value={readFilter} onValueChange={setReadFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All messages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All messages</SelectItem>
                      <SelectItem value="sent">Sent only</SelectItem>
                      <SelectItem value="received">Received only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date from */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> From
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left font-normal",
                          !dateFrom && "text-muted-foreground"
                        )}
                      >
                        {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Any date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date to */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> To
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left font-normal",
                          !dateTo && "text-muted-foreground"
                        )}
                      >
                        {dateTo ? format(dateTo, "MMM d, yyyy") : "Any date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Results */}
          <ScrollArea className="flex-1 min-h-0">
            {searching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredResults.length === 0 && hasSearched ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {results.length > 0 && hasActiveFilters
                    ? "No messages match your filters"
                    : `No messages found for "${query}"`}
                </p>
                {results.length > 0 && hasActiveFilters && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : filteredResults.length > 0 ? (
              <div className="space-y-2 pr-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
                  {hasActiveFilters ? " (filtered)" : ""}
                </p>
                {filteredResults.map((result) => {
                  const senderName = result.is_sent ? "You" : (profileMap[result.sender_user_id] || "User");
                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
                        "focus:outline-none focus:ring-2 focus:ring-primary/50",
                        "group"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm truncate">{senderName}</span>
                          <Badge variant={result.is_sent ? "secondary" : "default"} className="text-[10px] h-4 shrink-0">
                            {result.is_sent ? "Sent" : "Received"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(result.created_at), "MMM d, yyyy")}
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      {result.subject && (
                        <p className="text-sm font-medium truncate mb-1">
                          {highlightText(result.subject, query)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {highlightText(result.content, query)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Enter at least 2 characters to search
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use filters to narrow down results
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
