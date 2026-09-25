"""
Every module the Copilot can answer about, declared once.

Each ``Source`` says, for one table: what a question about it sounds like (in
English and Roman Urdu), which columns are worth showing and how to format
them, which columns a date, status, class or name filter applies to, and who
may see it. The resolver turns a Source plus a question into exactly one
parameterised query. Identifiers only ever come from here; every value from
the question is a bind parameter.

The curated sources below cover the modules a school uses every day. Every
other school-scoped table in the database is picked up automatically by
``generic_sources`` — so nothing in the shell is unanswerable — but those are
limited to school leadership, because a table nobody has looked at closely
might hold something only they should see.

Column names here are the real ones, read from production.
"""
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, Optional, Tuple

PKT = "Asia/Karachi"

# ── Roles ───────────────────────────────────────────────────────────────────
GOV = frozenset({"super_admin", "school_owner", "principal", "vice_principal", "school_admin"})
ACADEMIC = GOV | {"academic_coordinator", "teacher"}
FINANCE = GOV | {"accountant"}
HR = GOV | {"hr_manager"}
COUNSEL = GOV | {"counselor", "academic_coordinator"}
MARKETING = GOV | {"marketing_staff"}
STAFF = GOV | {"academic_coordinator", "teacher", "accountant", "hr_manager", "counselor", "marketing_staff"}
FAMILY = frozenset({"parent", "student"})


# ── SQL building blocks ─────────────────────────────────────────────────────
def pk(col: str) -> str:
    """A timestamp read as a date in Pakistan time."""
    return f"(({col}) AT TIME ZONE '{PKT}')::date"


STUDENT_JOIN = "LEFT JOIN students s ON s.id = t.student_id AND s.school_id = t.school_id"
STUDENT_NAME = "trim(concat_ws(' ', s.first_name, s.last_name))"
#: A fee record's student, saying so when the student record is gone. A
#: dash read as "a nameless child owes Rs. 6,000".
BILLED_STUDENT = (
    f"COALESCE(NULLIF({STUDENT_NAME}, ''), CASE WHEN t.student_id IS NULL "
    "THEN '(no student)' ELSE '(student record removed)' END)"
)


def student_class(sid: str) -> str:
    return (
        "(SELECT concat_ws(' ', ac.name, cs.name) FROM student_enrollments se "
        "JOIN class_sections cs ON cs.id = se.class_section_id "
        "JOIN academic_classes ac ON ac.id = cs.class_id "
        f"WHERE se.student_id = {sid} AND se.end_date IS NULL LIMIT 1)"
    )


def section_label(expr: str) -> str:
    return (
        "(SELECT concat_ws(' ', ac.name, cs.name) FROM class_sections cs "
        f"JOIN academic_classes ac ON ac.id = cs.class_id WHERE cs.id = {expr})"
    )


#: Everyone who works at the school: the HR directory, plus every staff
#: account (any role but parent or student) not already linked to an entry
#: in it. Named by the directory, or else by the account.
STAFF_UNION = (
    "(SELECT d.school_id, d.full_name, d.position, d.department, "
    "COALESCE(d.phone, d.email) AS contact, d.joining_date, d.is_active, d.linked_user_id AS user_id "
    "FROM hr_staff_directory d "
    "UNION ALL "
    "SELECT ur.school_id, COALESCE(NULLIF(u.display_name, ''), u.email, 'Unnamed account') AS full_name, "
    "string_agg(DISTINCT initcap(replace(ur.role::text, '_', ' ')), ', ') AS position, "
    "NULL::text AS department, u.email AS contact, NULL::date AS joining_date, true AS is_active, "
    "ur.user_id "
    "FROM user_roles ur LEFT JOIN school_user_directory u "
    "ON u.user_id = ur.user_id AND u.school_id = ur.school_id "
    "WHERE ur.role::text NOT IN ('parent', 'student') "
    "AND NOT EXISTS (SELECT 1 FROM hr_staff_directory d2 "
    "WHERE d2.linked_user_id = ur.user_id AND d2.school_id = ur.school_id) "
    "GROUP BY ur.school_id, ur.user_id, u.display_name, u.email) t"
)


def staff_name(uid: str) -> str:
    return (
        "COALESCE("
        f"(SELECT d.full_name FROM hr_staff_directory d WHERE d.linked_user_id = {uid} "
        "AND d.school_id = t.school_id LIMIT 1), "
        f"(SELECT u.display_name FROM school_user_directory u WHERE u.user_id = {uid} "
        "AND u.school_id = t.school_id LIMIT 1), "
        f"(SELECT u.email FROM school_user_directory u WHERE u.user_id = {uid} "
        "AND u.school_id = t.school_id LIMIT 1))"
    )


@dataclass(frozen=True)
class Col:
    label: str
    sql: str
    kind: str = "text"   # text | money | number | percent | date | datetime | bool
    label_ur: str = ""


@dataclass(frozen=True)
class Status:
    """A word group and the predicate it means for this table."""
    words: Tuple[str, ...]
    sql: str
    label: str
    label_ur: str = ""


@dataclass(frozen=True)
class Agg:
    label: str
    sql: str
    kind: str = "money"
    label_ur: str = ""


@dataclass(frozen=True)
class Source:
    key: str
    module: str
    title: str
    title_ur: str
    keywords: Tuple[str, ...]
    frm: str
    columns: Tuple[Col, ...]
    roles: FrozenSet[str]
    order_by: str = "t.created_at DESC"
    top_order: Optional[str] = None
    lowest_order: Optional[str] = None
    date_col: Optional[str] = None
    #: (start, end) for records that span dates — leave, holidays — so "today"
    #: means "covers today" rather than "starts today".
    span: Optional[Tuple[str, str]] = None
    #: "today" or "upcoming" when the question names no period.
    default_when: Optional[str] = None
    #: For a weekly schedule: the ISO weekday column (Monday = 1), so "aaj"
    #: and "kal" pick a day of the week rather than a date.
    dow_expr: Optional[str] = None
    statuses: Tuple[Status, ...] = ()
    default_where: str = ""
    always_where: str = ""
    name_cols: Tuple[str, ...] = ()
    student_expr: Optional[str] = None
    section_expr: Optional[str] = None
    #: The user id column, for staff reading their own HR records.
    self_expr: Optional[str] = None
    #: Parents and students may ask; rows are limited to their own children
    #: (student_expr) or their children's sections (section_expr).
    family: bool = False
    count_expr: str = "COUNT(*)"
    count_noun: str = "records"
    count_noun_ur: str = "records"
    aggregates: Tuple[Agg, ...] = ()
    generic: bool = False
    #: The underlying table, when ``frm`` is a derived query rather than a
    #: table — used to tell the panel which data an answer came from.
    table: str = ""


# ── The curated sources ─────────────────────────────────────────────────────
SOURCES: Tuple[Source, ...] = (
    Source(
        key="students", module="Students", title="students", title_ur="talaba",
        keywords=("student", "students", "bacha", "bachay", "bache", "bachon", "bachy", "talib",
                  "talaba", "roster", "enrolled", "enrolment", "enrollment", "strength", "admitted"),
        frm="students t",
        columns=(
            Col("Name", "trim(concat_ws(' ', t.first_name, t.last_name))", label_ur="Naam"),
            Col("Class", student_class("t.id"), label_ur="Class"),
            Col("Roll no.", "t.roll_number"),
            Col("Reg. no.", "t.registration_number"),
            Col("Guardian", "t.parent_name", label_ur="Sarparast"),
            Col("Phone", "t.parent_phone", label_ur="Phone"),
            Col("Status", "t.status"),
        ),
        roles=STAFF, family=True,
        order_by="t.first_name ASC", date_col="t.admission_date",
        default_where="t.status IN ('active', 'enrolled')",
        statuses=(
            Status(("left", "inactive", "withdrawn", "chore", "chor gaye", "former"),
                   "t.status NOT IN ('active', 'enrolled')", "no longer enrolled", "ab enrolled nahi"),
            Status(("new", "naye", "new admissions", "recently admitted"),
                   "t.admission_date >= (CAST(:today AS date) - INTERVAL '30 days')", "admitted in the last 30 days",
                   "pichle 30 din mein dakhil"),
            Status(("male", "boys", "boy", "larke", "larkay"), "lower(t.gender) = 'male'", "boys", "larke"),
            Status(("female", "girls", "girl", "larkiyan", "larki"), "lower(t.gender) = 'female'", "girls", "larkiyan"),
        ),
        name_cols=("trim(concat_ws(' ', t.first_name, t.last_name))", "t.registration_number",
                   "t.student_code", "t.roll_number"),
        student_expr="t.id",
        count_noun="students", count_noun_ur="talaba",
    ),
    Source(
        key="admissions", module="Admissions", title="admission applications", title_ur="dakhle ki darkhwastein",
        # Not a bare "applicant": "job applicants" are the HR module's.
        keywords=("admission", "admissions", "application", "applications", "admission applicant",
                  "admission applicants", "dakhla", "dakhle", "dakhlay", "naye dakhle"),
        frm="admission_applications t",
        columns=(
            Col("Applicant", "trim(concat_ws(' ', t.first_name, t.last_name))", label_ur="Naam"),
            Col("Class applied", "(SELECT ac.name FROM academic_classes ac WHERE ac.id = t.applying_for_class_id)"),
            Col("Guardian", "t.parent_name", label_ur="Sarparast"),
            Col("Phone", "t.parent_phone"),
            Col("Status", "t.status::text"),
            Col("Submitted", "t.created_at", "datetime"),
        ),
        # Marketing staff work the admissions pipeline (their panel suggests
        # "New admission applications"), so they may read it.
        roles=GOV | {"academic_coordinator", "marketing_staff"},
        date_col=pk("t.created_at"),
        statuses=(
            Status(("pending", "waiting", "new", "baqi", "zer e ghor"),
                   "t.status IN ('submitted', 'under_review')", "awaiting a decision", "faisle ke muntazir"),
            # Compared as text so the query stands whether or not the enum
            # value has been added yet on a given database.
            Status(("waitlisted", "waitlist", "waiting list", "wait list", "intezar list"),
                   "t.status::text = 'waitlisted'", "waitlisted", "waiting list par"),
            Status(("approved", "accepted", "manzoor"), "t.status = 'approved'", "approved", "manzoor"),
            Status(("rejected", "declined", "mustarad"), "t.status = 'rejected'", "rejected", "mustarad"),
        ),
        name_cols=("trim(concat_ws(' ', t.first_name, t.last_name))", "t.parent_name"),
        count_noun="applications", count_noun_ur="darkhwastein",
    ),
    Source(
        key="attendance", module="Attendance", title="student attendance", title_ur="talaba ki hazri",
        keywords=("attendance", "absent", "absents", "present", "hazri", "haziri", "hazir",
                  "ghair hazir", "ghairhazir", "late comers", "attend", "attendance percentage",
                  "attendance rate", "attendance rates", "absentees", "attendance trends", "todays attendance"),
        frm=("attendance_entries t JOIN attendance_sessions a ON a.id = t.session_id "
             "AND a.school_id = t.school_id " + STUDENT_JOIN),
        columns=(
            Col("Student", STUDENT_NAME, label_ur="Talib-e-ilm"),
            Col("Class", section_label("a.class_section_id")),
            Col("Date", "a.session_date", "date", label_ur="Tareekh"),
            Col("Period", "a.period_label"),
            Col("Status", "t.status"),
        ),
        roles=ACADEMIC | COUNSEL, family=True,
        order_by="a.session_date DESC, s.first_name ASC",
        date_col="a.session_date", default_when="today",
        statuses=(
            Status(("absent", "absents", "ghair hazir", "ghairhazir", "ghair haazir", "nahi aaye", "nahi aye"),
                   "t.status = 'absent'", "absent", "ghair hazir"),
            Status(("present", "hazir", "aaye", "attended"), "t.status = 'present'", "present", "hazir"),
            Status(("late", "der se"), "t.status = 'late'", "late", "der se"),
        ),
        name_cols=(STUDENT_NAME,),
        student_expr="t.student_id", section_expr="a.class_section_id",
        count_expr="COUNT(DISTINCT t.student_id)", count_noun="students", count_noun_ur="talaba",
        aggregates=(
            Agg("Present rate",
                "ROUND(100.0 * COUNT(*) FILTER (WHERE t.status = 'present') / NULLIF(COUNT(*), 0), 1)",
                "percent", "Hazri ki sharah"),
        ),
    ),
    Source(
        key="fee_invoices", module="Fees", title="fee invoices", title_ur="fee invoices",
        keywords=("fee", "fees", "invoice", "invoices", "voucher", "vouchers", "challan", "dues",
                  "unpaid", "baqaya", "outstanding", "wajib", "balance",
                  "pending fee", "overdue", "fee nahi di", "fees due"),
        frm="fee_invoices t " + STUDENT_JOIN,
        columns=(
            Col("Invoice", "t.invoice_number"),
            Col("Student", BILLED_STUDENT, label_ur="Talib-e-ilm"),
            Col("Class", student_class("t.student_id")),
            Col("Period", "t.period_label"),
            Col("Due", "t.due_date", "date"),
            Col("Billed", "t.total_amount", "money"),
            Col("Paid", "t.paid_amount", "money"),
            Col("Balance", "(COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0))", "money", "Baqaya"),
            Col("Status", "t.status::text"),
        ),
        roles=FINANCE, family=True,
        order_by="t.due_date DESC NULLS LAST",
        top_order="(COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0)) DESC",
        date_col="t.due_date",
        default_where="t.status NOT IN ('draft', 'cancelled')",
        statuses=(
            Status(("overdue", "late fee", "past due", "time guzar"),
                   "(t.status = 'overdue' OR (t.status IN ('pending', 'partial') AND t.due_date < CAST(:today AS date)))",
                   "overdue", "muddat guzar chuki"),
            Status(("unpaid", "baqaya", "defaulter", "defaulters", "outstanding", "pending", "wajib",
                    "due", "dues", "nahi di", "not paid", "balance"),
                   "t.status IN ('pending', 'partial', 'overdue')", "unpaid", "baqaya"),
            Status(("partial", "partly", "adhi", "kuch"), "t.status = 'partial'", "part-paid", "jazvi ada"),
            Status(("paid", "cleared", "ada", "clear"), "t.status = 'paid'", "paid", "ada shuda"),
        ),
        name_cols=(STUDENT_NAME, "t.invoice_number"),
        student_expr="t.student_id",
        count_noun="invoices", count_noun_ur="invoices",
        aggregates=(
            Agg("Billed", "SUM(t.total_amount)", label_ur="Kul bill"),
            Agg("Received", "SUM(t.paid_amount)", label_ur="Wusool"),
            Agg("Outstanding", "SUM(COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0))",
                label_ur="Baqaya"),
        ),
    ),
    Source(
        key="defaulters", module="Fees", title="fee defaulters", title_ur="fee ke nadehandgan",
        keywords=("defaulter", "defaulters", "top defaulters", "who owes", "kis ne fee nahi di",
                  "fee nahi di", "sab se zyada baqaya", "nadehinda", "nadehandgan", "owes", "owing",
                  "kin bachon ki fee", "kis ki fee baqaya", "students with unpaid fees", "student wise balance",
                  "fee defaulters", "defaulter analytics", "defaulters list", "defaulter list"),
        # One row per student, the balance summed across every unpaid invoice.
        frm=("(SELECT fi.school_id, fi.student_id, "
             "SUM(COALESCE(fi.total_amount, 0) - COALESCE(fi.paid_amount, 0)) AS balance, "
             "COUNT(*) AS invoices, MIN(fi.due_date) AS oldest_due "
             "FROM fee_invoices fi WHERE fi.status IN ('pending', 'partial', 'overdue') "
             "GROUP BY fi.school_id, fi.student_id) t " + STUDENT_JOIN),
        table="fee_invoices",
        columns=(
            Col("Student", BILLED_STUDENT, label_ur="Talib-e-ilm"),
            Col("Class", student_class("t.student_id")),
            Col("Guardian", "s.parent_name", label_ur="Sarparast"),
            Col("Phone", "s.parent_phone"),
            Col("Invoices", "t.invoices", "number"),
            Col("Oldest due", "t.oldest_due", "date"),
            Col("Owes", "t.balance", "money", "Baqaya"),
        ),
        roles=FINANCE, family=True,
        order_by="t.balance DESC", top_order="t.balance DESC", lowest_order="t.balance ASC",
        always_where="t.balance > 0",
        statuses=(Status(("overdue", "past due"), "t.oldest_due < CAST(:today AS date)", "overdue", "muddat guzar chuki"),),
        name_cols=(STUDENT_NAME,),
        student_expr="t.student_id",
        count_noun="students", count_noun_ur="talaba",
        aggregates=(Agg("Owed in total", "SUM(t.balance)", label_ur="Kul baqaya"),),
    ),
    Source(
        key="fee_payments", module="Fees", title="fee payments", title_ur="fee ki adayigiyan",
        keywords=("payment", "payments", "collection", "collections", "collect", "collected",
                  "received", "wusool", "wusooli", "jama", "receipt", "receipts", "deposit", "deposited",
                  "fee collection", "fee aayi", "fee ai", "revenue", "mtd revenue", "income", "aamdani",
                  "earnings", "fee payments"),
        frm="fee_payments t " + STUDENT_JOIN,
        columns=(
            Col("Date", "t.paid_at", "datetime", "Tareekh"),
            Col("Student", BILLED_STUDENT, label_ur="Talib-e-ilm"),
            Col("Class", student_class("t.student_id")),
            Col("Amount", "t.amount", "money", "Raqam"),
            Col("Method", "t.method::text", label_ur="Tareeqa"),
            Col("Reference", "t.transaction_ref"),
        ),
        roles=FINANCE, family=True,
        order_by="t.paid_at DESC NULLS LAST", top_order="t.amount DESC",
        date_col=pk("t.paid_at"),
        default_where="t.status = 'success'",
        statuses=(
            Status(("failed", "nakam"), "t.status = 'failed'", "failed", "nakam"),
            Status(("refunded", "refund", "wapas"), "t.status = 'refunded'", "refunded", "wapas"),
            Status(("cash", "naqd"), "t.status = 'success' AND t.method = 'cash'", "in cash", "naqd"),
            Status(("bank", "transfer"), "t.status = 'success' AND t.method = 'bank_transfer'", "by bank transfer", "bank se"),
            Status(("jazzcash",), "t.status = 'success' AND t.method = 'jazzcash'", "by JazzCash", "JazzCash se"),
            Status(("easypaisa",), "t.status = 'success' AND t.method = 'easypaisa'", "by Easypaisa", "Easypaisa se"),
        ),
        name_cols=(STUDENT_NAME, "t.transaction_ref"),
        student_expr="t.student_id",
        count_noun="payments", count_noun_ur="adayigiyan",
        aggregates=(Agg("Collected", "SUM(t.amount)", label_ur="Wusool"),),
    ),
    Source(
        key="exams", module="Exams", title="exams", title_ur="imtihanat",
        keywords=("exam", "exams", "examination", "imtihan", "imtehan", "imtihanat", "paper", "papers",
                  "datesheet", "date sheet", "term exam", "test", "tests"),
        frm="exams t",
        columns=(
            Col("Exam", "t.name", label_ur="Imtihan"),
            Col("Term", "t.term_label"),
            Col("Starts", "t.start_date", "date"),
            Col("Ends", "t.end_date", "date"),
            Col("Status", "t.status"),
            Col("Results out", "t.result_published", "bool"),
        ),
        roles=STAFF, family=True,
        order_by="t.start_date DESC NULLS LAST", date_col="t.start_date",
        span=("t.start_date", "t.end_date"),
        statuses=(
            Status(("published", "announced", "result aa gaya", "declared"), "t.result_published = true",
                   "with results published", "natija jari"),
        ),
        name_cols=("t.name", "t.term_label"),
        count_noun="exams", count_noun_ur="imtihanat",
    ),
    Source(
        key="exam_results", module="Exams", title="exam results", title_ur="imtihani nataij",
        keywords=("result", "results", "marks", "mark", "grade", "grades", "score", "scores", "natija",
                  "nataij", "percentage", "position", "fail", "failed", "pass", "passed", "topper", "toppers",
                  "exam performance", "weak students", "grade distribution", "grade distributions",
                  "class wise exam performance"),
        frm=("exam_results t JOIN exams e ON e.id = t.exam_id AND e.school_id = t.school_id "
             "LEFT JOIN subjects sub ON sub.id = t.subject_id " + STUDENT_JOIN),
        columns=(
            Col("Student", STUDENT_NAME, label_ur="Talib-e-ilm"),
            Col("Class", student_class("t.student_id")),
            Col("Exam", "e.name", label_ur="Imtihan"),
            Col("Subject", "sub.name", label_ur="Mazmoon"),
            Col("Marks", "t.marks_obtained", "number", "Number"),
            Col("Out of", "t.max_marks", "number"),
            Col("Grade", "t.grade"),
        ),
        roles=ACADEMIC | COUNSEL, family=True,
        order_by="e.start_date DESC NULLS LAST, s.first_name ASC",
        top_order="(t.marks_obtained * 100.0 / NULLIF(t.max_marks, 0)) DESC NULLS LAST",
        lowest_order="(t.marks_obtained * 100.0 / NULLIF(t.max_marks, 0)) ASC NULLS LAST",
        date_col="e.start_date",
        always_where="t.marks_obtained IS NOT NULL",
        statuses=(
            Status(("fail", "failed", "failing", "fail hue", "fail hone"),
                   "t.marks_obtained * 100.0 / NULLIF(t.max_marks, 0) < COALESCE(e.passing_percentage, 33)",
                   "below the pass mark", "fail"),
        ),
        name_cols=(STUDENT_NAME, "e.name", "sub.name"),
        student_expr="t.student_id",
        count_noun="results", count_noun_ur="nataij",
        aggregates=(
            Agg("Average", "ROUND(AVG(t.marks_obtained * 100.0 / NULLIF(t.max_marks, 0)), 1)", "percent", "Ausat"),
        ),
    ),
    Source(
        key="report_cards", module="Report Cards", title="report cards", title_ur="report cards",
        keywords=("report card", "report cards", "result card", "result cards", "progress report", "reportcard"),
        frm="report_cards t " + STUDENT_JOIN,
        columns=(
            Col("Student", STUDENT_NAME, label_ur="Talib-e-ilm"),
            Col("Class", student_class("t.student_id")),
            Col("Period", "t.period_label"),
            Col("Percentage", "t.percentage", "percent"),
            Col("Grade", "t.overall_grade"),
            Col("Position", "t.position_in_class", "number"),
            Col("Published", "t.is_published", "bool"),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.updated_at DESC NULLS LAST",
        top_order="t.percentage DESC NULLS LAST", lowest_order="t.percentage ASC NULLS LAST",
        statuses=(
            Status(("published", "jari"), "t.is_published = true", "published", "jari shuda"),
            Status(("draft", "unpublished", "pending"), "t.is_published = false", "not yet published", "abhi jari nahi"),
        ),
        name_cols=(STUDENT_NAME, "t.period_label"),
        student_expr="t.student_id",
        count_noun="report cards", count_noun_ur="report cards",
    ),
    Source(
        key="homework", module="Homework", title="homework", title_ur="homework",
        keywords=("homework", "home work", "ghar ka kaam", "home task"),
        frm="homework t",
        columns=(
            Col("Title", "t.title", label_ur="Unwan"),
            Col("Class", section_label("t.class_section_id")),
            Col("Due", "t.due_date", "date"),
            Col("Set by", staff_name("t.teacher_user_id")),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.due_date DESC NULLS LAST", date_col="t.due_date",
        name_cols=("t.title",), section_expr="t.class_section_id",
        count_noun="homework items", count_noun_ur="homework",
    ),
    Source(
        key="assignments", module="Assignments", title="assignments", title_ur="assignments",
        keywords=("assignment", "assignments", "project", "projects", "tafweez"),
        frm="assignments t",
        columns=(
            Col("Title", "t.title"),
            Col("Class", section_label("t.class_section_id")),
            Col("Due", "t.due_date", "date"),
            Col("Max marks", "t.max_marks", "number"),
            Col("Set by", staff_name("t.teacher_user_id")),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.due_date DESC NULLS LAST", date_col="t.due_date",
        name_cols=("t.title",), section_expr="t.class_section_id",
        count_noun="assignments", count_noun_ur="assignments",
    ),
    Source(
        key="diary", module="Diary", title="diary entries", title_ur="diary",
        keywords=("diary", "dairy", "class diary", "daily diary"),
        frm="diary_entries t LEFT JOIN subjects sub ON sub.id = t.subject_id",
        columns=(
            Col("Date", "t.entry_date", "date"),
            Col("Class", section_label("t.class_section_id")),
            Col("Subject", "sub.name"),
            Col("Title", "t.title"),
            Col("Type", "t.category"),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.entry_date DESC NULLS LAST", date_col="t.entry_date",
        name_cols=("t.title", "sub.name"), section_expr="t.class_section_id",
        count_noun="diary entries", count_noun_ur="diary entries",
    ),
    Source(
        key="timetable", module="Timetable", title="timetable", title_ur="timetable",
        keywords=("timetable", "time table", "schedule", "period", "periods", "lecture", "lectures",
                  "class schedule", "routine"),
        frm="timetable_entries t",
        columns=(
            Col("Day", "(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[t.day_of_week::int]"),
            Col("Time", "concat_ws('–', t.start_time, t.end_time)"),
            Col("Class", section_label("t.class_section_id")),
            Col("Subject", "t.subject_name", label_ur="Mazmoon"),
            Col("Teacher", staff_name("t.teacher_user_id"), label_ur="Ustad"),
            Col("Room", "t.room"),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.day_of_week ASC, t.start_time ASC",
        always_where="t.is_published = true", dow_expr="t.day_of_week::int",
        name_cols=("t.subject_name",), section_expr="t.class_section_id",
        self_expr="t.teacher_user_id",
        count_noun="periods", count_noun_ur="periods",
    ),
    Source(
        key="classes", module="Academic", title="classes and sections", title_ur="classes aur sections",
        keywords=("classes", "sections", "section", "class list", "grades", "class strength",
                  "kitni classes", "jamaat", "jamaaten"),
        frm="class_sections t JOIN academic_classes ac ON ac.id = t.class_id",
        columns=(
            Col("Class", "ac.name"),
            Col("Section", "t.name"),
            Col("Room", "t.room"),
            Col("Students", "(SELECT COUNT(*) FROM student_enrollments se JOIN students st ON st.id = se.student_id "
                            "WHERE se.class_section_id = t.id AND se.end_date IS NULL "
                            "AND st.status IN ('active', 'enrolled'))", "number", "Talaba"),
        ),
        roles=STAFF,
        order_by="ac.grade_level ASC NULLS LAST, ac.name ASC, t.name ASC",
        top_order="(SELECT COUNT(*) FROM student_enrollments se WHERE se.class_section_id = t.id "
                  "AND se.end_date IS NULL) DESC",
        name_cols=("ac.name", "t.name"), section_expr="t.id",
        count_noun="sections", count_noun_ur="sections",
    ),
    Source(
        key="subjects", module="Academic", title="subjects", title_ur="mazameen",
        keywords=("subject", "subjects", "mazmoon", "mazameen", "courses", "course"),
        frm="subjects t",
        columns=(Col("Subject", "t.name", label_ur="Mazmoon"), Col("Code", "t.code")),
        roles=STAFF, family=True, order_by="t.name ASC",
        name_cols=("t.name", "t.code"),
        count_noun="subjects", count_noun_ur="mazameen",
    ),
    Source(
        key="teacher_assignments", module="Academic", title="teaching assignments", title_ur="tadrees ki taqseem",
        keywords=("teaches", "who teaches", "kaun parhata", "kaun parhati", "assigned teacher",
                  "class teacher", "teaching assignment", "my classes", "meri classes", "mere classes",
                  "assigned classes", "kon parhata", "parhata", "parhati", "teacher assignments",
                  "subject allocations", "subject allocation", "teacher subjects", "allocations",
                  "teacher assignment", "class teachers"),
        frm="teacher_assignments t LEFT JOIN subjects sub ON sub.id = t.subject_id",
        columns=(
            Col("Teacher", staff_name("t.teacher_user_id"), label_ur="Ustad"),
            Col("Class", section_label("t.class_section_id")),
            Col("Subject", "sub.name", label_ur="Mazmoon"),
        ),
        roles=ACADEMIC, family=True,
        order_by="t.created_at ASC",
        name_cols=(staff_name("t.teacher_user_id"), "sub.name"),
        section_expr="t.class_section_id", self_expr="t.teacher_user_id",
        count_noun="assignments", count_noun_ur="taqseemat",
    ),
    Source(
        key="enrolment_by_class", module="Students", title="enrolment by class", title_ur="class-wise talaba",
        keywords=("enrollment breakdown", "enrolment breakdown", "class enrollment", "class enrolment",
                  "class wise", "classwise", "class strength", "students per class", "students by class",
                  "class vacancy", "vacancy", "vacancies", "class size", "class sizes", "har class",
                  "class wise students", "section wise"),
        # One row per section, counting the students enrolled in it now.
        frm=("(SELECT cs.school_id, cs.id AS section_id, ac.name AS class_name, cs.name AS section_name, "
             "ac.grade_level, cs.room, "
             "(SELECT COUNT(*) FROM student_enrollments se JOIN students st ON st.id = se.student_id "
             "WHERE se.class_section_id = cs.id AND se.end_date IS NULL "
             "AND st.status::text IN ('active', 'enrolled')) AS students, "
             "(SELECT COUNT(*) FROM student_enrollments se JOIN students st ON st.id = se.student_id "
             "WHERE se.class_section_id = cs.id AND se.end_date IS NULL "
             "AND st.status::text IN ('active', 'enrolled') AND lower(COALESCE(st.gender, '')) IN ('male', 'm', 'boy')) AS boys, "
             "(SELECT COUNT(*) FROM student_enrollments se JOIN students st ON st.id = se.student_id "
             "WHERE se.class_section_id = cs.id AND se.end_date IS NULL "
             "AND st.status::text IN ('active', 'enrolled') AND lower(COALESCE(st.gender, '')) IN ('female', 'f', 'girl')) AS girls "
             "FROM class_sections cs JOIN academic_classes ac ON ac.id = cs.class_id) t"),
        table="student_enrollments",
        columns=(
            Col("Class", "concat_ws(' ', t.class_name, t.section_name)"),
            Col("Room", "t.room"),
            Col("Students", "t.students", "number", "Talaba"),
            Col("Boys", "t.boys", "number", "Larkay"),
            Col("Girls", "t.girls", "number", "Larkiyan"),
        ),
        roles=ACADEMIC | COUNSEL | FINANCE,
        order_by="t.grade_level NULLS LAST, t.class_name, t.section_name",
        top_order="t.students DESC", lowest_order="t.students ASC",
        name_cols=("t.class_name",), section_expr="t.section_id",
        count_noun="class sections", count_noun_ur="sections",
        aggregates=(Agg("Students enrolled", "SUM(t.students)", "number", "Kul talaba"),),
    ),
    Source(
        key="campuses", module="Campuses", title="campuses", title_ur="campus",
        keywords=("campus", "campuses", "branch", "branches", "compare campuses", "all campuses",
                  "campus wise", "branch wise"),
        frm=("(SELECT c.school_id, c.id AS campus_id, c.name, c.code, c.is_active, "
             "(SELECT COUNT(*) FROM students st WHERE st.campus_id = c.id "
             "AND st.status::text IN ('active', 'enrolled')) AS students, "
             "(SELECT COUNT(DISTINCT ur.user_id) FROM user_roles ur WHERE ur.campus_id = c.id "
             "AND ur.role::text NOT IN ('parent', 'student')) AS staff, "
             "(SELECT COALESCE(SUM(COALESCE(fi.total_amount, 0) - COALESCE(fi.paid_amount, 0)), 0) "
             "FROM fee_invoices fi WHERE fi.campus_id = c.id "
             "AND fi.status IN ('pending', 'partial', 'overdue')) AS outstanding, "
             "(SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.campus_id = c.id "
             "AND fp.status = 'success' AND ((fp.paid_at AT TIME ZONE 'Asia/Karachi')::date) "
             ">= date_trunc('month', CAST(:today AS date))) AS collected_month "
             "FROM campuses c) t"),
        table="campuses",
        columns=(
            Col("Campus", "t.name"),
            Col("Code", "t.code"),
            Col("Students", "t.students", "number", "Talaba"),
            Col("Staff", "t.staff", "number"),
            Col("Outstanding fees", "t.outstanding", "money", "Baqaya fees"),
            Col("Collected this month", "t.collected_month", "money", "Is mahine wusool"),
        ),
        roles=GOV, order_by="t.name ASC", top_order="t.students DESC", lowest_order="t.students ASC",
        default_where="t.is_active IS NOT FALSE",
        name_cols=("t.name", "t.code"),
        count_noun="campuses", count_noun_ur="campus",
        aggregates=(
            Agg("Students", "SUM(t.students)", "number", "Talaba"),
            Agg("Outstanding", "SUM(t.outstanding)", "money", "Baqaya"),
            Agg("Collected this month", "SUM(t.collected_month)", "money", "Is mahine wusool"),
        ),
    ),
    Source(
        key="campaigns", module="Marketing", title="marketing campaigns", title_ur="marketing campaigns",
        keywords=("campaign", "campaigns", "marketing campaigns", "active campaigns", "marketing",
                  "advertising", "ads", "muhim"),
        frm="crm_campaigns t",
        columns=(
            Col("Campaign", "t.name"),
            Col("Channel", "t.channel"),
            Col("Status", "t.status"),
            Col("Budget", "t.budget", "money"),
            Col("Starts", "t.start_date", "date"),
            Col("Ends", "t.end_date", "date"),
        ),
        roles=MARKETING, order_by="t.start_date DESC NULLS LAST", top_order="t.budget DESC NULLS LAST",
        date_col="t.start_date",
        statuses=(
            Status(("active", "running", "live", "current"), "lower(COALESCE(t.status, '')) IN ('active', 'running', 'live')",
                   "active", "jari"),
            Status(("ended", "completed", "finished", "past"), "lower(COALESCE(t.status, '')) IN ('ended', 'completed', 'finished')",
                   "ended", "khatam"),
        ),
        name_cols=("t.name", "t.channel"),
        count_noun="campaigns", count_noun_ur="campaigns",
        aggregates=(Agg("Budget", "SUM(t.budget)", label_ur="Budget"),),
    ),
    Source(
        key="staff", module="Staff", title="staff", title_ur="staff",
        keywords=("staff", "teacher", "teachers", "ustad", "ustaad", "asatza", "asatiza", "employee",
                  "employees", "mulazim", "mulazmeen", "faculty", "team", "principal", "clerk",
                  "staff directory", "active staff", "staff list", "current teachers", "all teachers"),
        # The HR directory and the staff accounts together. A school that
        # added its teachers as users and never filled in the HR directory
        # was told it had "0 staff members".
        frm=STAFF_UNION, table="hr_staff_directory",
        columns=(
            Col("Name", "t.full_name", label_ur="Naam"),
            Col("Position", "t.position", label_ur="Ohda"),
            Col("Department", "t.department"),
            Col("Contact", "t.contact"),
            Col("Joined", "t.joining_date", "date"),
        ),
        roles=GOV | {"hr_manager", "academic_coordinator"},
        order_by="t.full_name ASC", date_col="t.joining_date",
        default_where="t.is_active = true",
        statuses=(
            Status(("inactive", "left", "former", "chor gaye"), "t.is_active = false", "no longer active", "ab kaam nahi karte"),
            Status(("teacher", "teachers", "ustad", "asatza"), "t.is_active = true AND lower(t.position) LIKE '%teach%'",
                   "teachers", "asatza"),
        ),
        name_cols=("t.full_name", "t.position", "t.department"),
        count_noun="staff members", count_noun_ur="staff",
    ),
    Source(
        key="staff_attendance", module="Staff Attendance", title="staff attendance", title_ur="staff ki hazri",
        keywords=("staff attendance", "teacher attendance", "teachers attendance", "staff absent",
                  "teacher absent", "teachers absent", "staff hazri", "ustad hazri", "staff late",
                  "teachers late", "clock in", "check in", "my attendance", "meri hazri",
                  "staff turnout", "turnout", "staff present"),
        frm="hr_staff_attendance t",
        columns=(
            Col("Staff", staff_name("t.user_id"), label_ur="Naam"),
            Col("Date", "t.attendance_date", "date"),
            Col("Status", "t.status"),
            Col("In", "t.clock_in", "datetime"),
            Col("Out", "t.clock_out", "datetime"),
        ),
        roles=HR, order_by="t.attendance_date DESC, t.clock_in ASC",
        date_col="t.attendance_date", default_when="today",
        statuses=(
            Status(("absent", "ghair hazir"), "t.status = 'absent'", "absent", "ghair hazir"),
            Status(("late", "der se"), "t.status = 'late'", "late", "der se"),
            Status(("leave", "chutti"), "t.status = 'leave'", "on leave", "chutti par"),
            Status(("present", "hazir"), "t.status = 'present'", "present", "hazir"),
            Status(("half day", "half_day", "adha din"), "t.status = 'half_day'", "half day", "adha din"),
        ),
        name_cols=(staff_name("t.user_id"),), self_expr="t.user_id",
        count_expr="COUNT(DISTINCT t.user_id)", count_noun="staff", count_noun_ur="staff",
    ),
    Source(
        key="leave", module="Leave", title="leave requests", title_ur="chutti ki darkhwastein",
        keywords=("leave", "leaves", "leave request", "on leave", "chutti", "chhutti", "rukhsat",
                  "chutti ki darkhwast", "my leave", "meri chutti"),
        frm="hr_leave_requests t LEFT JOIN hr_leave_types lt ON lt.id = t.leave_type_id",
        columns=(
            Col("Staff", staff_name("t.user_id"), label_ur="Naam"),
            Col("Type", "lt.name"),
            Col("From", "t.start_date", "date"),
            Col("To", "t.end_date", "date"),
            Col("Days", "t.days_count", "number"),
            Col("Status", "t.status"),
            Col("Reason", "t.reason"),
        ),
        roles=HR, order_by="t.start_date DESC NULLS LAST",
        span=("t.start_date", "t.end_date"),
        statuses=(
            Status(("pending", "waiting", "baqi"), "lower(coalesce(t.status, 'pending')) = 'pending'",
                   "awaiting approval", "manzoori ki muntazir"),
            Status(("approved", "manzoor"), "lower(t.status) = 'approved'", "approved", "manzoor"),
            Status(("rejected", "mustarad"), "lower(t.status) = 'rejected'", "rejected", "mustarad"),
        ),
        name_cols=(staff_name("t.user_id"), "lt.name"), self_expr="t.user_id",
        count_noun="leave requests", count_noun_ur="darkhwastein",
        aggregates=(Agg("Days", "SUM(t.days_count)", "number", "Din"),),
    ),
    Source(
        key="payslips", module="Payroll", title="payslips", title_ur="salary slips",
        keywords=("payslip", "payslips", "pay slip", "salary slip", "salary slips", "payroll",
                  "net pay", "salary paid", "tankhwah di", "my payslip", "meri salary slip"),
        frm="hr_payslips t",
        columns=(
            Col("Staff", staff_name("t.employee_user_id"), label_ur="Naam"),
            Col("Gross", "COALESCE(t.total_gross, t.gross)", "money"),
            Col("Deductions", "COALESCE(t.total_deductions, t.deductions)", "money", "Katoti"),
            Col("Net", "COALESCE(t.total_net, t.net)", "money", "Khalis"),
            Col("Status", "t.status"),
            Col("Paid on", "t.paid_at", "datetime"),
        ),
        roles=HR | {"accountant"}, order_by="t.created_at DESC",
        top_order="COALESCE(t.total_net, t.net) DESC NULLS LAST",
        date_col=pk("t.created_at"),
        name_cols=(staff_name("t.employee_user_id"),), self_expr="t.employee_user_id",
        count_noun="payslips", count_noun_ur="salary slips",
        aggregates=(Agg("Net total", "SUM(COALESCE(t.total_net, t.net))", label_ur="Kul khalis"),),
    ),
    Source(
        key="salaries", module="Salaries", title="salaries", title_ur="tankhwahein",
        keywords=("salary", "salaries", "tankhwah", "tankhwa", "pay scale", "base salary", "my salary",
                  "meri salary", "meri tankhwah", "wages"),
        frm="hr_salary_records t",
        columns=(
            Col("Staff", staff_name("t.user_id"), label_ur="Naam"),
            Col("Base", "t.base_salary", "money", "Bunyadi"),
            Col("Allowances", "t.allowances", "money", "Allowances"),
            Col("Deductions", "t.deductions", "money", "Katoti"),
            Col("From", "t.effective_from", "date"),
        ),
        roles=HR | {"accountant"}, order_by="t.base_salary DESC NULLS LAST",
        top_order="t.base_salary DESC NULLS LAST", lowest_order="t.base_salary ASC NULLS LAST",
        default_where="COALESCE(t.is_active, true) = true",
        name_cols=(staff_name("t.user_id"),), self_expr="t.user_id",
        count_noun="salary records", count_noun_ur="records",
        aggregates=(Agg("Monthly base total", "SUM(t.base_salary)", label_ur="Kul bunyadi"),),
    ),
    Source(
        key="contracts", module="Contracts", title="contracts", title_ur="muahiday",
        keywords=("contract", "contracts", "muahida", "muahiday", "agreement", "agreements", "expiring"),
        frm="hr_contracts t",
        columns=(
            Col("Staff", staff_name("t.user_id"), label_ur="Naam"),
            Col("Reference", "t.reference_number"),
            Col("Position", "t.position"),
            Col("Type", "t.contract_type"),
            Col("Starts", "t.start_date", "date"),
            Col("Ends", "t.end_date", "date"),
            Col("Status", "t.status"),
        ),
        roles=HR, order_by="t.end_date ASC NULLS LAST",
        span=("t.start_date", "t.end_date"),
        statuses=(
            Status(("expiring", "khatam hone", "renew", "renewal"),
                   "t.end_date BETWEEN CAST(:today AS date) AND (CAST(:today AS date) + INTERVAL '60 days')",
                   "ending within 60 days", "60 din mein khatam"),
            Status(("expired", "khatam", "ended"), "t.end_date < CAST(:today AS date)", "already ended", "khatam ho chuke"),
        ),
        name_cols=(staff_name("t.user_id"), "t.reference_number", "t.position"), self_expr="t.user_id",
        count_noun="contracts", count_noun_ur="muahiday",
    ),
    Source(
        key="jobs", module="Recruitment", title="job openings", title_ur="naukriyan",
        keywords=("job", "jobs", "vacancy", "vacancies", "opening", "openings", "hiring", "recruitment",
                  "naukri", "naukriyan", "post", "posts"),
        frm="hr_job_postings t",
        columns=(
            Col("Title", "t.title"), Col("Department", "t.department"), Col("Type", "t.employment_type"),
            Col("Openings", "t.openings", "number"), Col("Status", "t.status"), Col("Closes", "t.closes_at", "datetime"),
        ),
        roles=HR, date_col=pk("t.created_at"),
        statuses=(Status(("open", "active", "khuli"), "lower(t.status) IN ('open', 'active', 'published')", "open", "khuli"),),
        name_cols=("t.title", "t.department"),
        count_noun="job postings", count_noun_ur="postings",
    ),
    Source(
        key="applicants", module="Recruitment", title="job applicants", title_ur="umeedwar",
        keywords=("applicant", "applicants", "candidate", "candidates", "cv", "cvs", "resume", "interview",
                  "interviews", "umeedwar", "job applicants", "job applications", "job applicant"),
        frm="hr_applicants t LEFT JOIN hr_job_postings jp ON jp.id = t.posting_id",
        columns=(
            Col("Name", "t.full_name"), Col("Post", "jp.title"), Col("Stage", "t.stage"),
            Col("Rating", "t.rating", "number"), Col("Phone", "t.phone"), Col("Applied", "t.applied_at", "datetime"),
        ),
        roles=HR, date_col=pk("t.created_at"), top_order="t.rating DESC NULLS LAST",
        name_cols=("t.full_name", "jp.title"),
        count_noun="applicants", count_noun_ur="umeedwar",
    ),
    Source(
        key="appraisals", module="Appraisals", title="staff appraisals", title_ur="karkardagi jaiza",
        keywords=("appraisal", "appraisals", "performance review", "staff review", "evaluation", "jaiza",
                  "increment", "increments"),
        frm="staff_appraisals t",
        columns=(
            Col("Staff", staff_name("t.staff_user_id")), Col("Status", "t.status"),
            Col("Increment", "t.salary_increment_pct", "percent"), Col("Created", "t.created_at", "datetime"),
        ),
        roles=HR, top_order="t.salary_increment_pct DESC NULLS LAST",
        name_cols=(staff_name("t.staff_user_id"),), self_expr="t.staff_user_id",
        count_noun="appraisals", count_noun_ur="jaiza",
    ),
    Source(
        key="complaints", module="Complaints", title="complaints", title_ur="shikayaat",
        keywords=("complaint", "complaints", "shikayat", "shikayaat", "shikayatein", "grievance", "issue",
                  "issues", "problem", "problems"),
        frm="complaints t " + STUDENT_JOIN,
        columns=(
            Col("Subject", "t.subject", label_ur="Mauzu"),
            Col("Category", "t.category"),
            Col("Priority", "t.priority"),
            Col("Student", STUDENT_NAME),
            Col("Status", "t.status"),
            Col("Raised", "t.created_at", "datetime"),
        ),
        roles=GOV | {"counselor", "academic_coordinator"}, family=True,
        date_col=pk("t.created_at"),
        statuses=(
            Status(("open", "pending", "unresolved", "baqi", "hal nahi"), "lower(coalesce(t.status, 'open')) <> 'resolved'",
                   "not yet resolved", "abhi hal nahi hui"),
            Status(("resolved", "closed", "hal"), "lower(t.status) = 'resolved'", "resolved", "hal shuda"),
            Status(("urgent", "high", "fori"), "lower(t.priority) IN ('high', 'urgent')", "high priority", "fori"),
        ),
        name_cols=("t.subject", "t.category", STUDENT_NAME),
        student_expr="t.student_id", self_expr="t.sender_user_id",
        count_noun="complaints", count_noun_ur="shikayaat",
    ),
    Source(
        key="notices", module="Notices", title="notices", title_ur="notices",
        keywords=("notice", "notices", "announcement", "announcements", "elaan", "circular", "circulars",
                  "notice board"),
        frm="notices t",
        columns=(
            Col("Title", "t.title", label_ur="Unwan"), Col("For", "t.audience"), Col("Priority", "t.priority"),
            Col("Pinned", "t.pinned", "bool"), Col("Posted", "t.created_at", "datetime"),
        ),
        roles=STAFF, family=True, date_col=pk("t.created_at"),
        always_where="(t.expires_at IS NULL OR t.expires_at > now())",
        statuses=(Status(("urgent", "important", "zaroori", "ahem"), "lower(t.priority) IN ('high', 'urgent')",
                         "urgent", "zaroori"),),
        name_cols=("t.title",),
        count_noun="notices", count_noun_ur="notices",
    ),
    Source(
        key="holidays", module="Holidays", title="holidays", title_ur="chuttiyan",
        keywords=("holiday", "holidays", "vacation", "vacations", "chuttiyan", "chhuttiyan", "tateel",
                  "tateelat", "school band", "school off", "off day", "off days"),
        frm="holidays t",
        columns=(
            Col("Holiday", "t.title", label_ur="Chutti"), Col("From", "t.start_date", "date"),
            Col("To", "t.end_date", "date"), Col("Type", "t.holiday_type"),
        ),
        roles=STAFF, family=True, order_by="t.start_date ASC",
        span=("t.start_date", "t.end_date"), default_when="upcoming",
        name_cols=("t.title",),
        count_noun="holidays", count_noun_ur="chuttiyan",
    ),
    Source(
        key="events", module="Events", title="events", title_ur="taqreebat",
        keywords=("event", "events", "function", "functions", "program", "programme", "taqreeb", "taqreebat",
                  "sports day", "trip", "picnic", "ceremony"),
        frm="school_events t",
        columns=(
            Col("Event", "t.title", label_ur="Taqreeb"), Col("Date", "t.event_date", "date"),
            Col("Time", "concat_ws('–', t.start_time, t.end_time)"), Col("Where", "t.location"),
            Col("For", "t.audience"), Col("RSVPs", "t.rsvp_count", "number"),
        ),
        roles=STAFF, family=True, order_by="t.event_date ASC",
        date_col="t.event_date", default_when="upcoming",
        name_cols=("t.title", "t.event_type"),
        count_noun="events", count_noun_ur="taqreebat",
    ),
    Source(
        key="books", module="Library", title="library books", title_ur="library ki kitabein",
        keywords=("book", "books", "library", "kitab", "kitaben", "kitabein", "author", "catalogue", "catalog"),
        frm="library_books t",
        columns=(
            Col("Title", "t.title", label_ur="Kitab"), Col("Author", "t.author", label_ur="Musannif"),
            Col("Category", "t.category"), Col("Copies", "t.total_copies", "number"),
            Col("Available", "t.available_copies", "number", "Dastiyab"), Col("Shelf", "t.shelf_location"),
        ),
        roles=STAFF, family=True, order_by="t.title ASC",
        statuses=(Status(("available", "dastiyab", "in stock"), "t.available_copies > 0", "available", "dastiyab"),
                  Status(("unavailable", "out", "not available"), "COALESCE(t.available_copies, 0) = 0",
                         "none on the shelf", "koi copy nahi")),
        name_cols=("t.title", "t.author", "t.category", "t.isbn"),
        count_noun="titles", count_noun_ur="kitabein",
        aggregates=(Agg("Copies", "SUM(t.total_copies)", "number", "Copies"),
                    Agg("On the shelf", "SUM(t.available_copies)", "number", "Dastiyab")),
    ),
    Source(
        key="book_issues", module="Library", title="books issued", title_ur="jari kitabein",
        keywords=("issued", "borrowed", "borrow", "issue", "returned", "return", "library overdue",
                  "library fine", "fine", "fines", "kitab wapas", "book issues", "book issue",
                  "books issued", "issued books", "library issues", "library fines", "pending fines",
                  "overdue loans", "loans"),
        frm="book_issues t LEFT JOIN library_books b ON b.id = t.book_id "
            "LEFT JOIN students s ON s.id = t.borrower_id AND t.borrower_type = 'student'",
        columns=(
            Col("Book", "b.title"),
            Col("Borrower", "COALESCE(NULLIF(" + STUDENT_NAME + ", ''), " + staff_name("t.borrower_id") + ")"),
            Col("Issued", "t.issue_date", "date"), Col("Due", "t.due_date", "date"),
            Col("Returned", "t.return_date", "date"), Col("Fine", "t.fine_amount", "money"),
            Col("Status", "t.status"),
        ),
        roles=STAFF, family=True, order_by="t.issue_date DESC NULLS LAST",
        date_col="t.issue_date",
        statuses=(
            Status(("overdue", "late", "der"), "t.status = 'issued' AND t.due_date < CAST(:today AS date)", "overdue", "der se"),
            Status(("returned", "wapas"), "t.status = 'returned'", "returned", "wapas"),
            Status(("issued", "out", "jari"), "t.status = 'issued'", "still out", "abhi jari"),
        ),
        name_cols=("b.title", STUDENT_NAME),
        student_expr="t.borrower_id",
        count_noun="issues", count_noun_ur="kitabein",
        aggregates=(Agg("Fines", "SUM(t.fine_amount)", label_ur="Jurmana"),),
    ),
    Source(
        key="vehicles", module="Transport", title="school vehicles", title_ur="gaariyan",
        keywords=("bus", "buses", "van", "vans", "vehicle", "vehicles", "gaari", "gaariyan", "driver",
                  "drivers", "fleet", "conductor"),
        frm="vehicles t",
        columns=(
            Col("Bus", "t.bus_number"), Col("Reg. no.", "t.registration_no"), Col("Type", "t.vehicle_type"),
            Col("Seats", "t.seating_capacity", "number"), Col("Driver", "t.driver_name"),
            Col("Driver phone", "t.driver_phone"), Col("Status", "t.status"),
        ),
        roles=STAFF, order_by="t.bus_number ASC",
        name_cols=("t.bus_number", "t.registration_no", "t.driver_name"),
        count_noun="vehicles", count_noun_ur="gaariyan",
        aggregates=(Agg("Seats", "SUM(t.seating_capacity)", "number", "Seats"),),
    ),
    Source(
        key="routes", module="Transport", title="bus routes", title_ur="bus routes",
        keywords=("route", "routes", "transport", "pick", "pickup", "drop", "stop", "stops"),
        frm="bus_routes t",
        columns=(
            Col("Route", "t.route_name"), Col("Code", "t.route_code"), Col("From", "t.start_point"),
            Col("To", "t.end_point"), Col("Morning", "t.morning_departure"), Col("Evening", "t.evening_departure"),
            Col("Fare", "t.monthly_fare", "money"),
        ),
        roles=STAFF, order_by="t.route_name ASC",
        name_cols=("t.route_name", "t.route_code", "t.start_point", "t.end_point"),
        count_noun="routes", count_noun_ur="routes",
    ),
    Source(
        key="transport_students", module="Transport", title="students on transport", title_ur="transport wale talaba",
        keywords=("transport students", "bus students", "who uses bus", "bus wale", "van wale", "transport use",
                  "students on transport", "on transport", "using transport", "use transport", "transport wale"),
        frm="student_transport_assignments t " + STUDENT_JOIN + " LEFT JOIN bus_routes r ON r.id = t.route_id",
        columns=(
            Col("Student", STUDENT_NAME), Col("Class", student_class("t.student_id")),
            Col("Route", "r.route_name"), Col("Pickup", "t.pickup_type"), Col("Status", "t.status"),
        ),
        roles=STAFF, family=True, order_by="s.first_name ASC",
        name_cols=(STUDENT_NAME, "r.route_name"), student_expr="t.student_id",
        count_noun="students", count_noun_ur="talaba",
    ),
    Source(
        key="inventory", module="Inventory", title="inventory", title_ur="saman",
        keywords=("inventory", "stock", "store", "asset", "assets", "saman", "item", "items", "supplies",
                  "low stock", "reorder"),
        frm="inventory_items t",
        columns=(
            Col("Item", "t.item_name", label_ur="Cheez"), Col("Category", "t.category_name"),
            Col("Total", "t.total_quantity", "number"), Col("Available", "t.available_quantity", "number", "Dastiyab"),
            Col("Reorder at", "t.min_reorder_threshold", "number"), Col("Where", "t.room_location"),
        ),
        roles=GOV | {"accountant"}, order_by="t.item_name ASC",
        statuses=(Status(("low", "low stock", "reorder", "kam", "khatam"),
                         "t.available_quantity <= t.min_reorder_threshold", "at or below reorder level",
                         "reorder ki had par"),),
        name_cols=("t.item_name", "t.category_name", "t.sku_barcode"),
        count_noun="items", count_noun_ur="cheezein",
        aggregates=(Agg("Stock value", "SUM(t.available_quantity * COALESCE(t.unit_price, 0))", label_ur="Maliyat"),),
    ),
    Source(
        key="expenses", module="Expenses", title="expenses", title_ur="akhrajat",
        keywords=("expense", "expenses", "kharcha", "kharche", "kharchay", "spent", "spending", "spend",
                  "akhrajat", "bill", "bills", "vendor", "vendors"),
        frm="finance_expenses t",
        columns=(
            Col("Date", "t.expense_date", "date"), Col("Description", "t.description"),
            Col("Category", "t.category"), Col("Vendor", "t.vendor"), Col("Amount", "t.amount", "money", "Raqam"),
        ),
        roles=FINANCE, order_by="t.expense_date DESC NULLS LAST", top_order="t.amount DESC",
        date_col="t.expense_date",
        name_cols=("t.description", "t.category", "t.vendor"),
        count_noun="expenses", count_noun_ur="akhrajat",
        aggregates=(Agg("Spent", "SUM(t.amount)", label_ur="Kharch"),),
    ),
    Source(
        key="visitors", module="Visitors", title="visitors", title_ur="mehman",
        keywords=("visitor", "visitors", "mehman", "guest", "guests", "gate pass", "gate", "visit", "visits"),
        frm="visitor_passes t " + STUDENT_JOIN,
        columns=(
            Col("Visitor", "t.visitor_name"), Col("Purpose", "t.purpose"), Col("For student", STUDENT_NAME),
            Col("Date", "t.scheduled_date", "date"), Col("Status", "t.checkin_status"),
            Col("In", "t.checkin_at", "datetime"), Col("Out", "t.checkout_at", "datetime"),
        ),
        roles=GOV, order_by="t.scheduled_date DESC NULLS LAST",
        date_col="t.scheduled_date",
        statuses=(Status(("inside", "checked in", "andar"), "t.checkin_status = 'checked_in'", "inside now", "abhi andar"),),
        name_cols=("t.visitor_name", STUDENT_NAME),
        count_noun="visitors", count_noun_ur="mehman",
    ),
    Source(
        key="leads", module="Admissions CRM", title="enquiries", title_ur="enquiries",
        keywords=("lead", "leads", "enquiry", "enquiries", "inquiry", "inquiries", "prospect", "prospects",
                  "marketing", "follow up", "follow ups", "followup"),
        frm="crm_leads t",
        columns=(
            Col("Name", "t.full_name"), Col("Phone", "t.phone"), Col("Source", "t.source"),
            Col("Status", "t.status"), Col("Score", "t.score", "number"),
            Col("Next follow-up", "t.next_follow_up_at", "datetime"),
        ),
        roles=MARKETING, date_col=pk("t.created_at"), top_order="t.score DESC NULLS LAST",
        statuses=(Status(("due", "follow up", "overdue"), "t.next_follow_up_at < now()", "with a follow-up due",
                         "follow up baqi"),),
        name_cols=("t.full_name", "t.source"),
        count_noun="enquiries", count_noun_ur="enquiries",
    ),
    Source(
        key="hostel_rooms", module="Hostel", title="hostel rooms", title_ur="hostel ke kamray",
        keywords=("hostel", "hostels", "room", "rooms", "boarding", "dorm", "kamra", "kamray"),
        frm="hostel_rooms t",
        columns=(
            Col("Building", "t.building_name"), Col("Room", "t.room_number"), Col("Type", "t.room_type"),
            Col("Capacity", "t.capacity", "number"), Col("Occupied", "t.occupied_count", "number"),
            Col("Fee/term", "t.fee_per_term", "money"),
        ),
        roles=STAFF, order_by="t.building_name ASC, t.room_number ASC",
        statuses=(Status(("vacant", "empty", "khali", "available"), "COALESCE(t.occupied_count, 0) < t.capacity",
                         "with space", "khali jagah"),),
        name_cols=("t.building_name", "t.room_number"),
        count_noun="rooms", count_noun_ur="kamray",
        aggregates=(Agg("Beds", "SUM(t.capacity)", "number", "Bistar"), Agg("Occupied", "SUM(t.occupied_count)", "number", "Bhare")),
    ),
    Source(
        key="alumni", module="Alumni", title="alumni", title_ur="sabiq talaba",
        keywords=("alumni", "alumnus", "graduate", "graduates", "old students", "sabiq talaba", "passed out"),
        frm="alumni_profiles t",
        columns=(
            Col("Name", "t.full_name"), Col("Year", "t.graduation_year", "number"),
            Col("University", "t.higher_education_uni"), Col("Company", "t.current_company"),
            Col("Role", "t.designation"),
        ),
        roles=GOV, order_by="t.graduation_year DESC NULLS LAST",
        name_cols=("t.full_name", "t.current_company", "t.higher_education_uni"),
        count_noun="alumni", count_noun_ur="sabiq talaba",
    ),
    Source(
        key="behavior", module="Behaviour", title="behaviour notes", title_ur="rawaiye ke notes",
        keywords=("behavior", "behaviour", "discipline", "conduct", "rawaiya", "rawayya", "tameez", "misconduct",
                  "wellbeing", "well being", "behavior logs", "behaviour logs", "student wellbeing"),
        frm="behavior_notes t " + STUDENT_JOIN,
        columns=(
            Col("Student", STUDENT_NAME), Col("Class", student_class("t.student_id")), Col("Note", "t.title"),
            Col("Type", "t.note_type"), Col("By", staff_name("t.teacher_user_id")), Col("Date", "t.created_at", "datetime"),
        ),
        roles=ACADEMIC | COUNSEL, family=True, date_col=pk("t.created_at"),
        statuses=(Status(("negative", "bad", "bura", "warning"), "lower(t.note_type) IN ('negative', 'warning', 'concern')",
                         "concerns", "shikayat wale"),
                  Status(("positive", "good", "acha", "achha", "praise"), "lower(t.note_type) IN ('positive', 'praise', 'merit')",
                         "positive", "achhe")),
        name_cols=(STUDENT_NAME, "t.title"), student_expr="t.student_id",
        count_noun="notes", count_noun_ur="notes",
    ),
    Source(
        key="medical", module="Health", title="medical records", title_ur="sehat ka record",
        keywords=("medical", "health", "allergy", "allergies", "blood group", "chronic", "sehat", "bimari",
                  "illness", "condition", "conditions"),
        frm="student_medical_records t " + STUDENT_JOIN,
        columns=(
            Col("Student", STUDENT_NAME), Col("Blood group", "t.blood_group"), Col("Allergies", "t.allergies"),
            Col("Conditions", "t.chronic_conditions"), Col("Emergency contact", "t.emergency_contact_phone"),
        ),
        roles=GOV | {"counselor", "academic_coordinator"}, family=True, order_by="s.first_name ASC",
        statuses=(Status(("allergy", "allergies", "allergic"), "COALESCE(t.allergies, '') <> ''", "with an allergy",
                         "allergy wale"),),
        name_cols=(STUDENT_NAME, "t.blood_group"), student_expr="t.student_id",
        count_noun="records", count_noun_ur="records",
    ),
    Source(
        key="first_aid", module="Health", title="first-aid incidents", title_ur="first aid waqiat",
        keywords=("first aid", "injury", "injuries", "incident", "incidents", "chot", "accident", "zakhmi", "infirmary"),
        frm="first_aid_incidents t " + STUDENT_JOIN,
        columns=(
            Col("Student", STUDENT_NAME), Col("What", "t.incident_type"), Col("Where", "t.location"),
            Col("Action", "t.action_taken"), Col("Parent told", "t.parent_notified", "bool"),
            Col("When", "t.created_at", "datetime"),
        ),
        roles=GOV | {"counselor"}, family=True, date_col=pk("t.created_at"),
        name_cols=(STUDENT_NAME, "t.incident_type"), student_expr="t.student_id",
        count_noun="incidents", count_noun_ur="waqiat",
    ),
    Source(
        key="certificates", module="Certificates", title="certificates issued", title_ur="jari sanadein",
        keywords=("certificate", "certificates", "sanad", "sanadein", "leaving certificate",
                  "character certificate", "slc", "certificates issued", "issued certificates",
                  "certificate issued"),
        frm="issued_certificates t " + STUDENT_JOIN,
        columns=(
            Col("Student", STUDENT_NAME), Col("Type", "t.certificate_type"), Col("Number", "t.certificate_number"),
            Col("Issued", "t.issue_date", "date"), Col("Status", "t.status"),
        ),
        roles=GOV, family=True, order_by="t.issue_date DESC NULLS LAST", date_col="t.issue_date",
        name_cols=(STUDENT_NAME, "t.certificate_type", "t.certificate_number"), student_expr="t.student_id",
        count_noun="certificates", count_noun_ur="sanadein",
    ),
    Source(
        key="ptm", module="PTM", title="parent–teacher meetings", title_ur="parent teacher meetings",
        keywords=("ptm", "parent teacher", "parent-teacher", "meeting", "meetings", "mulaqat"),
        frm="ptm_bookings t " + STUDENT_JOIN + " LEFT JOIN ptm_slots sl ON sl.id = t.slot_id",
        columns=(
            Col("Date", "sl.slot_date", "date"), Col("Time", "concat_ws('–', sl.start_time, sl.end_time)"),
            Col("Teacher", staff_name("sl.teacher_user_id")), Col("Student", STUDENT_NAME),
            Col("Status", "t.status"),
        ),
        roles=ACADEMIC, family=True, order_by="sl.slot_date ASC NULLS LAST",
        date_col="sl.slot_date", default_when="upcoming",
        name_cols=(STUDENT_NAME,), student_expr="t.student_id", self_expr="sl.teacher_user_id",
        count_noun="meetings", count_noun_ur="meetings",
    ),
)

#: Tables the generic safety net never touches: credentials, sessions,
#: gateway secrets, audit and security trails, internal caches and plumbing.
DENYLIST = frozenset({
    "active_sessions", "audit_logs", "security_events", "payment_gateway_configs", "jazzcash_settings",
    "easypaisa_settings", "jazzcash_transactions", "easypaisa_transactions", "user_invitations",
    "white_label_settings", "custom_domains", "ai_semantic_cache", "ai_cache_stats", "cleared_conversations",
    "school_bootstrap", "school_feature_flags", "invoice_number_sequences", "hr_contract_reference_sequences",
    "event_store", "notification_delivery_logs", "document_generation_jobs", "report_jobs",
    "teacher_presence_audit", "user_roles", "school_memberships", "school_owner_assignments",
    "platform_requests", "user_notification_preferences", "notification_preferences",
    "parent_notification_preferences", "admin_message_pins", "admin_message_reactions",
    "workspace_messages", "admin_messages", "parent_messages", "pt_conversations", "support_messages",
    "scheduled_messages", "app_notifications", "parent_notifications", "support_conversations",
})

#: Columns the generic safety net never shows.
SENSITIVE_COLUMN = (
    "token", "hash", "secret", "password", "passcode", "api_key", "apikey", "key", "embedding",
    "signature", "cnic", "otp", "salt", "private", "credential", "ip_address", "user_agent",
)


def curated_tables() -> frozenset:
    names = set()
    for s in SOURCES:
        names.add(s.table or s.frm.split()[0])
    return frozenset(names)


def vocabulary() -> set:
    """Every keyword word, so parameter parsing does not mistake them for names."""
    out = set()
    for s in SOURCES:
        for k in s.keywords:
            out.update(k.split())
    return out


SOURCES_BY_KEY: Dict[str, Source] = {s.key: s for s in SOURCES}
