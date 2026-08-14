import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Image, File, Download, ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface AttachmentsListProps {
  attachmentUrls: string[] | null;
  compact?: boolean;
}

const BUCKET_NAME = "assignment-submissions";

export function AttachmentsList({ attachmentUrls, compact = false }: AttachmentsListProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!attachmentUrls?.length) return null;

  const getFileIcon = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
      return <Image className="h-4 w-4" />;
    }
    if (["pdf", "doc", "docx", "txt"].includes(ext || "")) {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  const getFileName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  };

  const openFile = async (path: string) => {
    setLoading(path);
    const { data, error } = await api.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 3600);

    setLoading(null);

    if (error) {
      toast.error("Failed to open file");
      return;
    }

    window.open(data.signedUrl, "_blank");
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {attachmentUrls.map((path) => (
          <Button
            key={path}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => openFile(path)}
            disabled={loading === path}
          >
            {loading === path ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              getFileIcon(path)
            )}
            <span className="ml-1 max-w-[100px] truncate">{getFileName(path)}</span>
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Attachments ({attachmentUrls.length})</p>
      <div className="space-y-1">
        {attachmentUrls.map((path) => (
          <div
            key={path}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              {getFileIcon(path)}
              <span className="text-sm truncate">{getFileName(path)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openFile(path)}
              disabled={loading === path}
            >
              {loading === path ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
