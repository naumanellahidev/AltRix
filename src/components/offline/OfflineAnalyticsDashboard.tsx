import { useMemo } from 'react';
import { BarChart3, Users, BookOpen, Clock, TrendingUp, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getCachedStats } from '@/hooks/useUniversalPrefetch';
import { formatDistanceToNow } from 'date-fns';

interface OfflineAnalyticsDashboardProps {
  schoolId: string;
  role: string;
  className?: string;
}

interface CachedKPI {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  color?: string;
}

export function OfflineAnalyticsDashboard({
  schoolId,
  role,
  className,
}: OfflineAnalyticsDashboardProps) {
  const isOnline = navigator.onLine;
  
  const { stats, cachedAt } = useMemo(() => {
    const cached = getCachedStats(schoolId, role);
    const rawCachedAt = localStorage.getItem(`eduverse_stats_${schoolId}_${role}`);
    let cachedAtDate: Date | null = null;
    
    if (rawCachedAt) {
      try {
        const parsed = JSON.parse(rawCachedAt);
        cachedAtDate = new Date(parsed.cachedAt);
      } catch {
        // Ignore
      }
    }
    
    return {
      stats: cached || {},
      cachedAt: cachedAtDate,
    };
  }, [schoolId, role]);

  const kpis: CachedKPI[] = useMemo(() => {
    const items: CachedKPI[] = [];
    
    if (typeof stats.totalStudents === 'number') {
      items.push({
        label: 'Total Students',
        value: stats.totalStudents,
        icon: <Users className="h-4 w-4" />,
        color: 'text-blue-600',
      });
    }
    
    if (typeof stats.pendingHomework === 'number') {
      items.push({
        label: 'Pending Homework',
        value: stats.pendingHomework,
        icon: <BookOpen className="h-4 w-4" />,
        color: 'text-amber-600',
      });
    }
    
    if (typeof stats.totalAssignments === 'number') {
      items.push({
        label: 'Assignments',
        value: stats.totalAssignments,
        icon: <BarChart3 className="h-4 w-4" />,
        color: 'text-emerald-600',
      });
    }
    
    if (typeof stats.attendanceRate === 'number') {
      items.push({
        label: 'Attendance Rate',
        value: `${stats.attendanceRate.toFixed(1)}%`,
        icon: <TrendingUp className="h-4 w-4" />,
        color: stats.attendanceRate >= 90 ? 'text-emerald-600' : 'text-amber-600',
      });
    }

    // Owner/Admin specific stats
    if (typeof stats.totalRevenue === 'number') {
      items.push({
        label: 'Revenue MTD',
        value: `PKR ${stats.totalRevenue.toLocaleString()}`,
        icon: <BarChart3 className="h-4 w-4" />,
        color: 'text-emerald-600',
      });
    }

    if (typeof stats.openLeads === 'number') {
      items.push({
        label: 'Open Leads',
        value: stats.openLeads,
        icon: <Users className="h-4 w-4" />,
        color: 'text-purple-600',
      });
    }

    if (typeof stats.pendingInvoices === 'number') {
      items.push({
        label: 'Pending Invoices',
        value: stats.pendingInvoices,
        icon: <Clock className="h-4 w-4" />,
        color: 'text-orange-600',
      });
    }
    
    return items;
  }, [stats]);

  if (kpis.length === 0) {
    return null;
  }

  const timeAgo = cachedAt ? formatDistanceToNow(cachedAt, { addSuffix: true }) : 'unknown';

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Quick Stats
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Updated {timeAgo}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
            >
              <div className={cn('rounded-full bg-background p-2', kpi.color)}>
                {kpi.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="text-lg font-semibold">{kpi.value}</p>
              </div>
              {kpi.trend !== undefined && (
                <Badge
                  variant={kpi.trend >= 0 ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {kpi.trend >= 0 ? '+' : ''}{kpi.trend}%
                </Badge>
              )}
            </div>
          ))}
        </div>

        {!isOnline && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>Showing cached data. Stats will refresh when online.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
