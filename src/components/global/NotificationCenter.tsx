import { useState, useMemo, useEffect } from "react";
import { 
  Bell, Check, CheckCheck, Trash2, Archive, Star, Pin, Inbox, 
  Search, SlidersHorizontal, Settings, RefreshCw, X, FolderSync, Info, AlertTriangle, AlertOctagon, CheckCircle2, Bookmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotifications, AppNotification, NotificationFilters } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, subDays, isAfter } from "date-fns";
import NotificationPreferencesDialog from "./NotificationPreferencesDialog";

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
}

// Map categories to user-friendly labels and colors
const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  general: { label: "General", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  exams: { label: "Exams", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  grades: { label: "Grades", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  attendance: { label: "Attendance", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  billing: { label: "Fees / Billing", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  notices: { label: "Notices", color: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300" },
  messages: { label: "Messages", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  ai: { label: "AI Copilot", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
};

// Priority colors and icons
function getPriorityIndicator(priority: string) {
  switch (priority.toLowerCase()) {
    case "critical":
      return { label: "Critical", border: "border-l-4 border-l-red-600", bg: "bg-red-50 text-red-700 dark:bg-red-950/40", icon: <AlertOctagon className="h-4 w-4 text-red-600 animate-pulse" /> };
    case "high":
      return { label: "High", border: "border-l-4 border-l-orange-500", bg: "bg-orange-50 text-orange-700 dark:bg-orange-950/20", icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> };
    case "warning":
      return { label: "Warning", border: "border-l-4 border-l-amber-500", bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/20", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> };
    case "success":
      return { label: "Success", border: "border-l-4 border-l-emerald-500", bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> };
    default:
      return { label: "Normal", border: "border-l-4 border-l-slate-300 dark:border-l-slate-700", bg: "bg-transparent", icon: <Info className="h-4 w-4 text-slate-400" /> };
  }
}

export default function NotificationCenter({ open, onOpenChange, schoolId }: NotificationCenterProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [viewTab, setViewTab] = useState<"inbox" | "archived" | "favorites" | "pinned">("inbox");
  const [showPreferences, setShowPreferences] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Construct filters object
  const filters = useMemo((): NotificationFilters => {
    const f: NotificationFilters = {
      page,
      limit: 50,
      unread_only: false,
      archived_only: viewTab === "archived",
      is_favorite: viewTab === "favorites" ? true : undefined,
      is_pinned: viewTab === "pinned" ? true : undefined,
      category: category !== "all" ? category : undefined,
      priority: priority !== "all" ? priority : undefined,
      query: debouncedSearch || undefined,
    };
    return f;
  }, [page, viewTab, category, priority, debouncedSearch]);

  const { 
    data: notifications = [], 
    isLoading, 
    isFetching,
    counts,
    refetch,
    markRead, 
    archiveNotification, 
    restoreNotification, 
    toggleFavorite, 
    togglePin, 
    clearNotification, 
    bulkAction 
  } = useNotifications(schoolId, filters);

  // Time grouping function
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, AppNotification[]> = {
      Today: [],
      Yesterday: [],
      "Last 7 Days": [],
      Older: []
    };

    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);

    notifications.forEach(n => {
      const date = new Date(n.created_at);
      if (isToday(date)) {
        groups.Today.push(n);
      } else if (isYesterday(date)) {
        groups.Yesterday.push(n);
      } else if (isAfter(date, sevenDaysAgo)) {
        groups["Last 7 Days"].push(n);
      } else {
        groups.Older.push(n);
      }
    });

    return Object.fromEntries(
      Object.entries(groups).filter(([_, items]) => items.length > 0)
    );
  }, [notifications]);

  // Handle single notification click
  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read_at) {
      void markRead(n.id);
    }
    if (n.action_url) {
      // Trigger navigation or dispatch custom routing event
      window.dispatchEvent(
        new CustomEvent("eduverse:open-notification", {
          detail: { notification: n },
        })
      );
      onOpenChange(false);
    }
  };

  // Selection toggle
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === notifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notifications.map(n => n.id));
    }
  };

  // Bulk operation executor
  const handleBulkAction = async (action: "read" | "unread" | "archive" | "restore" | "delete") => {
    if (selectedIds.length === 0) return;
    await bulkAction(action, selectedIds);
    setSelectedIds([]);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col h-full bg-surface dark:bg-card border-l border-border/40 shadow-2xl">
          
          {/* Header */}
          <div className="p-6 border-b border-border/30 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="font-display text-lg font-bold tracking-tight">Notification Center</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Stay updated with live ERP events, billing warnings, and alerts
                </SheetDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                onClick={() => void refetch()}
                title="Refresh Feed"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                onClick={() => setShowPreferences(true)}
                title="Notification Preferences"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Stats Tabs */}
          <div className="flex items-center justify-between px-6 py-3 bg-slate-50/20 border-b border-border/20 shrink-0 gap-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setViewTab("inbox"); setPage(1); }}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-2 transition-all duration-200",
                  viewTab === "inbox" 
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-slate-600 border-border/40 hover:bg-slate-50"
                )}
              >
                <Inbox className="h-3.5 w-3.5" />
                Inbox
                {counts.unread > 0 && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-red-500 text-white border-none rounded-full min-w-5 h-5 flex items-center justify-center">
                    {counts.unread}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => { setViewTab("pinned"); setPage(1); }}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all duration-200",
                  viewTab === "pinned" 
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-slate-600 border-border/40 hover:bg-slate-50"
                )}
              >
                <Pin className="h-3.5 w-3.5" />
                Pinned
              </button>
              <button
                onClick={() => { setViewTab("favorites"); setPage(1); }}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all duration-200",
                  viewTab === "favorites" 
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-slate-600 border-border/40 hover:bg-slate-50"
                )}
              >
                <Star className="h-3.5 w-3.5" />
                Starred
              </button>
              <button
                onClick={() => { setViewTab("archived"); setPage(1); }}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all duration-200",
                  viewTab === "archived" 
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-slate-600 border-border/40 hover:bg-slate-50"
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                Archived
                {counts.archived > 0 && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] rounded-full border-border">
                    {counts.archived}
                  </Badge>
                )}
              </button>
            </div>
          </div>

          {/* Advanced Search & Filtering Controls */}
          <div className="p-4 border-b border-border/20 bg-slate-50/10 shrink-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notification title or content..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/20"
              />
              {search && (
                <button 
                  onClick={() => setSearch("")} 
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 rounded-xl text-xs border-border/60">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60">
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="exams">Exams & Datesheets</SelectItem>
                    <SelectItem value="grades">Grades & Results</SelectItem>
                    <SelectItem value="attendance">Attendance</SelectItem>
                    <SelectItem value="billing">Fees & Billing</SelectItem>
                    <SelectItem value="notices">Notices</SelectItem>
                    <SelectItem value="messages">Messages</SelectItem>
                    <SelectItem value="ai">AI Copilot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-8 rounded-xl text-xs border-border/60">
                    <AlertTriangle className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60">
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical Only</SelectItem>
                    <SelectItem value="high">High Only</SelectItem>
                    <SelectItem value="warning">Warning Only</SelectItem>
                    <SelectItem value="normal">Normal Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Bulk Operations Bar */}
          {notifications.length > 0 && (
            <div className="px-6 py-2 bg-slate-50 border-b border-border/20 flex items-center justify-between shrink-0 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={selectedIds.length === notifications.length && notifications.length > 0} 
                  onChange={toggleSelectAll} 
                  className="rounded border-slate-300 text-primary focus:ring-primary/20"
                />
                <span>
                  {selectedIds.length > 0 
                    ? `${selectedIds.length} selected` 
                    : "Select all items"}
                </span>
              </div>
              
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-1">
                  {viewTab === "inbox" && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-primary hover:bg-white rounded-lg flex items-center gap-1" onClick={() => handleBulkAction("read")}>
                        <CheckCheck className="h-3.5 w-3.5" /> Read
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-amber-600 hover:bg-white rounded-lg flex items-center gap-1" onClick={() => handleBulkAction("archive")}>
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </Button>
                    </>
                  )}
                  {viewTab === "archived" && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-primary hover:bg-white rounded-lg flex items-center gap-1" onClick={() => handleBulkAction("restore")}>
                      <FolderSync className="h-3.5 w-3.5" /> Restore
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-red-600 hover:bg-white rounded-lg flex items-center gap-1" onClick={() => handleBulkAction("delete")}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* List Scroll Area */}
          <ScrollArea className="flex-1 overflow-y-auto bg-slate-50/10">
            {isLoading ? (
              <div className="py-24 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading notifications feed…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-32 text-center px-6">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Bell className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-700">No notifications found</p>
                <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto">
                  {debouncedSearch 
                    ? "Try adjusting your search keywords or filter settings." 
                    : "You are all caught up! No notifications in this tab."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                {Object.entries(groupedNotifications).map(([groupTitle, items]) => (
                  <div key={groupTitle} className="pb-4">
                    {/* Time Group Header */}
                    <div className="px-6 py-2.5 bg-slate-50/40 dark:bg-slate-900/10 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {groupTitle}
                    </div>
                    
                    <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                      {items.map((n) => {
                        const pri = getPriorityIndicator(n.priority || "normal");
                        const cat = CATEGORY_MAP[n.category] || CATEGORY_MAP.general;
                        const isSelected = selectedIds.includes(n.id);
                        
                        return (
                          <div
                            key={n.id}
                            className={cn(
                              "group relative flex items-start gap-4 px-6 py-4 cursor-pointer transition-all duration-200 border-l border-r",
                              !n.read_at ? "bg-blue-50/15 dark:bg-blue-950/5 hover:bg-blue-50/25" : "bg-transparent hover:bg-slate-50/50",
                              pri.border,
                              isSelected && "bg-primary/5 border-primary/20"
                            )}
                            onClick={() => handleNotificationClick(n)}
                          >
                            {/* Selection Checkbox */}
                            <div className="pt-1.5" onClick={e => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleSelect(n.id)}
                                className="rounded border-slate-300 text-primary focus:ring-primary/10 h-3.5 w-3.5"
                              />
                            </div>

                            {/* Priority Icon Container */}
                            <div className={cn(
                              "h-10 w-10 rounded-2xl flex items-center justify-center border text-slate-500 shrink-0",
                              !n.read_at ? "bg-white border-blue-100 shadow-sm" : "bg-slate-50/50 border-slate-100"
                            )}>
                              {pri.icon}
                            </div>

                            {/* Text Contents */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-start justify-between gap-3">
                                <h4 className={cn(
                                  "text-xs leading-tight line-clamp-1 pr-6",
                                  !n.read_at ? "font-bold text-slate-900" : "font-semibold text-slate-600"
                                )}>
                                  {n.title}
                                </h4>
                                {!n.read_at && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5 animate-pulse" />
                                )}
                              </div>
                              
                              {n.body && (
                                <p className="text-[10px] text-slate-450 leading-relaxed pr-6">
                                  {n.body}
                                </p>
                              )}

                              <div className="flex items-center gap-2 pt-0.5">
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", cat.color)}>
                                  {cat.label}
                                </span>
                                {n.priority && n.priority !== "normal" && (
                                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", pri.bg)}>
                                    {pri.label}
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-400 font-medium">
                                  {format(new Date(n.created_at), "h:mm a")}
                                </span>
                              </div>
                            </div>

                            {/* Floating Toolbar (Icons) */}
                            <div className="absolute right-4 top-4 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-slate-100 shadow-sm rounded-xl p-0.5" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-6 w-6 rounded-lg", n.is_pinned ? "text-amber-500" : "text-slate-400")}
                                onClick={() => void togglePin(n.id, n.is_pinned)}
                                title={n.is_pinned ? "Unpin" : "Pin"}
                              >
                                <Pin className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-6 w-6 rounded-lg", n.is_favorite ? "text-rose-500" : "text-slate-400")}
                                onClick={() => void toggleFavorite(n.id, n.is_favorite)}
                                title={n.is_favorite ? "Remove Star" : "Star"}
                              >
                                <Star className="h-3 w-3" />
                              </Button>
                              {viewTab === "inbox" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-slate-400 hover:text-amber-600 rounded-lg"
                                  onClick={() => void archiveNotification(n.id)}
                                  title="Archive"
                                >
                                  <Archive className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-slate-400 hover:text-primary rounded-lg"
                                  onClick={() => void restoreNotification(n.id)}
                                  title="Restore to Inbox"
                                >
                                  <FolderSync className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-rose-600 rounded-lg"
                                onClick={() => void clearNotification(n.id)}
                                title="Delete permanently"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Simple Pagination Footer */}
          {notifications.length > 0 && (
            <div className="p-4 border-t border-border/20 bg-slate-50/50 shrink-0 flex items-center justify-between text-xs text-slate-500">
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl h-8 text-[10px] font-bold"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl h-8 text-[10px] font-bold"
                onClick={() => setPage(p => p + 1)}
                disabled={notifications.length < 50}
              >
                Next
              </Button>
            </div>
          )}

        </SheetContent>
      </Sheet>

      {/* Preferences Dialog */}
      <NotificationPreferencesDialog
        open={showPreferences}
        onOpenChange={setShowPreferences}
      />
    </>
  );
}
