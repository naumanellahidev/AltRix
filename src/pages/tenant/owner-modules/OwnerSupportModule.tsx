import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, MessageSquare, CheckCircle, Clock, AlertCircle, Search, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { SupportInbox } from "@/pages/tenant/modules/components/SupportInbox";

interface Props {
  schoolId: string | null;
}

export function OwnerSupportModule({ schoolId }: Props) {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

  // Fetch support ticket stats
  const { data: stats } = useQuery({
    queryKey: ["owner_support_stats", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;

      const { data: messages } = await api
        .from("admin_messages")
        .select("id,status,priority,created_at")
        .eq("school_id", schoolId);

      const all = messages || [];
      const open = all.filter((m) => m.status === "open");
      const resolved = all.filter((m) => m.status === "resolved");
      const high = all.filter((m) => m.priority === "high" && m.status === "open");

      return {
        total: all.length,
        open: open.length,
        resolved: resolved.length,
        highPriority: high.length,
      };
    },
    enabled: !!schoolId,
  });

  // Real-time updates
  useRealtimeTable({
    channel: `owner-support-${schoolId}`,
    table: "admin_messages",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => {
      void qc.invalidateQueries({ queryKey: ["owner_support_stats", schoolId] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-primary" /> Support Overview
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage all support tickets across your institution
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline">All</Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{stats?.total || 0}</p>
            <p className="text-xs text-muted-foreground">Total Tickets</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-amber-600" />
              <Badge variant="secondary">Open</Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-amber-600">{stats?.open || 0}</p>
            <p className="text-xs text-muted-foreground">Open Tickets</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <Badge variant="default">Done</Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-emerald-600">{stats?.resolved || 0}</p>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <Badge variant="destructive">Urgent</Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-red-600">{stats?.highPriority || 0}</p>
            <p className="text-xs text-muted-foreground">High Priority</p>
          </CardContent>
        </Card>
      </div>

      {/* Support Inbox */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {schoolId ? (
            <SupportInbox schoolId={schoolId} />
          ) : (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
