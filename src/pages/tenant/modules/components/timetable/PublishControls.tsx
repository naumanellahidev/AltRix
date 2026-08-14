import { useState } from "react";
import { CheckCircle2, Globe, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PublishControlsProps {
  schoolId: string | null;
  sectionId: string;
  entryIds: string[];
  publishedCount: number;
  totalCount: number;
  onDone: () => Promise<void>;
  canEdit: boolean;
}

export function PublishControls({
  schoolId,
  sectionId,
  entryIds,
  publishedCount,
  totalCount,
  onDone,
  canEdit,
}: PublishControlsProps) {
  const [busy, setBusy] = useState(false);

  const allPublished = publishedCount === totalCount && totalCount > 0;
  const nonePublished = publishedCount === 0;

  const publishAll = async () => {
    if (!schoolId || !canEdit) return;
    setBusy(true);
    try {
      const { error } = await api
        .from("timetable_entries")
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq("school_id", schoolId)
        .eq("class_section_id", sectionId);
      if (error) return toast.error(error.message);
      toast.success("Timetable published to students/parents");
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const unpublishAll = async () => {
    if (!schoolId || !canEdit) return;
    setBusy(true);
    try {
      const { error } = await api
        .from("timetable_entries")
        .update({ is_published: false, published_at: null })
        .eq("school_id", schoolId)
        .eq("class_section_id", sectionId);
      if (error) return toast.error(error.message);
      toast.success("Timetable unpublished");
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  if (totalCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={allPublished ? "default" : "secondary"} className="gap-1">
        {allPublished ? (
          <>
            <Globe className="h-3 w-3" /> Published
          </>
        ) : nonePublished ? (
          <>
            <Lock className="h-3 w-3" /> Draft
          </>
        ) : (
          <>
            <Unlock className="h-3 w-3" /> {publishedCount}/{totalCount} published
          </>
        )}
      </Badge>

      {canEdit && !allPublished && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="soft" disabled={busy}>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Publish All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish timetable?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make the entire timetable visible to students and parents. You can
                unpublish later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void publishAll()}>Publish</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canEdit && allPublished && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              <Lock className="mr-1 h-4 w-4" />
              Unpublish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unpublish timetable?</AlertDialogTitle>
              <AlertDialogDescription>
                Students and parents will no longer see this timetable until you publish again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void unpublishAll()}>Unpublish</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
