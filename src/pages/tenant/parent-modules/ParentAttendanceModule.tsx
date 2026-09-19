import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { RefreshCw, WifiOff } from "lucide-react";
import { useOfflineAttendanceEntries } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { DataExportMenu } from "@/components/documents/DataExportMenu";

interface ParentAttendanceModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const ParentAttendanceModule = ({ child, schoolId }: ParentAttendanceModuleProps) => {
  // Use offline-first hook
  const { 
    data: cachedAttendance, 
    loading, 
    isOffline, 
    isUsingCache,
    refresh 
  } = useOfflineAttendanceEntries(schoolId);

  // Filter for this child's attendance
  const childAttendance = useMemo(() => {
    if (!child) return [];
    return cachedAttendance
      .filter(a => a.studentId === child.student_id)
      .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
  }, [cachedAttendance, child]);

  if (!child) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a child to view attendance.
      </div>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "present":
        return "default";
      case "absent":
        return "destructive";
      case "late":
        return "secondary";
      case "excused":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refresh} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground">
            View attendance records for {child.first_name || "your child"}
          </p>
        </div>
        {!isOffline && (
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Attendance History</CardTitle>
            <DataExportMenu
              title="Attendance History"
              subtitle={child ? [child.first_name, child.last_name].filter(Boolean).join(" ") : undefined}
              fileNameParts={[child ? [child.first_name, child.last_name].filter(Boolean).join(" ") : null, "Attendance"]}
              rows={childAttendance.map((r: any) => ({ Date: r.sessionDate ? String(r.sessionDate).slice(0, 10) : "", Period: r.periodLabel ?? "", Status: r.status, Note: r.note ?? "" }))}
              disabled={!childAttendance.length}
              size="sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {childAttendance.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isOffline ? (
                <div className="flex flex-col items-center gap-2">
                  <WifiOff className="h-6 w-6" />
                  <span>No cached attendance records available</span>
                </div>
              ) : (
                "No attendance records found."
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {childAttendance.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {record.sessionDate
                        ? format(new Date(record.sessionDate), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>{record.periodLabel || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(record.status)}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ParentAttendanceModule;
