import { useState } from "react";
import { useEventTimeline } from "@/hooks/useEventTimeline";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  DollarSign, 
  Key, 
  BookOpen, 
  GraduationCap, 
  UserCheck, 
  ShieldCheck, 
  Sparkles, 
  Activity, 
  RefreshCw, 
  Bell, 
  Bus, 
  Coins,
  CheckCircle2,
  Clock,
  User,
  ChevronRight,
  Filter
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const CATEGORIES = [
  { value: "", label: "All", icon: Sparkles },
  { value: "finance", label: "Finance", icon: Coins },
  { value: "academic", label: "Academics", icon: GraduationCap },
  { value: "attendance", label: "Attendance", icon: Calendar },
  { value: "security", label: "Security", icon: ShieldCheck },
  { value: "general", label: "General", icon: Bell },
];

export function ActivityTimelineWidget() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { items, isLoading, error } = useEventTimeline(selectedCategory || undefined, 1, 20);

  const getCategoryMeta = (category: string, eventName: string = "") => {
    const cat = category.toLowerCase();
    const evt = eventName.toLowerCase();

    if (cat === "finance" || evt.includes("fee") || evt.includes("payment") || evt.includes("invoice")) {
      return {
        bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40",
        badgeBg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200",
        borderAccent: "border-l-emerald-500",
        dotColor: "bg-emerald-500",
        icon: Coins,
        label: "FINANCE",
      };
    }
    if (cat === "attendance" || evt.includes("attendance")) {
      return {
        bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40",
        badgeBg: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200",
        borderAccent: "border-l-amber-500",
        dotColor: "bg-amber-500",
        icon: CheckCircle2,
        label: "ATTENDANCE",
      };
    }
    if (cat === "academic" || evt.includes("student") || evt.includes("exam") || evt.includes("grade")) {
      return {
        bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40",
        badgeBg: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200",
        borderAccent: "border-l-blue-500",
        dotColor: "bg-blue-500",
        icon: GraduationCap,
        label: "ACADEMICS",
      };
    }
    if (cat === "security" || evt.includes("login") || evt.includes("auth") || evt.includes("role")) {
      return {
        bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40",
        badgeBg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200",
        borderAccent: "border-l-indigo-500",
        dotColor: "bg-indigo-500",
        icon: ShieldCheck,
        label: "SECURITY",
      };
    }
    return {
      bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/40",
      badgeBg: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200",
      borderAccent: "border-l-violet-500",
      dotColor: "bg-violet-500",
      icon: Activity,
      label: "OPERATIONS",
    };
  };

  return (
    <Card className="border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-lg rounded-2xl flex flex-col h-full overflow-hidden transition-all duration-300">
      {/* Header */}
      <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800/60 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Operations Activity Feed
                </CardTitle>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time multi-channel school operations timeline
              </p>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 ${
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-blue-600 dark:text-white shadow-sm"
                    : "bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </CardHeader>

      {/* Timeline Feed Content */}
      <CardContent className="flex-1 overflow-y-auto p-4 sm:p-5 max-h-[500px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-blue-500" />
            <p className="text-xs font-medium">Syncing live operations stream...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-rose-500">
            <p className="text-xs font-semibold">Unable to connect to live stream</p>
            <p className="text-[11px] text-slate-400 mt-1">Retrying in background...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
            <Activity className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No events logged in this category</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Live events appear automatically when activities occur</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const meta = getCategoryMeta(item.category, item.event_name);
              const Icon = meta.icon;
              const dateObj = new Date(item.created_at);
              const timeAgo = formatDistanceToNow(dateObj, { addSuffix: true });
              const fullTime = format(dateObj, "MMM dd, yyyy • hh:mm a");

              return (
                <div
                  key={item.id}
                  className={`group relative flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700/80 transition-all duration-200 border-l-4 ${meta.borderAccent}`}
                >
                  {/* Icon badge */}
                  <div className={`p-2 rounded-xl border ${meta.bg} shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-105 shadow-xs`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${meta.badgeBg}`}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 shrink-0 flex items-center gap-1" title={fullTime}>
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {/* Metadata Footer: Actor & Entity */}
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100/80 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500">
                      {item.actor_name && (
                        <div className="flex items-center gap-1">
                          <User className="h-2.5 w-2.5 text-slate-400" />
                          <span className="font-medium text-slate-600 dark:text-slate-400">{item.actor_name}</span>
                          {item.actor_role && (
                            <span className="px-1 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-[9px] text-slate-500 font-semibold">
                              {item.actor_role}
                            </span>
                          )}
                        </div>
                      )}
                      <span className="ml-auto text-[9px] text-slate-400 dark:text-slate-500">
                        {fullTime}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
