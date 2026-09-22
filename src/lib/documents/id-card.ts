/**
 * Student ID cards, as print-ready sheets.
 *
 * The old cards were an HTML page opened in a pop-up. Their QR codes were
 * fetched from a third-party web service, so every card printed sent the
 * child's id, name, roll number and class to someone else's server — and no
 * code appeared at all without internet. Photos were linked by storage path,
 * which the browser cannot load without a signed URL, so most cards printed
 * with an emoji where the face should be. A school that had not set a tagline
 * got "SCHOOL TAGLINE" printed on every card; one without a logo got "LOGO".
 *
 * These are vector PDFs at the real card size (CR80, 85.6 × 54 mm), laid out on
 * A4 with crop marks — nine portrait or ten landscape cards a sheet — with the
 * backs on the following sheet in mirrored order so a duplex printer lines them
 * up. The QR code is drawn locally. Nothing the school has not set is printed.
 */
import jsPDF from "jspdf";

import { tryLoadImage, type LoadedImage } from "./assets";
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { applyLoadedUnicodeFont, ensureUnicodeFontLoaded, installTextSafety, unsupportedText } from "./fonts";
import { date as formatDate, documentFileName } from "./format";
import { parseColor, readableOn, tint, type Rgb } from "./theme";
import { drawQrVector } from "./verify";

export interface IdCardStudent {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string | null;
  registration_number: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  card_valid_until: string | null;
  profile_image_url: string | null;
  emergency_contact: string | null;
  class_name?: string | null;
  section_name?: string | null;
}

export interface IdCardSettings {
  card_layout: string; // vertical | horizontal
  primary_color: string;
  text_color: string;
  card_title: string;
  show_logo: boolean;
  show_qr_code: boolean;
  show_roll_number: boolean;
  show_class: boolean;
  show_dob: boolean;
  show_blood_group: boolean;
  show_emergency_contact: boolean;
  show_signature: boolean;
  signature_text: string;
  design_style: string; // classic | modern | minimal | playful | crest | ribbon | corporate
}

/** Titles that are defaults nobody chose, and must never reach a card. */
const PLACEHOLDER_TITLES = new Set(["school tagline", "tagline", "your tagline here", ""]);

const CARD_LONG = 85.6;
const CARD_SHORT = 53.98;
const GAP = 4;

interface Geometry {
  w: number;
  h: number;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
}

function sheetGeometry(vertical: boolean): Geometry {
  const w = vertical ? CARD_SHORT : CARD_LONG;
  const h = vertical ? CARD_LONG : CARD_SHORT;
  const cols = vertical ? 3 : 2;
  const rows = vertical ? 3 : 5;
  const totalW = cols * w + (cols - 1) * GAP;
  const totalH = rows * h + (rows - 1) * GAP;
  return { w, h, cols, rows, originX: (210 - totalW) / 2, originY: (297 - totalH) / 2 };
}

function cropMarks(pdf: jsPDF, x: number, y: number, w: number, h: number) {
  pdf.setDrawColor(160, 160, 160);
  pdf.setLineWidth(0.1);
  const m = 2.5;
  const o = 0.8;
  for (const [cx, cy] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const) {
    const dx = cx === x ? -1 : 1;
    const dy = cy === y ? -1 : 1;
    pdf.line(cx + dx * o, cy, cx + dx * (o + m), cy);
    pdf.line(cx, cy + dy * o, cx, cy + dy * (o + m));
  }
}

function initials(first: string, last: string | null): string {
  return [first, last]
    .filter(Boolean)
    .map((p) => String(p).trim()[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function fullName(s: IdCardStudent) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
}

/** What the QR carries: plain text any phone can read, with no network call. */
function qrPayload(s: IdCardStudent, schoolName: string): string {
  return [
    schoolName,
    `Student: ${fullName(s)}`,
    s.registration_number ? `Reg: ${s.registration_number}` : null,
    s.roll_number ? `Roll: ${s.roll_number}` : null,
    s.class_name ? `Class: ${[s.class_name, s.section_name].filter(Boolean).join(" ")}` : null,
    s.card_valid_until ? `Valid until: ${s.card_valid_until}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

interface Ctx {
  pdf: jsPDF;
  brand: SchoolBrand;
  settings: IdCardSettings;
  accent: Rgb;
  onAccent: Rgb;
  logo: LoadedImage | null;
}

function fitText(pdf: jsPDF, text: string, maxWidth: number, start: number, min: number): number {
  let size = start;
  pdf.setFontSize(size);
  while (size > min && pdf.getTextWidth(text) > maxWidth) {
    size -= 0.25;
    pdf.setFontSize(size);
  }
  return size;
}

function drawLogo(ctx: Ctx, x: number, y: number, size: number) {
  const { pdf, logo } = ctx;
  if (!ctx.settings.show_logo) return false;
  pdf.setFillColor(255, 255, 255);
  pdf.circle(x + size / 2, y + size / 2, size / 2, "F");
  if (logo && (logo.format === "PNG" || logo.format === "JPEG")) {
    try {
      pdf.addImage(logo.data, logo.format, x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
      return true;
    } catch {
      // Falls through to the monogram.
    }
  }
  // The school's own initials — not the word "LOGO".
  pdf.setFont("times", "bold");
  pdf.setFontSize(size * 1.1);
  pdf.setTextColor(...ctx.accent);
  const mono = (ctx.brand.name ?? "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  pdf.text(mono || "", x + size / 2, y + size / 2 + size * 0.14, { align: "center" });
  return true;
}

function drawPhoto(ctx: Ctx, s: IdCardStudent, photo: LoadedImage | null, x: number, y: number, w: number, h: number) {
  const { pdf } = ctx;
  pdf.setFillColor(...tint(ctx.accent, 0.9));
  pdf.roundedRect(x, y, w, h, 1.4, 1.4, "F");
  if (photo && (photo.format === "PNG" || photo.format === "JPEG")) {
    try {
      // Cover-fit: fill the frame, cropping the longer side by clipping.
      const scale = Math.max(w / photo.width, h / photo.height);
      const dw = photo.width * scale;
      const dh = photo.height * scale;
      pdf.saveGraphicsState();
      pdf.roundedRect(x, y, w, h, 1.4, 1.4, null as unknown as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdf as any).clip();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdf as any).discardPath();
      pdf.addImage(photo.data, photo.format, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      pdf.restoreGraphicsState();
    } catch {
      photo = null;
    }
  }
  if (!photo) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(Math.min(w, h) * 1.2);
    pdf.setTextColor(...ctx.accent);
    pdf.text(initials(s.first_name, s.last_name), x + w / 2, y + h / 2 + Math.min(w, h) * 0.15, { align: "center" });
  }
  pdf.setDrawColor(...ctx.accent);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(x, y, w, h, 1.4, 1.4, "S");
}

function fieldsFor(ctx: Ctx, s: IdCardStudent): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const id = s.registration_number || (ctx.settings.show_roll_number ? s.roll_number : null);
  if (id) out.push(["ID", id]);
  if (ctx.settings.show_roll_number && s.roll_number && s.registration_number) out.push(["Roll", s.roll_number]);
  if (ctx.settings.show_class && s.class_name) out.push(["Class", [s.class_name, s.section_name].filter(Boolean).join(" – ")]);
  if (ctx.settings.show_dob && s.date_of_birth) out.push(["D.O.B", formatDate(s.date_of_birth)]);
  if (ctx.settings.show_blood_group && s.blood_group) out.push(["Blood", s.blood_group]);
  return out;
}

function cardFrame(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const { pdf, settings } = ctx;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 3, 3, "F");
  if (settings.design_style === "classic" || settings.design_style === "crest") {
    pdf.setDrawColor(...ctx.accent);
    pdf.setLineWidth(settings.design_style === "crest" ? 0.9 : 0.6);
    pdf.roundedRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 2.2, 2.2, "S");
    if (settings.design_style === "crest") {
      // A second, hairline rule inside the first: the way a certificate is
      // bordered, which is what a crest card is trying to be.
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x + 2.6, y + 2.6, w - 5.2, h - 5.2, 1.6, 1.6, "S");
    }
  }
  pdf.setDrawColor(215, 215, 220);
  pdf.setLineWidth(0.15);
  pdf.roundedRect(x, y, w, h, 3, 3, "S");
}

function headerBand(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const { pdf, settings } = ctx;
  pdf.saveGraphicsState();
  pdf.roundedRect(x, y, w, h + 3, 3, 3, null as unknown as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).clip();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).discardPath();
  if (settings.design_style === "minimal") {
    pdf.setFillColor(...ctx.accent);
    pdf.rect(x, y, w, 1.6, "F");
  } else if (settings.design_style === "crest") {
    // No band at all: the school's name sits on the card, framed, and the
    // colour appears only as a rule beneath it.
    pdf.setFillColor(...tint(ctx.accent, 0.92));
    pdf.rect(x, y, w, h, "F");
    pdf.setDrawColor(...ctx.accent);
    pdf.setLineWidth(0.5);
    pdf.line(x + 6, y + h - 0.6, x + w - 6, y + h - 0.6);
  } else if (settings.design_style === "ribbon") {
    pdf.setFillColor(...tint(ctx.accent, 0.9));
    pdf.rect(x, y, w, h, "F");
    // A diagonal sweep of the school's colour across the head.
    pdf.setFillColor(...ctx.accent);
    pdf.triangle(x, y, x + w, y, x + w, y + h, "F");
    pdf.setFillColor(...tint(ctx.accent, 0.3));
    pdf.triangle(x, y, x + w * 0.62, y, x, y + h, "F");
  } else if (settings.design_style === "corporate") {
    pdf.setFillColor(...ctx.accent);
    pdf.rect(x, y, w, h, "F");
    // One quiet highlight bar, nothing else: a staff-badge look.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x + 5, y + h - 2.2, 14, 0.9, "F");
  } else {
    pdf.setFillColor(...ctx.accent);
    pdf.rect(x, y, w, h, "F");
    if (settings.design_style === "playful") {
      pdf.setFillColor(...tint(ctx.accent, 0.35));
      pdf.circle(x + w - 4, y + 2, 9, "F");
      pdf.circle(x + 6, y + h, 5, "F");
    } else {
      pdf.setFillColor(...tint(ctx.accent, 0.25));
      pdf.triangle(x + w * 0.55, y + h, x + w, y + h * 0.2, x + w, y + h, "F");
    }
  }
  pdf.restoreGraphicsState();
}

function schoolTitle(ctx: Ctx): string | null {
  const t = (ctx.settings.card_title ?? "").trim();
  return PLACEHOLDER_TITLES.has(t.toLowerCase()) ? null : t;
}

function drawFrontVertical(ctx: Ctx, s: IdCardStudent, photo: LoadedImage | null, x: number, y: number, w: number, h: number) {
  const { pdf, settings } = ctx;
  cardFrame(ctx, x, y, w, h);
  const minimal = settings.design_style === "minimal";
  const bandH = 19;
  headerBand(ctx, x, y, w, bandH);
  const headInk: Rgb = minimal ? [17, 24, 39] : ctx.onAccent;

  const logoDrawn = drawLogo(ctx, x + 3, y + 3.5, 10);
  const textX = logoDrawn ? x + 15 : x + 3.5;
  const textW = x + w - 2.5 - textX;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...headInk);
  const name = ctx.brand.name ?? "";
  const size = fitText(pdf, name, textW, 8, 5.5);
  const lines = (pdf.splitTextToSize(name, textW) as string[]).slice(0, 2);
  lines.forEach((l, i) => pdf.text(l, textX, y + 7 + i * size * 0.4));
  const title = schoolTitle(ctx);
  if (title) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5);
    pdf.text((pdf.splitTextToSize(title, textW) as string[])[0], textX, y + 7 + lines.length * size * 0.4 + 1.5);
  }

  const pw = 22;
  const ph = 26;
  drawPhoto(ctx, s, photo, x + (w - pw) / 2, y + bandH + 3, pw, ph);

  let cy = y + bandH + ph + 7.5;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(17, 24, 39);
  fitText(pdf, fullName(s), w - 6, 10, 6.5);
  pdf.text(fullName(s), x + w / 2, cy, { align: "center" });
  cy += 3.4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.setTextColor(...ctx.accent);
  pdf.text("STUDENT", x + w / 2, cy, { align: "center" });
  cy += 4;

  pdf.setFontSize(6);
  for (const [label, value] of fieldsFor(ctx, s)) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x + 5, cy);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(17, 24, 39);
    pdf.text((pdf.splitTextToSize(value, w - 20) as string[])[0], x + 17, cy);
    cy += 3.5;
  }

  // Validity strip.
  pdf.setFillColor(...ctx.accent);
  pdf.rect(x, y + h - 5, w, 5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.2);
  pdf.setTextColor(...ctx.onAccent);
  pdf.text(s.card_valid_until ? `Valid until ${formatDate(s.card_valid_until)}` : "Student Identity Card", x + w / 2, y + h - 1.8, {
    align: "center",
  });
}

function drawFrontHorizontal(ctx: Ctx, s: IdCardStudent, photo: LoadedImage | null, x: number, y: number, w: number, h: number) {
  const { pdf, settings } = ctx;
  cardFrame(ctx, x, y, w, h);
  const minimal = settings.design_style === "minimal";
  const bandH = 13;
  headerBand(ctx, x, y, w, bandH);
  const headInk: Rgb = minimal ? [17, 24, 39] : ctx.onAccent;

  const logoDrawn = drawLogo(ctx, x + 3, y + 2, 9);
  const textX = logoDrawn ? x + 14 : x + 3.5;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...headInk);
  fitText(pdf, ctx.brand.name ?? "", w - (textX - x) - 3, 9, 6);
  pdf.text(ctx.brand.name ?? "", textX, y + 6.5);
  const title = schoolTitle(ctx);
  if (title) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.2);
    pdf.text((pdf.splitTextToSize(title, w - (textX - x) - 3) as string[])[0], textX, y + 10);
  }

  const pw = 21;
  const ph = 25;
  drawPhoto(ctx, s, photo, x + 4, y + bandH + 3, pw, ph);

  const dx = x + pw + 8;
  let cy = y + bandH + 6.5;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(17, 24, 39);
  fitText(pdf, fullName(s), w - (dx - x) - 3, 10, 6.5);
  pdf.text(fullName(s), dx, cy);
  cy += 3.6;
  pdf.setFontSize(5.5);
  pdf.setTextColor(...ctx.accent);
  pdf.text("STUDENT", dx, cy);
  cy += 4;
  pdf.setFontSize(6);
  for (const [label, value] of fieldsFor(ctx, s)) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, dx, cy);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(17, 24, 39);
    pdf.text((pdf.splitTextToSize(value, w - (dx - x) - 16) as string[])[0], dx + 11, cy);
    cy += 3.3;
  }

  pdf.setFillColor(...ctx.accent);
  pdf.rect(x, y + h - 4, w, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5);
  pdf.setTextColor(...ctx.onAccent);
  pdf.text(s.card_valid_until ? `Valid until ${formatDate(s.card_valid_until)}` : "Student Identity Card", x + w / 2, y + h - 1.3, {
    align: "center",
  });
}

function drawBack(ctx: Ctx, s: IdCardStudent, x: number, y: number, w: number, h: number) {
  const { pdf, settings, brand } = ctx;
  const vertical = h > w;
  cardFrame(ctx, x, y, w, h);
  pdf.setFillColor(...ctx.accent);
  pdf.rect(x + 3, y + 3, w - 6, 0.8, "F");

  let cy = y + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(17, 24, 39);
  const name = brand.name ?? "";
  fitText(pdf, name, w - 6, 8, 5.5);
  (pdf.splitTextToSize(name, w - 6) as string[]).slice(0, 2).forEach((line) => {
    pdf.text(line, x + w / 2, cy, { align: "center" });
    cy += 3.4;
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.4);
  pdf.setTextColor(71, 85, 105);
  for (const line of [brand.address, brand.phone, brand.email].filter(Boolean) as string[]) {
    (pdf.splitTextToSize(line, w - 6) as string[]).slice(0, 2).forEach((l) => {
      pdf.text(l, x + w / 2, cy, { align: "center" });
      cy += 2.6;
    });
  }
  cy += 1.5;

  if (settings.show_qr_code) {
    const size = vertical ? 22 : 17;
    drawQrVector(pdf, qrPayload(s, name), x + (w - size) / 2, cy, size, [17, 24, 39]);
    cy += size + 3;
  }

  if (settings.show_emergency_contact && s.emergency_contact) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.5);
    pdf.setTextColor(...ctx.accent);
    pdf.text("IN CASE OF EMERGENCY", x + w / 2, cy, { align: "center" });
    cy += 2.8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.2);
    pdf.setTextColor(17, 24, 39);
    pdf.text(s.emergency_contact, x + w / 2, cy, { align: "center" });
    cy += 3.5;
  }

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(5);
  pdf.setTextColor(100, 116, 139);
  const note = "This card is the property of the school. If found, please return it to the school office.";
  (pdf.splitTextToSize(note, w - 8) as string[]).forEach((l) => {
    pdf.text(l, x + w / 2, cy, { align: "center" });
    cy += 2.4;
  });

  if (settings.show_signature) {
    const sy = y + h - 7;
    pdf.setDrawColor(150, 150, 160);
    pdf.setLineWidth(0.2);
    pdf.line(x + w * 0.25, sy, x + w * 0.75, sy);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(settings.signature_text?.trim() || "Authorised Signature", x + w / 2, sy + 2.6, { align: "center" });
  }
}

export interface IdCardSheetResult {
  pdf: jsPDF;
  fileName: string;
  cards: number;
  sheets: number;
  warnings: string[];
}

/** Load photos a few at a time: a class of forty must not open forty requests at once. */
async function loadPhotos(students: IdCardStudent[]) {
  const photos = new Map<string, LoadedImage | null>();
  const failures: string[] = [];
  const queue = [...students];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (!s.profile_image_url) {
        photos.set(s.id, null);
        continue;
      }
      const { image, failure } = await tryLoadImage(s.profile_image_url, "student-photos");
      photos.set(s.id, image);
      if (failure) failures.push(fullName(s));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, students.length) }, worker));
  return { photos, failures };
}

export async function buildIdCardSheets(
  students: IdCardStudent[],
  settings: IdCardSettings,
  options: { brand?: SchoolBrand; label?: string | null } = {},
): Promise<IdCardSheetResult> {
  if (!students.length) throw new Error("there are no students to make cards for");
  const [brand] = await Promise.all([options.brand ?? loadActiveSchoolBrand(), ensureUnicodeFontLoaded()]);
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];

  const accent = parseColor(settings.primary_color) ?? brand.accent;
  const configured = parseColor(settings.text_color);
  // The chosen text colour is honoured unless it would be unreadable on the band.
  const onAccent = configured && contrastOk(configured, accent) ? configured : readableOn(accent);

  const { photos, failures } = await loadPhotos(students);
  if (failures.length) {
    warnings.push(
      `${failures.length} photo${failures.length === 1 ? "" : "s"} could not be loaded; those cards show initials (${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""})`,
    );
  }
  const missingPhotos = students.filter((s) => !s.profile_image_url).length;
  if (missingPhotos) warnings.push(`${missingPhotos} student${missingPhotos === 1 ? " has" : "s have"} no photo on file`);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  installTextSafety(pdf);
  applyLoadedUnicodeFont(pdf);
  pdf.setProperties({ title: `Student ID Cards${options.label ? ` — ${options.label}` : ""}`, author: brand.name ?? "", creator: brand.name ?? "" });

  const vertical = (settings.card_layout || "vertical") !== "horizontal";
  const g = sheetGeometry(vertical);
  const perSheet = g.cols * g.rows;
  const ctx: Ctx = { pdf, brand, settings, accent, onAccent, logo: brand.logo };

  let sheets = 0;
  for (let start = 0; start < students.length; start += perSheet) {
    const batch = students.slice(start, start + perSheet);

    // Fronts.
    if (sheets > 0) pdf.addPage("a4", "portrait");
    sheets += 1;
    batch.forEach((s, i) => {
      const col = i % g.cols;
      const row = Math.floor(i / g.cols);
      const x = g.originX + col * (g.w + GAP);
      const y = g.originY + row * (g.h + GAP);
      if (vertical) drawFrontVertical(ctx, s, photos.get(s.id) ?? null, x, y, g.w, g.h);
      else drawFrontHorizontal(ctx, s, photos.get(s.id) ?? null, x, y, g.w, g.h);
      cropMarks(pdf, x, y, g.w, g.h);
    });
    sheetFooter(pdf, `Front — sheet ${sheets}`);

    // Backs, columns mirrored so they sit behind their fronts when the sheet
    // is printed double-sided and flipped on the long edge.
    pdf.addPage("a4", "portrait");
    sheets += 1;
    batch.forEach((s, i) => {
      const col = g.cols - 1 - (i % g.cols);
      const row = Math.floor(i / g.cols);
      const x = g.originX + col * (g.w + GAP);
      const y = g.originY + row * (g.h + GAP);
      drawBack(ctx, s, x, y, g.w, g.h);
      cropMarks(pdf, x, y, g.w, g.h);
    });
    sheetFooter(pdf, `Back — sheet ${sheets} (print double-sided, flip on long edge)`);
  }

  for (const lost of unsupportedText(pdf)) warnings.push(`"${lost}" could not be printed`);

  const who = students.length === 1 ? fullName(students[0]) : options.label ?? `${students.length} students`;
  const fileName = documentFileName([who, "Student ID Card" + (students.length === 1 ? "" : "s"), brand.name], "pdf");
  return { pdf, fileName, cards: students.length, sheets, warnings };
}

function sheetFooter(pdf: jsPDF, text: string) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 160);
  pdf.text(text, 105, 292, { align: "center" });
}

function luminance([r, g, b]: Rgb) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast of at least 3:1, the minimum for large bold text. */
function contrastOk(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05) >= 3;
}
