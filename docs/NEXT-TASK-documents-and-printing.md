# Next task — documents, reports and printing

> **Status: IN PROGRESS.** Done so far (see "Progress log"): the document
> layer, exact money arithmetic, Urdu font, fee vouchers end to end, unified
> invoice numbering, the vector DOM exporter replacing html2canvas everywhere,
> branded Excel/PDF/print/WhatsApp exports on every data screen, data-named
> files, report cards (official one-page card, class-set ZIP, WhatsApp, public
> QR verification), payslips (single and whole-run PDFs), receipts (A5) and
> invoices, student ID cards, certificates and the document vault, datesheets,
> admit cards, timetables, HR appointment letters, the parents' annual fee
> certificate, lesson plans, teacher progress reports, platform invoices and
> receipts, data-named vouchers/transcripts, all timetable screens, exam
> seating (real plans, door sheets, family seat view), visitor passes,
> expense vouchers, the owner's board packet, the financial report, and
> exports on the data screens (slices 16-17), and versioned SQL migrations
> applied by the deploy. Documents work is done. Next: the lower-priority
> audit items — silently swallowed exceptions, unpaginated endpoints,
> sequential API calls in frontend loops (e.g. the datesheet per-student
> upload loop), main JS chunk size (drop unused html2canvas deps, split),
> remaining TypeScript errors (39), esbuild / react-router advisories.
>
> This is the agreed next piece of work after the
> security/stability audit. It is written to be self-contained so any session —
> this one after a reset, a new one, or a cloud agent — can pick it up without
> re-deriving context.
>
> **Keep this status line current.** A resuming session reads it first: mark
> slices done here as they land, and change it to `COMPLETE` when the work is
> finished. Nothing else records progress.

## Resuming automatically

The audit that preceded this is finished — `python scripts/audit_verify.py`
reports 117/117. Do not re-run it as a task; only keep it passing.

An in-session job that fires every minute re-enters this work within a minute
of the usage limit resetting (it only fires while the session is idle). That job lives in the Claude session's memory only, so if the editor is
closed it is gone — this file is the durable handoff. A new session resumes by
reading it and continuing from the status line above.

A cloud routine would survive a closed editor, but cannot be used yet: the
repository is not connected to the user's Claude account, and the audit work is
still uncommitted in the working tree, so a cloud agent would clone code that
does not contain any of it.

## The goal, in the user's words

Every document the app produces — anything a principal, teacher, student or
parent generates, prints or exports — is currently low quality as a *printed
artefact*. The design, the paper layout, the generation mechanism and the
feature set all need to reach a genuinely premium, professional standard.

Not a polish pass. A rebuild of how this product makes documents.

## Where documents are produced today

Found by inspection; confirm before changing anything.

| Area | File |
|---|---|
| Report cards | `src/pages/tenant/modules/ReportCardModule.tsx` (1,953 lines) |
| Fee vouchers | `src/pages/tenant/modules/FeeVouchersModule.tsx` (2,400 lines) |
| Student ID cards | `src/pages/tenant/modules/StudentCardsModule.tsx` (1,997 lines) |
| Invoices | `src/pages/tenant/accountant-modules/AccountantInvoicesModule.tsx` |
| Payment receipts | `src/pages/tenant/accountant-modules/AccountantPaymentsModule.tsx` |
| Certificates | `src/pages/tenant/modules/DocManagementModule.tsx` |
| Payroll / payslips | `src/pages/tenant/accountant-modules/AccountantPayrollModule.tsx` |
| Exam datesheets, hall tickets | `src/pages/tenant/modules/` (search `datesheet`, `hall_ticket`) |
| Branded wrapper | `src/components/pdf/BrandedDocument.tsx` |
| HR letters | `src/components/hr/ContractLetterhead.tsx` |
| Reports | `src/pages/tenant/modules/ReportsModule.tsx` |
| Backend PDF tasks | `backend/app/tasks/pdf_tasks.py` |

Current toolchain: `jspdf`, `jspdf-autotable`, `html2canvas` / `html2canvas-pro`,
plus `window.print()` with `@media print` CSS in places.

## What is already known to be wrong

Observed during the audit, not yet fixed:

1. **`html2canvas` rasterises.** Text becomes pixels — blurry in print, not
   selectable, not searchable, and the file is large. Anything that must look
   sharp on paper should be laid out as vector PDF or printed from real HTML.
2. **Images inside generated documents were silently missing.** `<img src>`
   could not authenticate against `/api/storage/files/...`. Signed URLs now
   exist (`POST /api/storage/sign`, see `backend/app/routers/vps_storage.py`) —
   the document code still has to be switched over to use them.
3. **No shared document layer.** Each module builds its own header, footer,
   fonts and spacing, so nothing matches anything else.
4. **Page mechanics are unhandled** — page breaks mid-table, no repeated table
   headers, no "Page X of Y", no margins for binding or hole-punching.
5. **Branding is inconsistent** — `BrandedDocument.tsx` exists but most
   generators do not use it.
6. **No Urdu / RTL support** in any generated document, in a Pakistani product.

## Suggested shape of the work

Verify each of these against the code before committing to them.

**1. One document system, not fifteen.** A single layer owning page size and
margins, the type scale, the school's branding, header/footer with page
numbers, signature blocks, QR/verification marks, and watermarks
(DRAFT / COPY / ORIGINAL).

**2. Choose the right renderer per document.**
- Server-side PDF for anything official (report cards, vouchers, certificates,
  payslips): reproducible, sharp, and it cannot differ between browsers.
  `backend/app/tasks/pdf_tasks.py` is the existing entry point.
- Real print CSS (`@page`, `break-inside: avoid`, running headers) for anything
  the user prints directly.
- Keep `html2canvas` only where a pixel snapshot is genuinely what is wanted.

**3. Make the paper right.** A4 as default with Letter available; correct
margins; tables that repeat their header across pages and never split a row;
"Page X of Y"; a footer identifying the school, the document and when it was
generated.

**4. Urdu / bilingual.** Embed a Urdu-capable font (Noto Nastaliq Urdu or
Jameel Noori), support RTL blocks, and allow bilingual labels on official
documents.

**5. Features worth having.** Bulk generation into one PDF or a ZIP; a preview
that matches the print exactly; export as PDF / Excel / CSV; a QR code linking
to the existing verification endpoints (`/api/documents/certificates/verify/...`,
`/api/report-cards/verify/...`); per-school templates the school can adjust;
and a digital signature block.

**6. Performance.** Generating 500 report cards must not block a worker or the
browser — queue it, report progress, deliver a download when it is done.

## Ground rules carried over from the audit

- Never fabricate data to fill a document. A missing mark is not a zero; an
  absent signature is not a blank line pretending to be signed.
- A failed generation must say so. No "Downloaded successfully" toast on a
  document that was never produced — that pattern was found in seven places
  during the audit and fixed.
- Money and marks are `Decimal` now (`backend/app/utils/money.py`). Format them
  through it; do not convert to float on the way to a document.
- Storage files need a signed URL to be fetchable by the browser.

## Before starting

1. `git status` — a large amount of audit work may still be uncommitted.
2. `python scripts/audit_verify.py` — should report every check passing.
3. `cd backend && python -m pytest tests/ -q` and `npm run build`.

## Also still open from the audit

Lower priority than the above, but not done:

- ~~Silently swallowed exceptions in the backend.~~ **Done.** 45 handlers that
  turned a database error into an empty list or a `"status": "success"` with no
  rows now let the error out; 51 genuinely optional steps (cache invalidation,
  notifications) still swallow but log. `backend/app/utils/best_effort.py` is
  the helper, `backend/tests/test_error_propagation.py` pins the rule across
  every router so it cannot come back, and `scripts/audit_verify.py` gates it.
- ~~REST list endpoints with no pagination.~~ **Done.** 71 endpoints now take
  `limit`/`offset` through the `ListPage` dependency in
  `backend/app/utils/pagination.py` and apply it to the query. The response is
  still a plain array, so no caller broke; `X-Result-Limit` and
  `X-Result-Offset` tell a caller what bound was applied. Three endpoints are
  bounded by their own subject and say so at the call site.
  `backend/tests/test_list_bounds.py` pins it.
- ~~Parent-teacher chat kept an on-disk shadow store.~~ **Done.** A database
  error used to serve stale threads from a JSON file, and a failed send was
  appended to that file and broadcast over the websocket — the parent saw their
  message delivered and the teacher never received it. The store is gone.
- 29 sequential API calls inside loops in the frontend.
- Main JS chunk is 1.1 MB, `dist` is 9.9 MB.
- ~49 TypeScript errors remain (down from 201).
- `esbuild` and `react-router` still have moderate advisories; both need a major
  version bump and route-by-route testing.

## Progress log

### Slice 1 — document layer (done)

`src/lib/documents/` — one system every generator uses:

| File | Owns |
|---|---|
| `paper.ts` | A4/Letter/Legal/A5, portrait/landscape, real margins with a binding edge |
| `theme.ts` | Type scale, greys, the school's accent colour; readable text on any brand colour |
| `document.ts` | `PdfDocument`: vector text, letterhead, continuation heads, "Page X of Y" footers, watermarks, signature blocks that do not pretend to be signed, callouts, auto-pagination |
| `table.ts` | Tables that repeat their header on every page and never split a row; money summaries |
| `format.ts` | Money/marks/percent/date formatting from exact decimal strings; absent prints as an em dash, never as 0 |
| `decimal.ts` | BigInt minor-unit arithmetic mirroring the RPC's `ROUND()`; amount in words (lakh/crore for PKR) |
| `fonts.ts` | WinAnsi safety for built-in fonts; Noto Naskh Arabic for Urdu, switched in automatically per text run |
| `assets.ts` | Logos/photos through signed storage URLs, failures reported not swallowed |
| `verify.ts` | QR codes drawn as vector squares; verification URLs |
| `deliver.ts` | Download, print, preview, bulk ZIP with a MISSING-DOCUMENTS manifest; results that never claim success they did not observe |

Font: `public/fonts/NotoNaskhArabic-{Regular,Bold}.ttf` (SIL OFL 1.1, see
`public/fonts/README.txt`). Covers all Urdu letters and presentation forms.

Tests: `src/lib/documents/*.test.ts`.

### Slice 2 — fee vouchers (done)

- `src/lib/fee-voucher-pdf.ts` rebuilt on the layer. Kept: three-copy landscape
  layout, gradient header, gold accents, bank details, signatures, platform
  mark. Added: exact decimals, fit-to-space charges (tail combined into one
  exactly-summed line), amount in words, late fee from the school's policy with
  grace days, vector QR, PAID/PARTIAL/OVERDUE/CANCELLED stamps, paid-to-date and
  balance on reprints, monogram instead of a stock crest, Urdu names. Fixed the
  CMYK gold border.
- `src/lib/voucher-data.ts` — one loader for staff, parent and Copilot vouchers.
- `FeeVouchersModule.tsx` batch generation: removed the client-side invoice
  fallback that invented invoices when the RPC failed; retry transient errors;
  per-student failures with the server's reason; "Retry failed" button; prints
  the server's line items; exact totals; honest toasts; batch id no longer
  fabricated; dialog no longer closes with failures hidden (stale state).
- `ParentFeesModule.tsx`: same loader; paid/status on reprint; the proof-upload
  dialog was passed the wrong props and never opened — fixed; fiscal-year list
  was hard-coded to two past years — now computed (Pakistan FY July–June).
- `AltrixCopilot.tsx` voucher: discounts were dropped so lines did not add up
  to the total; branding lightness defaulted to 178% — both fixed via the loader.
- `backend/sql_migrations/20260918010000_unified_invoice_numbering.sql`: one atomic
  per-school sequence behind both `generate_invoice_number` and
  `next_invoice_number`, keeping each school's prefix and six digits, seeded
  from numbers already issued. Verified on real Postgres: 400 concurrent
  numbers from 8 sessions, contiguous, no duplicates.

### Slice 3 — no more screenshots (done)

- `src/lib/documents/dom-to-pdf.ts`: exports an on-screen element as a vector
  PDF — text drawn line by line where the browser placed it (selectable,
  searchable, fitted to its measured width), backgrounds/borders as shapes, SVG
  charts as vector (svg2pdf.js), links clickable, light theme forced even in
  dark mode, page breaks between lines/rows/images, table headers repeated,
  `data-page-break` / `data-keep-together` honoured, Page X of Y footers.
  Verified in real Chrome with a 120-row fixture (every row once, header on
  every page, Urdu joined and RTL, truncation, justification).
- `src/lib/pdfExportEngine.ts` now delegates to it; html2canvas is no longer
  imported anywhere. Report cards (staff + parent), HR contracts, HR analytics,
  staff directory and recruitment all export vector PDFs.
- `usePdfExport`: preview in a new tab; print no longer hides the document's own
  `<header>` letterhead, waits for images/fonts, and is not torn down while the
  dialog is open (Firefox/Safari printed blank pages).

### Slice 4 — branded exports everywhere (done)

- `spreadsheet.ts`: real .xlsx (exceljs, lazy chunk) with crest, school name in
  its colour, title/period/filters, typed columns, SUM formulas, frozen and
  filterable header, zebra rows, Urdu RTL, A4 print setup with repeated header
  and Page X of Y. CSV with BOM and formula-injection guard.
- `table-report.ts`: tabular reports as real PDF files with summary tiles,
  sections, totals. `brand.ts`: one source for school (or platform) branding —
  the old helper read a dead localStorage key, so every export had no name.
- `deliver.ts`: WhatsApp sharing (native share sheet with the file attached;
  elsewhere download + open WhatsApp and say so).
- `format.ts` `documentFileName`: "Fee Defaulters - Grade 7 - September 2026 -
  Crescent Model School - 19 Sep 2026.xlsx".
- `DataExportMenu` (Excel · PDF · Print · WhatsApp PDF/Excel · CSV · JSON) on:
  all accountant reports (via ReportExportMenu), fee defaulters, monthly
  financial report, fees analytics (invoices, payments, defaulters, daily
  collection), expenses, reports module, attendance summary, timetable, HR
  analytics, leave register, staff attendance, teacher presence, counseling,
  behaviour notes, complaints, campuses, owner ledger, gradebook, platform
  audit log.
- Fixed on the way: platform audit log showed invented records on load failure
  and its Export only showed a success toast; accountant consolidated report
  injected user text as HTML; reports module printed class/section UUIDs;
  timetable export mis-ordered periods; assessment delete could drop marks and
  keep the assessment; parent proof-upload dialog never opened.

### Slice 5 — report cards (done)

- `src/lib/documents/report-card.ts`: the official card built from the stored,
  published record — letterhead, photo (signed URL), particulars, headline
  tiles (marks, %, grade, GPA, position, attendance), subjects with class
  average / top / position / comments (blank never printed as 0, and said so),
  co-curricular (empty columns dropped), term-on-term chart, remarks, grading
  key, three signature lines with a stated digital sign-off, QR verification.
  Fits one A4 page for a typical card. Drafts are watermarked DRAFT and carry
  no QR. File: "Ayesha Khan - Report Card - Term 2 - 2026-2027.pdf".
- Parent portal: Download / Print / Share on WhatsApp all use it (the old
  Share sent a login-only URL).
- Staff: "Download class set (ZIP)" in the publish dialog — one PDF per child,
  named after them, with progress and a MISSING-DOCUMENTS manifest.
- Publishing now goes through the server (`/report-cards/publish-bulk`), so
  cards get QR tokens and signatures. Fixed: bulk publish compared a UUID to a
  string and published nothing; re-publishing minted a new token and voided
  every printed QR; the detail endpoint let any parent in the school read any
  child's card (drafts included) by id; `require_school_match` let callers
  with no school through; verification accepted unpublished drafts.
- `/verify/:kind/:code` — public page a QR leads to, for report cards and
  certificates, showing issuer, holder and key facts from the school's records.

### Slice 6 — payslips (done)

- `src/lib/documents/payslip.ts`; `src/lib/payslip-pdf.ts` keeps its export
  names but every function now makes a real PDF (download used to save .html,
  with names unescaped). A pay run is one PDF with each employee as their own
  document — own letterhead, own "Page 1 of 1" (`PdfDocument.beginDocument`).
- Honest figures: gross/deductions/net from the run; basic + allowances shown
  only when they sum exactly to that gross (the screens used to invent basic
  as gross − allowances and use today's salary record for past months); no
  internal UUID printed as employee number; net ≠ gross − deductions is
  reported; net in words; confidential note.
- Accountant payroll and HR salaries screens: async, honest toasts, runs with no
  staff record are reported rather than silently dropped.

### Slice 7 — receipts and invoices (done)

- `receipt.ts`: A5 receipt — payer, date, method, transaction ref, invoice,
  amount in figures and words, invoice total / paid to date / balance (only
  when known; otherwise says so), DUPLICATE watermark for reprints, WhatsApp to
  the payer's number. Payments screen: receipt menu (print / download /
  WhatsApp / reprint as duplicate) replacing a CSS hide-the-page print; the
  receipt used to print "Unknown" for an unfound invoice.
- `invoice.ts`: the invoice's own lines (the old print invented "Qty 1" and a
  unit price), discount/late fee only when present, exact paid-to-date from the
  recorded payments with a payments table, PAID/OVERDUE/CANCELLED watermark,
  QR of the invoice number, balance in words, inconsistency warning. Invoices
  screen: Print / Download / WhatsApp.
- Letterhead: school name shrinks and wraps, and the contact line stops short
  of the title, so long names no longer run under the title on narrow pages.

### Slice 8 — student ID cards (done)

- `src/lib/documents/id-card.ts`: vector PDF sheets at CR80 size with crop
  marks — 9 portrait or 10 landscape cards per A4, backs on the next sheet in
  mirrored order for duplex printing. Honours every card setting (layout,
  colours, design style, each show_* flag, signature text); the configured text
  colour is overridden only when it would be unreadable on the band.
- Fixed: QR codes were fetched from api.qrserver.com with the child's id,
  name, roll and class in the URL (a third-party data leak, and no codes
  offline) — now drawn locally; photos used unsigned storage paths and mostly
  failed — now signed and loaded a few at a time; "SCHOOL TAGLINE" and "LOGO"
  placeholders printed on real cards — never now; names were injected into
  HTML unescaped. Missing photos are reported, not faked.
- `src/lib/id-card-print.ts` keeps `printStudentCards` (callers used `void`,
  so it now reports its own outcome and never rejects) and adds
  `downloadStudentCards`; the cards screen has "Download PDF" for card printers.
  Admissions/Directory no longer read tenant fields that do not exist.

### Slice 9 — certificates and the document vault (done)

- The DMS screen called endpoints that did not exist; nothing on it worked.
  Vault "upload" stored a stock-photo URL ("Simulated Scan File URL");
  certificates printed "AltRix Academy" on every school's certificate and a
  "Digitally Signed" line whether or not anyone signed.
- Backend `documents.py`: families see only their children's documents and
  certificates (the vault exposed every student's CNIC/B-form to any user);
  vault writes and certificate issue/revoke are staff-only and limited to the
  school's own students (any user could issue, for any student id, any school);
  certificate numbers are sequential per school/type/year with a school tag
  and retry (were random and could collide); added delete, certificate types,
  certificate detail (with student particulars) and revoke; verification shows
  holder and school.
- `certificate.ts`: framed landscape certificate in the school's name and
  colours; wording per type built only from recorded facts (a sentence whose
  facts are missing is omitted); pronouns from recorded gender, neutral
  otherwise; number, date, signature line (named only if given), school seal,
  QR verification; revoked prints VOID.
- New DMS screen: real file upload to `student-documents` (signed links to
  open), categories, expiry alerts, issue → download, print / download /
  WhatsApp / revoke on issued certificates. Upload errors now carry the
  server's reason. `deliver.printBlob` is shared by hand-laid documents.

### Slice 10 — datesheets and admit cards (done)

- `components/datesheetPdf.ts` on the document system (same exported API, so
  the per-student upload flow is unchanged): letterhead and school colour,
  vector paper QRs via the new table `drawCell` hook, 12-hour times,
  readable durations, undated papers listed last with a note, portrait or
  landscape by column count, data-named file ("Grade 7 — Blue - Datesheet -
  Mid-Term Examination 2026.pdf"). Per-student labels no longer print
  "Ayesha null".
- `admit-card.ts`: one card per student, each its own document in one PDF —
  photo (or an "affix photograph" box), particulars, vector verify QR, the
  student's papers with an invigilator column, the school's rules wrapped to
  the page, signatures; Print and Download in the dialog. Removed the invented
  "Eduverse Academy" fallback name and "N/A" code; students ordered by roll.
- `format.ts`: bare YYYY-MM-DD dates are local calendar dates everywhere (they
  were parsed as UTC midnight and could print a day early west of UTC).

### Slice 11 — timetables (done)

- `documents/timetable.ts`: landscape weekly grid on the letterhead — periods
  with 12-hour times down the side, the school week across (Mon–Fri plus any
  day with lessons), subject / teacher-or-class / room per cell, shaded break
  rows, clashes printed with both lessons and reported, lessons on a deleted
  period reported. Teacher screen (`timetable-pdf.ts`, same exports) prints and
  downloads a real PDF (download used to save .html); the class timetable
  preview has Print / Download PDF / WhatsApp instead of printing the whole app.
- `table.ts` fix affecting every document: headings were measured after the
  pen was set, and measuring reset it — every table header in every PDF came
  out dark-on-colour and not bold. Bold cells are now measured in bold.
- `document.text`: a line that starts in Urdu is right-aligned automatically.

### Slice 12 — HR letters and the fee certificate (done)

- `documents/appointment-letter.ts`: letter of appointment from `hr_contracts`
  — reference and date, addressee, subject, terms table built only from terms
  the school set (no "As per offer letter" stand-in, no dashes), salary exact
  and in words, benefits/conditions/body as written (Urdu right-aligned),
  signatory and employee acceptance; terminated contracts watermarked
  CANCELLED with a note. Contracts screen: WhatsApp / Download PDF / Print.
  The on-screen preview uses the same terms and shows the school's name in its
  footer instead of "AltRix — Institute Operating System".
- Migration `20261027000000_hr_contract_reference_numbers.sql`: the form
  promised "Reference No. — auto if blank" but nothing assigned one. Now an
  atomic per-school, per-year sequence (HR-2026-0001), seeded past any typed
  number; existing contracts keep the HR-XXXXXXXX their letters were printed
  with; clearing it on edit keeps the issued one. Verified on Postgres: 320
  concurrent inserts contiguous and unique.
- Annual fee certificate (parents): backend always certified PKR 0 — it
  filtered status "completed" (payments are "success") and read a
  non-existent field inside a swallowed try. It also counted two calendar
  years per fiscal year and had no access control. Now: Pakistan fiscal year
  1 July–30 June, exact Decimal sum, JSON-safe itemised payments with invoice
  and period, finance office or the child's own family only, school NTN only
  from finance staff, repeat requests with an unchanged total return the
  existing certificate. `documents/fee-certificate.ts` replaces the .txt with
  a letterhead certificate (itemised table, total in words, signatures and
  stamp). Parent screen: WhatsApp / Print / Download.
- Parent online payment: JazzCash was sent a hard-coded "03001234567" and the
  returned checkout was never opened; other gateways showed "processed
  successfully (Simulation)". Now the parent enters their JazzCash number
  (validated, also server-side), the server charges the exact outstanding
  balance, the signed checkout is posted to JazzCash, and unconnected gateways
  say they are not available.
- HR PDF exports named after their data (Job Posting, Staff Directory, Staff
  Record).
- Verified: vitest 158/158, pytest 527/527, audit 138/138, TS errors 42 (none
  new).

### Slice 13 — lesson plans, progress reports, platform billing, file names (done)

- `documents/lesson-plan.ts` + `lib/lesson-plan-actions.ts`: both planners
  (`CurriculumPlannerAI`, `TeacherLessonPlannerModule`) drew "AltRix AI Lesson
  Plan" on a bare page with fixed line spacing and left out prior knowledge,
  materials, differentiation and homework. Now a letterhead plan: full topic,
  particulars, objectives, prior knowledge, materials, schedule table (header
  repeats), differentiation, homework, slide script, teacher and coordinator
  signatures. WhatsApp / Print / Download PDF on both screens; file named
  "Grade 7 — Blue - Science - <topic> - Lesson Plan - 22 Sept 2026.pdf".
- `documents/progress-report.ts`: the teacher's "REPORT CARD" .txt is now a
  Progress Report PDF (it is not the term report card and says so) — per
  student or the whole class in one PDF, attendance with rate, coursework with
  marks / % / grade and an average row. Percentages and averages are exact
  (`decimal.ts` gains `ratioPercent` and `mean`, BigInt, half away from zero);
  an unmarked piece is "Not marked", never 0, and a missing maximum is not
  assumed to be 100. Generation now checks every query's error (it used to
  report success over failures), excludes students who have left, and runs its
  queries in parallel. Class summary via `DataExportMenu` (branded Excel etc.).
- Platform billing (`PlatformBillingPage`): the receipt printed an invented
  bank, account number and IBAN unless overwritten, and the settings screen
  pre-filled those values. `lib/platform-brand.ts` treats the examples as
  unset (placeholders only); `documents/platform-invoice.ts` issues an Invoice
  (unpaid, with bank details only when real — otherwise a warning) or a Receipt
  (paid, PAID watermark), exact amount in words. WhatsApp / Print / Download.
- Data-named files: vouchers ("Ayesha Khan - Fee Voucher - September 2026 -
  CMS-2026-000412.pdf", `voucherFileName`) in the fee module, parent fees and
  the copilot; batch vouchers; official transcript; HR analytics; parent
  datesheet downloads.
- Verified: vitest 168/168, pytest 527/527, audit 138/138, TS errors 42.

### Slice 14 — timetable screens and exam seating (done)

- Parent, student and teacher timetable screens printed the whole app with
  `window.print()` (the teacher's "HTML" button saved a web page). New
  `components/timetable/TimetableDocumentActions.tsx` — WhatsApp / PDF / Print
  of the real grid via `documents/timetable.ts` — on all three.
- Exam seating was fabricated end to end: the staff screen showed invented
  halls and a plan of invented students when the server returned nothing,
  generated "Grade 9-A Candidate #3" placeholders itself, posted to an
  endpoint that did not exist and reported success; parents and students
  were all shown the same made-up seat ("Seat #A-1, Main Auditorium Hall A,
  Prof. Tariq Mahmood"). Backend generation compared a class id with a
  section id; the invigilator endpoint had no school or role check.
  - Migration `20261028000000_exam_seating_sessions.sql`: plans belong to an
    exam sitting (date, start time, label), legacy datesheet link optional;
    one student per seat, one seat per student per plan. Verified on Postgres.
  - `routers/exams.py`: academic staff only for writes (teachers may read),
    everything scoped to the caller's school; generation from current
    enrolments of the chosen sections, sections alternating seat by seat
    (`allocate_seats`, chessboard for 2+ sections), capacity check; delete
    hall / plan; add / remove invigilator; `GET /seating-plans/my` for a
    family's or student's own seats; list endpoint batched (no N+1) with
    section labels, seat labels ("B-3") and invigilator names.
  - `documents/seating-plan.ts`: door sheet per hall — sitting particulars,
    the hall drawn desk by desk facing the front, roll-ordered attendance
    list with signature column; one or all halls in one PDF.
  - Staff screen rewritten on real data (halls, generate, plans by exam, hall
    layout, invigilators, WhatsApp / PDF / Print door sheet); parent and
    student screens show the real allocated seats or say none yet
    (`components/exams/MySeatsView.tsx`).
- Verified: vitest 170/170, pytest 534/534 (one unreproduced flaky failure
  seen once in a full run; three reruns clean), audit 138/138, TS errors 42.

### Slice 15 — visitor passes, expense vouchers, owner insights, financial report (done)

- `documents/visitor-pass.ts` (A5, letterhead, pass code large and as a QR
  the gate console scans, phone masked to last four digits) replaces three
  HTML pop-ups — gate badge, parent pre-registration pass (headed "ALTRIX
  ACADEMY" whatever the school), public self-registration ticket (default
  school name "AltRix Academy"). Visitor names no longer go into HTML. Print /
  Download / WhatsApp on all three (`lib/visitor-pass-actions.ts`).
- `routers/visitors.py`: public registration claimed "SMS Alert dispatched",
  "WhatsApp Message sent" and "Email Confirmation sent" and sent nothing.
  Now it queues a real confirmation email when an address is given
  (HTML-escaped) and reports only that — queued or failed; the page says so.
- `documents/expense-voucher.ts`: A5 payment voucher (PV-number, particulars,
  amount exact and in words, prepared / authorised / received) replaces the
  expense pop-up; the expense register's "Print Report" pop-up now prints
  through the branded report engine with its filters listed.
- Owner insights: the endpoint read fields that do not exist and always
  failed, so the screen always showed invented figures (1,250,000 revenue,
  240 students, 94% attendance, 88% satisfaction, named "faculty", a
  "provincial average", AI "directives" citing +14% / +18%); the endpoint
  itself invented teachers, a sentiment, a response count and benchmark
  scores, and counted failed payments as revenue. Rewritten: fees collected
  per calendar month (successful payments, exact), projection only with 3+
  months of history, admissions per month and current roll, teachers by
  tenure from joining date (by name), parent-message tone by a stated keyword
  rule with the real count, and the school's own rates (fee recovery this
  FY, attendance last 30 days, messages resolved); no outside benchmark is
  claimed. SQL checked on Postgres. Dashboard rewritten on it; directives are
  derived from the figures and say why; "Print Board Packet" is a branded
  report (PDF / Excel / Print / WhatsApp) instead of `window.print()`.
- Financial report (accountant): revenue counted failed payments and summed
  floats; the print button opened an HTML pop-up and toasted success
  regardless. Now successful payments only, exact sums, printed through the
  branded report engine with a real outcome.
- Payments: `_new_txn_ref` had 24 random bits per second — about a 1-in-8
  chance of a duplicate JazzCash reference when 2,000 payments start in one
  second (the occasional test failure). Now date + 12 base-36 characters
  (62 bits), 19 characters; the test checks 20,000.
- Verified: vitest 173/173, pytest 539/539 (twice), audit 138/138, TS errors 42.

### Slice 16 — exports on the data screens, and what they exposed (done)

Branded Excel / PDF / Print / WhatsApp / CSV (`DataExportMenu`) added to:
student / staff / lead directory (exports every match via `loadRows`, not
just the page), finance (fee plans, payment methods, invoices, payments,
expenses), accountant fee ledger, a teacher's performance report (4 tabs),
users and invitations, transport (routes, fleet, passengers), staff appraisal
(scorecard, improvement plans), student wellbeing (infirmary, immunisations,
incidents, medical contacts), accountant salaries, HR payroll runs, hostel
rooms and mess menu, alumni directory and events, admission applications,
student's own results and attendance, parent's view of a child's results and
attendance, teacher's class roll, attendance sheet, assignments and
assignment results, marketing pipeline / sources / campaign yield.

Fixed along the way:
- Hostel router: allocation found a room by id alone (any school's user
  could house a student in another school's room); every write was open to
  any signed-in user; callers without a school wrote under an all-zero id.
  Now school-scoped, staff-only writes, student must belong to the school,
  room row locked while occupancy changes, no double allocation. The screen
  no longer claims parents get an automatic 10 PM SMS (nothing sends one).
- Parent results showed a missing mark as 0% (`Math.round(null / max)`); now
  "Not marked" / "—", percentages exact (`ratioPercent`) here and on the
  student's own results.
- Staff appraisal showed "Teacher ID: 3f9a2c1b" — now staff names.
- Amounts on finance, payroll and marketing screens printed through
  `toLocaleString` (dropping paisa) or with a `$` sign; now exact, in PKR.
  Campaign cost per lead with no leads was shown as 0; now "—".
- Two small type errors (button size "xs", badge variant "soft").
- Also: owner wellbeing / compliance, platform directory / schools /
  audit log, marketing sources / calls / follow-ups, student roster card.
  Teacher attendance "Load" passed the click event as the period label.
- Verified: vitest 173/173, pytest 543/543, audit 138/138, TS errors 39.

### Slice 17 — migrations reach production; VPS-only deployment (done)

- The deploy ran only `app.db_bootstrap`; nothing applied SQL migrations on
  the VPS. `backend/app/sql_migrations.py` applies an explicit ordered list,
  once each, recorded in `public.app_sql_migrations` (name + checksum); a
  failure raises and stops the deploy before containers are replaced. Called
  from `python -m app.db_bootstrap`. It connects with the engine's own URL
  (which rewrites the Docker gateway address to 127.0.0.1 on the VPS).
- The four VPS migrations now live in `backend/sql_migrations/` — inside the
  `backend/` build context the deploy uses (`-f backend/Dockerfile backend/`),
  so they are in the image. The hardening migration's 67 index statements
  check their table and column exist first.
- `backend/.dockerignore` (new): no `.env` or tests in the image.
  `backend/Dockerfile` installs `postgresql-client-17` (server is 17) so the
  backup feature's pg_dump works in production.
- Railway and Vercel removed from the app: `railway.json`, `.railwayignore`,
  `backend/railway.json`, `vercel.json`, `.vercelignore`, the Railway env
  example, their CORS origins, and the `vercel.app` host special case. The
  CSP that only the Vercel config carried is now in `scripts/nginx_altrix.conf`
  (the audit checks it there).
- VPS: `/opt/altrix/scripts/deploy.sh` was root-owned, so the auto-deploy
  daemon (user altrixadmin) could never install a newer script and every
  deploy ran the 25 Aug version — no migrations, uploads not on persistent
  storage (lost on each deploy), docker.sock mounted into the backend.
  Ownership fixed (old copy kept as deploy.sh.pre-20260919); the next deploy
  installs the repo script. A pre-migration database dump was taken:
  /var/backups/altrix-predeploy/altrix-pre-migration-20260919-123148.dump.
- Verified: pytest 546/546, audit 138/138; runner tested on Postgres
  (applies all four on a sparse schema, re-run no-op, failure rolls back).

### Slice 18 — Fees Centre: one job per tab, real numbers (done)

Plan approved on 2026-09-22 (see `docs/PLAN-principal-shell-upgrade.md`).

- **The mixup, in code.** `module-registry.tsx` pointed *three* sidebar tabs —
  Fees Center, Fee Configurations, Finance & Cashflow — at the same
  `FeesUnifiedModule`, while `TenantDashboard` gave two of them different
  components again, so the same tab meant different screens in different
  shells. Inside, three vague labels ("Billing Structures", "Advanced
  Operations", "Vouchers & Proofs") held five jobs, and payments, expenses,
  gateways and discounts each appeared in two or three places.
- `src/pages/tenant/modules/fees/FeesCentreModule.tsx` (new) gives each job one
  home, in the order the office works: Collection Board → Fee Structure →
  Student Ledger → Billing Run → Collections → Defaulters & Reminders. The old
  deep links (`?tab=plans|advanced|vouchers`) map onto the new tabs, and
  `FeesUnifiedModule` is now a re-export so every shell keeps working.
  Nothing was deleted: the old modules render inside the tab that owns them
  (new `section` props on `FeesAdvancedModule` and `FeeVouchersModule` hide
  only their own heading and tab strip), and Invoices / Payments / Expenses /
  Configurations are linked, not duplicated.
- `GET /finance/collection-board` (new): billed, collected, outstanding, aging
  0–30/31–60/61–90/90+, daily collection, by method, class by class and the
  ten largest debts. `/finance/reports/summary` could not be its source — it
  called an invoice "collected" when its *status* said paid (so a half-paid
  invoice counted as nothing), returned floats, and ignored from_date/to_date.
  Money now comes from the payments actually received, stays in NUMERIC, and
  leaves as exact strings. A rate with nothing to divide by is null, not 0%.
- `GET /finance/defaulters` (new): one row per family with balance, age,
  contact, last payment, and both the notice the ladder has *earned* and the
  one actually *sent*. Its first draft joined `fee_payments`, which multiplied
  each invoice row by that student's payments and reported balances two and
  three times too large; the aggregates are subqueries now (verified against
  production: 5,500 per family, not 11,000).
- **The escalation ladder had never raised a notice.** `check_escalations`
  selected `status in ("unpaid","partial")` — "unpaid" is not a value of that
  enum, so Postgres rejected the statement on every call — and then read
  `v.amount`, which the model does not map. It now selects genuinely overdue
  invoices, computes the balance in Decimal, and closes notices for invoices
  since settled. `list_escalations` and `resolve_escalation` were open to any
  authenticated user; both are now finance-only, and resolve is scoped to the
  caller's own school.
- Collection Board and Defaulters Board both carry `DataExportMenu`
  (Excel / PDF / Print / WhatsApp / CSV) and honest empty, loading and error
  states. The WhatsApp reminder says WhatsApp was opened — it does not claim
  the parent was messaged.
- Verified: backend 51 new assertions in `test_collection_board.py` and
  `test_fee_defaulters.py`, all SQL run against the production database
  read-only, vitest `fees-centre.test.ts` 5/5, tsc clean.

### Slice 19 — no family is billed twice for the same period (done)

- **The double billing was real.** Production held three June invoices and two
  July invoices for one student, and a second "Voucher August 2026" for another
  whose first copy was already paid. Every copy counted as money owed, so the
  defaulters list, the aging buckets and each total built on them were wrong.
  `generate_fee_voucher` had no duplicate check at all, so re-running a class
  billing re-billed everyone in it.
- `backend/sql_migrations/20260922000000_fee_voucher_duplicate_guard.sql`
  (new) replaces the function with one that refuses a second live voucher for
  the same student, plan and period, raising `duplicate_voucher` with SQLSTATE
  23505. The guard sits in the database because that is the one place every
  caller passes through. A deliberate re-issue passes the new
  `_allow_duplicate` argument; the old 10-argument function is dropped so a
  10-argument call cannot resolve to the unguarded version. Dry-run against the
  production schema inside a rolled-back transaction: DROP, CREATE, ROLLBACK.
- Billing Run now says so before it runs: a banner names how many of the
  selected students already hold a voucher for that period, skips them by
  default, and only re-bills when the office switches "Bill them again on".
  A skipped student is reported as skipped, in amber — not as a failure.
- `GET /finance/duplicate-invoices` (new) lists the pairs that already exist;
  the Billing Run tab shows them with the amount they add to what families
  appear to owe. Nothing is cancelled automatically — which copy goes is the
  school's decision — and a copy with money paid against it cannot be
  cancelled from here at all.
- `PATCH /finance/vouchers/{id}/cancel` was open: the id alone was enough, so
  any signed-in user of any school could cancel any invoice, with no role
  check, no reason, and no regard for payments already received. It is now
  finance-only, scoped to the caller's school, requires a reason that is
  written onto the invoice, and refuses a voucher with a paid amount (409).
- Verified: pytest 616/616 (new `test_fee_duplicates.py`), migration order and
  idempotency contract honoured, tsc unchanged at 36 pre-existing errors
  (none in the new code).

### Slice 20 — the student ledger, and the parent's balance (done)

- **`/finance/balance-dashboard/{student}` could never have answered.** It
  summed `FeeVoucher.amount`, a column the model does not map, so the request
  raised; it filtered invoices on `status in ("unpaid","partial")` — "unpaid"
  is not a value of that enum; it counted payments with status "completed"
  while payments are recorded as "success"; and it compared the `due_date`
  column against a formatted string. `ParentFeesModule` caught the error into
  `console.error` and rendered zeros, so a family could not tell "nothing is
  owed" from "nothing could be loaded".
- Rewritten on real rows: every voucher with its concessions, charge, paid and
  balance; every payment, including failed and refunded ones marked as not
  counted rather than hidden; billed / paid / outstanding / advance / overdue
  totals added in Decimal and returned as exact strings. The field names the
  parent screen already read (`total_due`, `total_paid`, `overdue_amount`,
  `active_escalations`) are kept, now carrying real numbers.
- Access was school-wide — any signed-in user of the school could read any
  child's balance. It now uses the same rule as the tax certificate, renamed
  `_require_student_fee_access` since it guards both: the finance office for
  any student of the school, a family for its own.
- `src/pages/tenant/modules/fees/StudentLedger.tsx` (new) is the Student
  Ledger tab's first screen: search a child, see the full ledger, export it.
  The plan-assignment screen sits below it, unchanged.
- The parent screen now shows what went wrong, with a Try again button,
  instead of silently showing zeros.
- Verified: pytest 626/626 (new `test_student_fee_ledger.py`), all three
  ledger queries run against the production database read-only.

### Slice 21 — a report card that comes out on one sheet (done)

- **The single card was still a screenshot.** `ReportCardModule` exported it
  with `exportCleanDocumentToPdf`, a DOM capture of the on-screen HTML, while
  the vector builder in `src/lib/documents/report-card.ts` was used only for
  the class-set archive. So the print was a picture of a web page — letterhead,
  Urdu, verification code and page count were whatever the browser rendered —
  and a long card simply spilled onto a second sheet. Download, Print and
  Share now all go through the vector builder, and so does the class set.
- **Measured, not assumed.** A probe across densities showed the comfortable
  layout needed two sheets from twelve subjects upward, and that a landscape
  sheet made it *worse* (wider, but 87mm shorter). What actually buys the room
  is setting the subjects in two columns.
- `PdfDocument.inBand(x, width, draw)` (new) narrows the content box for the
  duration of a callback, so any document can lay part of itself out in a
  column. The report card uses it for a two-column subject table; a card that
  carries a per-subject comment stays in one column, because a comment needs
  the width.
- `buildFittedReportCard` tries, at each of five densities, one column then
  two, and stops at the first layout that is a single page — so it keeps the
  largest type that fits. **Nothing is ever dropped to make room**: a mark that
  is not printed is a mark the family never sees. In two-column mode headings
  are abbreviated rather than cut off ("Mks", "Gr", "Pos"), and when every
  subject is marked out of the same number that column is replaced by one line
  above the table.
- A twenty-subject card now prints on one page at 0.92 density in two columns;
  a sixteen-subject card with a comment on every subject fits in one column by
  tightening. Where even the tightest legible layout needs two sheets, the
  result says so and the screen repeats it — it never claims one page.
- **The school is asked once.** New `report_card_settings` table (migration
  `20260922010000`), `src/lib/report-card-settings.ts` and a setup dialog that
  offers every option — what to do when a card will not fit (tighten /
  landscape / two pages), which optional sections to print, and the style. The
  answer is stored against the school and applied to every later card without
  asking again; Print settings on the Report Cards screen changes it. A failed
  settings read is reported rather than silently treated as "never asked",
  which would have overwritten the school's own choice.
- Printing now requires a saved card, as a voucher does: what is printed is
  what the school has recorded.
- Verified: vitest 10/10 on the report card (including real page counts for
  16, 20 and 22 subject cards), 8/8 on the settings store, 127/127 across the
  document library, one card rendered and inspected at 110 dpi.

### Slice 22 — the AI Copilot answers, or says it cannot (done)

- **It was asking for a model the server does not have.** The configured name
  was `glm-5.3`; the VPS has `qwen2.5:1.5b`. Every message walked a hard-coded
  list of eleven names, taking a 404 from Ollama for each, before reaching the
  one that exists — seconds of round trips before a single token, on every
  turn. `ai_service.py` now reads `/api/tags`, caches it for five minutes, and
  only ever requests a model the server reports having.
- **It ignored the cloud settings it already had.** `AI_PROVIDER`,
  `AI_API_KEY` and `AI_API_BASE` were in the config and in production.env, and
  nothing read them. There is now a provider layer: an OpenAI-compatible cloud
  (GLM/Z.ai, Zhipu, OpenRouter, Groq, DeepSeek, OpenAI) when a key is
  configured, the school's own server otherwise, and the local model as the
  fallback when the cloud refuses — the case a school hits the day a
  subscription lapses.
  **The key currently in production.env is rejected by both api.z.ai and
  open.bigmodel.cn with HTTP 401, so it must be replaced before the cloud path
  can be switched on.**
- `num_predict` was 512, which cut tables and lists off mid-row; answers now
  have 1024 tokens of room.
- **A failure is reported as a failure.** The service used to emit a cheerful
  notice as though the assistant were speaking, and the screen had its own
  cheerful fallback — "👋 I am currently processing your request" plus three
  hard-coded links — so a user could not tell a working Copilot from a broken
  one. The stream now carries an `error` event, the screen shows it, and
  `GET /ai/health` says up front which provider is reachable and which local
  models exist. When nothing can answer, the panel says so above the input.
- **Tokens were being dropped.** The reader split each network chunk on
  newlines with no carry, so an event that straddled a chunk boundary was lost.
  The tail is now buffered into the next read.
- **The prompt was too big for the model.** The context builder can assemble a
  hundred students, fifty invoices, fifty staff and twenty-five payments into
  one prompt; a 32k window cannot hold that with the question, so the evidence
  fell off the end. `trim_ai_context` caps it at 16,000 characters, cuts on a
  section boundary (never mid-table), keeps the sections nearest the question,
  and tells the model that some were left out rather than letting it imply it
  saw everything.
- The semantic cache was left off. It is disabled deliberately — the Copilot
  answers from live ERP data, and a cached fee balance is a wrong fee balance.
- Verified: pytest 636/636, including new assertions that only an installed
  model is requested, that the cloud is used only when a key is configured,
  and that an unreachable model produces an error event with no `delta`.

### Slice 23 — the principal's dashboard shows what was measured (done)

- **`/reports/dashboard` raised on every call.** Four queries filtered
  `fee_payments` with `status IN ('success','paid','completed')`; that enum
  holds only pending/success/failed/refunded, and Postgres rejects the whole
  statement on the first unknown label. So the KPI endpoint, the finance trend
  and anything built on them returned nothing — which is why `PrincipalHome`
  kept a `sessionStorage` copy of the numbers and guarded every render with
  `hasRealData`. Fixed in all four places; the query now returns the school's
  real figures (9 students, 5 teachers, PKR 108,900 collected year to date on
  the live database).
- **Every sparkline was invented from the number under it.** `openLeads - 6,
  -4, -5, -3, -2, -1`; an attendance rate wobbled by ±3; a class count
  repeated seven times; and `staffAttendanceRate = 96`, a literal constant. A
  line nobody measured is worse than no line, because it is read as evidence.
- `GET /reports/daily-series` (new) counts what can be counted, one row per
  day over the last 30: student attendance rate, staff attendance rate,
  collections and new leads. A day nobody marked attendance returns `null`,
  not zero, and the chart simply has no point there. All four queries verified
  against the production database.
- Classes and pending leaves have no history to draw — they are positions, not
  trends — so those two cards now say what they are instead of drawing a made-up
  line. An attendance rate with nothing recorded shows "—", not a number.
- Two audit gates added so neither can come back: "no dashboard line is
  invented from the number under it" and "payment queries ask for a status the
  enum actually has", along with gates for the Fees Centre, the duplicate
  guard, the voucher cancel rules, single-page report cards, the stored print
  settings and the Copilot's model and error handling — 149 checks in total.

### Slice 24 — the sweep: screens that were asking for columns that do not exist (done)

Rather than polish tab by tab, the whole codebase was checked against the
production schema — every enum filter, every `Model.attribute`, every raw SQL
statement and every `api.from(...).select(...)`. A query that names a column
the table does not have is rejected outright, so the screen shows an empty
list and nothing in the console explains it. That is what "basic" or "not
working" looked like on several tabs.

- **Public Admissions Portal — never worked at all.** Both halves were written
  against fields the model does not have (`applicant_name`, `guardian_name`,
  `guardian_phone`, `guardian_email`, `target_class`, `application_number`), so
  constructing the row raised a TypeError before it reached the database, and
  the status lookup raised on `AdmissionApplication.application_number`. An
  applicant got a 500 whether they applied or checked. It also wrote
  `status="pending"`, which that enum does not hold. Rewritten on the real
  columns: the name is split across first/last, guardian details go to
  `parent_*`, the class is matched by name (and recorded in the notes when the
  school has no class of that name), and the tracking code is a unique
  `registration_number`. The status lookup answers only what the applicant
  may see — their own name, class and stage — never the office's notes.
- **AI Board Insights** — its revenue query asked for
  `status IN ('success','completed','paid')`, so the monthly revenue line
  never loaded. The test that covered it asserted the broken filter, pinning
  the bug in place; both are corrected.
- **Activity timeline** — asked `students.admission_number` and
  `crm_leads.student_name` / `parent_name`. None of the three exist.
- **Global search (Ctrl+K)** — the same two, plus
  `inventory_items.category` / `sku` (they are `category_name` and
  `sku_barcode`). Students, leads and inventory were silently unsearchable.
- **Event timeline hook** — `school_memberships.full_name` / `role_name`, and
  the same students and leads columns.
- **Library** — the borrower list selected `students.class_name` and
  `section`; the class comes from the enrolled section, embedded now.
- **Messages** — sender names were looked up by `profiles.user_id`; that table
  keys on `id`, so no name ever resolved.
- **Support inbox** — the student notification read `students.user_id`; the
  link is `profile_id`, so a reply never reached the student.
- **Parent linking, platform support, platform requests** — `profiles.full_name`
  and `profiles.user_id` again; parents showed as their email address and the
  platform lists showed no requester.
- **Platform directory** — selected `id` and `created_at` from
  `school_user_directory`, a view with neither.
- Verified: pytest 648/648 including a new `test_public_admissions.py`, tsc
  unchanged at its 36-error baseline (the two LibraryModule errors pre-date
  this work), and every corrected query checked against the live schema.
- Also in the sweep: the owner HR pay-run trend ordered `hr_pay_runs` by
  `year` and `month` — a table dated by `period_start`, with neither column —
  so the query failed and the chart was empty even before the grouping, which
  read the same two missing fields. Messages looked the current user's own
  display name up by `profiles.user_id` as well.

### Slice 25 — what the live site showed after the deploy (done)

Four faults, found from the browser console on production:

- **Every report card detail request answered 500.**
  `report_cards.trend_data` defaults to `'{}'::jsonb` — an empty JSON
  *object* — while `ReportCardOut` declares a list, so pydantic refused all
  seven cards in the database. Download, Print and Share were therefore all
  dead on the Report Cards screen regardless of the new builder. The field now
  accepts what is stored: an empty object becomes an empty series, a mapping
  of term to percentage becomes the series it describes, and anything unusable
  becomes an empty series rather than an error — a missing trend chart must
  never cost a family its report card.
- **`/reports/daily-series` answered 503.** It bound `days` as an integer into
  `(:days || ' days')::interval`; asyncpg types a parameter from where it is
  used, wanted text and got an int. `make_interval(days => :days)` takes the
  integer.
- **`/events/timeline` called `resolve_effective_school_id` with its arguments
  reversed** — `(db, request, current_user, school_id)` — so the helper tried
  to run a query on a string. Pre-existing; visible now that the queries
  around it work.
- **A crash in any principal module produced a white screen.** The accountant
  shell wraps every route in `ModuleErrorBoundary`; the principal's tenant
  shell wrapped none, so one bad render blanked the whole page and left only a
  minified React error in the console — which is exactly what `/admin-fees`
  showed. The shell now wraps its routes in the boundary, named after the tab
  the crash happened on.
- **The dashboard tripped its own rate limit.** `rate_limit_api` was
  100/minute per signed-in user, and one principal dashboard load costs well
  over that (the prefetch alone fans out across a dozen tables), so the first
  load answered 429 and came up empty. Raised to 600/minute; login and
  password reset keep their own much tighter limits, which is where brute
  force actually matters.

### Slice 26 — the printed card's marks, and five writes that never landed (done)

- **Every report card printed without its marks.**
  `report_card_subject_entries` held **no rows at all**, for any school: the
  Report Cards screen saved the card header and the exam results but never the
  per-subject lines, and the printed card reads exactly those lines. So a card
  came off the printer complete — letterhead, tiles, remarks, signatures — with
  "No subject results have been recorded on this card" where the subjects
  should be.
  New `PUT /report-cards/{id}/subject-entries` records them (the table has no
  `school_id`, so the data proxy rightly refuses to write it; the scoping comes
  from the card's own school). Saving a card now writes its lines, and a
  subject with no mark is still written with null marks — a blank mark means
  "not recorded", and leaving the row out would drop the subject from the
  child's card. If the lines fail to save, the toast says the printed card will
  be missing its subjects instead of reporting a clean save.
  Migration `20260922020000` rebuilds the lines for the cards that already
  exist, from the exam results they were computed from, so nobody has to
  re-save seven cards (verified on production: all 7 cards, 27 lines). It also
  gives the table's `id` the default it never had — only the ORM could insert
  there before.
- **Five writes named columns that do not exist**, so each was rejected:
  `app_notifications.created_by` (twice — every in-app message notification
  failed), `hr_leave_requests.created_by` (the offline leave queue),
  `academic_assessments.teacher_user_id` (a teacher could not create an
  assessment; the column is `created_by`), and
  `admission_application_documents.doc_type` (every uploaded admission document
  failed to record; it now stores the file's MIME type, which the table does
  have).
- **The platform billing page had nowhere to save.** It writes `plan_tier`,
  `billing_cycle`, `billing_amount` and `billing_email` onto `schools`; none of
  the four existed. Changing a plan either failed or — when the page decided
  the schema was "not applied" — was written to **localStorage**, which is not
  a saved plan: it lives in one browser and no invoice or renewal can see it.
  Migration `20260922030000` adds the columns; the localStorage branch now
  raises instead of pretending.

### Slice 27 — seven report card designs, seven ID card designs, and promotions (done)

- **The report card design setting did nothing.** `template` was stored and the
  builder ignored it, so "classic", "modern" and "minimal" printed the same
  card. There are now seven finished designs in
  `src/lib/documents/report-card-templates.ts` — Classic, Modern, Minimal,
  Crest, Ledger, Bulletin, Heritage — and each changes the whole look together:
  the heading style (ruled, banded, side-ruled or letter-spaced), the headline
  figures (filled, outlined or a single strip over a rule), the table (accent
  head, zebra, row rules, frame) and the page border (none, hairline, double,
  or a colour band across the head). All seven were rendered and checked: each
  fits one page at full density with seven subjects, and the setup dialog shows
  a drawn miniature of each so the choice is made by eye. Migration
  `20260922040000` widens the check constraint that would have rejected the
  four new names.
- **ID cards** gained Crest, Ribbon and Corporate alongside the four that
  existed, and the picker now describes each in a line rather than naming a CSS
  effect.
- **Promotions — the whole thing was missing.** There was no academic year:
  `student_enrollments` held a section and two dates, `grade_level` was null
  for every class in production, and nothing recorded that a child had been
  promoted, retained or graduated. A school had to re-enrol every student by
  hand at the end of the year.
  Migration `20260922050000` adds `academic_sessions` (one current per school,
  enforced by a partial unique index), a `session_id` on sections and
  enrolments, `next_class_id` for schools whose progression is not simply the
  next number, and `student_promotions` — one row per child per year with the
  outcome, the result it rested on, who decided it and a batch id. It backfills
  `grade_level` from class names ("Class 7" → 7) only where a school had not
  set it, gives every school a current session, and attaches existing sections
  and open enrolments to it.
  `backend/app/routers/promotions.py` is preview → run → undo: the preview
  proposes an outcome for every child **from the records only** (at or above
  the pass mark → up; below → stay; no annual result → stay, and it says so;
  top of the school → leaving) and changes nothing; the run closes the old
  enrolment, opens the new one, records the decision, and **carries each
  section's teachers into its successor** — but never over a class the
  principal has already staffed; undo reverses a whole batch and reopens the
  old enrolments.
  The Promotions tab is a review, not a button: every child, their result, the
  proposal, the reason, and an override on each row. A student with nowhere to
  move into is named rather than moved.
- Verified: 26 new promotion assertions, migration dry-run on production
  (sessions created, Class 1/2/3 → grade 1/2/3, 6 sections attached), tsc clean.

### Slice 28 — the connections nobody could see (done)

Ran the school's data through an integrity pass against production. Tenant
isolation is clean — no enrolment, report card, invoice or attendance row
belongs to another school. What it did find were connections that simply do
not exist, and which nothing in the app ever mentioned:

- 1 student in **no class at all** (absent from every class list, attendance
  register and report card run)
- 1 student with **two open enrolments** — in two classes at once, which is
  enough to double them in class lists, let attendance be taken twice, make the
  report card's class line depend on read order, and confuse a promotion run
- 6 students with no account, 10 with **no guardian linked** (their parent signs
  in and sees nothing), 1 section with no teacher

Migration `20260922060000` closes the older of each duplicate open enrolment —
closes, not deletes, because an enrolment records where a child actually sat —
and adds a partial unique index so a student can only have one open enrolment
from now on. Verified on production data: the duplicate resolves and the index
builds.

`GET /reports/data-health` runs the four checks that cannot be fixed
automatically and **names the people**, and the principal's dashboard shows
them in a card that links to the tab where each is fixed. It appears only when
there is something to say.

### Slice 29 — real samples in the pickers, and the shell's premium kit (in progress)

- **Choosing a design showed nothing.** The ID card settings screen previewed
  a card by re-drawing it in HTML, and that drawing **ignored `design_style`
  entirely** — so picking a design changed a database column and nothing a
  principal could see; only the printed PDF differed, which is the one place
  they could not check before committing. The report card picker had the same
  shape of problem: a schematic, not the card.
  `buildIdCardPreview` draws one card on a card-sized page with the real
  builder, and `PdfSamplePreview` shows any built document in the page itself.
  Both pickers are now galleries of **the real document**: seven report cards
  and seven ID cards, each built by the same code that prints, on the school's
  own letterhead, with the chosen one marked. The per-student Preview Card
  modal and the big live preview show the real card too, front and back.
  Samples use a clearly fictional pupil — a design gallery is not a place for
  a real child's marks or photograph.
- **The premium kit.** Sixty screens each solved "no heading", "empty looks
  like broken", "blank flash while loading" and "a failure with nothing on
  screen" in their own way, or not at all. `src/components/tenant/module-kit.tsx`
  holds the shared answers — `ModuleHeader`, `StatTiles`, `PanelCard`,
  `EmptyState`, `LoadingRows`, `ErrorState` — so a module is premium by using
  them, and the next module looks like it belongs beside it.
  A scan scored all 62 principal modules against those five; the work is being
  done worst-first.
- **Applied so far**: Offboarding, Leads, At-Risk Students, Budget Simulator,
  Support, Parent Notes (all opened with no heading at all — several were
  indistinguishable from the tab beside them), Attendance Heatmap and Fee
  Configurations.
- The heatmap's banner announced "Live Security Feed", "Centroid Lock:
  Verified", "Geofence Max: 100m Radius" and "WS Sync: Active" as fixed text.
  Nothing measured any of them. A banner that reports a status it never checked
  is worse than no banner; it now says what the map actually shows.
- Fee Configurations swallowed its own load failure — `catch { setDiscounts([]) }`
  — so a permissions error and a school that had configured nothing looked
  identical. It reports now, and its three figures say what each means when the
  count is zero.

## The report card, redesigned (23 Sep 2026)

Three complaints, all of them fair.

**"Yeh chiz footer se hatao."** Every card carried
`Beacon International School · Nauman Ellahi` on the left and `Page 1 of 1` on
the right, ruled off with a hairline. On a one-page document a family keeps,
that is noise: the school is already on the letterhead and the child's name is
the largest thing on the sheet. `DocumentOptions.footerStyle` now takes
`standard` / `minimal` / `none`; the report card asks for `minimal`, which
prints the issue note alone and brings the page count back only when there is a
second sheet to lose. Nothing else changed — a payslip run still numbers every
page, because a stack of those does get separated.

**"Designs ek doosre se bilkul different hon."** The seven were one layout with
seven colour schemes — a fair description of what they were. Each now has its
own page architecture, in `report-card-templates.ts` under `layout`:

| id | name | the page |
| --- | --- | --- |
| `classic` | Classic | particulars across the top, coloured table head |
| `modern` | Rail | a tinted rail down the left holds the photo, particulars and figures; marks run beside it; grades set in chips |
| `minimal` | Minimal | hairlines only, figures on one ruled strip |
| `crest` | Crest | centred, particulars on dot leaders, double border, a place for the school's seal |
| `ledger` | Register | particulars as a bordered form, marks in a full ruled grid |
| `bulletin` | Nameplate | a deep band with the name and result reversed out, and a bar per subject against the class average |
| `heritage` | Heritage | double border with ruled corners, serif throughout, particulars in a tinted panel |

The ids are unchanged, so a school that already chose one keeps its choice.

What the conventions came from, rather than invention: the particulars are a
block set apart from the marks; the grading key prints on the card, because a
grade nobody can interpret is not a report; the narrative gets its own block
and real width; the signature lines sit at the foot where a pen expects them.

**"Page mein white space nahi honi chahiye."** A card with three subjects
stopped a third of the way down. `buildFittedReportCard` now opens a card up
before it ever tightens one — densities above 1 are tried first and the largest
that still comes out on one sheet wins — then measures what is left over
(`ReportCardResult.slack`) and rebuilds with that slack handed back, repeating
until it closes. The slack goes where a printed card puts it: taller ruled
result rows (`TableOptions.minRowHeight`, with the text centred in the row),
more generous particulars and figures, air between the blocks, and the
signature block anchored to the foot of the sheet. A three-subject card went
from 96mm of empty page to under 10mm. Nothing is dropped at any density, and
nothing is invented to fill: the page is opened, never padded.

Checked by looking at them — all seven rendered to PNG and read, which is what
turned up the rest: column headings cut to "Ma…", "Gr…" and "Against the cl…"
in any narrow band (headings now shorten by the width they have, not by whether
the subjects were halved); a bold total wrapping "85.4 %" onto two lines; an
attendance figure losing the word "days" off the end (figures shrink to fit
now, never truncate); two of three term bars drawn as hollow outlines under
gridlines running the whole page; a footer reading "Issued —" where the school
never recorded a publication date; and the overall grade vanishing from the
totals line of the Rail design, because a drawn cell is skipped on an emphasis
row.

## The shell pass, and what it turned up (23 Sep 2026)

Going through every module the principal can open, worst-first, against five
things: a heading that says what the tab is, a state for an empty list, a
skeleton while it loads, something on screen when it fails, and a way to get
the records out. `QueryState` joins the kit — loading, failure and empty in one
component, so a retrofit is five lines rather than twenty, and a failed query
can no longer be drawn as an empty table.

**Done so far**: Cash Ledger, Tax Centre, Assets & Inventory, Contracts, Events
& Sports, Academic structure — plus the earlier batch (Offboarding, Leads,
At-Risk, Budget Simulator, Support, Parent Notes, Attendance Heatmap, Fee
Configurations, Vendors).

What the pass found, beyond the design:

- **Events shipped an invented school.** Two hard-coded events — a sports gala
  with 48 RSVPs and 12 photos, a PTM with 92 — under stock Unsplash
  photographs; a gallery captioned "Relay Race 100m Sprint"; a leaderboard
  giving "Red Jinnah House" 50 points and first place; a planning checklist
  already ticked. `loadEvents` caught its own failure with the comment "keep
  initial fallback list", so a school whose events could not be read was shown
  these as its own calendar. All of it deleted.
- **The parent photo gallery did the same**, with the comment `MOCK DATA
  FALLBACK for aesthetic demonstration`: three invented albums, including a
  Milad that never happened, shown to families whose school had uploaded
  nothing. Deleted; an empty gallery now says it is empty.
- **The gate camera was a stock portrait.** "Capture Gate Photo" set an
  Unsplash headshot and toasted "Live gate photo captured!", and that URL was
  posted to `/visitors/{id}/checkin` as `photo_url` — a stranger's photograph
  written into the school's visitor log as the person who came through the
  gate. It now opens the real device camera, and says so plainly when there is
  none or permission is refused; a visitor with no photograph is recorded
  without one.
- **Inventory reported a refused write as a success.** A rejected stock
  adjustment was caught, applied to local state, and announced with
  `toast.success("Stock recorded")`; the figure reverted on the next refresh.
- **Academic had no `catch` at all** around eleven parallel queries called as
  `void refresh()` — one rejection left an unhandled promise and a screen of
  five zeros, so a school with a thousand students looked like a school with
  none.
- **Cash Ledger and Tax Centre rounded money to whole rupees.** A running
  balance column that cannot be added up is not a ledger, and a liability
  rounded to rupees is not the liability.

## Saving a termly or annual card (23 Sep 2026)

Reported from production:

    there is no unique or exclusion constraint matching the ON CONFLICT
    specification

`report_cards_period_unique` is the index the statement asked for, but it is
**partial** — `UNIQUE (school_id, student_id, period_type, period_label) WHERE
exam_id IS NULL` — and Postgres will not use a partial index to arbitrate a
conflict unless the statement repeats its predicate. The proxy had no way to
say one, so **every monthly, termly and annual card failed to save**; only exam
cards worked, because their index is a full one.

`build_conflict_where` adds it, and is deliberately not a hole for free SQL: it
accepts only `<column> IS NULL` / `<column> IS NOT NULL`, resolves the column
case-insensitively against the real columns of the table being written, and
quotes the resolved name — so `EXAM_ID` becomes `"exam_id"` and not a different
identifier. Anything else is refused. 21 tests cover it, including stacked
statements, widened predicates, quote break-outs, subqueries and columns of
other tables.

The same report also showed what would have been saved: `percentage=0`,
`overall_grade='F'` for a student whose marks had not been entered. `max` was
0, so `pct` was 0, and `calcGrade(0)` is "F". **A child nobody had marked would
have been permanently recorded as having failed.** Totals are now null when
nothing was marked, the screen shows an em dash rather than 0% and F, and the
progress bar is not drawn at all — a bar of zero length reads as a score of
zero.

## Admissions, and moving a school in (23 Sep 2026)

### What admission was leaving undone

Approving an application called `convert_admission_to_student`, which created
the student row and stopped. Three things it never did, all of them visible to
the school:

- **No enrolment.** The form asks which class and section the child is applying
  for; the function read that only to pick a fee plan. The child ended up in no
  class at all — off every register, every report card run and every seating
  plan. Production had a student in exactly that state. The REST endpoint had
  the same defect by a different route: it passed `section_id=` to the
  `Student` constructor, and `Student.section_id` is a read-only view over the
  enrolments whose setter does nothing, so the choice was discarded in silence.
- **No documents.** Birth certificate, B-form, previous report card — all
  uploaded at admission, all left attached to the application, which is
  archived the moment it is approved. The child's own record had none of them.
- **No photograph, ever.** The form never asked for one. `photo_url` on the
  application was always null, the conversion dutifully copied null across, and
  every ID card and report card printed with an empty box where the face goes.

It also collected fourteen fields while the students table holds a blood group,
medical notes, an emergency contact, a town, an area and the child's own phone
— so a school that gathered those on paper typed them in twice.

### What it does now

`20260923000000_admission_completes_the_student.sql` adds the missing columns
to the application and rewrites the conversion to carry everything across in
one transaction: the particulars, the photograph, **the enrolment** (including
picking the only section when a class has just one), both guardians, and the
documents — which land in `student_documents` with a pointer back to the
application, under a partial unique index so the carry-over can be repeated
without duplicating rows.

The form is in sections now — the child, placement, the family, health and
notes — and opens with `StudentPhotoField`: a photograph from a file or from
the device camera, shrunk to 900px before it is stored. If there is no camera,
or permission is refused, it says so and the admission proceeds without one.

A photograph is no good if it only appears on the PDF. `profile_image_url`
holds either a full URL (what the old system wrote) or a storage path (what the
app writes); nine screens passed it straight to an `<img src>`, which works for
the first and shows a broken box for the second. All of them resolve it through
`getVPSFileUrl` now, so the photograph taken at the desk shows on the ID card,
the report card, the parent shell, the hall ticket and the student's profile.
The profile also grew a **Documents** tab, which is where what the family handed
in is now read.

### Bringing in a paper register

A school joining AltRix does not have a hundred new admissions; it has four
hundred children in a ledger. There was no way in but the form, one child at a
time.

`src/lib/admissions/bulk-import.ts` reads the school's own spreadsheet — or the
template it can download, which lists that school's real classes and sections
on a second sheet so the names match. Every row is checked before any row is
written, and the rules are the ones that matter:

- **Nothing is guessed.** A date it cannot read is a problem on that row, never
  replaced with today. Dates are read day-first, as they are written in
  Pakistan; `31/02/2015` is refused rather than rolled into March.
- **No class or section is ever created.** A name that does not match one the
  school already has is reported, with the instruction to create it first.
- **A blank cell stays blank** — never "unknown", never a placeholder.
- **Duplicates are caught twice**: against the rest of the file, and against
  the students already on the roll.

The screen shows every problem with its row, its column and what to do, then
what will happen, and only then imports. `POST /admissions/bulk-import` writes
each row in **its own savepoint**, so one bad line does not cost the school the
other 399, and reports per row what landed. `dry_run` does all the checking and
writes nothing.

28 tests cover the parsing and checking, 19 the endpoint — including that a
row cannot reach `school_id`, `id` or `status`, that the section named is
verified against the caller's own school, and that the setter which used to
swallow the class is not assigned to again.

### Shell pass, batch four (24 Sep 2026)

Diary, Holidays, Leave, Performance Reviews, Notices, Inquiries and the four
marketing tabs (Calls, Sources, Follow-ups, Campaigns).

- **Diary and Holidays both read `const { data } = await query`** and dropped
  the error half on the floor. A query the tenant was not allowed to run set an
  empty list, so a class with homework set showed none and a school with a full
  calendar showed no holidays.
- **Notices** reported its failure with a toast, which is gone in four seconds
  — on a board that is then empty for the rest of the session. It keeps saying
  so now.
- **Inquiries read `tenant.logoUrl` and `tenant.name`, neither of which
  exists** on the tenant (it carries `{ id, slug, name }` under `school`). The
  preview of the public intake form therefore showed no crest and the words
  "Our School" to every school in the system. It reads the real brand now.
- The four marketing tabs each opened straight into a card or a table. Side by
  side in one sidebar group, nothing said which of the four you were on.

### Nothing fails in silence (24 Sep 2026)

The single most common defect across the whole shell was one shape: a screen
drawing an empty table over a request that never succeeded.

    const { data = [] } = useQuery(...)      // the error half, dropped
    const { data } = await api.from(...)     // the error half, dropped

There are well over a hundred of them. A permissions error and a school with
no records then look exactly alike — which is how a report card endpoint
answered 500 for every card in the database without anyone noticing, and how
the fee configuration screen, the diary, the holiday calendar and the events
calendar all told schools they had nothing.

Fixing the call sites one at a time is worth doing where a screen deserves a
proper inline state, and the bigger ones now have `ErrorState` with a retry.
The *guarantee* belongs in two places, not a hundred and fifty:

- **`App.tsx`** gives the QueryClient a `QueryCache` with an `onError`, so
  every `useQuery` in the app reports its failure once, named from its own
  query key. `meta: { silent: true }` opts a background poll out.
- **`src/lib/api.ts`** reports a failed `select` from inside the query
  builder, so a caller that destructures only `data` still cannot hide it.
  `.single()` matching nothing is not reported — that is a normal answer the
  caller handles — and writes are left alone, since they already report
  through their own toast and offline queue.

`reportLoadFailure` de-duplicates, so a tab that loads eight things does not
stack eight toasts when the network drops.

`src/lib/silent-failures.test.ts` holds both in place.

### Every module has a heading

All 61 real modules in the shell now open with a `ModuleHeader` (or an
existing hero that does the same job): what the tab is, in one sentence, with
its actions beside it. The last ones were Attendance, the admissions pipeline,
Directory, Salaries, Fees, the Admin console, Presence diagnostics, the Vice
Principal home, Schools, the Timetable, Fee vouchers and the fallback home.

The remaining gaps in the scan are exports (32) and loading skeletons (19),
which are next.

## The 429 storm, and the Copilot (24 Sep 2026)

### Why half the console was red

A dashboard mount fired the entire universal prefetch at once: twelve groups,
thirty-four tasks, each with its own handful of queries — well over a hundred
requests in about two seconds, on top of the queries the screen itself needs.
The server refused the overflow, so `/api/notifications`, `/api/notifications/counts`
and a dozen `/api/vps-db/query` calls all came back 429 and the page loaded
half-empty.

Nobody is waiting for a warm-up. It now starts when the browser goes idle
(or after 1.5s), runs **one group at a time** with a breath between them, and
reports nothing to the user when a piece of it fails — `duringBackgroundLoads`
routes those to the console. Being rate limited is also now said **once**, as
one condition, rather than once per table.

### The Copilot

**It could be asked about someone else's school.** The endpoint resolved its
school as `current_user.school_id or request.headers["X-School-Id"]`. A header
is whatever the caller says it is, so any authenticated user whose token
carried no school could name another school and have the Copilot read that
school's live records back to them — students, fees, salaries. Only a super
admin may name a school now; everyone else gets the school on their token, and
naming a different one is refused.

**One lookup in the context was not school-scoped.** Every other personal query
in the builder carries `AND school_id = :sid`; the student-attendance one did
not, so an email that exists as a student in two schools had both schools'
attendance summed into one percentage. A test now walks every SQL statement in
the builder and fails on any that touches a school-scoped table without a
school filter — directly, or through an id that was itself resolved with one.

**It answered about things nobody asked.** The prompt was trimmed by keeping
sections in the order the builder wrote them until the budget ran out. The
direct answer survived — it is written first — but everything after was kept
or dropped by *position*: a question about attendance could lose the
attendance section because the fee ledger was written before it and was long,
and the model then talked about fees. Sections are now ranked against the
question's own words, with the direct-answer sections pinned, and the budget
comes down from 16,000 characters to 9,000. A smaller prompt of the right
records is both a faster answer and a more focused one.

**The cache stats measured nothing.** `find_similar` and `store` both return
None unconditionally — the Copilot reads live on every question on purpose,
because a stale fee figure presented as current is worse than a slow answer.
That is the right call, but the admin endpoint still served a "hit rate" for
it. It says the cache is off now.

### Exports and loading states (24 Sep 2026)

Six more record lists a school could read on screen but not get out of the
app — leave requests, contracts, the holiday calendar, notices, performance
reviews and the class diary — now carry a `DataExportMenu`, so an office asked
for any of them by an auditor or a board can produce it.

Two shared components that made their wrappers look finished when they were
not: `SupportInbox` printed "No tickets found." while its tickets were still
loading, telling a school its help desk was empty when it was not; and the
salary forecast had neither a skeleton nor a word for a year with no budget
set.

## The Copilot, rebuilt to answer from the records (24 Sep 2026)

### What was measured on the server

The VPS has four CPU cores, no GPU and one local model (`qwen2.5:1.5b` on
Ollama). The model reads a prompt at about sixty tokens a second before it
says a word. The old Copilot sent it roughly eighteen thousand characters of
the school's records, the same dump for every question, and then 40 to 85
seconds passed before the first word. After all that wait the figures still
came from a 1.5B model counting and adding rows of text. For "list unpaid
invoices" the targeted search found nothing, so the answer was not in the
prompt at all.

### What it does now

**The answer is computed; the model only explains it.**
`backend/app/utils/copilot/` has:
- a registry of 45 curated sources covering every module schools use daily,
  such as fees, defaulters, attendance, exams, homework, timetable, staff,
  leave, payroll, library, transport, hostel, inventory, visitors, CRM,
  health and certificates;
- a generic source for each of the ~125 other school-scoped tables, read from
  `information_schema`;
- a router and parameter parser (period, shape, status, class, name) that
  read English, Roman Urdu and Urdu script without a model.

A record question becomes one parameterised query. Postgres does the counting
and summing, so a balance is the ledger's balance to the paisa. The answer
comes back as a table in about 0.01 to 0.04 seconds, with the time it was
read. The model is used only in three cases, each with a small prompt:
- a short explanation over those figures, when asked "why" or "compare";
- an attached file;
- a question no module matches.

**Scope is in the SQL.** Every statement filters on the caller's school.
Leadership sees the whole school. A teacher sees their own sections, and only
their own leave and pay. A parent sees their own children, and cannot point
the screen at another family's child. A member of staff without the HR role
reads only their own payslip. Generic tables are for leadership only. Tables
holding credentials, sessions, gateways, audit logs or private messages are
never offered, and no id, token or URL column is ever shown.

**A correction to the entry above.** It said the Copilot could be asked about
another school through the `X-School-Id` header. The dependency
(`get_current_user_with_roles`) already prevented that: it loads roles for the
named school only and returns 403 to anyone who is not a member. The
string-compare check added then was redundant, and it also refused correct
requests that sent the school's slug. The endpoint now trusts the school the
dependency resolved, and still refuses an account with no school.

**It says what is happening, and when something fails.**
- The stream is unbuffered (`X-Accel-Buffering: no`) and runs on its own
  database session.
- The panel shows status lines while it works ("Reading fee records…").
- If no word has arrived after 90 seconds, the panel says so instead of
  spinning.
- Each failure gives its real reason: 403, 429, server error or no
  connection.
- If the explanation fails, a note appears under the figures, which are
  already complete.
- A database failure is reported plainly without the SQL text.
- Ollama error lines and mid-stream failures now surface; before, they were
  ignored, or the next endpoint was tried and appended a second answer.

**Nothing runs by itself.** Before, the panel executed any action that the
model's text marked `execute: true`. That path has been removed.

**Realtime.** Each answer carries the tables it was read from, and the panel
watches them. A new trigger (`sql_migrations/20261029000000_copilot_change_notifications.sql`)
sends a NOTIFY for every committed write on those tables. It includes only the
table, the school and the kind of change, never row data. Each API worker
LISTENs and passes the change to that school's open sessions. So a payment
recorded through the fees endpoint marks an answer as out of date, just as a
write through the data proxy does, and the panel offers "The figures have
changed since — ask again".

### Found and fixed on the way

- "Show me …" had been treated as "mine", so a principal asking "show me the
  leave requests" saw only their own leave.
- "Help me find unpaid invoices" returned the help text instead of the
  invoices.
- "Fee summary" returned the school overview instead of the fee answer.
- The screen name the panel sent ("Finance", "Exams & Results") never matched
  a module, so the tie-breaker had never worked.
- The old parent lookup queried `students.parent_id`, a column that does not
  exist. The error was swallowed, so every parent was told they had no linked
  children.
- `active_student_id` used to be any id found in the URL, such as an invoice
  or a card. Now it is only the student the user actually selected.
- Attachments of up to 2 MB were accepted and then refused by a
  2,000-character limit on the server. They are now capped at 4,000
  characters and sent in their own field.

### Tests

`backend/tests/test_copilot_engine.py` has 329 cases:
- 55 phrasings, each reaching its module, with every curated module covered;
- periods, shape and "mine";
- role access for leadership, teachers, parents and staff;
- a walk of every statement for every source, asserting the school filter
  and bind;
- the generic denylist and safe columns;
- the SSE contract;
- the realtime wiring.

Audit gates cop4 to cop7 were added.

### Still to do for the Copilot

- (Done) The model defaults in `config.py` are now `qwen2.5:1.5b`, the model
  the server has; `glm-5.3` was never installed. `OLLAMA_URL=127.0.0.1:11434`
  is correct as it is, because the backend container runs on the host
  network. The plan had called it wrong; it was checked from inside the
  container.
- (Done) **The model, chosen by measurement.** Four models that fit the box
  were benchmarked on the prompts the Copilot actually sends: an explanation
  over fee figures in English and in Roman Urdu, an open question, and a trap
  question whose answer is not in the facts.

  | Model | First word (~550-token prompt) | Writing speed | What it got wrong |
  |---|---|---|---|
  | qwen2.5:1.5b | 11.5 s | 6–8 tok/s | Invented a deadline ("due by the end of this month"); repeated the table; misread the open question |
  | qwen2.5:3b | 25 s | 3.4 tok/s | Invented a due date ("October 2026") |
  | llama3.2:3b | 21–27 s | 3–5 tok/s | Its Roman Urdu came out as Hindi ("darshate", "prapt", "jankari"), and it invented a "Parent Reminders tab" |
  | **gemma2:2b** | 21–24 s | 4–6 tok/s | Nothing: every figure it quoted was right, and it kept to five points |

  **gemma2:2b** is now the default, with qwen2.5:1.5b installed as the
  fallback; the other two were removed. It takes 1.9 GB of the 8 GB. Ollama
  runs with `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1` (a
  systemd drop-in), so a second model or a burst of questions cannot exhaust
  memory. The app asks for 3 of the 4 cores (`ollama_num_thread`), so pages
  stay responsive while the model writes. The explanation reads at most 700
  characters of figures, and every prompt says in so many words which
  language to answer in.
- **Found by the live test after deploy.** "Itni fees baqaya kyun hain" was
  asked in the school with 14 unpaid invoices (Rs. 84,445.00). gemma2:2b had
  been shown three sample rows, added them up, and answered "3 invoices,
  total billed Rs. 16,000". It also read the Urdu labels "Kul bill · Wusool"
  as information that was missing. The facts sent to the model are now in
  English whatever the reader's language, and labelled "complete count",
  "Totals over all 14 (exact)" and "Example rows (3 of 14; do not add these
  up)". The rules also forbid counting or adding rows, and say "the records
  do not show a reason" when they don't. After the fix, both languages
  answered "14 invoices, Rs. 84,445.00, nothing received, the records do not
  show why". The whole answer took about 35 s, down from 46–60 s; the table
  still arrives at once.
- **Fixed on the way:** `choose_local_model` matched the model *family*
  before the exact tag. With `qwen2.5:3b` also installed, a configured
  `qwen2.5:1.5b` was answered by whichever of the two `/api/tags` listed
  first.

### Parked by the user, to pick up after the Copilot

1. TimetableBuilder inline error state with retry.
2. Export menus for Curriculum, PrincipalComplaints and MarketingCampaigns.
3. Skeletons for Users, Directory, StudentWellbeing and PrincipalComplaints.
4. Empty states for AdminConsole and Curriculum.
5. The one student who is in no class.
6. A report on students whose photo URLs still point at Supabase.
7. A review of the nginx edge limit (30 r/s, burst 50 per IP).
8. The Admissions UI sets a `waitlisted` status that the enum does not have.
9. Some fee invoices have no student (e.g. INV-2026-000020).

### "Why does it show 0 records?" (25 Sep 2026)

The principal's screenshots showed "0 staff members", "0 students — today"
and, for the panel's own "Show finance insights" button, "0 owner ai
insights". None of these was a missing record. Each was the Copilot looking
in the wrong place or saying too little:

- **Staff.** This school added its teachers, accountant and HR manager as
  user accounts and never filled in the HR directory, and the Copilot read
  only the directory. Staff is now the directory plus every staff account
  (any role but parent or student) that is not linked to a directory entry.
  "How many staff" now answers 13 and "current teachers" answers 5. The
  school overview counts staff the same way.
- **Nothing today versus nothing at all.** Attendance had not been marked on
  25 Sep; the last was on 20 Sep. When a period has no records, the answer
  now says so and gives the date of the last one. The same applies to
  "upcoming exams" ("nothing upcoming; the most recent was on 27 Jun 2026")
  and to MTD revenue.
- **A parent's "my child's attendance"**, and any question asking for a
  rate, percentage or trend, now means the month so far rather than today.
  The answer includes the present rate.
- **Every suggestion the panel offers is now answered from the records.** A
  test walks every chip for every real role. Principal and owner chips used
  to fall through to the model or to empty generic tables. New answers:
  - a finance summary (outstanding, past due, students owing, collected
    today, this month and last month, expenses, and net);
  - class-wise enrolment (students, boys and girls per section);
  - a campus comparison (students, staff, outstanding, collected this month);
  - marketing campaigns;
  - "fee defaulters" now reaches the student-wise defaulters list;
  - "MTD revenue" reaches payments this month.
  The panel had suggestions for a role called "marketing"; the role is stored
  as `marketing_staff`, so those users saw none. Marketing staff may now read
  admission applications, as their suggestions assume.
- **One question, two modules.** "Recent complaints and notices" and
  "homework aur diary" are answered with both tables.
- **The right table for the role.** "My attendance" is the staff register
  for a teacher and the student's own attendance for a student. The first
  match the caller may read is used, not the first match overall.
- **From anywhere in the shell.** The screen the Copilot is opened on only
  breaks ties, such as "pending" on the admissions screen. A test asks four
  different module questions from five different screens and expects the
  same answers. Every answer stays within the caller's school and role.
- **Admissions waiting list.** The Waitlist button set a status that the
  `admission_status` enum did not have, so every click was refused. The
  value is now added by migration `20261030000000_admission_waitlist_status.sql`,
  and the Copilot understands "waitlisted".

## The parked list, done (25 Sep 2026)

- **Timetable builder.** A failed read had only its `data` destructured, so
  the grid looked empty, as if the school had no periods. It now shows an
  error with a retry.
- **Exports.** Curriculum presets and grade boundaries, principal complaints
  and marketing campaigns now have exports. On paper, an anonymous complaint
  stays "Anonymous student". The campaigns screen showed budgets in `$`; it
  now uses Rs. A campaign with no leads showed a cost per lead of "$0"; it
  now shows "—".
- **Loading, empty and failed states:**
  - Users & Roles and its invitations show rows loading, and a failure
    appears with a retry. Before, "No users found" appeared while the list
    was still loading, and a failed load was dropped.
  - The Directory used to print "No students found." for a search that had
    failed. Now each tab shows rows loading, a failure appears with a retry,
    and "no match for x" is told apart from "none yet".
  - Curriculum and principal complaints show a skeleton and an empty state.
- **Student wellbeing.** When a different student was chosen and had no
  medical profile, the previous child's allergies and medications stayed in
  the form, and "Update" saved them onto the new child. The form now starts
  empty. The sections show rows loading while a student's records load.
- **Admin console.** A failed read of the setup lock left it "Unlocked (can
  run once)" with the button live. It now says the lock could not be read,
  and keeps the button disabled. A school that is already set up sees a plain
  "already set up" instead of a form it cannot use. The header now says what
  the screen actually does.
- **Data-health card.** Two new checks:
  - fee invoices whose student record no longer exists (7 in Beacon, 3 still
    pending, Rs. 17,000 counted as owed that no family can see or pay; they
    are reported, never deleted);
  - student photos still on the old Supabase storage (1).
  The Copilot now names such records "(student record removed)" instead of
  "—". The student who is in no class was already on this card.
- **The 429s: the edge limit was per Cloudflare server, not per visitor.**
  nginx logged Cloudflare's addresses (172.69.x, 104.23.x) as the client, so
  the `altrix_edge_api` limit (30 r/s, burst 50 per IP) was shared by
  everyone behind the same Cloudflare edge. The 300 refusals in the error log
  (most of them `/api/vps-db/query` from the report-cards screen on 24 Sep)
  were a school's users tripping one shared bucket.
  `/etc/nginx/conf.d/98-cloudflare-realip.conf` now takes the visitor's
  address from `CF-Connecting-IP`, trusting it only from Cloudflare's
  published ranges (22 of them), so it cannot be spoofed. After a reload, the
  access log shows real visitor addresses. The installer is
  `scripts/install_cloudflare_realip.sh`: it fetches the current ranges,
  backs up the old file, and reloads only if `nginx -t` passes. The app's own
  limiter already keys on the signed-in user.

### The errors in the console, and Fee Configurations (25 Sep 2026)

- **Fee Configurations crashed** with "Cannot convert object to primitive
  value". Its route was loaded without naming the module's export, and the
  lazy loader fell back to the module object, which React cannot render.
  The route now names the export. The loader throws a readable error when
  an export is missing instead of rendering the module. A new audit gate
  (`lazy1`) checks every one of the ~100 lazily loaded screens against its
  module's real exports.
  The screen itself:
  - showed "2nd / 2rd Child" for every tier; it now reads "2nd child";
  - labelled every rule "Active" and every gateway "Integrated" whatever
    their state; the badges now follow the data;
  - showed empty tables with no explanation; each table now says what
    would appear there.
- **Live-update connection.** It retried every 5 seconds forever, during
  outages, while offline, and after the browser parked the page in its
  back-forward cache ("WebSocket connection failed: Page entered
  Back-Forward Cache"), and logged an error each time. A failed ticket
  request also stopped it until a reload. Now:
  - retries back off from 5 s up to 60 s;
  - it waits for the browser's `online` event while offline;
  - it closes cleanly when the page is parked and reconnects when it is
    shown again;
  - a failed ticket is retried;
  - an outage is reported once ("Live updates paused … retrying"), and the
    recovery once.
  The collaboration hub's own socket had the same faults and gets the same
  treatment.
- **Console noise.** The "VPS API Proxy Warning" printed a whole AxiosError
  object; it is now one line: which request, and why. The mobile navigation
  sheets had no description, so Radix warned on every open. They now have a
  screen-reader description. `net::ERR_NAME_NOT_RESOLVED` in that screenshot
  was the computer's own DNS failing for a moment, which no code on the site
  can cause or prevent. The app now recovers from it on its own.

### The platform owner, and counting people in their own groups (25 Sep 2026)

- **The platform owner is never listed in a school.** The owner's account
  (the platform super admin) can open any school, and nobody else may see
  it. The Users and Directory screens had hidden it by a hard-coded email in
  the browser. Now:
  - migration `20261031000000_hide_platform_owner.sql` adds
    `is_platform_owner()`;
  - every people list the database hands out leaves the account out:
    `get_school_user_directory`, `list_school_user_profiles`,
    `get_school_staff_directory` and the `school_user_directory` view;
  - the Copilot's staff, teacher, parent and user answers leave it out too.
  The rule is by role (`platform_super_admins`), not by address, so it holds
  even if the account is ever given a role in a school. (It has none today,
  so no school's numbers change.)
- **Each group is counted on its own** (Beacon, live):
  - staff: 13 (every role but parent and student, plus the HR directory);
  - teachers: 5, with the classes and subjects each teaches;
  - parent accounts: 1, and how many students have one linked (1) or not (8);
  - user accounts: 19 in all, by role (staff 13, teachers 5, parents 1,
    students 5);
  - students: 9, from the student records.
  "Teachers" used to be a filter on the staff answer ("5 staff members —
  teachers"); it is now its own answer. The school overview lists teachers
  and parent accounts too. Contact details now come from the user's profile:
  the directory view returns an empty email for everyone.
- `user_roles` now announces its changes (migration
  `20261031000100_copilot_change_notifications_people.sql`), so a users or
  parents answer is flagged when someone is added.

### Six functions the app called that did not exist (25 Sep 2026)

The data proxy's allowlist named them and the screens called them, but none
had ever been created on this database, so each call failed:

| Function | What was broken | Now |
|---|---|---|
| `directory_search` | The Directory search. Every search failed, and the screen showed "No students found." | Students (name, roll or registration number, guardian), staff (never the platform owner) and leads, with paging and a total count. The caller must belong to the school. |
| `ensure_default_crm_pipeline` | Opening CRM, and creating a lead from the Directory (12 failures in the log) | Returns the school's default pipeline. It adopts the oldest one if none is marked default, or creates "Admissions" with six stages. |
| `create_public_lead` | The website enquiry form | Validates the enquiry, files it as a lead in the default pipeline and notifies the admissions staff. |
| `get_child_teachers_detailed` | A parent's "contact my child's teachers" | The class teacher and the subject teachers of the child's current section. Only the child's guardian, the student or the school's staff may ask. |
| `search_messages` | Message search | Searches the caller's own sent and received messages only. The `_user_id` the browser sends is ignored in favour of the signed-in identity. |
| `export_table_schema` | The platform schema viewer | For the platform owner only. |

**The website enquiry form had never worked for a visitor.** The page found
the school, read its form settings and saved the enquiry through the
signed-in data proxy, and all three return 401 without a login. A parent
opening the link saw "School Portals Offline". New endpoints need no login:
`GET /public-inquiries/{slug}` returns what the form shows, and
`POST /public-inquiries/{slug}` saves the enquiry. The POST is rate-limited
to 5 a minute and has a hidden field for bots, and it returns the
function's own messages to the visitor. The page uses them now.

**Beacon had two default CRM pipelines.** A race in the old browser-side
fallback left both marked default, so every "the default pipeline" lookup
failed with "multiple rows". One default is kept per school (the one with
the most leads). A unique index stops a second one appearing. Nothing is
deleted.

All six were run against the production data inside a transaction that was
rolled back:
- a Directory search for "ali" found 4 students;
- staff returned 13, without the platform owner;
- an enquiry became a lead and notified 4 staff;
- a child's teachers came back with the class teacher first.


### Platform billing, and data a school could read from other schools (25 Sep 2026)

- **Platform billing made invoices up.** The page read `platform_invoices`
  and called `cron_generate_platform_invoices`, and neither existed. When the
  read failed, the page invented invoices in the browser
  ("PLAT-INV-202605-100", one of them "Paid") and kept them in localStorage.
  It also showed every school, all four of which are on the free plan, as
  paying the template price of Rs. 15,000 a month, due in 30 days. That made
  a monthly recurring revenue of Rs. 60,000 that does not exist. And after a
  manual invoice it said "notification sent to …", though no email is sent.
  Migration `20261031000300_platform_billing.sql` adds:
  - `next_billing_date` and `billing_status` on schools;
  - the `platform_invoices` table (exact money, never deleted with its
    school, one recurring invoice per school per date);
  - the billing run. It bills a school on a paid plan when its date has
    come and moves the date on by the cycle. A school with no date is given
    one rather than billed by surprise. Unpaid invoices past due become
    Overdue, and so does their school. It is for the platform owner only.

  The page shows only what is stored ("Not billed", "Not scheduled"), and
  reports a failure instead of simulating. Its message after a manual
  invoice now says no email was sent. Tried on the production data and
  rolled back: Beacon at Rs. 15,000, billed from yesterday, raised
  PLAT-20260924-BEACON due 4 Oct and moved to 24 Oct. A second run raised
  nothing.
- **A school could mark its own platform invoice Paid.** `platform_invoices`
  sat among the tables a school's own administrators may write. It is now
  kept by the platform: `PLATFORM_ONLY_TABLES` refuses it to schools, both
  reading and writing.
- **Readable tables without a school_id were served whole.** Through the data
  proxy, any signed-in user of any school could read:
  - every school's record;
  - every user's profile (name, phone and email);
  - report-card marks (`report_card_subject_entries`,
    `co_curricular_grades`);
  - exam seating and invigilators;
  - message recipients;
  - bus stops.

  For anyone but the platform owner, each is now confined through the row it
  belongs to: the schools the caller belongs to; the people who share the
  caller's school (never the platform owner); and marks, seats, recipients
  and stops whose report card, seating plan, message or route is in the
  caller's school. For Beacon's principal, schools went from 4 to 1 and
  profiles from 23 to 19.

### Screens that made up what they showed (25 Sep 2026)

A search for mock data, simulations and random numbers found screens that
presented invented figures as real. Each now shows only what is stored or
measured:

| Screen | What it made up | Now |
|---|---|---|
| Platform health | CPU "4.8%", memory, "12 connections", a table list with 1,420 students and 28,400 attendance rows, a "94.2%" cache hit rate, and a "probe" that drew a random latency | `GET /platform/health-metrics` (owner only): Postgres connections, database size, cache hit rate, the largest tables (rows counted exactly unless huge), load, memory, disk and the task queue. Latency is timed from 5 real requests. |
| Platform database | "114.6 MB", "5.0 GB", "99.9%", the same invented table list, a "93.1 MB" full backup that was never taken, "re-indexed 4 indexes … reclaimed 4.2 MB" with nothing done, and **invented rows ("John Doe", "Automated Record", "Grade 1") put into an empty school's export, which a restore would have written into the school** | The figures come from the server. "Back up the whole database now" starts a real server backup. "Refresh database statistics" runs ANALYZE and reports it (the row estimates had read 0 for 29 invoices). Exports hold only real rows, and a table that could not be read is named. The three seeded fake backups are gone. |
| Platform search | "Muhammad Ali", "Ayesha Khan", "Dr. Kamran Malik" whenever nothing matched | Nothing matched is shown as nothing matched. |
| Principal's live attendance radar | "SIMULATE LIVE CHECK-IN" put invented staff on the radar and into the Active Staff count | Removed; only real check-ins appear. |
| Student and teacher complaints | "Add mock file" attached "Witness_Declaration.pdf" and similar files that never existed, and the principal saw them as evidence | Real uploads (up to 5 files, 10 MB each) to the school's storage, opened through a signed link. Old invented entries show "file not stored". |
| AI timetable generator | A draft lived only in the tab, and "approve" reported success without saving anything | The draft is saved to `ai_timetable_suggestions` and approval updates that row. A draft that could not be saved says so, and can still be applied. |
| Parent report card and visitor pass | Headed "ALTRIX ACADEMY" for every school | The school's own name. |
| Library | Every book entered without them was saved with a made-up ISBN ("978-969-xxxx-0"), the publisher "Standard Edition", the year 2024 (the form has no year field) and the shelf "Rack A-1", and the display showed the same values for empty fields | Blank stays blank ("not recorded"). The library's own barcode label may still be generated, since that one is ours. |
| Exam grading lock | Each subject teacher's lock wrote their one subject's marks as the report card's whole total, so the last teacher to lock set every student's total, and the other subjects vanished. It also wrote "Grading locked by Subject Teacher." as the teacher's remark on the printed card. | The card is totalled over every subject recorded for the exam (a mark not recorded is not a zero), and no remark is written for the teacher. |

These stay as they are, because they are labelled and are tools rather than
records: the owner's finance what-if simulator, and the parent bus tracker's
"Demo GPS" (marked "Simulated position — not live").

### The hall-ticket check at the exam-hall door (25 Sep 2026)

The page an invigilator's phone opens when scanning an admit card's QR code
called `verify_exam_hall_ticket` through the signed-in data proxy, which
answers 401 to anyone not logged in. The check failed where it was meant to
be used. `GET /public-verify/hall-ticket/{exam}/{student}` needs no login
and is rate-limited (30 a minute); the page uses it. The function also never
compared schools, so a card pairing a student with another school's exam
verified as genuine. Migration `20261031000400_hall_ticket_same_school.sql`
refuses that, as tried on the production data.

`tests/test_public_pages.py` checks that no public page (enquiry, hall
ticket, visitor registration, document verification) uses the signed-in
proxy, and that the public endpoints need no login and are rate-limited.

Also:
- the platform search no longer links a school it cannot find to a
  made-up "model-school" address;
- the database page's schedule no longer comes pre-filled with
  "admin@altrix.com", and it says that no email is sent from it yet.
