import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { downloadCertificate } from "@/lib/documents/certificate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// The school's issued certificates. The PDF is drawn from the record on
// download (the documents library), so there is no stored file to link to.
type Cert = {
  id: string;
  title: string;
  certificate_type: string;
  certificate_number: string;
  issue_date: string | null;
  status: string;
};

export function StudentCertificatesModule({ myStudent }: { myStudent: any; schoolId: string }) {
  const [rows, setRows] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const refresh = async () => {
    if (myStudent.status !== "ready") return;
    setLoading(true);
    setError(null);
    try {
      const [types, certs] = await Promise.all([
        apiClient.get<{ type: string; title: string }[]>("/documents/certificates/types"),
        apiClient.get<any[]>("/documents/certificates", { params: { student_id: myStudent.studentId } }),
      ]);
      const titles = new Map((types.data ?? []).map((t) => [t.type, t.title]));
      setRows((certs.data ?? []).map((c) => ({
        id: c.id,
        title: titles.get(c.certificate_type) ?? c.certificate_type.replace(/_/g, " "),
        certificate_type: c.certificate_type,
        certificate_number: c.certificate_number,
        issue_date: c.issue_date,
        status: c.status,
      })));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Your certificates could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const download = async (id: string) => {
    setDownloading(id);
    try {
      const { warnings } = await downloadCertificate(id);
      warnings.forEach((w) => toast.warning(w));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "The certificate could not be downloaded");
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStudent.status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your certificates</p>
        <Button variant="soft" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Number</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead className="text-right">Download</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">
                {c.title}
                {c.status !== "valid" && <Badge variant="destructive" className="ml-2 capitalize">{c.status}</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.certificate_number}</TableCell>
              <TableCell className="text-muted-foreground">
                {c.issue_date ? new Date(c.issue_date).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="link" size="sm" disabled={downloading === c.id} onClick={() => download(c.id)}>
                  {downloading === c.id ? "Preparing…" : "Download PDF"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && !error && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-muted-foreground">No certificates have been issued to you yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
