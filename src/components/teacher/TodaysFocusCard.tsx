import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarCheck,
  Clock,
  Sparkles,
  ArrowRight,
  Coffee,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface TodaysFocusData {
  currentPeriod: string | null;
  currentSubject: string | null;
  currentRoom: string | null;
  nextPeriod: string | null;
  nextSubject: string | null;
  nextPeriodTime: string | null;
  classesToday: number;
}

interface Props {
  schoolId: string;
  schoolSlug: string;
  sectionIds: string[];
}

export function TodaysFocusCard({ schoolId, schoolSlug, sectionIds }: Props) {
  const { user } = useSession();
  const [data, setData] = useState<TodaysFocusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !schoolId) return;

    const fetchData = async () => {
      setLoading(true);
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0-6

      // Get today's timetable entries
      const { data: timetableEntries } = await supabase
        .from("timetable_entries")
        .select("*, timetable_periods!inner(label, start_time, end_time, sort_order)")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id)
        .eq("day_of_week", dayOfWeek)
        .order("timetable_periods(sort_order)", { ascending: true });

      const classesToday = timetableEntries?.length || 0;

      // Calculate current and next period
      const now = format(today, "HH:mm:ss");
      let currentPeriod: string | null = null;
      let currentSubject: string | null = null;
      let currentRoom: string | null = null;
      let nextPeriod: string | null = null;
      let nextSubject: string | null = null;
      let nextPeriodTime: string | null = null;

      if (timetableEntries && timetableEntries.length > 0) {
        for (let i = 0; i < timetableEntries.length; i++) {
          const entry = timetableEntries[i];
          const period = entry.timetable_periods as { label: string; start_time: string | null; end_time: string | null };
          const startTime = period.start_time || "00:00:00";
          const endTime = period.end_time || "23:59:59";

          if (now >= startTime && now <= endTime) {
            currentPeriod = period.label;
            currentSubject = entry.subject_name;
            currentRoom = entry.room;
          } else if (now < startTime && !nextPeriod) {
            nextPeriod = period.label;
            nextSubject = entry.subject_name;
            nextPeriodTime = startTime.slice(0, 5);
          }
        }
      }

      setData({
        currentPeriod,
        currentSubject,
        currentRoom,
        nextPeriod,
        nextSubject,
        nextPeriodTime,
        classesToday,
      });
      setLoading(false);
    };

    fetchData();
  }, [user, schoolId, sectionIds]);

  if (loading) {
    return (
      <Card className="border-primary/10 bg-surface/50 shadow-soft">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasSchedule = data.classesToday > 0;
  const isCurrentlyTeaching = !!data.currentSubject;
  const hasUpcomingClass = !!data.nextSubject;

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-soft transition-all duration-300 hover:shadow-elevated hover:border-primary/20 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          
          {/* Main Info Area */}
          <div className="flex items-start gap-3.5 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isCurrentlyTeaching 
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 animate-pulse" 
                : hasUpcomingClass 
                  ? "bg-primary/10 text-primary" 
                  : "bg-muted text-muted-foreground"
            }`}>
              {isCurrentlyTeaching ? (
                <Sparkles className="h-5 w-5" />
              ) : hasUpcomingClass ? (
                <Clock className="h-5 w-5" />
              ) : (
                <Coffee className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isCurrentlyTeaching ? "In Progress" : hasUpcomingClass ? "Up Next Today" : "Status"}
                </span>
                <Badge variant="outline" className="text-[10px] font-medium bg-background px-1.5 py-0">
                  {format(new Date(), "EEEE, MMM d")}
                </Badge>
              </div>

              {isCurrentlyTeaching ? (
                <p className="mt-1 font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
                  {data.currentSubject}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({data.currentPeriod} • Room {data.currentRoom || "N/A"})
                  </span>
                </p>
              ) : hasUpcomingClass ? (
                <p className="mt-1 font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
                  {data.nextSubject}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (Period {data.nextPeriod} at {data.nextPeriodTime})
                  </span>
                </p>
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <p className="font-display text-sm font-semibold text-foreground sm:text-base">
                    {hasSchedule 
                      ? "All scheduled classes for today are complete!" 
                      : "No classes scheduled for today."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex shrink-0 items-center gap-2 sm:self-center">
            {isCurrentlyTeaching ? (
              <Button asChild size="sm" className="rounded-xl shadow-soft">
                <Link to={`/${schoolSlug}/teacher/attendance`}>
                  Manage Attendance <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : hasUpcomingClass ? (
              <Button asChild variant="outline" size="sm" className="rounded-xl bg-background hover:bg-accent">
                <Link to={`/${schoolSlug}/teacher/timetable`}>
                  View Schedule <CalendarCheck className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm" className="rounded-xl text-primary hover:text-primary/80">
                <Link to={`/${schoolSlug}/teacher/timetable`}>
                  Timetable Details <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
