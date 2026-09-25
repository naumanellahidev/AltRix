import { useRef, useState } from "react";
import { FileUp, Paperclip, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Files attached to a complaint: really uploaded, and openable later.
 *
 * The complaint forms had an "Add mock file" button that attached made-up
 * names ("Witness_Declaration.pdf", "Screenshot_Incident_Report.png") to the
 * complaint record. Those files never existed, but a principal saw them
 * listed as evidence. Attachments are now the files the user chose, stored
 * in the school's own storage, and opened through a short-lived signed link.
 */

export const COMPLAINT_BUCKET = "complaint-attachments";
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export type ComplaintAttachment = {
  id: string;
  name: string;
  size: string;
  type: string;
  /** Where the file is stored. Missing on the old made-up entries. */
  path?: string;
  uploadedAt: string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The picker on a complaint form. */
export function ComplaintAttachmentPicker({
  schoolId,
  userId,
  value,
  onChange,
  hint,
}: {
  schoolId: string | null | undefined;
  userId: string | null | undefined;
  value: ComplaintAttachment[];
  onChange: (next: ComplaintAttachment[]) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length || !schoolId || !userId) return;
    const room = MAX_FILES - value.length;
    if (room <= 0) {
      toast.error(`At most ${MAX_FILES} files can be attached.`);
      return;
    }
    setUploading(true);
    const added: ComplaintAttachment[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 10 MB and was not attached.`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
        const path = `${userId}/${Date.now()}_${safeName}`;
        const { error } = await api.storage.from(COMPLAINT_BUCKET).upload(path, file);
        if (error) {
          toast.error(`${file.name} was not attached: ${error.message}`);
          continue;
        }
        added.push({
          id: `${Date.now()}-${added.length}`,
          name: file.name,
          size: humanSize(file.size),
          type: file.type || "application/octet-stream",
          path,
          uploadedAt: new Date().toISOString(),
        });
      }
      if (added.length) {
        onChange([...value, ...added]);
        toast.success(added.length === 1 ? `Attached ${added[0].name}` : `Attached ${added.length} files`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => void add(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || !schoolId || !userId || value.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5 text-xs font-semibold rounded-lg"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Attach files"}
        </Button>
        <span className="text-[10px] text-muted-foreground italic">
          {hint ?? "Images, PDFs or documents"} — up to {MAX_FILES} files, 10 MB each
        </span>
      </div>

      {value.length > 0 && (
        <div className="space-y-1.5 pt-1 border border-slate-100 rounded-xl p-2.5 bg-slate-50/50">
          {value.map((file) => (
            <div key={file.id} className="flex items-center justify-between text-xs bg-white border rounded-lg p-2 shadow-sm">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                <span>{file.name}</span>
                <span className="text-[10px] text-muted-foreground font-medium">({file.size})</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-500 rounded-md"
                onClick={() => onChange(value.filter((a) => a.id !== file.id))}
                aria-label={`Remove ${file.name}`}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One attachment on a complaint that has been sent: opens the stored file. */
export function ComplaintAttachmentChip({ file, className = "" }: { file: ComplaintAttachment; className?: string }) {
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (!file.path) return;
    setOpening(true);
    try {
      const { data, error } = await api.storage.from(COMPLAINT_BUCKET).createSignedUrl(file.path, 300);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "No link");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(`${file.name} could not be opened: ${err?.message ?? err}`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={!file.path || opening}
      title={file.path ? "Open this file" : "No file was stored for this entry"}
      className={`flex items-center gap-1.5 bg-slate-50 border rounded-lg py-1 px-2.5 text-xs font-semibold text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-70 ${className}`}
    >
      {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 text-slate-400" />}
      <span>{file.name}</span>
      <span className="text-[10px] text-muted-foreground font-medium">
        {file.path ? `(${file.size})` : "(file not stored)"}
      </span>
    </button>
  );
}
