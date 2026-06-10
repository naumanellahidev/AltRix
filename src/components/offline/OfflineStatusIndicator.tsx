import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface OfflineStats {
  pending: number;
  synced: number;
  failed: number;
  byType: Record<string, number>;
}

interface SyncProgress {
  current: number;
  total: number;
  currentType: string;
}

interface StorageInfo {
  usageFormatted: string;
  quotaFormatted: string;
  percentUsed: number;
}

interface OfflineStatusIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  stats: OfflineStats;
  lastSyncAt: Date | null;
  syncProgress: SyncProgress | null;
  storageInfo: StorageInfo | null;
  onSync: () => void;
  variant?: "floating" | "inline" | "compact";
  className?: string;
}

export function OfflineStatusIndicator({
  isOnline,
  isSyncing,
  stats,
  lastSyncAt,
  syncProgress,
  storageInfo,
  onSync,
  variant = "floating",
  className,
}: OfflineStatusIndicatorProps) {
  const [open, setOpen] = useState(false);

  const hasIssues = stats.pending > 0 || stats.failed > 0;
  const showBadge = !isOnline || hasIssues || isSyncing;

  const getStatusIcon = () => {
    if (isSyncing) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (!isOnline) return <CloudOff className="h-4 w-4" />;
    if (stats.failed > 0) return <AlertTriangle className="h-4 w-4" />;
    if (stats.pending > 0) return <RefreshCw className="h-4 w-4" />;
    return <Cloud className="h-4 w-4" />;
  };

  const getStatusColor = () => {
    if (!isOnline) return "bg-amber-500";
    if (stats.failed > 0) return "bg-destructive";
    if (isSyncing || stats.pending > 0) return "bg-primary";
    return "bg-emerald-500";
  };

  if (variant === "compact") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "relative h-8 w-8",
              !isOnline && "text-amber-500",
              className
            )}
          >
            {getStatusIcon()}
            {showBadge && (
              <span className={cn(
                "absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold text-white",
                getStatusColor()
              )}>
                {stats.pending > 0 ? (stats.pending > 9 ? "9+" : stats.pending) : ""}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <StatusContent
            isOnline={isOnline}
            isSyncing={isSyncing}
            stats={stats}
            lastSyncAt={lastSyncAt}
            syncProgress={syncProgress}
            storageInfo={storageInfo}
            onSync={onSync}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          isOnline ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
        )}>
          {getStatusIcon()}
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>
        {stats.pending > 0 && (
          <Badge variant="secondary" className="text-xs">
            {stats.pending} pending
          </Badge>
        )}
      </div>
    );
  }

  // Floating variant (default)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "fixed bottom-20 right-4 z-40 gap-2 rounded-full transition-all lg:bottom-4 backdrop-blur-sm",
            isOnline && "bg-transparent border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-500/30 shadow-none",
            !isOnline && "border-amber-500 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 shadow-lg",
            isSyncing && "animate-pulse",
            className
          )}
        >
          {getStatusIcon()}
          <span className="hidden sm:inline">
            {isSyncing ? "Syncing..." : isOnline ? "Online" : "Offline"}
          </span>
          {stats.pending > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 rounded-full px-1.5 text-[10px]">
              {stats.pending}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 p-4">
        <StatusContent
          isOnline={isOnline}
          isSyncing={isSyncing}
          stats={stats}
          lastSyncAt={lastSyncAt}
          syncProgress={syncProgress}
          storageInfo={storageInfo}
          onSync={onSync}
        />
      </PopoverContent>
    </Popover>
  );
}

function StatusContent({
  isOnline,
  isSyncing,
  stats,
  lastSyncAt,
  syncProgress,
  storageInfo,
  onSync,
}: {
  isOnline: boolean;
  isSyncing: boolean;
  stats: OfflineStats;
  lastSyncAt: Date | null;
  syncProgress: SyncProgress | null;
  storageInfo: StorageInfo | null;
  onSync: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Cloud className="h-5 w-5 text-emerald-500" />
          ) : (
            <CloudOff className="h-5 w-5 text-amber-500" />
          )}
          <div>
            <p className="font-medium">{isOnline ? "Connected" : "Offline Mode"}</p>
            {lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last sync: {lastSyncAt.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing || !isOnline}
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Syncing {syncProgress.currentType}...</span>
            <span>{syncProgress.current}/{syncProgress.total}</span>
          </div>
          <Progress value={(syncProgress.current / syncProgress.total) * 100} className="h-1.5" />
        </div>
      )}

      {/* Queue Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-lg font-semibold">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
          <Check className="mx-auto h-4 w-4 text-emerald-600" />
          <p className="text-xs text-muted-foreground">{stats.synced} Synced</p>
        </div>
        <div className="rounded-lg bg-destructive/10 p-2 text-center">
          <p className="text-lg font-semibold text-destructive">{stats.failed}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </div>
      </div>

      {/* Pending by Type */}
      {Object.keys(stats.byType).length > 0 && stats.pending > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Pending by type:</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.byType)
              .filter(([_, count]) => count > 0)
              .map(([type, count]) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type}: {count}
                </Badge>
              ))}
          </div>
        </div>
      )}

      {/* Storage Info */}
      {storageInfo && (
        <div className="space-y-1.5 border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>Local Storage: {storageInfo.usageFormatted} / {storageInfo.quotaFormatted}</span>
          </div>
          <Progress value={storageInfo.percentUsed} className="h-1" />
        </div>
      )}

      {/* Offline Tips */}
      {!isOnline && (
        <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700">
          <p className="font-medium">Working offline</p>
          <p className="mt-1 text-amber-600">Your changes are saved locally and will sync automatically when you're back online.</p>
        </div>
      )}
    </div>
  );
}
