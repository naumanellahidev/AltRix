# Plan — Principal shell upgrade (Fees Centre, Report Cards, AI Copilot, Dashboard, 63 tabs)

Status: **approved 2026-09-22** — Phase A in progress.
Date: 2026-09-22

Approved decisions:

1. Fees Centre = 6 tabs exactly as proposed below; gateways/policy ka ek hi ghar
   "Fee Configurations"; Payments/Expenses apne sidebar tabs par (Fees me summary + link).
2. AI Copilot: GLM cloud primary (maujooda `AI_API_KEY`) + local `qwen2.5:1.5b` fallback.
3. Report card page fit: pehli baar principal se saare tareeqe poochhe jayenge (one-time
   setup), uska jawab school setting me save hoga aur agli dafa khud wahi apply hoga
   (settings me badla ja sakega).
4. Order: A → B → C → D → E (Fees pehle).

Ground rules carried into every slice below:

* Koi feature khatam nahi. Duplicate screen ko delete nahi karte — usko clear jagah par
  bhejte hain aur purani jagah par ek deep link + summary chhorte hain.
* Data kabhi fabricate nahi. Missing mark zero nahi. Jo series real nahi, uska chart nahi.
* Paisa aur marks exact decimal (`src/lib/documents/decimal.ts`, backend `money.py`).
* Har document `src/lib/documents` se — vector PDF, letterhead, Urdu, Page X of Y, QR.
* Fail hone par failure report — jhoota success toast nahi.
* Har slice ke baad: vitest + pytest + `scripts/audit_verify.py` + docs update.

---

## 0. Diagnosis — jo cheezen waqai kharab hain (verified in code)

### 0.1 Fees Centre
| # | Finding | Proof |
|---|---------|-------|
| 1 | Teen sidebar tabs ek hi component render karte hain | `src/lib/module-registry.tsx:122-124` — `fees`, `admin-fees`, `finance` → `FeesUnifiedModule` |
| 2 | Principal shell aur baaki shells me same tab ka matlab alag | `src/pages/tenant/TenantDashboard.tsx:691-692,717` — `fees`→`FeesUnifiedModule`, `finance`→`OwnerFinanceModule`, `admin-fees`→`AdminFeePortalModule` |
| 3 | Fees Center khud sirf 3 legacy modules ka wrapper hai, labels vague | `src/pages/tenant/modules/FeesUnifiedModule.tsx` (102 lines): "Billing Structures" / "Advanced Operations" / "Vouchers & Proofs" |
| 4 | Payments aur Expenses do jagah | `FeesAdvancedModule` tabs `payments`, `expenses` **aur** alag sidebar tabs Payments/Expenses |
| 5 | Gateways do jagah | `FeesAdvancedModule` tab `settings` (JazzCash/Easypaisa) **aur** `AdminFeePortalModule` tab `gateways` |
| 6 | Discounts teen jagah | `AdminFeePortalModule` (discounts), `FeeVouchersModule` (grade-based merit discount), `FeesAdvancedModule` (per-student overrides) |
| 7 | Expense (kharcha) "Fees" ke andar — conceptually ghalat, fee income hai | `FeesAdvancedModule` expense register |

Backend already rich: `backend/app/routers/finance.py` me structures, vouchers, payments,
reports/summary, installment-plans, sibling-discounts, escalations, gateway-configs,
balance-dashboard, export-payment-proofs. Yani UI ki problem hai, data ki nahi.

### 0.2 Report Cards
* Single card ka export DOM capture se hota hai — `ReportCardModule.tsx:985-1005`
  `exportCleanDocumentToPdf(el, …)`. Vector builder `src/lib/documents/report-card.ts`
  sirf bulk class-set me use hota hai (`downloadReportCardSet`).
* Isi liye: screen design aur print design alag, quality DOM par depend, aur page count
  guarantee nahi — subjects zyada hon to doosra page.
* Builder me koi density/fit mode nahi; `ensureSpace` page todta hai.

### 0.3 AI Copilot
| # | Finding | Proof |
|---|---------|-------|
| 1 | Default model `glm-5.3`, magar VPS Ollama par sirf `qwen2.5:1.5b` hai | `backend/app/config.py:81-84`; VPS `GET /api/tags` = only `qwen2.5:1.5b` |
| 2 | Har message par 11 models ka blind fallback loop → kai 404 round-trips → slow | `backend/app/utils/ai_service.py:77-101,137-180` |
| 3 | Prompt me poora DB dump (100 students, 50 invoices, 50 staff, 25 payments…) 1.5B model ko | `backend/app/utils/ai_context_builder.py` (1908 lines, LIMIT 100/50/25) |
| 4 | `num_predict: 512` — lamba jawab beech me katta hai | `ai_service.py` payload |
| 5 | Semantic cache poora bana hua hai magar kabhi call hi nahi hota | `find_similar` / `store` ka koi caller nahi (`grep` across `backend/app`) — sirf definition |
| 6 | Frontend error ko chhupa kar jhoota jawab dikhata hai | `src/components/ai/AltrixCopilot.tsx:1185-1190` — "👋 I am currently processing your request" + hardcoded links |
| 7 | SSE parsing chunk boundary par tokens giraati hai | `AltrixCopilot.tsx:1174-1182` — `chunk.split("\n")`, adhoori line ka tail carry nahi hota |
| 8 | System prompt links/actions mana karta hai, magar frontend me action/chart parsing maujood — dead feature | `misc.py` system prompt rule 2 vs `parseMessageContent` |
| 9 | AI_API_KEY (GLM/Z.ai format) production.env me maujood hai magar `OLLAMA_*` naming ki wajah se use hi nahi hota | VPS `production.env`: `AI_API_KEY=…`; settings key `ollama_api_key` |

### 0.4 Principal dashboard
* Sparklines fabricated: `PrincipalHome.tsx:200-245`
  `classesTrend` (7 baar wahi value), `leavesTrend` (+1/+2 farzi), `leadsTrend` (−6…0),
  `attendanceTrend` (±3 farzi), `staffAttendanceRate = 96` **hardcoded**,
  `staffAttendanceTrend` hardcoded [95,96,95,97,96,98,96].
* Paisa `Number(...)` float se — decimal nahi.
* KPIs `sessionStorage` se cache — stale numbers dikhne ka risk, koi "as of" stamp nahi.

### 0.5 Sidebar — 63 principal tabs
Har tab ka route resolve hota hai (13 tabs jo `TenantDashboard` me explicit nahi,
woh `createCatalogRouteElements` se registry ke through aate hain — yani dead nahi).
Module size + flags ka scan (line count, DataExportMenu, fabricated data, data layer):

* **Thin wrapper / duplicate (5–140 lines):** Offboarding(5, Onboarding ka kind), Leads(5 — **CRM ka bilkul same component**), Parent Notes(10), At-Risk(11), Budget Simulator(16), Support(28), Attendance Heatmap(40), Fees trio(102), Diary(136).
* **Chhote, premium treatment chahiye (180–350):** Leaves(185), Curriculum(195), Reviews(214), Behavior(233), Holidays(263), Documents(268), Vendors(273), Onboarding(289), Notices(300), Sources(314), Campaigns(323), Ledger(348), Inventory(349).
* **Medium (370–700):** Calls(373), Owner Insights(376), Admissions(429), Tax(443), Follow-ups(457), HR Analytics(458), AI Counselor(469), Gate(475), Contracts(477), Attendance(491), Staff Attendance(511), Hostel(524), Alumni(541), Expenses(542), Recruitment(580), DMS(607), Exams(628), Complaints(655), Events(671).
* **Bare (700+) — audit + polish:** CRM(721), Counseling(817), Salaries(836), Appraisals(843), Timetable(882), Academic(894), Payments(925), Collaboration(956), Wellbeing(1014), Reports(1068), Invoices(1366), Inquiries(1369), Library(1550), Users(1759), Transport(1820), Payroll(1859), Messages(1891), Student Cards(2002), Report Cards(2034).
* Fabricated ID generators (chhoti magar theek karni hain): random ISBN `LibraryModule.tsx:267`, random GPS device id `TransportModule.tsx:241`.

---

## 1. Phase A — Fees Centre (slices 18–20)

Ek Fees Centre, 6 workflow tabs, har tab ka ek hi maalik:

1. **Collection Board (Overview)** — due vs collected vs outstanding (decimal), aging
   0–30/31–60/61–90/90+, aaj ki collection, class-wise collection %, top defaulters,
   month trend (real payments se), DataExportMenu.
2. **Fee Structure** — fee heads, class-wise structures, effective-date versioning,
   late-fee aur concession policy. (aaj ka "Billing Structures")
3. **Student Ledger** — per-student plan assignment, overrides, sibling/merit/staff-ward
   concession, installment plan, poora ledger + balance ek screen par.
4. **Billing Run** — class/section/month ka batch generate; commit se pehle count + total
   ka preview; idempotent (ek period ka dobara voucher nahi); batch print/PDF; WhatsApp/email
   dispatch; cancel with reason + audit.
5. **Collections** — payment receive (cash/bank/gateway), proof upload + verify queue,
   receipt print, partial payment, refund/adjustment with reason, reconciliation.
6. **Defaulters & Reminders** — aging, escalation ladder (backend `/escalations` already),
   reminder templates, dispatch log with delivery status.

Consolidation (kuch delete nahi hota):
* Gateways + fee policy ka **ek** ghar: "Fee Configurations". Fees Centre me wahan ka link.
* Payments/Expenses apne sidebar tabs par rahenge; Fees Centre ke andar sirf summary card +
  deep link (duplicate form nahi).
* `finance` tab har shell me `OwnerFinanceModule` (cashflow) — fees se alag, clear.

Standard har screen par: decimal money, server-side search/filter/pagination, skeleton +
empty + error states, bulk actions, DataExportMenu, audit trail, mobile layout.

## 2. Phase B — Report Cards (slices 21–22)

* Single card ka download/print/share DOM capture se hata kar **vector builder** par.
* `buildReportCard` me `fit: "single-page"` density engine: pehle normal density; agar
  `pages > 1` to tighter density par rebuild (font/row padding kam, tiles ek row,
  subjects > 12 par 2-column subject table, trend chart compact). Density floor tak
  binary search. Data kabhi nahi girta.
* Agar sach me fit na ho: **pehli baar** principal se ek setup dialog me saare tareeqe
  poochhe jayenge (compact density, A4 landscape 2-column, ya 2 pages + kaunsi cheezen
  optional). Jawab school-level setting me save — agli dafa khud wahi apply, bina poochhe;
  Fee/Report settings se kabhi bhi badla ja sake.
* On-screen preview = wahi asli PDF iframe me (WYSIWYG), plus template chooser
  (Classic / Modern / Minimal), brand accent, optional photo, optional QR.
* Functionality: term comparison, rank sirf jab real ho, attendance real records se,
  grade scale config se, co-curricular, teacher + principal remarks, publish/unpublish
  audit, bulk publish, class-set ZIP (maujood), mark-sheet Excel, parent share.
* Tests: 8/15/20 subject fixtures par page count === 1, PyMuPDF render check.

## 3. Phase C — AI Copilot (slices 23–24)

* **Provider layer**: `AI_PROVIDER = glm | ollama | auto`. GLM cloud (maujooda `AI_API_KEY`)
  primary, local `qwen2.5:1.5b` fallback. Model discovery `/api/tags` se, 5 min cache —
  blind 11-model loop khatam. Health endpoint + UI me honest status.
* **Intent router + tools**: DB dump ki jagah sawal ka intent (fees/attendance/exams/staff/
  student/my-*) → 1–3 precise SQL queries (tenant + role scoped) → compact fact block
  (≤2k tokens). Numbers SQL se (exact Decimal), model se nahi.
* **Semantic cache on**: call se pehle `find_similar`, baad me `store`, dep tags par
  invalidate. Stats endpoint phir sach bolega.
* **Streaming fix**: buffer tail carry, `[DONE]` handling, `num_predict` barha kar,
  AI offline par asli error + retry — jhoota "processing" message khatam.
* **Actions/charts wapas zinda**: server-declared allow-list (navigate, open invoice,
  download voucher) — button dabaye to kaam kare; chart payload SQL result se.
* Module-wise quick prompts, Roman Urdu/Urdu/English matching, per-user conversation
  memory, thumbs feedback stored.
* Guardrail: number invent nahi — data na ho to saaf kehna.

## 4. Phase D — Principal dashboard (slice 25)

* Sab farzi sparkline aur hardcoded 96% khatam; real 30-day series backend se
  (`/reports/*` me daily series). Series na ho to number dikhao, chart nahi.
* Staff attendance real HR attendance se.
* Money decimal, currency `fee_settings` se, "as of" timestamp.
* Premium exec layout: live KPI row with real period deltas, cashflow chart, attendance
  trend, admissions funnel, academic performance, "Aaj" panel (timetable gaps, absent
  staff, unresolved complaints, pending approvals), Action Center real counts + deep links,
  Approvals inbox (leave/expense/discount) with one-click approve, "Principal Daily Brief"
  PDF + Excel, period + campus filter, auto refresh.

## 5. Phase E — 63 tabs sweep (slices 26–31)

Per-tab checklist ("premium standard"): real data only · tenant + role scoping · decimal
money · skeleton/empty/error · server-side search+filter+pagination · bulk actions ·
DataExportMenu (Excel/PDF/Print/WhatsApp/CSV) · premium document from `src/lib/documents` ·
audit log · mobile · a11y · tests.

Order: finance → academics → people/HR → operations → communication.
Har slice 4–6 tabs: code + tests + docs + audit run. Duplicate tabs (Leads vs CRM) ko
alag maqsad diya jayega (Leads = pipeline board, CRM = full relationship), delete nahi.

---

## 6. Verification aur deploy

* Har slice: `npx vitest run`, `pytest`, `python scripts/audit_verify.py` (138/138 + naye gates).
* Phase ke end par: build, push `main`, VPS deploy, deploy log + `/api/version` check,
  rollback ready.
* Estimate: A 3 slices, B 2, C 2, D 1, E 6 — kul ~14 slices.

## 7. Approval chahiye

1. Fees Centre ka 6-tab structure theek hai?
2. AI provider: GLM cloud primary + local fallback (recommended) ya local only?
3. Report card jab sach me 1 page par na aaye: auto landscape 2-column, har baar poochna,
   ya 2 pages allow?
4. Order A → B → C → D → E theek hai ya kisi cheez ko pehle karna hai?
