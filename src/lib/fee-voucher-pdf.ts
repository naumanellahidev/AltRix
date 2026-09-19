/**
 * Fee voucher — the three-part slip a parent takes to the bank.
 *
 * One landscape A4 sheet, three identical copies side by side, separated by
 * fold-and-tear lines: one stays with the student, one with the bank, one comes
 * back to the school office. That format is the Pakistani standard and every
 * bank teller expects it, so it is kept exactly.
 *
 * What changed, and why:
 *
 *  - Amounts are printed from their exact decimal value. They were numbers, and
 *    three instalments of 1650.10 print as 4,950.299999999999 once a float
 *    has been through them.
 *  - The charges list is fitted to the space it has. It used to run on until it
 *    printed over the bank details and the signature lines when a plan had many
 *    fee heads. Now rows tighten to fit, and if there are still too many, the
 *    remainder is combined into one line whose amount is their exact sum — the
 *    total on the slip always equals the lines on the slip.
 *  - The amount is written out in words under the total, as banks require on
 *    anything that can be altered with a pen.
 *  - A late-payment amount is printed when the school charges one, so the bank
 *    can collect the right figure after the due date without phoning the school.
 *  - A QR code carrying the invoice number, drawn as vector squares, lets a
 *    teller or the office scan the slip instead of typing it.
 *  - A reprint of a paid or cancelled invoice is stamped as such, so a slip
 *    found in a drawer cannot be paid twice.
 *  - A school with no logo gets its own initials, not a stock crest that could
 *    be mistaken for its emblem.
 *  - The gold inner border was drawn with a four-argument colour call, which
 *    jsPDF reads as CMYK, not RGB-with-alpha. It printed a muddy brown.
 */
import jsPDF from "jspdf";
import { documentFileName } from "@/lib/documents/format";

import { amountInWordsFor, atLeastZero, isPositive, subtract, sum } from "@/lib/documents/decimal";
import { ABSENT, type Numeric, money } from "@/lib/documents/format";
import { hslToRgb, readableOn, type Rgb } from "@/lib/documents/theme";
import { drawQrVector } from "@/lib/documents/verify";
import { tryLoadImage, type ImageLoadFailure } from "@/lib/documents/assets";
import { applyLoadedUnicodeFont, ensureUnicodeFontLoaded, installTextSafety } from "@/lib/documents/fonts";

export type VoucherBankDetails = {
  bankName?: string | null;
  accountTitle?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  branch?: string | null;
  swift?: string | null;
};

/** Where a reprinted voucher stands, stamped across each copy. */
export type VoucherStatus = "pending" | "paid" | "partial" | "partially_paid" | "overdue" | "cancelled" | "void";

/** "Ayesha Khan - Fee Voucher - September 2026 - CMS-2026-000412.pdf" */
export function voucherFileName(data: Pick<VoucherCopyData, "invoiceNumber" | "periodLabel" | "student">): string {
  return documentFileName([data.student?.name, "Fee Voucher", data.periodLabel, data.invoiceNumber], "pdf");
}

export type VoucherCopyData = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodLabel?: string | null;
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    /** A data: URI. Use prepareVoucherData() to resolve a URL or storage path. */
    logoUrl?: string | null;
    motto?: string | null;
  };
  student: {
    name: string;
    rollNumber?: string | null;
    studentCode?: string | null;
    className?: string | null;
    sectionName?: string | null;
    parentName?: string | null;
    parentPhone?: string | null;
  };
  /** Amounts accept the exact decimal string the server returns. */
  items: { label: string; amount: Numeric }[];
  subtotal: Numeric;
  baseDiscount: Numeric;
  meritDiscount: Numeric;
  meritReason?: string | null;
  siblingDiscount: Numeric;
  total: Numeric;
  currency: string;
  accentHsl?: { h: number; s: number; l: number } | null;
  notes?: string | null;
  bank?: VoucherBankDetails | null;
  footerNote?: string | null;

  // ── Optional, printed only when supplied ───────────────────────────────────
  /** Added to the total after the due date. */
  lateFee?: Numeric;
  /** The date the late fee starts to apply. Defaults to the due date. */
  lateFeeAfter?: string | null;
  /** Already paid against this invoice, for a reprint. */
  paidAmount?: Numeric;
  /** Stamped across each copy of a reprint. Omit or "pending" for none. */
  status?: VoucherStatus | null;
  /** Encoded in the QR code. Defaults to the invoice number; false for none. */
  qrValue?: string | false | null;
  /** The three copy labels, left to right. */
  copies?: [string, string, string];
};

// ─── Palette ─────────────────────────────────────────────────────────────────

const GOLD: Rgb = [212, 175, 55];
const GOLD_SOFT: Rgb = [236, 222, 170];
const INK: Rgb = [22, 22, 28];
const MUTED: Rgb = [110, 110, 120];
const HAIRLINE: Rgb = [220, 220, 228];
const DANGER: Rgb = [153, 27, 27];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function displayCurrency(code: string): string {
  return code === "PKR" ? "Rs." : code;
}

function present(value: string | null | undefined): value is string {
  return value != null && String(value).trim() !== "";
}

// ─── Brand marks ─────────────────────────────────────────────────────────────

/** Initials in a ring, for a school that has not uploaded a logo. */
function drawMonogram(doc: jsPDF, name: string, x: number, y: number, size: number, accent: Rgb) {
  const initials =
    name
      .split(/\s+/)
      .filter((w) => w && /[A-Za-z0-9]/.test(w[0]) && !/^(of|the|and|&)$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "•";

  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, size / 2, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, size / 2 - 0.4, "S");
  doc.setFont("times", "bold");
  doc.setFontSize(size * 1.25);
  doc.setTextColor(...accent);
  doc.text(initials, cx, cy + size * 0.16, { align: "center" });
}

function imageFormat(dataUri: string): string | null {
  const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUri);
  if (!match) return null;
  return match[1].toLowerCase().startsWith("jp") ? "JPEG" : match[1].toUpperCase();
}

/** The platform mark in the footer. Read from the brand settings the super admin sets. */
function platformBrand(): { name: string; logo: string | null } {
  try {
    const saved = localStorage.getItem("altrix_global_brand_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        name: typeof parsed.brandName === "string" && parsed.brandName.trim() ? parsed.brandName : "Altrix",
        logo: typeof parsed.logoBase64 === "string" && parsed.logoBase64 ? parsed.logoBase64 : null,
      };
    }
  } catch {
    // Unreadable settings fall back to the default mark; the voucher is unaffected.
  }
  return { name: "Altrix", logo: null };
}

function drawPlatformMark(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...GOLD);
  doc.circle(x + size / 2, y + size / 2, size / 2, "F");
  doc.setFillColor(15, 23, 42);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const s = size / 10;
  doc.rect(cx - 2.5 * s, cy + 1.5 * s, 5 * s, 0.8 * s, "F");
  doc.triangle(cx - 2.5 * s, cy + 1.5 * s, cx - 2.5 * s, cy - 1.5 * s, cx - 0.8 * s, cy + 1.5 * s, "F");
  doc.triangle(cx + 2.5 * s, cy + 1.5 * s, cx + 2.5 * s, cy - 1.5 * s, cx + 0.8 * s, cy + 1.5 * s, "F");
  doc.triangle(cx - 1.2 * s, cy + 1.5 * s, cx, cy - 2.2 * s, cx + 1.2 * s, cy + 1.5 * s, "F");
}

// ─── Status stamp ────────────────────────────────────────────────────────────

const STAMPS: Partial<Record<VoucherStatus, { label: string; color: Rgb }>> = {
  paid: { label: "PAID", color: [22, 101, 52] },
  partial: { label: "PARTIALLY PAID", color: [161, 98, 7] },
  partially_paid: { label: "PARTIALLY PAID", color: [161, 98, 7] },
  overdue: { label: "OVERDUE", color: DANGER },
  cancelled: { label: "CANCELLED", color: [71, 85, 105] },
  void: { label: "VOID", color: [71, 85, 105] },
};

function drawStamp(doc: jsPDF, status: VoucherStatus | null | undefined, cx: number, cy: number) {
  const stamp = status ? STAMPS[status] : undefined;
  if (!stamp) return;

  doc.saveGraphicsState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GState = (doc as any).GState;
  if (GState) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).setGState(new GState({ opacity: 0.16 }));
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(stamp.label.length > 8 ? 22 : 34);
  doc.setTextColor(...stamp.color);
  doc.text(stamp.label, cx, cy, { align: "center", angle: 28, baseline: "middle" });
  doc.restoreGraphicsState();
}

// ─── Layout ──────────────────────────────────────────────────────────────────

/** Fixed furniture at the foot of each copy, in mm from the top of the sheet. */
const SIGNATURE_Y = 192;
const FOOTER_Y = 200;
/** Nothing in the body may extend below this. */
const BODY_LIMIT = SIGNATURE_Y - 6;

type Row = { label: string; amount: Numeric; combined?: number };

/**
 * Fit the charge lines into the rows available.
 *
 * Returns the lines to print. If they cannot all fit, the tail is combined into
 * one line carrying their exact sum, so the printed lines still add up to the
 * subtotal.
 */
function fitRows(items: VoucherCopyData["items"], capacity: number): Row[] {
  const rows: Row[] = items.map((i) => ({ label: i.label, amount: i.amount }));
  if (rows.length <= capacity || capacity < 2) return rows;

  const keep = rows.slice(0, capacity - 1);
  const rest = rows.slice(capacity - 1);
  keep.push({
    label: `Other charges (${rest.length} items)`,
    amount: sum(rest.map((r) => r.amount)),
    combined: rest.length,
  });
  return keep;
}

function drawCopy(
  doc: jsPDF,
  data: VoucherCopyData,
  copyLabel: string,
  xOffset: number,
  copyWidth: number,
  accent: Rgb,
) {
  const accentDark = mix(accent, [0, 0, 0], 0.35);
  const accentSoft = mix(accent, [255, 255, 255], 0.88);
  const onAccent = readableOn(accent);

  const margin = 7;
  const left = xOffset + margin;
  const right = xOffset + copyWidth - margin;
  const innerW = copyWidth - margin * 2;
  const currency = displayCurrency(data.currency);

  // ── Frame ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(xOffset + 2, 3, copyWidth - 4, 204, 2, 2, "S");

  doc.setDrawColor(...GOLD_SOFT);
  doc.setLineWidth(0.15);
  doc.roundedRect(xOffset + 3, 4, copyWidth - 6, 202, 1.5, 1.5, "S");

  // Guilloche-style rosette in the centre: faint enough to read through, and
  // tedious to reproduce by hand, which is the point on a payment slip.
  const wmcx = xOffset + copyWidth / 2;
  const wmcy = 118;
  doc.setDrawColor(246, 242, 232);
  doc.setLineWidth(0.08);
  for (let r = 6; r <= 20; r += 2.8) doc.circle(wmcx, wmcy, r, "S");
  for (let a = 0; a < 180; a += 22.5) {
    const rad = (a * Math.PI) / 180;
    doc.line(wmcx - 20 * Math.cos(rad), wmcy - 20 * Math.sin(rad), wmcx + 20 * Math.cos(rad), wmcy + 20 * Math.sin(rad));
  }

  // ── Header band ───────────────────────────────────────────────────────────
  const headerH = 26;
  const slices = 18;
  for (let i = 0; i < slices; i += 1) {
    const c = mix(accentDark, accent, i / (slices - 1));
    doc.setFillColor(...c);
    doc.rect(xOffset + 3.2, 4.2 + (headerH * i) / slices, copyWidth - 6.4, headerH / slices + 0.2, "F");
  }
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.line(xOffset + 3.2, 4.2 + headerH, xOffset + copyWidth - 3.2, 4.2 + headerH);

  // Copy label
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(right - 34, 6.5, 32, 5.5, 1.5, 1.5, "F");
  doc.setTextColor(...accentDark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(copyLabel.toUpperCase(), right - 18, 10.3, { align: "center" });

  // School identity
  const textLeft = left + 14;
  const logo = data.school.logoUrl;
  const format = logo ? imageFormat(logo) : null;
  let logoDrawn = false;
  if (logo && format) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.circle(left + 5.5, 12, 6, "F");
      doc.addImage(logo, format, left + 0.5, 7, 10, 10);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) drawMonogram(doc, data.school.name, left, 6.5, 11, accent);

  doc.setTextColor(...onAccent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const nameLine = doc.splitTextToSize(data.school.name, innerW - 50)[0] as string;
  doc.text(nameLine, textLeft, 12);
  if (present(data.school.motto)) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(data.school.motto, innerW - 50)[0] as string, textLeft, 16);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  const contact = [data.school.address, data.school.phone, data.school.email, data.school.website]
    .filter(present)
    .join("  •  ");
  if (contact) doc.text(doc.splitTextToSize(contact, innerW)[0] as string, left, 21.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.text("OFFICIAL FEE VOUCHER", left, 27);
  if (present(data.periodLabel)) {
    doc.setTextColor(...onAccent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(data.periodLabel, right, 27, { align: "right" });
  }

  // ── Voucher meta strip ────────────────────────────────────────────────────
  let y = 32;
  doc.setFillColor(...accentSoft);
  doc.roundedRect(left, y, innerW, 11, 1.2, 1.2, "F");
  const colW = innerW / 3;
  const metaCol = (idx: number, label: string, value: string, tone: Rgb = INK) => {
    const cx = left + colW * idx + 2;
    doc.setTextColor(...MUTED);
    doc.setFontSize(5.8);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), cx, y + 3.6);
    doc.setTextColor(...tone);
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(value || ABSENT, colW - 4)[0] as string, cx, y + 8.4);
  };
  metaCol(0, "Voucher #", data.invoiceNumber);
  metaCol(1, "Issue Date", data.issueDate);
  metaCol(2, "Due Date", data.dueDate, data.status === "overdue" ? DANGER : INK);
  y += 13;

  // ── Student block, with the QR code on its right ──────────────────────────
  const blockH = 22;
  const qrValue = data.qrValue === false ? null : (data.qrValue ?? data.invoiceNumber);
  const qrSize = 17;
  const hasQr = present(qrValue ?? null);
  const studentW = hasQr ? innerW - qrSize - 3 : innerW;

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(left, y, innerW, blockH, 1.2, 1.2, "S");
  doc.setFillColor(...accent);
  doc.rect(left, y, 1.2, blockH, "F");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text("STUDENT PROFILE", left + 3, y + 3.5);
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(data.student.name, studentW - 6)[0] as string, left + 3, y + 7.5);

  const classLine = [data.student.className, data.student.sectionName].filter(present).join(" – ");
  const idLine = [
    present(data.student.rollNumber) ? `Roll ${data.student.rollNumber}` : null,
    present(data.student.studentCode) ? `ID ${data.student.studentCode}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const parentLine = [data.student.parentName, data.student.parentPhone].filter(present).join("  ·  ");
  const facts: [string, string][] = [
    ["Class", classLine],
    ["Roll / ID", idLine],
    ["Parent", parentLine],
    ["Period", data.periodLabel ?? ""],
  ];
  doc.setFontSize(6.5);
  let ry = y + 11;
  for (const [k, v] of facts) {
    if (!present(v)) continue;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(k, left + 3, ry);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(v, studentW - 21)[0] as string, left + 18, ry);
    ry += 2.7;
  }

  if (hasQr && qrValue) {
    const qx = right - qrSize - 1.5;
    const qy = y + (blockH - qrSize) / 2;
    if (!drawQrVector(doc, qrValue, qx, qy, qrSize, INK)) {
      doc.setFontSize(5);
      doc.setTextColor(...MUTED);
      doc.text(qrValue, qx + qrSize / 2, y + blockH / 2, { align: "center" });
    }
  }
  y += blockH + 2;

  // ── Work out what must fit below the charges ──────────────────────────────
  const discounts: Array<[string, Numeric]> = [];
  if (isPositive(data.baseDiscount)) discounts.push(["Base Discount", data.baseDiscount]);
  if (isPositive(data.meritDiscount)) {
    discounts.push([`Merit Discount${present(data.meritReason) ? ` (${data.meritReason})` : ""}`, data.meritDiscount]);
  }
  if (isPositive(data.siblingDiscount)) discounts.push(["Sibling Discount", data.siblingDiscount]);

  const paid = isPositive(data.paidAmount) ? data.paidAmount : null;
  const payable = paid ? atLeastZero(subtract(data.total, paid)) : data.total;
  const lateFee = isPositive(data.lateFee) ? data.lateFee : null;

  const bank = data.bank;
  const bankLines: [string, string][] = [];
  if (bank) {
    if (present(bank.bankName)) bankLines.push(["Bank", bank.bankName + (present(bank.branch) ? ` — ${bank.branch}` : "")]);
    if (present(bank.accountTitle)) bankLines.push(["Title", bank.accountTitle]);
    if (present(bank.accountNumber)) bankLines.push(["A/C #", bank.accountNumber]);
    if (present(bank.iban)) bankLines.push(["IBAN", bank.iban]);
    if (present(bank.swift)) bankLines.push(["SWIFT", bank.swift]);
  }

  const summaryH = 1 + 3.4 * (1 + discounts.length + (paid ? 1 : 0));
  const totalH = 10;
  const words = amountInWordsFor(payable, data.currency);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  const wordLines = words ? (doc.splitTextToSize(words, innerW - 2) as string[]).slice(0, 2) : [];
  const wordsH = wordLines.length ? wordLines.length * 2.6 + 1 : 0;
  const lateH = lateFee ? 5 : 0;
  const bankH = bankLines.length ? 6 + bankLines.length * 2.5 + 1.5 : 0;
  doc.setFontSize(5.8);
  const noteLines = present(data.notes) ? (doc.splitTextToSize(`Note: ${data.notes}`, innerW) as string[]).slice(0, 2) : [];
  const notesH = noteLines.length ? noteLines.length * 2.5 + 1.5 : 0;

  const reserved = summaryH + totalH + wordsH + lateH + bankH + notesH;
  const tableHeaderH = 5.4;
  const itemsTop = y + tableHeaderH;
  const itemsBudget = Math.max(0, BODY_LIMIT - reserved - itemsTop);

  let rowH = 4.6;
  let fontSize = 6.8;
  if (data.items.length * rowH > itemsBudget) {
    rowH = 3.7;
    fontSize = 6.1;
  }
  const capacity = Math.max(1, Math.floor(itemsBudget / rowH));
  const rows = fitRows(data.items, capacity);

  // ── Charges ───────────────────────────────────────────────────────────────
  doc.setFillColor(...accent);
  doc.rect(left, y, innerW, tableHeaderH, "F");
  doc.setTextColor(...onAccent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("CHARGES DESCRIPTION", left + 2, y + 3.8);
  doc.text(`AMOUNT (${currency})`, right - 2, y + 3.8, { align: "right" });
  y += tableHeaderH;

  doc.setFontSize(fontSize);
  if (!rows.length) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...MUTED);
    doc.text("No charges on this voucher.", left + innerW / 2, y + rowH * 0.7, { align: "center" });
    y += rowH;
  }
  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 252);
      doc.rect(left, y, innerW, rowH, "F");
    }
    doc.setFont("helvetica", row.combined ? "italic" : "normal");
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(row.label, innerW - 30)[0] as string, left + 2, y + rowH * 0.7);
    doc.text(money(row.amount), right - 2, y + rowH * 0.7, { align: "right" });
    y += rowH;
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  y += 1;
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 3.4;
  const sumRow = (label: string, value: string, tone: Rgb = INK) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(label, innerW - 30)[0] as string, left + 2, y);
    doc.setTextColor(...tone);
    doc.text(value, right - 2, y, { align: "right" });
    y += 3.4;
  };
  sumRow("Subtotal", money(data.subtotal));
  for (const [label, amount] of discounts) sumRow(label, `– ${money(amount)}`, [22, 101, 52]);
  if (paid) sumRow("Already Paid", `– ${money(paid)}`, [22, 101, 52]);

  // ── Total band ────────────────────────────────────────────────────────────
  y += 1;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  doc.line(left, y + 7.5, right, y + 7.5);
  for (let i = 0; i < 10; i += 1) {
    doc.setFillColor(...mix(accent, accentDark, i / 9));
    doc.rect(left, y + 0.3 + (6.9 * i) / 10, innerW, 0.7, "F");
  }
  doc.setTextColor(...onAccent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(paid ? "BALANCE PAYABLE" : "TOTAL PAYABLE", left + 3, y + 5.1);
  doc.text(`${currency}  ${money(payable)}`, right - 3, y + 5.1, { align: "right" });
  y += totalH;

  if (wordLines.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    wordLines.forEach((line, i) => doc.text(line, left + 1, y - 1 + i * 2.6));
    y += wordsH;
  }

  if (lateFee) {
    doc.setFillColor(254, 242, 242);
    doc.rect(left, y - 1.5, innerW, 4.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...DANGER);
    doc.text(`Payable after ${data.lateFeeAfter || data.dueDate}`, left + 2, y + 1.6);
    doc.text(`${currency}  ${money(sum([payable, lateFee]))}`, right - 2, y + 1.6, { align: "right" });
    y += lateH;
  }

  // ── Bank details ──────────────────────────────────────────────────────────
  if (bankLines.length) {
    doc.setFillColor(...accentSoft);
    doc.roundedRect(left, y, innerW, bankH - 1, 1, 1, "F");
    doc.setTextColor(...accentDark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text("PAYMENT INSTRUCTIONS", left + 2, y + 3);
    doc.setFontSize(6.2);
    let by = y + 6;
    for (const [k, v] of bankLines) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MUTED);
      doc.text(k, left + 2, by);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(v, innerW - 16)[0] as string, left + 14, by);
      by += 2.5;
    }
    y += bankH;
  }

  if (noteLines.length) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.8);
    noteLines.forEach((line, i) => doc.text(line, left, y + i * 2.5));
    y += notesH;
  }

  // ── Status stamp over the body ────────────────────────────────────────────
  drawStamp(doc, data.status, xOffset + copyWidth / 2, 110);

  // ── Signatures ────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 188);
  doc.setLineWidth(0.25);
  doc.line(left, SIGNATURE_Y, left + innerW / 2 - 4, SIGNATURE_Y);
  doc.line(left + innerW / 2 + 4, SIGNATURE_Y, right, SIGNATURE_Y);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.text("Authorised Signature", left, SIGNATURE_Y + 3);
  doc.text("Received By (Cashier / Bank Stamp)", left + innerW / 2 + 4, SIGNATURE_Y + 3);

  // ── Footer ────────────────────────────────────────────────────────────────
  const brand = platformBrand();
  doc.setTextColor(...MUTED);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "italic");
  const foot = data.footerNote || "Please pay before the due date. A late fee may apply to overdue payments.";
  doc.text(doc.splitTextToSize(foot, innerW - 26)[0] as string, left, FOOTER_Y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  doc.setTextColor(...accentDark);
  doc.text(`Powered by ${brand.name}`, right - 4.5, FOOTER_Y + 0.2, { align: "right" });
  let markDrawn = false;
  if (brand.logo) {
    const f = imageFormat(brand.logo);
    if (f) {
      try {
        doc.addImage(brand.logo, f, right - 3.5, FOOTER_Y - 2, 3.2, 3.2);
        markDrawn = true;
      } catch {
        markDrawn = false;
      }
    }
  }
  if (!markDrawn) drawPlatformMark(doc, right - 3.5, FOOTER_Y - 2, 3.2);
}

/**
 * A small scissors mark, drawn rather than typed: the PDF's built-in fonts
 * have no scissors glyph and would print a question mark in its place.
 */
function drawScissors(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(150, 150, 160);
  doc.setLineWidth(0.18);
  doc.circle(x - 0.9, y - 1.1, 0.55, "S");
  doc.circle(x + 0.9, y - 1.1, 0.55, "S");
  doc.line(x - 0.6, y - 0.7, x + 0.9, y + 1.2);
  doc.line(x + 0.6, y - 0.7, x - 0.9, y + 1.2);
}

const DEFAULT_COPIES: [string, string, string] = ["Student Copy", "Bank Copy", "Office Copy"];

function drawVoucherOnDoc(doc: jsPDF, data: VoucherCopyData) {
  const accent: Rgb = data.accentHsl
    ? hslToRgb(data.accentHsl.h, data.accentHsl.s, data.accentHsl.l)
    : [35, 96, 178];
  const copyW = 297 / 3;
  const labels = data.copies ?? DEFAULT_COPIES;

  labels.forEach((label, i) => {
    drawCopy(doc, data, label, copyW * i, copyW, accent);
    if (i < labels.length - 1) {
      // Fold-and-tear line with a scissors mark at the top.
      const x = copyW * (i + 1);
      doc.setDrawColor(170, 170, 180);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.line(x, 6, x, 206);
      doc.setLineDashPattern([], 0);
      drawScissors(doc, x, 4.6);
    }
  });
}

function newVoucherDocument(data: VoucherCopyData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  // Urdu names print in the shipped Unicode font once it is loaded (see
  // prepareVoucherData), and symbols never print as boxes.
  installTextSafety(doc);
  applyLoadedUnicodeFont(doc);
  doc.setProperties({
    title: `Fee Voucher ${data.invoiceNumber}`,
    subject: `Fee voucher for ${data.student.name}${data.periodLabel ? `, ${data.periodLabel}` : ""}`,
    author: data.school.name,
    creator: data.school.name,
    keywords: ["fee voucher", data.invoiceNumber, data.student.name].join(", "),
  });
  return doc;
}

/** One voucher on one landscape sheet. */
export function generateVoucherPdf(data: VoucherCopyData): jsPDF {
  const doc = newVoucherDocument(data);
  drawVoucherOnDoc(doc, data);
  return doc;
}

/** Add another voucher on a new sheet — for printing a whole class at once. */
export function appendVoucherPage(doc: jsPDF, data: VoucherCopyData) {
  doc.addPage("a4", "landscape");
  drawVoucherOnDoc(doc, data);
}

/**
 * Resolve the school logo to something the PDF can embed.
 *
 * The voucher can only draw a data: URI. A logo stored as a URL or a storage
 * path is fetched here — through a signed link for storage — and inlined. If
 * that fails the voucher still generates, with the school's initials, and the
 * failure is returned so the screen can say the logo is missing rather than
 * leaving four hundred unbranded vouchers to be discovered at the bank.
 */
export async function prepareVoucherData(
  data: VoucherCopyData,
): Promise<{ data: VoucherCopyData; warnings: ImageLoadFailure[] }> {
  // Load the Urdu-capable font alongside the logo, so a student or parent
  // name written in Urdu prints correctly on every voucher that follows.
  const fontReady = ensureUnicodeFontLoaded();

  const logo = data.school.logoUrl;
  if (!logo || logo.startsWith("data:image/")) {
    await fontReady;
    return { data, warnings: [] };
  }

  const [{ image, failure }] = await Promise.all([tryLoadImage(logo, "school-logos"), fontReady]);
  return {
    data: { ...data, school: { ...data.school, logoUrl: image?.data ?? null } },
    warnings: failure ? [failure] : [],
  };
}
