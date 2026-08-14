import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PeriodRow = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
};

type SectionRow = { id: string; name: string; class_id: string };

type EntryRow = {
  id: string;
  day_of_week: number;
  period_id: string;
  subject_name: string;
  teacher_user_id: string | null;
  room: string | null;
};

type TimetableEntryInsert = {
  school_id: string;
  class_section_id: string;
  day_of_week: number;
  period_id: string;
  subject_name: string;
  teacher_user_id: string | null;
  room: string | null;
  start_time: string | null;
  end_time: string | null;
};

const DAYS: Array<{ id: number; label: string }> = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

export function TimetableToolsDialog({
  open,
  onOpenChange,
  schoolId,
  canEdit,
  periods,
  sections,
  sectionLabelById,
  currentSectionId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  canEdit: boolean;
  periods: PeriodRow[];
  sections: SectionRow[];
  sectionLabelById: Map<string, string>;
  currentSectionId: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  // Bulk room fill
  const [bulkRoom, setBulkRoom] = useState("");
  const [bulkDay, setBulkDay] = useState<string>("__all");
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(true);

  // Copy timetable
  const [copySourceSectionId, setCopySourceSectionId] = useState(currentSectionId);
  const [copyTargetSectionId, setCopyTargetSectionId] = useState("");
  const [copyMode, setCopyMode] = useState<"week" | "day">("week");
  const [copySourceDay, setCopySourceDay] = useState(1);
  const [copyTargetDay, setCopyTargetDay] = useState(1);

  const periodById = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);

  const ensureCanEdit = () => {
    if (!canEdit) {
      toast.error("Read-only: you don't have permission to edit timetables.");
      return false;
    }
    if (!schoolId) return false;
    return true;
  };

  const runBulkRoomFill = async () => {
    if (!ensureCanEdit()) return;
    if (!currentSectionId) return toast.error("Choose a section first.");
    const room = bulkRoom.trim();
    if (!room) return toast.error("Enter a room name.");

    const day = bulkDay === "__all" ? null : Number(bulkDay);
    if (bulkDay !== "__all" && !Number.isFinite(day)) return toast.error("Choose a valid day.");

    setBusy(true);
    try {
      let q = api
        .from("timetable_entries")
        .update({ room })
        .eq("school_id", schoolId)
        .eq("class_section_id", currentSectionId);

      if (day !== null) q = q.eq("day_of_week", day);
      if (bulkOnlyEmpty) q = q.is("room", null);

      const { error } = await q;
      if (error) return toast.error(error.message);
      toast.success("Rooms updated");
      await onDone();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const runCopyTimetable = async () => {
    if (!ensureCanEdit()) return;
    if (!copySourceSectionId) return toast.error("Choose a source section.");
    if (!copyTargetSectionId) return toast.error("Choose a target section.");

    setBusy(true);
    try {
      const { data: srcEntries, error: srcErr } = await api
        .from("timetable_entries")
        .select("id,day_of_week,period_id,subject_name,teacher_user_id,room")
        .eq("school_id", schoolId)
        .eq("class_section_id", copySourceSectionId)
        .order("day_of_week")
        .order("period_id");

      if (srcErr) return toast.error(srcErr.message);

      const filtered = ((srcEntries ?? []) as EntryRow[]).filter((e) =>
        copyMode === "week" ? true : e.day_of_week === copySourceDay,
      );

      // Clear target scope first
      const daysToClear = copyMode === "week" ? [0, 1, 2, 3, 4, 5, 6] : [copyTargetDay];
      const { error: delErr } = await api
        .from("timetable_entries")
        .delete()
        .eq("school_id", schoolId)
        .eq("class_section_id", copyTargetSectionId)
        .in("day_of_week", daysToClear);
      if (delErr) return toast.error(delErr.message);

      const rowsToInsert: TimetableEntryInsert[] = filtered.flatMap((e) => {
        const period = periodById.get(e.period_id);
        if (!period) return [];
        return [
          {
            school_id: schoolId,
            class_section_id: copyTargetSectionId,
            day_of_week: copyMode === "week" ? e.day_of_week : copyTargetDay,
            period_id: e.period_id,
            subject_name: e.subject_name,
            teacher_user_id: e.teacher_user_id,
            room: e.room,
            start_time: period.start_time,
            end_time: period.end_time,
          },
        ];
      });

      if (rowsToInsert.length === 0) {
        toast.message("Nothing to copy", {
          description: "The source section has no timetable entries for the selected scope.",
        });
        return;
      }

      const { error: insErr } = await api.from("timetable_entries").insert(rowsToInsert);
      if (insErr) return toast.error(insErr.message);

      toast.success("Timetable copied");
      await onDone();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tools</DialogTitle>
          <DialogDescription>Bulk actions for the currently selected section.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-2xl border bg-surface p-4">
            <p className="text-sm font-medium">Bulk room fill</p>

            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={bulkDay} onValueChange={setBulkDay}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Full week</SelectItem>
                  {DAYS.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Room</Label>
              <Input value={bulkRoom} onChange={(e) => setBulkRoom(e.target.value)} placeholder="e.g. Lab 2" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={bulkOnlyEmpty} onCheckedChange={(v) => setBulkOnlyEmpty(Boolean(v))} />
              <span className="text-muted-foreground">Only fill empty rooms</span>
            </label>

            <Button variant="soft" onClick={() => void runBulkRoomFill()} disabled={busy || !currentSectionId}>
              Apply
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border bg-surface p-4">
            <p className="text-sm font-medium">Copy timetable</p>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={copyMode} onValueChange={(v) => setCopyMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Copy full week</SelectItem>
                  <SelectItem value="day">Copy one day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>From section</Label>
              <Select value={copySourceSectionId} onValueChange={setCopySourceSectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Source section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sectionLabelById.get(s.id) ?? s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>To section</Label>
              <Select value={copyTargetSectionId} onValueChange={setCopyTargetSectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Target section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sectionLabelById.get(s.id) ?? s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {copyMode === "day" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Source day</Label>
                  <Select value={String(copySourceDay)} onValueChange={(v) => setCopySourceDay(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target day</Label>
                  <Select value={String(copyTargetDay)} onValueChange={(v) => setCopyTargetDay(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            <Button variant="soft" onClick={() => void runCopyTimetable()} disabled={busy}>
              Copy
            </Button>
            <p className="text-xs text-muted-foreground">
              Note: the target scope is cleared first to avoid mixed timetables.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
