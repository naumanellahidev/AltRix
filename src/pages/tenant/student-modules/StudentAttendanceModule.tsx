import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, WifiOff } from "lucide-react";
import { useOfflineAttendanceEntries } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

export function StudentAttendanceModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
  // Use offline-first hook
  const { 
    data: cachedAttendance, 
    loading, 
    isOffline, 
    isUsingCache,
    refresh 
  } = useOfflineAttendanceEntries(schoolId);

  // Filter for this student and sort by date
  const studentAttendance = useMemo(() => {
    if (myStudent.status !== "ready") return [];
    return cachedAttendance
      .filter(a => a.studentId === myStudent.studentId)
      .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
  }, [cachedAttendance, myStudent]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present":
        return <Badge variant="default" className="bg-primary/10 text-primary">Present</Badge>;
      case "absent":
        return <Badge variant="destructive">Absent</Badge>;
      case "late":
        return <Badge variant="secondary">Late</Badge>;
      case "excused":
        return <Badge variant="outline">Excused</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refresh} />
      
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your attendance entries</p>
        {!isOffline && (
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        )}
      </div>
      
      <div className="w-full overflow-x-auto rounded-xl border border-muted/30">
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
            {studentAttendance.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(r.sessionDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {r.periodLabel || "—"}
                </TableCell>
                <TableCell>{getStatusBadge(r.status)}</TableCell>
                <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
              </TableRow>
            ))}
            {studentAttendance.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  {isOffline ? (
                    <div className="flex flex-col items-center gap-2">
                      <WifiOff className="h-6 w-6" />
                      <span>No cached attendance available</span>
                    </div>
                  ) : (
                    "No attendance found."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
