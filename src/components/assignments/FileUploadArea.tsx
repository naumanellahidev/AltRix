import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, X, FileText, Image, File as FileIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FileUploadAreaProps {
  files: { name: string; path: string }[];
  onFilesChange: (files: { name: string; path: string }[]) => void;
  onUpload: (file: File) => Promise<string | null>;
  uploading: boolean;
  disabled?: boolean;
  maxFiles?: number;
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploadArea({
  files,
  onFilesChange,
  onUpload,
  uploading,
  disabled = false,
  maxFiles = 5,
}: FileUploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
      return <Image className="h-4 w-4" />;
    }
    if (["pdf", "doc", "docx", "txt"].includes(ext || "")) {
      return <FileText className="h-4 w-4" />;
    }
    return <FileIcon className="h-4 w-4" />;
  };

  const handleFiles = async (fileList: FileList) => {
    if (files.length >= maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const toUpload = Array.from(fileList).slice(0, maxFiles - files.length);

    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: File type not allowed`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name}: File too large (max 10MB)`);
        continue;
      }

      const path = await onUpload(file);
      if (path) {
        onFilesChange([...files, { name: file.name, path }]);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  return (
    <div className="space-y-3">
      <div
        className={`
          border-2 border-dashed rounded-lg p-4 text-center transition-colors
          ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          onChange={handleChange}
          disabled={disabled}
        />
        
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              PDF, Word, Images • Max 10MB each
            </p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={file.path}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(file.name)}
                <span className="text-sm truncate">{file.name}</span>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {files.length}/{maxFiles} files attached
          </p>
        </div>
      )}
    </div>
  );
}
