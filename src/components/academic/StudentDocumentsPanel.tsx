/**
 * A student's papers, on the student's own record.
 *
 * The birth certificate, the B-form and the previous report card are handed in
 * at admission. They were stored against the *application*, which is archived
 * the moment it is approved, so the child's own record showed nothing — and
 * the office went back to the filing cabinet.
 *
 * They are carried across on approval now. This is where they are read, and
 * where anything that arrives later is added.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { getVPSFileUrl } from "@/lib/vpsStorage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/tenant/module-kit";

interface StudentDocument {
  id: string;
  document_name: string | null;
  category: string | null;
  file_url: string | null;
  expires_at: string | null;
  created_at: string | null;
}

const BUCKET = "admission-documents";

export function StudentDocumentsPanel({ studentId, schoolId }: { studentId: string; schoolId: string }) {
  const [rows, setRows] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/documents/student/${studentId}`);
      setRows(data ?? []);
      setError(null);
    } catch (err) {
      // Reported: an empty list and a failed request must not look the same
      // on a screen that answers "did the family hand this in?".
      setRows([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${schoolId}/${studentId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await api.storage.from(BUCKET).upload(path, file);
        if (upErr) {
          toast.error(`${file.name} was not saved: ${upErr.message}`);
          continue;
        }
        await apiClient.post("/documents/upload", {
          student_id: studentId,
          document_name: file.name,
          category: "general",
          file_url: path,
        });
      }
      await load();
      toast.success("Added to the student's record");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "The document could not be saved");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Everything handed in for this child, including what came with the admission.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void add(e.target.files)}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Add a document
        </Button>
      </div>

      {loading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <ErrorState title="The student's documents could not be loaded" error={error} onRetry={() => void load()} />
      ) : !rows.length ? (
        <EmptyState
          icon={Paperclip}
          title="Nothing on file yet"
          description="Birth certificate, B-form, previous report card — anything handed in at admission appears here, and anything that arrives later can be added."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.document_name ?? "Document"}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.category === "admission" ? "Handed in at admission" : doc.category ?? "General"}
                    {doc.created_at ? ` · ${doc.created_at.slice(0, 10)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {doc.expires_at ? (
                  <Badge variant="outline" className="text-[10px]">
                    Expires {doc.expires_at.slice(0, 10)}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const url = getVPSFileUrl(BUCKET, doc.file_url);
                    if (!url) {
                      toast.error("That document has no file stored against it");
                      return;
                    }
                    window.open(url, "_blank", "noopener");
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
