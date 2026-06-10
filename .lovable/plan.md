## Scope

Four independent workstreams. Each ships end-to-end; no half-done modules.

---

### 1. Staff inclusion fix (small)

- Revert previous over-exclusion in `src/hooks/useOfflineData.ts` and `src/hooks/useUniversalPrefetch.ts`.
- `NON_STAFF` set reduces to `['student', 'parent', 'owner', 'school_owner']`.
- Per-school `super_admin` rows in `user_roles` will flow back into staff lists naturally.
- Keep `platform_super_admins` excluded (this is where `naumancheema643@gmail.com` lives).
- Verify staff appears in HR Staff list, Attendance, Payroll, Leave approvers.

---

### 2. Account-less HR staff (record-only)

DB migration (additive):
- Add to `hr_employees`: `is_account_linked boolean default false`, `email text`, `phone text`, `cnic text`, `address text`, `joining_date date`, `notes text` — only if missing.
- Make `user_id`/`profile_id` nullable on `hr_employees` if it isn't already.
- Update RLS so HR managers can `INSERT`/`UPDATE`/`SELECT` rows without a linked user.
- New RPC `hr_link_employee_to_user(_employee_id uuid, _user_id uuid)` for future linking.

UI (`HrStaffModule.tsx` + add-staff dialog):
- "Add Staff" dialog gains a "Has system account?" toggle.
  - Off → record-only path: capture name, role, department, joining date, contact, CNIC, address.
  - On → existing flow (link to existing user / invite).
- Staff list renders a "No login" badge for record-only entries with a "Link to account…" action.

---

### 3. Super Master Admin shell overhaul

New shell at `/super-admin/*` (or existing platform route) — full layout:

```text
┌──────────────────────────────────────────────────────┐
│  SuperAdminTopbar   [⌘K palette] [bell] [profile]   │
├───────────┬──────────────────────────────────────────┤
│ Sidebar   │  Page                                    │
│  • Overview                                          │
│  • Schools                                           │
│  • Owners & Admins                                   │
│  • Billing & Plans                                   │
│  • Platform Users                                    │
│  • Audit Log                                         │
│  • System Health                                     │
│  • Settings                                          │
└───────────┴──────────────────────────────────────────┘
```

Files created:
- `src/layouts/SuperAdminShell.tsx` — `SidebarProvider` + premium header + breadcrumbs.
- `src/components/super-admin/SuperAdminSidebar.tsx` — collapsible icon sidebar, gradient brand block.
- `src/components/super-admin/CommandPalette.tsx` — ⌘K global jump to any school/page.
- `src/pages/super-admin/Overview.tsx` — KPI cards (schools count, active users, MRR placeholder, signups 30d), trend chart (Recharts), recent activity feed, health pings.
- `src/pages/super-admin/Schools.tsx` — searchable table, status toggle, impersonate, deep-link to school shell.
- `src/pages/super-admin/Owners.tsx` — manage school owner assignments via existing RPCs.
- `src/pages/super-admin/AuditLog.tsx` — reads `app_notifications` + admin actions feed.
- `src/pages/super-admin/Health.tsx` — Supabase status, edge function ping, DB row counts per core table.

Design tokens: introduce `--super-bg`, `--super-surface`, `--super-accent` in `index.css` for a darker, premium navy/indigo theme distinct from tenant shell. All HSL.

Routing: wire under `App.tsx` behind `is_platform_admin(auth.uid())` guard; non-admins redirected.

---

### 4. Global branded PDF export

Strategy: **both** — branded print view everywhere + true downloadable PDF on key documents.

Shared infra:
- `src/components/pdf/BrandedDocument.tsx` — reusable letterhead wrapper consuming `school_branding` (logo, name, address, motto, primary color). Header band with logo + school info; footer with page number, reference, generated-at, signatory line.
- `src/components/pdf/ExportPdfButton.tsx` — dropdown: "Print / Save as PDF" (uses `window.print()` scoped via `@media print` + a portal) and "Download .pdf" (uses `html2pdf.js` or `jspdf` + `html2canvas`; choose `html2canvas-pro` + `jspdf` for crisp output).
- `src/hooks/usePdfExport.ts` — `exportNodeToPdf(node, { filename, orientation })`.
- Global print stylesheet `src/styles/print.css` — hides `[data-print="hide"]`, shows `[data-print="only"]`, A4 page sizing, removes shadows, forces serif body where appropriate.

Per-screen integrations (initial pass — all use the same wrapper):
- HR Contracts → already done; swap inline header for shared `BrandedDocument` + add Download button.
- HR Recruitment posting → new `RecruitmentPostingDocument.tsx`: full job spec on letterhead (title, dept, location, type, salary range, description, requirements, benefits, how to apply, deadline, posted-by). Export + Print + Share-link copy.
- Fee invoices, payslips, ID cards, leave letters, exam datesheets, results, complaints, certificates — wired with the same `BrandedDocument` wrapper and `ExportPdfButton`. Each gets a small per-document template component.
- Top-level: `AppToolbar` gains a context-aware "Export this page" button when the current route registers a printable view via a tiny `PrintableContext`.

---

## Technical notes

- Libraries to install: `jspdf`, `html2canvas-pro`. Avoid heavyweight `puppeteer`/server-side render this round.
- Branding pulled once via existing `useSchoolBranding` hook (cached).
- Print view and downloaded PDF render the SAME React tree, so visuals stay identical.
- All new tables follow Core memory rule: additive only, with GRANTs + RLS + service_role.

## Out of scope (this round)

- Server-side PDF generation via edge function (revisit if download fidelity is insufficient).
- Email-the-PDF flows.
- Bulk export (multiple records into one PDF).

## Order of execution

1. Staff inclusion revert (5 min, ships immediately).
2. PDF infra + ExportPdfButton + branded wrapper.
3. Recruitment posting branded document + export (since user is on `/hr/recruitment` now).
4. Account-less staff migration + UI.
5. Super Master Admin shell + pages.
6. Roll PDF export across remaining document screens.
