import jsPDF from "jspdf";

export type VoucherBankDetails = {
  bankName?: string | null;
  accountTitle?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  branch?: string | null;
  swift?: string | null;
};

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
  items: { label: string; amount: number }[];
  subtotal: number;
  baseDiscount: number;
  meritDiscount: number;
  meritReason?: string | null;
  siblingDiscount: number;
  total: number;
  currency: string;
  accentHsl?: { h: number; s: number; l: number } | null;
  notes?: string | null;
  bank?: VoucherBankDetails | null;
  footerNote?: string | null;
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

// Draw a luxury vector crown logo for Altrix
function drawAltrixLogo(doc: jsPDF, x: number, y: number, size: number = 4) {
  doc.saveGraphicsState();
  
  // Golden circular base
  doc.setFillColor(212, 175, 55); // Metallic Gold
  doc.circle(x + size / 2, y + size / 2, size / 2, "F");
  
  // Draw mini crown shape in slate-900 (RGB 15, 23, 42)
  doc.setFillColor(15, 23, 42);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const scale = size / 10;
  
  // Crown base line
  doc.rect(cx - 2.5 * scale, cy + 1.5 * scale, 5 * scale, 0.8 * scale, "F");
  
  // Peaks
  doc.triangle(
    cx - 2.5 * scale, cy + 1.5 * scale,
    cx - 2.5 * scale, cy - 1.5 * scale,
    cx - 0.8 * scale, cy + 1.5 * scale,
    "F"
  );
  doc.triangle(
    cx + 2.5 * scale, cy + 1.5 * scale,
    cx + 2.5 * scale, cy - 1.5 * scale,
    cx + 0.8 * scale, cy + 1.5 * scale,
    "F"
  );
  doc.triangle(
    cx - 1.2 * scale, cy + 1.5 * scale,
    cx, cy - 2.2 * scale,
    cx + 1.2 * scale, cy + 1.5 * scale,
    "F"
  );
  
  doc.restoreGraphicsState();
}

// Draw a luxury vector crest emblem as the default school logo
function drawSchoolCrest(doc: jsPDF, x: number, y: number, size: number = 10) {
  doc.saveGraphicsState();
  const cx = x + size / 2;
  const cy = y + size / 2;
  const scale = size / 10;

  // Outer gold double-circle frame
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.3 * scale);
  doc.circle(cx, cy, size / 2, "S");
  doc.circle(cx, cy, size / 2 - 0.7 * scale, "S");

  // Inner fill shield background
  doc.setFillColor(250, 245, 230); // Ivory/Cream
  doc.circle(cx, cy, size / 2 - 0.9 * scale, "F");

  // Gold shield drawing in the center
  doc.setFillColor(212, 175, 55);
  doc.triangle(
    cx - 2.2 * scale, cy - 1.5 * scale,
    cx + 2.2 * scale, cy - 1.5 * scale,
    cx, cy + 2.5 * scale,
    "F"
  );
  
  // Shield crest inner detailing (book layout)
  doc.setFillColor(255, 255, 255);
  doc.rect(cx - 1.2 * scale, cy - 0.8 * scale, 2.4 * scale, 1.2 * scale, "F");
  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(0.15 * scale);
  doc.line(cx, cy - 0.8 * scale, cx, cy + 0.4 * scale);

  // Tiny header star
  doc.setFillColor(212, 175, 55);
  doc.circle(cx, cy - 3.5 * scale, 0.4 * scale, "F");
  
  doc.restoreGraphicsState();
}

function drawCopy(
  doc: jsPDF,
  data: VoucherCopyData,
  copyLabel: string,
  xOffset: number,
  copyWidth: number,
  accent: [number, number, number],
) {
  const accentDark = mix(accent, [0, 0, 0], 0.35);
  const accentSoft = mix(accent, [255, 255, 255], 0.88);
  const ink: [number, number, number] = [22, 22, 28];
  const muted: [number, number, number] = [110, 110, 120];
  const hairline: [number, number, number] = [220, 220, 228];

  const margin = 7;
  const left = xOffset + margin;
  const right = xOffset + copyWidth - margin;
  const innerW = copyWidth - margin * 2;

  // Outer premium card border
  doc.setDrawColor(hairline[0], hairline[1], hairline[2]);
  doc.setLineWidth(0.25);
  doc.roundedRect(xOffset + 2, 3, copyWidth - 4, 204, 2, 2, "S");

  // Double gold accent outline inside borders
  doc.setDrawColor(212, 175, 55, 0.25); // light gold
  doc.setLineWidth(0.15);
  doc.roundedRect(xOffset + 3, 4, copyWidth - 6, 202, 1.5, 1.5, "S");

  // Draw luxury background watermark in center of the voucher copy
  const wmcx = xOffset + copyWidth / 2;
  const wmcy = 105;
  doc.saveGraphicsState();
  doc.setDrawColor(248, 245, 240); // extremely soft cream-gold
  doc.setLineWidth(0.08);
  doc.circle(wmcx, wmcy, 18, "S");
  doc.circle(wmcx, wmcy, 17.2, "S");
  doc.line(wmcx - 12, wmcy - 12, wmcx + 12, wmcy + 12);
  doc.line(wmcx - 12, wmcy + 12, wmcx + 12, wmcy - 12);
  doc.circle(wmcx, wmcy, 1.2, "S");
  doc.restoreGraphicsState();

  // Premium Header Banner
  const headerH = 26;
  const slices = 18;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1);
    const c = mix(accentDark, accent, t);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(xOffset + 3.2, 4.2 + (headerH * i) / slices, copyWidth - 6.4, headerH / slices + 0.2, "F");
  }

  // Double-border thin gold line dividing header banner
  doc.setDrawColor(212, 175, 55); // Gold line
  doc.setLineWidth(0.35);
  doc.line(xOffset + 3.2, 4.2 + headerH, xOffset + copyWidth - 3.2, 4.2 + headerH);

  // Copy label pill (top right)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(right - 34, 6.5, 32, 5.5, 1.5, 1.5, "F");
  doc.setTextColor(accentDark[0], accentDark[1], accentDark[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(copyLabel.toUpperCase(), right - 18, 10.3, { align: "center" });

  // School identity with Logo Integration
  let textLeft = left;
  const hasLogo = true; // Always draw logo/crest default fallback
  if (hasLogo) {
    textLeft = left + 14;
    // Attempt custom base64 logo or draw fallback gold crest vector
    if (data.school.logoUrl && data.school.logoUrl.startsWith("data:image/")) {
      try {
        doc.addImage(data.school.logoUrl, "PNG", left, 6.5, 11, 11);
      } catch (e) {
        drawSchoolCrest(doc, left, 6.5, 11);
      }
    } else {
      drawSchoolCrest(doc, left, 6.5, 11);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.school.name, textLeft, 12, { maxWidth: innerW - 48 });
  if (data.school.motto) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.text(data.school.motto, textLeft, 16, { maxWidth: innerW - 48 });
  }

  // Address and contact details strip
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  const contact = [data.school.address, data.school.phone, data.school.email, data.school.website]
    .filter(Boolean)
    .join("  •  ");
  if (contact) doc.text(contact, left, 21.5, { maxWidth: innerW });
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(212, 175, 55); // gold colored header label
  doc.text("OFFICIAL FEE VOUCHER", left, 27);

  // Voucher meta strip
  let y = 32;
  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(left, y, innerW, 11, 1.2, 1.2, "F");
  
  const colW = innerW / 3;
  const metaCol = (idx: number, label: string, val: string) => {
    const cx = left + colW * idx + 2;
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.setFontSize(5.8);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), cx, y + 3.6);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(val, cx, y + 8.4, { maxWidth: colW - 4 });
  };
  metaCol(0, "Voucher #", data.invoiceNumber);
  metaCol(1, "Issue Date", data.issueDate);
  metaCol(2, "Due Date", data.dueDate);
  y += 13;

  // Student block
  doc.setDrawColor(hairline[0], hairline[1], hairline[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(left, y, innerW, 22, 1.2, 1.2, "S");
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(left, y, 1.2, 22, "F");
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text("STUDENT PROFILE", left + 3, y + 3.5);
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFontSize(9);
  doc.text(data.student.name, left + 3, y + 7.5, { maxWidth: innerW - 6 });

  const sRows: [string, string][] = [
    ["Class", `${data.student.className ?? "-"} ${data.student.sectionName ?? ""}`.trim()],
    ["Roll / ID", `${data.student.rollNumber ?? "-"} / ${data.student.studentCode ?? "-"}`],
    ["Parent", `${data.student.parentName ?? "-"}${data.student.parentPhone ? " · " + data.student.parentPhone : ""}`],
    ["Period", data.periodLabel ?? "-"],
  ];
  doc.setFontSize(6.5);
  let ry = y + 11;
  sRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(k, left + 3, ry);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text(String(v), left + 18, ry, { maxWidth: innerW - 21 });
    ry += 2.7;
  });
  y += 24;

  // Items table header
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(left, y, innerW, 5.4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("CHARGES DESCRIPTION", left + 2, y + 3.8);
  doc.text(`AMOUNT (${data.currency})`, right - 2, y + 3.8, { align: "right" });
  y += 5.4;

  // Items rows
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  data.items.forEach((it, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 252);
      doc.rect(left, y, innerW, 4.6, "F");
    }
    doc.text(it.label, left + 2, y + 3.2, { maxWidth: innerW - 32 });
    doc.text(fmt(it.amount), right - 2, y + 3.2, { align: "right" });
    y += 4.6;
  });

  // Subtotal/discount lines
  y += 1;
  doc.setDrawColor(hairline[0], hairline[1], hairline[2]);
  doc.line(left, y, right, y);
  y += 3.4;
  const sumRow = (label: string, val: number) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.setFontSize(6.5);
    doc.text(label, left + 2, y);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text(fmt(val), right - 2, y, { align: "right" });
    y += 3.4;
  };
  sumRow("Subtotal", data.subtotal);
  if (data.baseDiscount > 0) sumRow("Base Discount", -data.baseDiscount);
  if (data.meritDiscount > 0)
    sumRow(`Merit Discount${data.meritReason ? " (" + data.meritReason + ")" : ""}`, -data.meritDiscount);
  if (data.siblingDiscount > 0) sumRow("Sibling Discount", -data.siblingDiscount);

  // Luxury Double-bordered Total band in gold/accent colors
  y += 1;
  doc.setDrawColor(212, 175, 55); // Gold line border for total
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  doc.line(left, y + 7.5, right, y + 7.5);

  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const c = mix(accent, accentDark, t);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(left, y + 0.3 + (6.9 * i) / 10, innerW, 0.7, "F");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL PAYABLE", left + 3, y + 5.1);
  doc.text(`${data.currency}  ${fmt(data.total)}`, right - 3, y + 5.1, { align: "right" });
  y += 10;

  // Bank details (if any)
  const bk = data.bank;
  if (bk && (bk.bankName || bk.accountNumber || bk.iban)) {
    doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
    doc.roundedRect(left, y, innerW, 16, 1, 1, "F");
    doc.setTextColor(accentDark[0], accentDark[1], accentDark[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text("PAYMENT INSTRUCTIONS", left + 2, y + 3);
    const bankLines: [string, string][] = [];
    if (bk.bankName) bankLines.push(["Bank", bk.bankName + (bk.branch ? " — " + bk.branch : "")]);
    if (bk.accountTitle) bankLines.push(["Title", bk.accountTitle]);
    if (bk.accountNumber) bankLines.push(["A/C #", bk.accountNumber]);
    if (bk.iban) bankLines.push(["IBAN", bk.iban]);
    if (bk.swift) bankLines.push(["SWIFT", bk.swift]);
    doc.setFontSize(6.2);
    let by = y + 6;
    bankLines.slice(0, 4).forEach(([k, v]) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(k, left + 2, by);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(ink[0], ink[1], ink[2]);
      doc.text(v, left + 14, by, { maxWidth: innerW - 16 });
      by += 2.5;
    });
    y += 17;
  }

  // Notes
  if (data.notes) {
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.8);
    doc.text(`Note: ${data.notes}`, left, y, { maxWidth: innerW });
    y += 4;
  }

  // Signature lines near bottom
  const sigY = 192;
  doc.setDrawColor(180, 180, 188);
  doc.setLineWidth(0.25);
  doc.line(left, sigY, left + innerW / 2 - 4, sigY);
  doc.line(left + innerW / 2 + 4, sigY, right, sigY);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.text("Authorised Signature", left, sigY + 3);
  doc.text("Received By (Cashier / Bank Stamp)", left + innerW / 2 + 4, sigY + 3);

  // Load dynamic brand settings from localStorage
  let brandName = "Altrix";
  let logoBase64 = "";
  try {
    const saved = localStorage.getItem("altrix_global_brand_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.brandName) {
        brandName = parsed.brandName;
      }
      if (parsed.logoBase64) {
        logoBase64 = parsed.logoBase64;
      }
    }
  } catch (e) {
    console.error("Error loading brand settings in voucher pdf", e);
  }

  // Footer & Powered by dynamic brand with Logo
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "italic");
  const foot = data.footerNote || "Please pay before due date. A late fee may apply for overdue payments.";
  doc.text(foot, left, 200, { maxWidth: innerW - 25 });
  
  // Luxury Brand alignment in footer
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  doc.setTextColor(accentDark[0], accentDark[1], accentDark[2]);
  doc.text(`Powered by ${brandName}`, right - 4.5, 200.2, { align: "right" });

  let logoDrawn = false;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", right - 3.5, 198, 3.2, 3.2);
      logoDrawn = true;
    } catch (err) {
      console.error("Failed to render custom logo base64 in voucher, falling back", err);
    }
  }
  if (!logoDrawn) {
    drawAltrixLogo(doc, right - 3.5, 198, 3.2);
  }
}

function drawVoucherOnDoc(doc: jsPDF, data: VoucherCopyData) {
  const accent = data.accentHsl
    ? hslToRgb(data.accentHsl.h, data.accentHsl.s, data.accentHsl.l)
    : ([35, 96, 178] as [number, number, number]);
  const copyW = 297 / 3;
  ["Student Copy", "Bank Copy", "Office Copy"].forEach((label, i) => {
    drawCopy(doc, data, label, copyW * i, copyW, accent);
    if (i < 2) {
      // Elegant dotted divider folding line
      doc.setDrawColor(170, 170, 180);
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.line(copyW * (i + 1), 4, copyW * (i + 1), 206);
      doc.setLineDashPattern([], 0);
    }
  });
}

export function generateVoucherPdf(data: VoucherCopyData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawVoucherOnDoc(doc, data);
  return doc;
}

export function appendVoucherPage(doc: jsPDF, data: VoucherCopyData) {
  doc.addPage("a4", "landscape");
  drawVoucherOnDoc(doc, data);
}
