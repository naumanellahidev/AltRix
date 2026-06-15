import type { EduverseRole } from "@/lib/eduverse-roles";

export interface VoiceCommandConfig {
  /** Relative path segment, e.g. "/attendance" — will be prefixed with /{slug}/{role} */
  route?: string;
  /** Special non-navigation action */
  action?: "logout" | "search" | "open-search";
  /**
   * Roles that can use this command.
   * Empty array = available to ALL roles.
   */
  roles?: EduverseRole[];
}

/**
 * Comprehensive voice command map.
 * Keys are lowercase spoken phrases. Values define the action.
 * Voice handler in TenantShell / TeacherShell builds the full URL from cfg.route.
 */
export const VOICE_COMMANDS: Record<string, VoiceCommandConfig> = {
  // ── Dashboard / Root / Homes ─────────────────────────────────────────────
  "go to dashboard":          { route: "", roles: [] },
  "open dashboard":           { route: "", roles: [] },
  "home":                     { route: "", roles: [] },
  "view home":                { route: "", roles: [] },
  "principal home":           { route: "", roles: ["principal"] },
  "teacher home":             { route: "", roles: ["teacher"] },
  "student home":             { route: "", roles: ["student"] },
  "parent home":              { route: "", roles: ["parent"] },

  // ── Academics & Timetable ────────────────────────────────────────────────
  "open academic":            { route: "/academic", roles: [] },
  "open academics":           { route: "/academic", roles: [] },
  "go to academic":           { route: "/academic", roles: [] },
  "academic module":          { route: "/academic", roles: [] },
  "open timetable":           { route: "/timetable", roles: [] },
  "go to timetable":          { route: "/timetable", roles: [] },
  "show timetable":           { route: "/timetable", roles: [] },
  "timetable builder":        { route: "/timetable", roles: [] },
  "open attendance":          { route: "/attendance", roles: [] },
  "go to attendance":         { route: "/attendance", roles: [] },
  "student attendance":       { route: "/attendance", roles: [] },
  "open exams":               { route: "/exams", roles: [] },
  "go to exams":              { route: "/exams", roles: [] },
  "exam schedules":           { route: "/exams", roles: [] },
  "open report cards":        { route: "/report-cards", roles: [] },
  "go to report cards":       { route: "/report-cards", roles: [] },
  "student report cards":     { route: "/report-cards", roles: [] },
  "grade reports":            { route: "/report-cards", roles: [] },
  "open diary":               { route: "/diary", roles: [] },
  "go to diary":              { route: "/diary", roles: [] },
  "school diary":             { route: "/diary", roles: [] },
  "open homework":            { route: "/homework", roles: ["teacher", "student", "parent"] },
  "go to homework":           { route: "/homework", roles: ["teacher", "student", "parent"] },
  "homework assignments":     { route: "/homework", roles: ["teacher", "student", "parent"] },
  "open assignments":         { route: "/assignments", roles: ["teacher", "student", "parent"] },
  "go to assignments":        { route: "/assignments", roles: ["teacher", "student", "parent"] },
  "open gradebook":           { route: "/gradebook", roles: ["teacher"] },
  "go to gradebook":          { route: "/gradebook", roles: ["teacher"] },
  "open lesson plans":        { route: "/lesson-plans", roles: ["teacher"] },
  "go to lesson plans":       { route: "/lesson-plans", roles: ["teacher"] },
  "lesson planner":           { route: "/lesson-plans", roles: ["teacher"] },
  "open student progress":    { route: "/progress", roles: ["teacher", "student", "parent"] },
  "student performance":      { route: "/progress", roles: ["teacher", "student", "parent"] },

  // ── People & Human Resources ─────────────────────────────────────────────
  "open staff":               { route: "/users", roles: [] },
  "open users":               { route: "/users", roles: [] },
  "go to users":              { route: "/users", roles: [] },
  "staff list":               { route: "/users", roles: [] },
  "open directory":           { route: "/directory", roles: [] },
  "go to directory":          { route: "/directory", roles: [] },
  "school directory":         { route: "/directory", roles: [] },
  "open leaves":              { route: "/leaves", roles: [] },
  "go to leaves":             { route: "/leaves", roles: [] },
  "staff leaves":             { route: "/leaves", roles: [] },
  "open salaries":            { route: "/salaries", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to salaries":           { route: "/salaries", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "staff salaries":           { route: "/salaries", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open staff attendance":    { route: "/staff-attendance", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to staff attendance":   { route: "/staff-attendance", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "employee attendance":      { route: "/staff-attendance", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open contracts":           { route: "/contracts", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to contracts":          { route: "/contracts", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "employment contracts":     { route: "/contracts", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open recruitment":         { route: "/recruitment", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to recruitment":        { route: "/recruitment", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open hr analytics":        { route: "/hr-analytics", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to hr analytics":       { route: "/hr-analytics", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open reviews":             { route: "/reviews", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to reviews":            { route: "/reviews", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "staff reviews":            { route: "/reviews", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open documents":           { route: "/documents", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to documents":          { route: "/documents", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "staff documents":          { route: "/documents", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open onboarding":          { route: "/onboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to onboarding":         { route: "/onboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "onboarding":               { route: "/onboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "open offboarding":         { route: "/offboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "go to offboarding":        { route: "/offboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },
  "offboarding":              { route: "/offboarding", roles: ["principal", "vice_principal", "hr_manager", "school_owner", "super_admin"] },

  // ── Admissions & CRM / Marketing ─────────────────────────────────────────
  "open admissions":          { route: "/admissions", roles: [] },
  "go to admissions":         { route: "/admissions", roles: [] },
  "enrollment portal":        { route: "/admissions", roles: [] },
  "open crm":                 { route: "/crm", roles: [] },
  "go to crm":                { route: "/crm", roles: [] },
  "crm dashboard":            { route: "/crm", roles: [] },
  "open leads":               { route: "/leads", roles: [] },
  "go to leads":              { route: "/leads", roles: [] },
  "marketing leads":          { route: "/leads", roles: [] },
  "open followups":           { route: "/follow-ups", roles: [] },
  "go to followups":          { route: "/follow-ups", roles: [] },
  "marketing followups":      { route: "/follow-ups", roles: [] },
  "open calls":               { route: "/calls", roles: [] },
  "go to calls":              { route: "/calls", roles: [] },
  "marketing calls":          { route: "/calls", roles: [] },
  "open sources":             { route: "/sources", roles: [] },
  "go to sources":            { route: "/sources", roles: [] },
  "lead sources":             { route: "/sources", roles: [] },
  "open campaigns":           { route: "/campaigns", roles: [] },
  "go to campaigns":          { route: "/campaigns", roles: [] },
  "marketing campaigns":      { route: "/campaigns", roles: [] },

  // ── Finance & Fees ───────────────────────────────────────────────────────
  "open fees":                { route: "/fees", roles: [] },
  "go to fees":               { route: "/fees", roles: [] },
  "student fees":             { route: "/fees", roles: [] },
  "open finance":             { route: "/fees", roles: [] },
  "go to finance":            { route: "/fees", roles: [] },
  "finance dashboard":        { route: "/fees", roles: [] },
  "open invoices":            { route: "/invoices", roles: [] },
  "go to invoices":           { route: "/invoices", roles: [] },
  "student invoices":         { route: "/invoices", roles: [] },
  "open payments":            { route: "/payments", roles: [] },
  "go to payments":           { route: "/payments", roles: [] },
  "collected payments":       { route: "/payments", roles: [] },
  "open expenses":            { route: "/expenses", roles: [] },
  "go to expenses":           { route: "/expenses", roles: [] },
  "school expenses":          { route: "/expenses", roles: [] },
  "open payroll":             { route: "/payroll", roles: [] },
  "go to payroll":            { route: "/payroll", roles: [] },
  "salary payroll":           { route: "/payroll", roles: [] },
  "open ledger":              { route: "/ledger", roles: [] },
  "go to ledger":             { route: "/ledger", roles: [] },
  "general ledger":           { route: "/ledger", roles: [] },
  "open vendors":             { route: "/vendors", roles: [] },
  "go to vendors":            { route: "/vendors", roles: [] },
  "vendor management":        { route: "/vendors", roles: [] },
  "open tax":                 { route: "/tax", roles: [] },
  "go to tax":                { route: "/tax", roles: [] },
  "tax settings":             { route: "/tax", roles: [] },
  "open budget":              { route: "/budget-simulator", roles: ["principal", "vice_principal", "accountant", "school_owner", "super_admin"] },
  "show budget":              { route: "/budget-simulator", roles: ["principal", "vice_principal", "accountant", "school_owner", "super_admin"] },
  "open budget simulator":    { route: "/budget-simulator", roles: ["principal", "vice_principal", "accountant", "school_owner", "super_admin"] },
  "budget simulator":         { route: "/budget-simulator", roles: ["principal", "vice_principal", "accountant", "school_owner", "super_admin"] },

  // ── Operations & Noticeboard ──────────────────────────────────────────────
  "open notices":             { route: "/notices", roles: [] },
  "go to notices":            { route: "/notices", roles: [] },
  "noticeboard":              { route: "/notices", roles: [] },
  "open holidays":            { route: "/holidays", roles: [] },
  "go to holidays":           { route: "/holidays", roles: [] },
  "holiday list":             { route: "/holidays", roles: [] },
  "open reports":             { route: "/reports", roles: [] },
  "go to reports":            { route: "/reports", roles: [] },
  "school reports":           { route: "/reports", roles: [] },
  "open complaints":          { route: "/complaints", roles: [] },
  "go to complaints":         { route: "/complaints", roles: [] },
  "principal complaints":     { route: "/complaints", roles: [] },
  "open counseling":          { route: "/counseling", roles: [] },
  "go to counseling":         { route: "/counseling", roles: [] },
  "student counseling":       { route: "/counseling", roles: [] },
  "open behavior notes":      { route: "/behavior", roles: [] },
  "go to behavior notes":     { route: "/behavior", roles: [] },
  "behavior logs":            { route: "/behavior", roles: [] },
  "open parent notes":        { route: "/parent-notes", roles: [] },
  "go to parent notes":       { route: "/parent-notes", roles: [] },
  "parent notebook":          { route: "/parent-notes", roles: [] },
  "open attendance heatmap":  { route: "/attendance-heatmap", roles: ["principal", "vice_principal", "school_owner", "super_admin"] },
  "go to attendance heatmap": { route: "/attendance-heatmap", roles: ["principal", "vice_principal", "school_owner", "super_admin"] },
  "show heatmap":             { route: "/attendance-heatmap", roles: ["principal", "vice_principal", "school_owner", "super_admin"] },
  "attendance heatmap":       { route: "/attendance-heatmap", roles: ["principal", "vice_principal", "school_owner", "super_admin"] },
  "open ai counselor":        { route: "/ai-counselor", roles: [] },
  "go to ai counselor":       { route: "/ai-counselor", roles: [] },
  "chat with counselor":      { route: "/ai-counselor", roles: [] },

  // ── Communication & Hubs ─────────────────────────────────────────────────
  "open messages":            { route: "/messages", roles: [] },
  "go to messages":           { route: "/messages", roles: [] },
  "messages box":             { route: "/messages", roles: [] },
  "open collaboration":       { route: "/collaboration", roles: ["principal", "vice_principal", "school_admin", "school_owner", "super_admin"] },
  "open collaboration hub":   { route: "/collaboration", roles: ["principal", "vice_principal", "school_admin", "school_owner", "super_admin"] },
  "collaboration hub":        { route: "/collaboration", roles: ["principal", "vice_principal", "school_admin", "school_owner", "super_admin"] },
  "open support":             { route: "/support", roles: [] },
  "go to support":            { route: "/support", roles: [] },
  "help tickets":             { route: "/support", roles: [] },

  // ── Super Admin / Platform Controls ──────────────────────────────────────
  "open platform overview":   { route: "/super_admin", roles: ["super_admin"] },
  "go to platform overview":  { route: "/super_admin", roles: ["super_admin"] },
  "super admin dashboard":    { route: "/super_admin", roles: ["super_admin"] },
  "open platform schools":    { route: "/super_admin/schools", roles: ["super_admin"] },
  "go to platform schools":   { route: "/super_admin/schools", roles: ["super_admin"] },
  "platform tenants":         { route: "/super_admin/schools", roles: ["super_admin"] },
  "open platform billing":    { route: "/super_admin/billing", roles: ["super_admin"] },
  "go to platform billing":   { route: "/super_admin/billing", roles: ["super_admin"] },
  "platform revenue":         { route: "/super_admin/revenue", roles: ["super_admin"] },
  "open platform revenue":    { route: "/super_admin/revenue", roles: ["super_admin"] },
  "open platform addons":     { route: "/super_admin/addons", roles: ["super_admin"] },
  "platform modules":         { route: "/super_admin/addons", roles: ["super_admin"] },
  "open platform audit log":  { route: "/super_admin/audit", roles: ["super_admin"] },
  "go to platform audit":     { route: "/super_admin/audit", roles: ["super_admin"] },
  "platform audit trail":     { route: "/super_admin/audit", roles: ["super_admin"] },
  "open platform health":     { route: "/super_admin/health", roles: ["super_admin"] },
  "go to platform health":    { route: "/super_admin/health", roles: ["super_admin"] },
  "platform metrics":         { route: "/super_admin/health", roles: ["super_admin"] },
  "open platform database":   { route: "/super_admin/database", roles: ["super_admin"] },
  "go to platform database":  { route: "/super_admin/database", roles: ["super_admin"] },
  "platform backups":         { route: "/super_admin/database", roles: ["super_admin"] },
  "open platform domains":    { route: "/super_admin/domains", roles: ["super_admin"] },
  "go to platform domains":   { route: "/super_admin/domains", roles: ["super_admin"] },
  "custom domains":           { route: "/super_admin/domains", roles: ["super_admin"] },
  "open platform security":   { route: "/super_admin/security", roles: ["super_admin"] },
  "go to platform security":  { route: "/super_admin/security", roles: ["super_admin"] },
  "security audits":          { route: "/super_admin/security", roles: ["super_admin"] },
  "open platform settings":   { route: "/super_admin/settings", roles: ["super_admin"] },
  "go to platform settings":  { route: "/super_admin/settings", roles: ["super_admin"] },
  "platform preferences":     { route: "/super_admin/settings", roles: ["super_admin"] },
  "open presence debug":      { route: "/presence-debug", roles: ["principal", "super_admin"] },
  "go to presence debug":     { route: "/presence-debug", roles: ["principal", "super_admin"] },

  // ── Global Actions / Settings ────────────────────────────────────────────
  "search":                   { action: "open-search", roles: [] },
  "open search":              { action: "open-search", roles: [] },
  "activate search":          { action: "open-search", roles: [] },
  "trigger search dialog":    { action: "open-search", roles: [] },
  "quick search":             { action: "open-search", roles: [] },
  "settings":                 { route: "?settings=1", roles: [] },
  "open settings":            { route: "?settings=1", roles: [] },
  "go to settings":           { route: "?settings=1", roles: [] },
  "show settings":            { route: "?settings=1", roles: [] },
  "logout":                   { action: "logout", roles: [] },
  "sign out":                 { action: "logout", roles: [] },
  "log out":                  { action: "logout", roles: [] },
  "exit dashboard":           { action: "logout", roles: [] },
  "quit dashboard":           { action: "logout", roles: [] },
};

/**
 * Parses a spoken transcript, strips filler/fluff words, and attempts to find 
 * the best matching command key from our voice command registry.
 */
export function matchVoiceCommand(spoken: string): string | null {
  const phrase = spoken.toLowerCase().trim();
  if (!phrase) return null;

  // Exact match check first
  if (VOICE_COMMANDS[phrase]) return phrase;

  // Strip filler prefixes
  const cleanPhrase = phrase
    .replace(/^(please|show|open|go\s+to|navigate\s+to|view|display|take\s+me\s+to|open\s+up|run)\s+/g, "")
    .trim();

  if (!cleanPhrase) return null;
  if (VOICE_COMMANDS[cleanPhrase]) return cleanPhrase;

  // Fuzzy matching check based on substring and word overlap
  let bestMatch: string | null = null;
  let maxScore = 0;

  const commandKeys = Object.keys(VOICE_COMMANDS);
  for (const cmdKey of commandKeys) {
    // Substring contains
    if (cmdKey.includes(cleanPhrase) || cleanPhrase.includes(cmdKey)) {
      const score = Math.min(cleanPhrase.length, cmdKey.length) / Math.max(cleanPhrase.length, cmdKey.length);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = cmdKey;
      }
    }
  }

  // Word overlap fallback
  if (!bestMatch || maxScore < 0.4) {
    const phraseWords = new Set(cleanPhrase.split(/\s+/));
    for (const cmdKey of commandKeys) {
      const cmdWords = cmdKey.split(/\s+/);
      const intersection = cmdWords.filter(w => phraseWords.has(w));
      const score = intersection.length / Math.max(phraseWords.size, cmdWords.length);
      if (score > maxScore && score >= 0.5) {
        maxScore = score;
        bestMatch = cmdKey;
      }
    }
  }

  return bestMatch;
}

