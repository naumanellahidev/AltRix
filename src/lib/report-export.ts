// Centralised report export helpers — branded across the whole platform.
// Supports CSV, Excel (.xls via HTML), JSON, Print, and Print-to-PDF
// via the browser's native print dialog (zero extra deps).
//
// The print template auto-detects the active school name + brand colour
// so every report, slip and analytics page prints with consistent branding.

import { toCsv } from "@/lib/csv";

export type ExportRow = Record<string, string | number | null | undefined>;

const ts = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function exportCSV(rows: ExportRow[], baseName: string) {
  const csv = toCsv(rows);
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${baseName}-${ts()}.csv`);
}

export function exportJSON(rows: ExportRow[], baseName: string) {
  const json = JSON.stringify(rows, null, 2);
  triggerDownload(new Blob([json], { type: "application/json;charset=utf-8;" }), `${baseName}-${ts()}.json`);
}

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function rowsToHtmlTable(rows: ExportRow[], title: string): string {
  if (!rows.length) {
    return `<table><thead><tr><th>${escapeHtml(title)}</th></tr></thead><tbody><tr><td class="empty">No data available</td></tr></tbody></table>`;
  }
  const keys = Object.keys(rows[0]);
  const header = keys.map((k) => `<th>${escapeHtml(k.replace(/_/g, " "))}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Export to a .xls file Excel can open (Excel-compatible HTML). */
export function exportExcel(rows: ExportRow[], baseName: string, title?: string) {
  const table = rowsToHtmlTable(rows, title ?? baseName);
  const brand = getBrandContext();
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" />
<style>
  body{font-family:Arial,sans-serif;color:#111}
  h3{margin:0 0 4px;color:${brand.hex}}
  .sub{color:#555;font-size:11px;margin-bottom:10px}
  table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}
  th,td{border:1px solid #999;padding:6px 10px;text-align:left}
  th{background:${brand.hex};color:#fff;font-weight:bold}
</style></head><body>
  <h3>${escapeHtml(brand.schoolName ?? "")}</h3>
  <div class="sub">${escapeHtml(title ?? baseName)} — generated ${new Date().toLocaleString()}</div>
  ${table}
</body></html>`;
  triggerDownload(
    new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    `${baseName}-${ts()}.xls`,
  );
}

export interface PrintOptions {
  title: string;
  subtitle?: string;
  rows: ExportRow[];
  /** Optional summary key/value pairs rendered above the table. */
  summary?: Array<{ label: string; value: string | number }>;
  /** Optional pre-rendered HTML inserted between summary and table. */
  extraHtml?: string;
  /** School/brand name printed in the header. Auto-detected if omitted. */
  schoolName?: string;
  /** Optional override for brand colour (any CSS colour). Auto-detected otherwise. */
  brandColor?: string;
  /** Optional contact/footer line (address, phone, website). */
  contactLine?: string;
}

/** Best-effort runtime detection of active school + brand colour. */
function getBrandContext(): { schoolName: string | null; hex: string; rgb: string } {
  let schoolName: string | null = null;
  let brandHsl: string | null = null;

  // 1. Try cached tenant from URL slug
  if (typeof window !== "undefined") {
    try {
      const slug = window.location.pathname.split("/").filter(Boolean)[0];
      if (slug) {
        const cached = localStorage.getItem(`eduverse_tenant_${slug}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          schoolName = parsed?.data?.name ?? null;
        }
      }
    } catch {
      /* ignore */
    }

    // 2. Read --brand CSS variable (format: "H S% L%")
    try {
      const root = document.documentElement;
      brandHsl = getComputedStyle(root).getPropertyValue("--brand").trim() || null;
    } catch {
      /* ignore */
    }
  }

  const hsl = brandHsl || "210 100% 50%";
  const hex = hslStringToHex(hsl);
  const rgb = hslStringToRgbTuple(hsl);
  return { schoolName, hex, rgb };
}

function hslStringToHex(hsl: string): string {
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return "#2563eb";
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hslStringToRgbTuple(hsl: string): string {
  const hex = hslStringToHex(hsl);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function monogramOf(name: string | null): string {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "•";
}

export function printReport(opts: PrintOptions) {
  const { title, subtitle, rows, summary, extraHtml, contactLine } = opts;
  const ctx = getBrandContext();
  const schoolName = opts.schoolName ?? ctx.schoolName ?? "School Report";
  const brandHex = opts.brandColor ?? ctx.hex;
  const brandRgb = ctx.rgb;
  const mono = monogramOf(schoolName);
  const table = rowsToHtmlTable(rows, title);
  const generated = new Date().toLocaleString();

  const summaryHtml = summary?.length
    ? `<div class="summary">${summary
        .map(
          (s) =>
            `<div class="summary-item"><div class="lbl">${escapeHtml(s.label)}</div><div class="val">${escapeHtml(s.value)}</div></div>`,
        )
        .join("")}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)} — ${escapeHtml(schoolName)}</title>
<style>
  :root{ --brand:${brandHex}; --brand-rgb:${brandRgb}; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
  html,body{margin:0;padding:0;background:#f6f8fb;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  body{padding:28px 32px}
  .sheet{background:#fff;border-radius:24px;padding:28px 30px;box-shadow:0 12px 40px -18px rgba(15,23,42,0.18);border:1px solid #eef2f7;overflow:hidden}

  /* Brand header */
  .brand-bar{height:8px;background:linear-gradient(90deg,var(--brand) 0%, rgba(var(--brand-rgb),0.6) 60%, rgba(var(--brand-rgb),0.15) 100%);border-radius:999px;margin-bottom:18px}
  .brand{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:6px 0 18px;border-bottom:1px solid #eef2f7;margin-bottom:20px}
  .brand-left{display:flex;align-items:center;gap:14px}
  .mono{width:54px;height:54px;border-radius:18px;background:linear-gradient(135deg,var(--brand),rgba(var(--brand-rgb),0.75));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;letter-spacing:.5px;box-shadow:0 10px 24px -10px rgba(var(--brand-rgb),0.7)}
  .brand h1{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em;color:#0f172a}
  .brand .school{font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.12em;font-weight:600}
  .brand .meta{text-align:right;font-size:11px;color:#64748b;line-height:1.6;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:10px 14px}
  .brand .meta strong{display:block;color:#0f172a;font-size:11px;letter-spacing:.06em;text-transform:uppercase}

  h2.subtitle{font-size:13px;color:#475569;margin:0 0 16px;font-weight:500}

  /* Summary tiles */
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 22px}
  .summary-item{border:1px solid #eef2f7;border-radius:18px;padding:14px 16px;background:linear-gradient(180deg,rgba(var(--brand-rgb),0.07),#fff);position:relative;overflow:hidden;box-shadow:0 4px 14px -8px rgba(15,23,42,0.08)}
  .summary-item::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;background:var(--brand);border-radius:0 4px 4px 0}
  .summary-item .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
  .summary-item .val{font-size:18px;font-weight:700;margin-top:6px;color:#0f172a;letter-spacing:-.01em}

  /* Table */
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;margin-top:8px;border:1px solid #eef2f7;border-radius:18px;overflow:hidden;box-shadow:0 4px 14px -10px rgba(15,23,42,0.10)}
  th{background:linear-gradient(180deg,var(--brand),rgba(var(--brand-rgb),0.85));color:#fff;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.08em;padding:12px 12px;text-align:left;border-bottom:1px solid rgba(0,0,0,.06)}
  td{padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1f2937;vertical-align:top}
  tbody tr:nth-child(even) td{background:#fafbfd}
  tbody tr:last-child td{border-bottom:none}
  td.empty{text-align:center;color:#9ca3af;padding:28px;font-style:italic}

  .footer{margin-top:28px;border-top:2px dashed rgba(var(--brand-rgb),0.4);padding-top:12px;font-size:10px;color:#64748b;display:flex;justify-content:space-between;align-items:center}
  .footer .brand-mark{color:var(--brand);font-weight:700;letter-spacing:.06em;text-transform:uppercase}

  @media print{ body{padding:10mm;background:#fff} .no-print{display:none} .sheet{box-shadow:none;border:none;border-radius:18px} }
  @page{size:A4;margin:10mm}
</style></head><body>
  <div class="sheet">
    <div class="brand-bar"></div>
    <div class="brand">
      <div class="brand-left">
        <div class="mono">${escapeHtml(mono)}</div>
        <div>
          <div class="school">${escapeHtml(schoolName)}</div>
          <h1>${escapeHtml(title)}</h1>
        </div>
      </div>
      <div class="meta">
        <strong>Generated</strong>
        <div>${escapeHtml(generated)}</div>
        ${contactLine ? `<div style="margin-top:4px">${escapeHtml(contactLine)}</div>` : ""}
      </div>
    </div>
    ${subtitle ? `<h2 class="subtitle">${escapeHtml(subtitle)}</h2>` : ""}
    ${summaryHtml}
    ${extraHtml ?? ""}
    ${table}
    <div class="footer">
      <span class="brand-mark">${escapeHtml(schoolName)}</span>
      <span>${rows.length} record${rows.length === 1 ? "" : "s"} • Page <span class="pg"></span></span>
    </div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)};window.onafterprint=function(){window.close()};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Print + save to PDF via the browser's native "Save as PDF" destination. */
export const exportPDF = (opts: PrintOptions) => printReport(opts);
