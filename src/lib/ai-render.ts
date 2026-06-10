/**
 * Safely coerce any AI-returned value (string, number, object, array) into a
 * displayable string. Prevents "Objects are not valid as a React child" crashes
 * when the model returns shapes like { path, reasoning } instead of strings.
 */
export function aiToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(aiToText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Common label fields the model uses
    const label =
      v.path ?? v.title ?? v.name ?? v.label ?? v.career ?? v.field ?? v.subject ?? v.area;
    const detail = v.reasoning ?? v.description ?? v.details ?? v.note;
    if (label && detail) return `${aiToText(label)} — ${aiToText(detail)}`;
    if (label) return aiToText(label);
    if (detail) return aiToText(detail);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function aiToTextArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(aiToText).filter(Boolean);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(aiToText).filter(Boolean);
  }
  const s = aiToText(value);
  return s ? [s] : [];
}
