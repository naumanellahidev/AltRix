import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Cert = { id: string; title: string; certificate_type: string; issued_at: string; file_url: string };

export function StudentCertificatesModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
  const [rows, setRows] = useState<Cert[]>([]);

  const refresh = async () => {
    if (myStudent.status !== "ready") return;
    const { data } = await api
      .from("student_certificates")
      .select("id,title,certificate_type,issued_at,file_url")
      .eq("school_id", schoolId)
      .eq("student_id", myStudent.studentId)
      .order("issued_at", { ascending: false });
    setRows((data ?? []) as Cert[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStudent.status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your certificates</p>
        <Button variant="soft" onClick={refresh}>Refresh</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead className="text-right">Download</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.title}</TableCell>
              <TableCell className="text-muted-foreground">{c.certificate_type}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(c.issued_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <a className="text-sm underline" href={c.file_url} target="_blank" rel="noreferrer">
                  Download
                </a>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-muted-foreground">No certificates found.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
