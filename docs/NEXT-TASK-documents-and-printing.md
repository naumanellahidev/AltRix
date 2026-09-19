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
