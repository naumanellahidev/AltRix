import { useState } from "react";
import { useEventTimeline } from "@/hooks/useEventTimeline";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  Calendar, 
  DollarSign, 
  Key, 
  BookOpen, 
  Award, 
  FileText, 
  Activity, 
  UserCheck, 
  RefreshCw 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES = [
  { value: "", label: "All Activities" },
  { value: "attendance", label: "Attendance" },
  { value: "finance", label: "Finance & Billing" },
  { value: "academic", label: "Academics" },
  { value: "security", label: "Security & Logins" },
  { value: "general", label: "General" }
];

export function ActivityTimelineWidget() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { items, isLoading, error } = useEventTimeline(selectedCategory || undefined, 1, 15);

  const getCategoryStyles = (category: string) => {
    switch (category.toLowerCase()) {
      case "attendance":
        return {
          bg: "bg-orange-50 dark:bg-orange-950/20",
          border: "border-orange-200 dark:border-orange-900/30",
          text: "text-orange-600 dark:text-orange-400",
          icon: Calendar
        };
      case "finance":
        return {
          bg: "bg-emerald-50 dark:bg-emerald-950/20",
          border: "border-emerald-200 dark:border-emerald-900/30",
          text: "text-emerald-600 dark:text-emerald-400",
          icon: DollarSign
        };
      case "academic":
        return {
          bg: "bg-blue-50 dark:bg-blue-950/20",
          border: "border-blue-200 dark:border-blue-900/30",
          text: "text-blue-600 dark:text-blue-400",
          icon: BookOpen
        };
      case "security":
        return {
          bg: "bg-indigo-50 dark:bg-indigo-950/20",
          border: "border-indigo-200 dark:border-indigo-900/30",
          text: "text-indigo-600 dark:text-indigo-400",
          icon: Key
        };
      default:
        return {
          bg: "bg-slate-50 dark:bg-slate-900/50",
          border: "border-slate-200 dark:border-slate-800",
          text: "text-slate-600 dark:text-slate-400",
          icon: Activity
        };
    }
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-sm h-full flex flex-col transition-all duration-300 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 font-outfit">
            Activity Timeline
          </CardTitle>
          <p className="text-xs text-muted-foreground">Real-time ERP operations timeline</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs border rounded-md px-2.5 py-1 bg-transparent border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value} className="bg-white dark:bg-slate-950">
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-6 pb-6 pt-2 max-h-[460px] scrollbar-thin">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-xs text-slate-400">Loading operations feed...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-xs text-red-500">Failed to load operations timeline feed.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No operations logged yet</p>
            <p className="text-[10px] text-slate-400">Events will appear here as they occur</p>
          </div>
        ) : (
          <div className="relative border-l border-slate-200 dark:border-slate-800 ml-3 pl-6 space-y-5">
            {items.map((item, idx) => {
              const styles = getCategoryStyles(item.category);
              const Icon = styles.icon;
              return (
                <div key={item.id} className="relative group transition-all duration-300">
                  {/* Timeline bullet icon */}
                  <div className={`absolute -left-[35px] top-1 p-1.5 rounded-full border ${styles.bg} ${styles.border} ${styles.text} transition-transform duration-200 group-hover:scale-110`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  
                  {/* Message body */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors duration-150">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {item.description}
                      </p>
                    )}
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
