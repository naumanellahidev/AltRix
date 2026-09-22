/**
 * The one-time question, and the place to change the answer later.
 *
 * A report card has to come out on a single sheet. Most do. A card with
 * twenty subjects, a photo, a term chart and two sets of remarks does not, and
 * the builder cannot decide on its own what should give way — that is the
 * school's call, and it has to be the same call for every child, or one class
 * goes home on one sheet and the next on two.
 *
 * So the principal is asked once, every option on one screen, and every later
 * card follows the answer without asking again.
 */
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  FIT_STRATEGY_CHOICES,
  type ReportCardPrintSettings,
} from "@/lib/report-card-settings";

const SECTION_TOGGLES: Array<{
  key: keyof ReportCardPrintSettings;
  label: string;
  hint: string;
}> = [
  { key: "showPhoto", label: "Student photograph", hint: "Printed top right, when the student has one." },
  { key: "showAttendance", label: "Attendance", hint: "Days present and the percentage." },
  { key: "showRank", label: "Position in class", hint: "“3rd of 38”, when a position has been worked out." },
  { key: "showActivities", label: "Co-curricular activities", hint: "Debates, sport, societies." },
  { key: "showTermTrend", label: "Progress across terms", hint: "The small bar chart of earlier terms." },
  { key: "showGradeKey", label: "Grading key", hint: "The grade bands, printed as one line at the foot." },
];

export function ReportCardPrintSetup({
  open,
  onOpenChange,
  initial,
  firstTime,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ReportCardPrintSettings;
  /** True the first time a school is asked, which changes the wording. */
  firstTime: boolean;
  onSave: (settings: ReportCardPrintSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReportCardPrintSettings>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            {firstTime ? "How should this school's report cards print?" : "Report card print settings"}
          </DialogTitle>
          <DialogDescription>
            {firstTime
              ? "Asked once. Every card after this follows the answer, so a whole class prints the same way. You can change it here whenever you like."
              : "Applies to every card this school prints, from now on."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-1">
          <section className="space-y-3">
            <div>
              <h4 className="font-semibold">When a card will not fit one sheet</h4>
              <p className="text-sm text-muted-foreground">
                Cards are always tightened as far as they need to be first, and subjects are set
                in two columns where that helps. This is what happens when even that is not enough.
              </p>
            </div>
            <div className="space-y-2">
              {FIT_STRATEGY_CHOICES.map((choice) => {
                const active = draft.fitStrategy === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, fitStrategy: choice.value })}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                          active ? "border-primary bg-primary" : "border-slate-300 dark:border-slate-600"
                        }`}
                      />
                      <div>
                        <p className="font-medium">{choice.title}</p>
                        <p className="text-sm text-muted-foreground">{choice.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h4 className="font-semibold">What goes on the card</h4>
              <p className="text-sm text-muted-foreground">
                Marks, grades and remarks are always printed. These are the extras — turning one
                off leaves more room for the rest.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTION_TOGGLES.map((section) => (
                <label
                  key={section.key}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3"
                >
                  <Checkbox
                    checked={draft[section.key] as boolean}
                    onCheckedChange={(v) => setDraft({ ...draft, [section.key]: v === true })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="block text-xs text-muted-foreground">{section.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="font-semibold">Style</Label>
            <div className="flex flex-wrap gap-2">
              {(["classic", "modern", "minimal"] as const).map((template) => (
                <Button
                  key={template}
                  type="button"
                  variant={draft.template === template ? "default" : "outline"}
                  size="sm"
                  className="capitalize"
                  onClick={() => setDraft({ ...draft, template })}
                >
                  {template}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              All three print on the school's letterhead in its own colour; they differ in how
              much rule and shading the page carries.
            </p>
          </section>
        </div>

        <DialogFooter>
          {!firstTime && (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {firstTime ? "Save and print this way from now on" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportCardPrintSetup;
