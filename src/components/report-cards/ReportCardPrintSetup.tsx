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
  REPORT_CARD_TEMPLATES,
  TEMPLATE_ORDER,
  type ReportCardTemplate,
} from "@/lib/documents/report-card-templates";
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

          <section className="space-y-3">
            <div>
              <h4 className="font-semibold">The design</h4>
              <p className="text-sm text-muted-foreground">
                Seven finished designs. Each prints on the school's own letterhead in its own
                colour; what changes is the whole look — headings, figures, the result table and
                the border. Pick one now and change it whenever you like.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATE_ORDER.map((id) => {
                const template = REPORT_CARD_TEMPLATES[id];
                const active = draft.template === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft({ ...draft, template: id })}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <TemplateThumbnail template={template} active={active} />
                      <div className="min-w-0">
                        <p className="font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
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

/**
 * A miniature of the design, so the choice is made by eye rather than by name.
 *
 * It mirrors what the builder actually draws — the page border, the heading
 * style, the shape of the figures and the table — at the size of a stamp.
 */
function TemplateThumbnail({
  template,
  active,
}: {
  template: ReportCardTemplate;
  active: boolean;
}) {
  const accent = active ? "currentColor" : "#94a3b8";
  const rule = "#cbd5e1";

  return (
    <svg
      viewBox="0 0 34 46"
      className={`h-[46px] w-[34px] shrink-0 rounded-sm border bg-white ${active ? "text-primary" : "text-slate-400"}`}
      aria-hidden="true"
    >
      {/* page border */}
      {template.pageFrame === "topBand" && <rect x="0" y="0" width="34" height="3" fill={accent} />}
      {template.pageFrame === "hairline" && (
        <rect x="1.5" y="1.5" width="31" height="43" fill="none" stroke={rule} strokeWidth="0.6" />
      )}
      {template.pageFrame === "double" && (
        <>
          <rect x="1.2" y="1.2" width="31.6" height="43.6" fill="none" stroke={accent} strokeWidth="0.9" />
          <rect x="2.6" y="2.6" width="28.8" height="40.8" fill="none" stroke={rule} strokeWidth="0.4" />
        </>
      )}

      {/* letterhead */}
      <rect x="5" y={template.pageFrame === "topBand" ? 6 : 5} width="14" height="2" rx="0.6" fill={accent} />
      <rect x="5" y={template.pageFrame === "topBand" ? 9.5 : 8.5} width="24" height="0.8" rx="0.4" fill={rule} />

      {/* headline figures */}
      {template.tileStyle === "strip" ? (
        <>
          <rect x="5" y="13" width="24" height="0.7" fill={rule} />
          <rect x="5" y="15.5" width="24" height="0.5" fill={rule} />
        </>
      ) : (
        [0, 1, 2].map((i) => (
          <rect
            key={i}
            x={5 + i * 8.4}
            y="12.5"
            width="7.2"
            height="5"
            rx="1"
            fill={template.tileStyle === "filled" ? accent : "none"}
            fillOpacity={template.tileStyle === "filled" ? 0.18 : 1}
            stroke={template.tileStyle === "outlined" ? rule : "none"}
            strokeWidth="0.5"
          />
        ))
      )}

      {/* section heading */}
      {template.sectionStyle === "band" ? (
        <rect x="5" y="20" width="24" height="2.6" fill={accent} />
      ) : template.sectionStyle === "sideRules" ? (
        <>
          <rect x="5" y="21.2" width="7" height="0.5" fill={accent} />
          <rect x="13.5" y="20.2" width="7" height="2" rx="0.4" fill={accent} fillOpacity="0.5" />
          <rect x="22" y="21.2" width="7" height="0.5" fill={accent} />
        </>
      ) : (
        <>
          <rect x="5" y="20.2" width="10" height="1.4" rx="0.4" fill={accent} fillOpacity="0.55" />
          {template.sectionStyle === "rule" && <rect x="5" y="22.4" width="24" height="0.5" fill={accent} />}
        </>
      )}

      {/* result table */}
      <g>
        {template.table.accentHeader && <rect x="5" y="25" width="24" height="2.4" fill={accent} />}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            {template.table.zebra && i % 2 === 1 && (
              <rect x="5" y={28 + i * 3} width="24" height="2.6" fill={rule} fillOpacity="0.35" />
            )}
            <rect x="6" y={29 + i * 3} width="12" height="0.6" fill={rule} />
            <rect x="24" y={29 + i * 3} width="4" height="0.6" fill={rule} />
            {template.table.rowRules && (
              <rect x="5" y={30.6 + i * 3} width="24" height="0.3" fill={rule} fillOpacity="0.8" />
            )}
          </g>
        ))}
        {template.table.frame && (
          <rect x="5" y="25" width="24" height="15.5" fill="none" stroke={rule} strokeWidth="0.5" />
        )}
      </g>

      {/* signature lines */}
      <rect x="5" y="42.5" width="8" height="0.5" fill={rule} />
      <rect x="21" y="42.5" width="8" height="0.5" fill={rule} />
    </svg>
  );
}
