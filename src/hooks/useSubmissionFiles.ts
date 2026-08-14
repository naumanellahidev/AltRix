import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const BUCKET_NAME = "assignment-submissions";

export function useSubmissionFiles(studentId: string, assignmentId: string) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);

  const loadFiles = async (attachmentUrls: string[] | null) => {
    if (!attachmentUrls?.length) {
      setFiles([]);
      return;
    }

    const loadedFiles = attachmentUrls.map((path) => {
      const { data } = api.storage.from(BUCKET_NAME).getPublicUrl(path);
      const name = path.split("/").pop() || path;
      return { name, url: data.publicUrl };
    });

    setFiles(loadedFiles);
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!studentId || !assignmentId) return null;

    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `${studentId}/${assignmentId}/${fileName}`;

    setUploading(true);
    const { error } = await api.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { upsert: false });

    setUploading(false);

    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    }

    return filePath;
  };

  const deleteFile = async (filePath: string): Promise<boolean> => {
    const { error } = await api.storage.from(BUCKET_NAME).remove([filePath]);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return false;
    }
    return true;
  };

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data, error } = await api.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      toast.error(`Failed to get file: ${error.message}`);
      return null;
    }
    return data.signedUrl;
  };

  return {
    files,
    uploading,
    loadFiles,
    uploadFile,
    deleteFile,
    getSignedUrl,
  };
}
