/**
 * How this school prints its report cards.
 *
 * A card must come out on a single sheet. Most do; one with twenty subjects,
 * a photo, a term chart and two sets of remarks does not, and the builder
 * cannot decide on its own what should give way — that is the school's call,
 * and it has to be the same call for every child, or one class goes home on
 * one sheet and the next on two.
 *
 * So the principal is asked once, the answer is stored against the school, and
 * every later card follows it without asking again.
 */
import {
  REPORT_CARD_TEMPLATES,
  TEMPLATE_ORDER,
  type ReportCardTemplateId,
} from "@/lib/documents/report-card-templates";
import { api } from "@/lib/api";
import {
  DEFAULT_PRINT_SETTINGS,
  type ReportCardPrintSettings,
} from "@/lib/documents/report-card";

export type { ReportCardPrintSettings };
export { DEFAULT_PRINT_SETTINGS };

export interface StoredReportCardSettings {
  settings: ReportCardPrintSettings;
  /** False when nobody has been asked yet — the screen then offers the setup. */
  configured: boolean;
  id: string | null;
}

interface SettingsRow {
  id: string;
  fit_strategy: string;
  template: string;
  show_photo: boolean;
  show_attendance: boolean;
  show_activities: boolean;
  show_term_trend: boolean;
  show_grade_key: boolean;
  show_rank: boolean;
  configured_at: string | null;
}

function fromRow(row: SettingsRow): ReportCardPrintSettings {
  const fit = row.fit_strategy;
  return {
    fitStrategy: fit === "landscape" || fit === "two_pages" ? fit : "compact",
    // An unknown name (an older row, or a hand-edited one) falls back to the
    // classic card rather than failing to load the school's settings.
    template: TEMPLATE_ORDER.includes(row.template as ReportCardTemplateId)
      ? (row.template as ReportCardTemplateId)
      : "classic",
    showPhoto: row.show_photo !== false,
    showAttendance: row.show_attendance !== false,
    showActivities: row.show_activities !== false,
    showTermTrend: row.show_term_trend !== false,
    showGradeKey: row.show_grade_key !== false,
    showRank: row.show_rank !== false,
  };
}

function toRow(settings: ReportCardPrintSettings) {
  return {
    fit_strategy: settings.fitStrategy,
    template: settings.template,
    show_photo: settings.showPhoto,
    show_attendance: settings.showAttendance,
    show_activities: settings.showActivities,
    show_term_trend: settings.showTermTrend,
    show_grade_key: settings.showGradeKey,
    show_rank: settings.showRank,
  };
}

/**
 * Read the school's answer.
 *
 * A school that has never been asked gets the defaults and `configured:
 * false` — which is what makes the Report Cards screen offer the one-time
 * setup. A read that fails is not the same as "never asked": it throws, so
 * the screen can say so rather than silently reverting the school's choice.
 */
export async function loadReportCardSettings(
  schoolId: string | null,
): Promise<StoredReportCardSettings> {
  if (!schoolId) return { settings: DEFAULT_PRINT_SETTINGS, configured: false, id: null };

  const { data, error } = await (api as any)
    .from("report_card_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "the report card settings could not be read");
  if (!data) return { settings: DEFAULT_PRINT_SETTINGS, configured: false, id: null };

  const row = data as SettingsRow;
  return { settings: fromRow(row), configured: !!row.configured_at, id: row.id };
}

/** Store the answer, and mark the school as asked. */
export async function saveReportCardSettings(
  schoolId: string,
  settings: ReportCardPrintSettings,
  options: { id?: string | null; userId?: string | null } = {},
): Promise<void> {
  const payload = {
    ...toRow(settings),
    configured_at: new Date().toISOString(),
    configured_by: options.userId ?? null,
  };

  if (options.id) {
    const { error } = await (api as any)
      .from("report_card_settings")
      .update(payload)
      .eq("id", options.id);
    if (error) throw new Error(error.message ?? "the settings could not be saved");
    return;
  }

  const { error } = await (api as any)
    .from("report_card_settings")
    .insert({ school_id: schoolId, ...payload });
  if (error) throw new Error(error.message ?? "the settings could not be saved");
}

/** What each answer means, in the words the setup dialog uses. */
export const FIT_STRATEGY_CHOICES: Array<{
  value: ReportCardPrintSettings["fitStrategy"];
  title: string;
  description: string;
}> = [
  {
    value: "compact",
    title: "Tighten it onto one sheet",
    description:
      "Type and spacing shrink together until the card fits. Nothing is left out. Recommended.",
  },
  {
    value: "landscape",
    title: "Turn the sheet sideways",
    description:
      "A landscape page has about a third more width, which suits a long subject list.",
  },
  {
    value: "two_pages",
    title: "Let it run to two sheets",
    description:
      "Keeps the comfortable portrait layout and prints a second page when it is needed.",
  },
];
