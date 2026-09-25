"""
One Copilot turn, from question to streamed answer.

    greeting / "what can you do"  → the modules this role can ask about    (instant)
    "school ka haal", "overview"  → live headline figures                    (instant)
    a question about a module     → one scoped query, exact figures          (instant)
        … "why / compare / explain" → then a short explanation by the model over those figures only
    nothing matches               → the model, with a few lines of live figures and the rules

The stream is the same Server-Sent Events the panel already reads — content
deltas and a final [DONE] — plus two event kinds it can show while it waits:
``status`` ("Reading fee records…") and ``meta`` (when the figures were read,
and from which tables, so the panel can say when they have changed since).
"""
import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from sqlalchemy import text

from app.utils.copilot import lang as L
from app.utils.copilot.generic import generic_sources
from app.utils.copilot.params import has_any, now_label, parse, today
from app.utils.copilot.registry import FAMILY, FINANCE, GOV, SOURCES, STAFF_UNION, vocabulary
from app.utils.copilot.resolver import Scope, access, answer, fmt
from app.utils.copilot.router import MIN_SCORE, rank

logger = logging.getLogger("app.copilot")

#: What the model is told. Short on purpose: every character here is read on
#: every turn, at roughly sixty tokens a second, before the first word.
RULES = (
    "You are AltRix Copilot inside a school management system. "
    "Reply in the same language as the question (English, Roman Urdu or Urdu script). "
    "Use ONLY the facts given. If they do not answer the question, say so in one sentence "
    "and suggest how to ask for it. Never invent names, numbers, dates or amounts, "
    "and never add up or count rows yourself: quote the totals given. "
    "If the facts do not show a reason, say the records do not show it. "
    "Never show internal ids. Be brief and professional: at most five short sentences "
    "or five bullet points. No greetings, no links, no code."
)

#: Said to the model in so many words: the small models on the server drift
#: into English whatever language the question was in.
_LANGUAGE_LINE = {
    L.EN: "Write the answer in English.",
    L.UR: "Write the answer in Roman Urdu (Urdu in English letters), as the question is.",
    L.UR_SCRIPT: "Write the answer in Urdu script.",
}

#: The most of an answer's figures the model reads for an explanation. It
#: reads about thirty tokens a second on this CPU, so every line is a second
#: before the first word; the table itself is already on screen.
EXPLAIN_FACTS_CHARS = 700


def _rules(lang: str, base: str = RULES) -> str:
    return f"{base} {_LANGUAGE_LINE.get(lang, _LANGUAGE_LINE[L.EN])}"


def _clip(text_: str, limit: int) -> str:
    """At most `limit` characters, cut at a line break so no row is half there."""
    if len(text_) <= limit:
        return text_
    cut = text_.rfind("\n", 0, limit)
    return text_[: cut if cut > 0 else limit]


GREETINGS = (
    "hi", "hello", "hey", "salam", "salaam", "assalam", "assalamualaikum", "aoa", "help",
    "what can you do", "kya kar sakte ho", "kya kar sakti ho", "madad", "start",
    "kya haal hai", "kaise ho", "kaisay ho", "how are you", "good morning", "good evening",
)
OVERVIEW = (
    "overview", "summary", "dashboard", "school ka haal", "school ki halat", "kaisa chal raha",
    "how is the school", "school status", "stats", "statistics", "khulasa", "at a glance",
    "analytics", "school analytics", "school performance", "overall performance",
    "overall school performance", "performance summary", "school report",
)

#: A finance summary rather than one ledger ("Show finance insights" is one of
#: the panel's own suggestions, and it used to land on an empty table).
FINANCE_OVERVIEW = (
    "finance insights", "finance summary", "finance overview", "financial summary",
    "financial overview", "financial insights", "revenue summary", "revenue summaries",
    "finances", "maali haalat", "maali khulasa", "accounts summary", "finance report",
    "finance dashboard", "money summary", "financial position",
)

#: Joins two modules in one question ("complaints and notices").
_AND = re.compile(r"(?:^|\s)(?:and|aur|&|plus)(?:\s|$)", re.I)

#: Example questions per module, shown when someone asks what the Copilot can do.
EXAMPLES = {
    "Fees": ("unpaid invoices this month", "fee collection today", "top defaulters"),
    "Attendance": ("aaj kitne bachay absent hain", "Class 3 attendance today"),
    "Students": ("how many students in Class 5", "new admissions this month"),
    "Exams": ("upcoming exams", "Class 8 results", "who failed in Maths"),
    "Staff": ("teachers on leave today", "staff absent today"),
    "Library": ("overdue library books",),
    "Transport": ("bus routes", "students on transport"),
    "Timetable": ("aaj ka timetable",),
    "Holidays": ("upcoming holidays",),
    "Complaints": ("open complaints",),
}


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


def _delta(textval: str) -> str:
    return _sse({"choices": [{"delta": {"content": textval}}]})


def _status(message: str) -> str:
    return _sse({"status": message})


def _error_of(event: str) -> Optional[str]:
    """The message of an SSE error event, or None for any other event."""
    body = event.strip()
    if not body.startswith("data:") or '"error"' not in body:
        return None
    try:
        data = json.loads(body[5:].strip())
    except ValueError:
        return None
    err = data.get("error") if isinstance(data, dict) else None
    if not err:
        return None
    if isinstance(err, dict):
        return str(err.get("message") or err.get("code") or "the model did not answer")
    return str(err)


#: Tables the overview reads; the panel watches them for changes.
OVERVIEW_TABLES = (
    "students", "hr_staff_directory", "attendance_entries", "fee_invoices", "fee_payments",
    "complaints", "admission_applications",
)


# ── Who is asking ───────────────────────────────────────────────────────────
async def build_scope(db, user, school_id: str, active_student_id: Optional[str]) -> Scope:
    from app.utils.permissions import expand_roles

    roles = frozenset(expand_roles(list(user.roles or [])))
    if getattr(user, "is_super_admin", False):
        roles = roles | {"super_admin"}
    uid = str(user.id)
    scope = Scope(school_id=school_id, user_id=uid, roles=roles)
    binds = {"sid": school_id, "uid": uid}

    try:
        cur = (await db.execute(text(
            "SELECT currency FROM fee_settings WHERE school_id = CAST(:sid AS uuid) LIMIT 1"), binds)).first()
        if cur and cur[0] and cur[0].upper() not in ("PKR", "RS", "RS."):
            scope.currency = cur[0]
    except Exception:
        await db.rollback()

    if "teacher" in roles and not (roles & GOV):
        rows = (await db.execute(text(
            """
            SELECT class_section_id::text FROM teacher_assignments
             WHERE teacher_user_id = CAST(:uid AS uuid) AND school_id = CAST(:sid AS uuid)
            UNION
            SELECT class_section_id::text FROM teacher_subject_assignments
             WHERE teacher_user_id = CAST(:uid AS uuid) AND school_id = CAST(:sid AS uuid)
            UNION
            SELECT class_section_id::text FROM timetable_entries
             WHERE teacher_user_id = CAST(:uid AS uuid) AND school_id = CAST(:sid AS uuid)
            """), binds)).all()
        scope.teacher_sections = [r[0] for r in rows if r[0]]

    if roles & FAMILY:
        # Guardians linked by account, and a student's own record. (The old
        # context builder also matched `students.parent_id`, a column that
        # does not exist, so that lookup failed and every parent was told no
        # children were linked.)
        rows = (await db.execute(text(
            """
            SELECT DISTINCT s.id::text FROM students s
            LEFT JOIN student_guardians g ON g.student_id = s.id
            WHERE s.school_id = CAST(:sid AS uuid)
              AND (g.user_id = CAST(:uid AS uuid) OR s.profile_id = CAST(:uid AS uuid))
            """), binds)).all()
        scope.child_ids = [r[0] for r in rows]
        if scope.child_ids:
            secs = (await db.execute(text(
                "SELECT DISTINCT class_section_id::text FROM student_enrollments "
                "WHERE student_id = ANY(CAST(:kids AS uuid[])) AND end_date IS NULL"),
                {"kids": scope.child_ids})).all()
            scope.child_sections = [r[0] for r in secs if r[0]]

    # The student on screen is honoured only if the caller may see them.
    if active_student_id:
        if scope.child_ids is not None and not (roles - FAMILY):
            if active_student_id in scope.child_ids:
                scope.active_student_id = active_student_id
        else:
            ok = (await db.execute(text(
                "SELECT 1 FROM students WHERE id = CAST(:st AS uuid) AND school_id = CAST(:sid AS uuid)"),
                {"st": active_student_id, "sid": school_id})).first()
            if ok:
                scope.active_student_id = active_student_id
    return scope


# ── Instant answers that need no module ─────────────────────────────────────
def help_text(scope: Scope, lang: str) -> str:
    modules = []
    seen = set()
    for s in SOURCES:
        if s.module in seen:
            continue
        allowed = bool(scope.roles & s.roles) or (s.family and scope.roles & FAMILY) or (
            s.self_expr and scope.roles and not scope.is_family_only)
        if allowed:
            seen.add(s.module)
            modules.append(s.module)
    if lang == L.EN:
        head = "I answer from your school's live records. You can ask about:"
        foot = "Ask in English or Roman Urdu — e.g. *“aaj kitne bachay absent hain”*."
    else:
        head = "Main aap ke school ke live record se jawab deta hoon. Aap in ke baare mein pooch sakte hain:"
        foot = "English ya Roman Urdu mein poochein — maslan *“unpaid invoices this month”*."
    # The common modules with an example each, and the rest on one line: a
    # thirty-six-line list pushed the question box off a phone's screen.
    lines = [head, ""]
    featured = [m for m in modules if m in EXAMPLES]
    others = [m for m in modules if m not in EXAMPLES]
    for m in featured:
        lines.append(f"- **{m}** — _{EXAMPLES[m][0]}_")
    if others:
        lines += ["", ("Also: " if lang == L.EN else "Aur: ") + ", ".join(others) + "."]
    lines += ["", foot]
    return "\n".join(lines)


async def overview(db, scope: Scope, lang: str) -> Optional[str]:
    """The figures a principal opens the dashboard for, read live."""
    if not (scope.roles & GOV):
        return None
    b = {"sid": scope.school_id, "today": today()}
    q = {
        "students": "SELECT COUNT(*) FROM students WHERE school_id = CAST(:sid AS uuid) AND status IN ('active','enrolled')",
        # The directory and the staff accounts, as the Staff answer counts them.
        "staff": f"SELECT COUNT(*) FROM {STAFF_UNION} WHERE t.school_id = CAST(:sid AS uuid) AND t.is_active",
        "absent": ("SELECT COUNT(DISTINCT e.student_id) FROM attendance_entries e JOIN attendance_sessions a "
                   "ON a.id = e.session_id WHERE e.school_id = CAST(:sid AS uuid) AND a.session_date = :today "
                   "AND e.status = 'absent'"),
        "unpaid": ("SELECT COUNT(*), COALESCE(SUM(total_amount - paid_amount), 0) FROM fee_invoices "
                   "WHERE school_id = CAST(:sid AS uuid) AND status IN ('pending','partial','overdue')"),
        "collected": ("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = CAST(:sid AS uuid) "
                      "AND status = 'success' AND ((paid_at AT TIME ZONE 'Asia/Karachi')::date) "
                      ">= date_trunc('month', CAST(:today AS date))"),
        "complaints": "SELECT COUNT(*) FROM complaints WHERE school_id = CAST(:sid AS uuid) AND lower(coalesce(status,'open')) <> 'resolved'",
        "admissions": "SELECT COUNT(*) FROM admission_applications WHERE school_id = CAST(:sid AS uuid) AND status IN ('submitted','under_review')",
    }
    vals: Dict[str, Any] = {}
    for key, sql in q.items():
        try:
            vals[key] = (await db.execute(text(sql), b)).first()
        except Exception as exc:
            logger.warning("overview figure %s failed: %s", key, exc)
            await db.rollback()
            vals[key] = None

    def one(key, idx=0):
        row = vals.get(key)
        return row[idx] if row is not None else None

    cur = scope.currency
    en = lang == L.EN
    lines = ["**" + ("School at a glance" if en else "School ka khulasa") + "**", ""]
    items = [
        ("Students enrolled", "Enrolled talaba", fmt(one("students"), "number", lang, cur)),
        ("Active staff", "Active staff", fmt(one("staff"), "number", lang, cur)),
        ("Absent today", "Aaj ghair hazir", fmt(one("absent"), "number", lang, cur)),
        ("Unpaid invoices", "Baqaya invoices",
         f"{fmt(one('unpaid'), 'number', lang, cur)} ({fmt(one('unpaid', 1), 'money', lang, cur)})"),
        ("Collected this month", "Is mahine wusool", fmt(one("collected"), "money", lang, cur)),
        ("Open complaints", "Khuli shikayaat", fmt(one("complaints"), "number", lang, cur)),
        ("Admissions awaiting a decision", "Faisle ki muntazir darkhwastein", fmt(one("admissions"), "number", lang, cur)),
    ]
    for label_en, label_ur, value in items:
        lines.append(f"- {label_en if en else label_ur}: **{value}**")
    lines += ["", f"_{L.phrase('as_of', lang, time=now_label())}_"]
    return "\n".join(lines)


async def finance_overview(db, scope: Scope, lang: str) -> Optional[str]:
    """Where the school's money stands, read live: billed, owed, collected, spent."""
    if not (scope.roles & FINANCE):
        return None
    b = {"sid": scope.school_id, "today": today()}
    q = {
        "outstanding": ("SELECT COUNT(*), COALESCE(SUM(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)), 0) "
                        "FROM fee_invoices WHERE school_id = CAST(:sid AS uuid) "
                        "AND status IN ('pending','partial','overdue')"),
        "overdue": ("SELECT COUNT(*), COALESCE(SUM(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)), 0) "
                    "FROM fee_invoices WHERE school_id = CAST(:sid AS uuid) "
                    "AND status IN ('pending','partial','overdue') AND due_date < CAST(:today AS date)"),
        "defaulters": ("SELECT COUNT(DISTINCT student_id) FROM fee_invoices WHERE school_id = CAST(:sid AS uuid) "
                       "AND status IN ('pending','partial','overdue') "
                       "AND COALESCE(total_amount, 0) > COALESCE(paid_amount, 0)"),
        "today": ("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = CAST(:sid AS uuid) "
                  "AND status = 'success' AND ((paid_at AT TIME ZONE 'Asia/Karachi')::date) = CAST(:today AS date)"),
        "month": ("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = CAST(:sid AS uuid) "
                  "AND status = 'success' AND ((paid_at AT TIME ZONE 'Asia/Karachi')::date) "
                  ">= date_trunc('month', CAST(:today AS date))"),
        "last_month": ("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = CAST(:sid AS uuid) "
                       "AND status = 'success' AND ((paid_at AT TIME ZONE 'Asia/Karachi')::date) "
                       ">= date_trunc('month', CAST(:today AS date)) - INTERVAL '1 month' "
                       "AND ((paid_at AT TIME ZONE 'Asia/Karachi')::date) < date_trunc('month', CAST(:today AS date))"),
        "expenses": ("SELECT COALESCE(SUM(amount), 0) FROM finance_expenses WHERE school_id = CAST(:sid AS uuid) "
                     "AND expense_date >= date_trunc('month', CAST(:today AS date))"),
    }
    vals: Dict[str, Any] = {}
    for key, sql in q.items():
        try:
            vals[key] = (await db.execute(text(sql), b)).first()
        except Exception as exc:
            logger.warning("finance figure %s failed: %s", key, exc)
            await db.rollback()
            vals[key] = None

    def one(key, idx=0):
        row = vals.get(key)
        return row[idx] if row is not None else None

    cur = scope.currency
    en = lang == L.EN
    net = None
    if one("month") is not None and one("expenses") is not None:
        net = one("month") - one("expenses")
    items = [
        ("Outstanding fees", "Baqaya fees",
         f"{fmt(one('outstanding', 1), 'money', lang, cur)} "
         f"({fmt(one('outstanding'), 'number', lang, cur)} {'invoices' if en else 'invoices'})"),
        ("Past due date", "Muddat guzar chuki",
         f"{fmt(one('overdue', 1), 'money', lang, cur)} ({fmt(one('overdue'), 'number', lang, cur)} invoices)"),
        ("Students owing", "Baqaya wale talaba", fmt(one("defaulters"), "number", lang, cur)),
        ("Collected today", "Aaj wusool", fmt(one("today"), "money", lang, cur)),
        ("Collected this month", "Is mahine wusool", fmt(one("month"), "money", lang, cur)),
        ("Collected last month", "Pichle mahine wusool", fmt(one("last_month"), "money", lang, cur)),
        ("Expenses this month", "Is mahine akhrajat", fmt(one("expenses"), "money", lang, cur)),
        ("Collected less expenses, this month", "Is mahine wusool minus akhrajat", fmt(net, "money", lang, cur)),
    ]
    lines = ["**" + ("Finances at a glance" if en else "Maali khulasa") + "**", ""]
    for label_en, label_ur, value in items:
        lines.append(f"- {label_en if en else label_ur}: **{value}**")
    lines += ["", ("Ask *top defaulters* for who owes the most." if en
                   else "Sab se zyada baqaya kis ka hai — *top defaulters* poochein."),
              "", f"_{L.phrase('as_of', lang, time=now_label())}_"]
    return "\n".join(lines)


FINANCE_TABLES = ("fee_invoices", "fee_payments", "finance_expenses")


# ── What to answer with ─────────────────────────────────────────────────────
def decide(message: str, ranked, scope: Scope, params):
    """
    ("help" | "finance" | "overview" | "source" | "model", best source, second source).

    The screen the user is on only breaks ties (see router.rank); any question
    about anything in the shell is answered from wherever it is asked, and
    always within the caller's school and role.
    """
    # The best match this caller may read: "my attendance" is staff
    # attendance for a teacher and the student's own for a student.
    candidates = [(sc, src) for sc, src in ranked if sc >= MIN_SCORE]
    allowed = [(sc, src) for sc, src in candidates if access(src, scope, params).allowed]
    if allowed:
        best = allowed[0][1]
    else:
        best = candidates[0][1] if candidates else None  # answered with a plain refusal
    # A second module named in the same breath ("complaints and notices",
    # "homework aur diary"): both are answered.
    second = None
    if allowed and _AND.search(message):
        top = allowed[0][0]
        second = next((src for sc, src in allowed[1:]
                       if src.module != best.module and not src.generic
                       and sc >= max(MIN_SCORE, 0.6 * top)), None)

    # Greeting / what can you do — only when the question names nothing
    # else: "help me find unpaid invoices" is a question about invoices.
    if best is None and len(message.split()) <= 6 and has_any(message, GREETINGS):
        return "help", None, None
    # Finances at a glance, for those who may see them.
    if has_any(message, FINANCE_OVERVIEW) and scope.roles & FINANCE:
        return "finance", None, None
    # School at a glance — unless a module was named ("fee summary" is about
    # fees). A table only the generic safety net matched does not outrank
    # it: "dashboard" is not a question about a table.
    if has_any(message, OVERVIEW) and (best is None or best.generic) and scope.roles & GOV:
        return "overview", None, None
    if best is not None:
        return "source", best, second
    return "model", None, None


# ── The model, briefly ──────────────────────────────────────────────────────
def _trim_history(history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
    """The last few turns, short, without the panel's own error messages."""
    out: List[Dict[str, str]] = []
    for entry in (history or [])[-8:]:
        role = entry.get("role") if isinstance(entry, dict) else None
        content = str((entry or {}).get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        if content.startswith("I couldn't reach") or "_Error:" in content:
            continue
        out.append({"role": role, "content": content[:300]})
    return out[-4:]


async def _model(system: str, prompt: str, history, max_tokens: int) -> AsyncGenerator[str, None]:
    from app.utils.ai_service import AIService

    async for event in AIService.stream_completion(
        system_prompt=system, user_message=prompt, history=history, max_tokens=max_tokens,
    ):
        if event.strip() == "data: [DONE]":
            continue
        yield event


# ── One turn ────────────────────────────────────────────────────────────────
async def copilot_stream(
    db, user, school_id: str, message: str,
    history: Optional[List[Dict[str, str]]] = None,
    current_module: Optional[str] = None,
    active_student_id: Optional[str] = None,
    attachment_name: Optional[str] = None,
    attachment_text: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    lang = L.detect(message)
    try:
        scope = await build_scope(db, user, school_id, active_student_id)

        # A file the user attached: the question is about the file, so the
        # model reads it (capped at 4,000 characters by the request model).
        if attachment_text:
            yield _status("Reading the attached file…" if lang == L.EN else "File parh raha hoon…")
            prompt = (
                f"Attached file ({attachment_name or 'file'}):\n{attachment_text}\n\n"
                f"Question: {message or 'Summarise this file.'}"
            )
            async for event in _model(_rules(lang, RULES.replace("Use ONLY the facts given", "Use ONLY the attached file")),
                                      prompt, [], max_tokens=300):
                yield event
            yield "data: [DONE]\n\n"
            return

        params = parse(message, vocabulary())
        sources = list(SOURCES)
        if scope.roles & GOV:
            sources += list(await generic_sources(db))
        ranked = rank(message, sources, current_module)
        kind, best, second = decide(message, ranked, scope, params)

        if kind == "help":
            yield _delta(help_text(scope, lang))
            yield "data: [DONE]\n\n"
            return

        if kind == "finance":
            text_ = await finance_overview(db, scope, lang)
            if text_:
                yield _status("Reading the school's finances…" if lang == L.EN else "Maali record parh raha hoon…")
                yield _sse({"meta": {"as_of": now_label(), "tables": list(FINANCE_TABLES)}})
                yield _delta(text_)
                yield "data: [DONE]\n\n"
                return

        if kind == "overview":
            yield _status("Reading the school's figures…" if lang == L.EN else "School ke figures parh raha hoon…")
            text_ = await overview(db, scope, lang)
            if text_:
                yield _sse({"meta": {"as_of": now_label(), "tables": list(OVERVIEW_TABLES)}})
                yield _delta(text_)
                yield "data: [DONE]\n\n"
                return

        if best is not None:
            title = best.title if lang == L.EN else best.title_ur
            yield _status(f"Reading {title}…" if lang == L.EN else f"{title} parh raha hoon…")
            result = await answer(db, best, params, scope, message, lang)
            other = None
            if second is not None:
                other = await answer(db, second, params, scope, message, lang)
            tables = list(result.tables) + ([t for t in other.tables if t not in result.tables] if other else [])
            yield _sse({"meta": {"as_of": now_label(), "tables": tables, "source": best.key}})
            yield _delta(result.markdown)
            if other is not None:
                heading = second.title.capitalize() if lang == L.EN else second.title_ur.capitalize()
                yield _delta(f"\n\n---\n\n**{heading}**\n\n" + other.markdown)

            if params.explain and result.count and not result.denied:
                yield _status("Writing a short explanation…" if lang == L.EN else "Mukhtasar wazahat likh raha hoon…")
                yield _delta("\n\n")
                prompt = (
                    f"Live figures from the school's records (as of {now_label()}):\n{_clip(result.facts, EXPLAIN_FACTS_CHARS)}\n\n"
                    f"Question: {message}\n"
                    "Explain what these figures show in answer to the question. Do not repeat the table."
                )
                # The figures are already on screen and complete; if the model
                # cannot add its explanation, say so under them rather than
                # flag the whole answer as having stopped early.
                async for event in _model(_rules(lang), prompt, [], max_tokens=180):
                    failure = _error_of(event)
                    if failure is None:
                        yield event
                    else:
                        note = ("_The explanation could not be written: " if lang == L.EN
                                else "_Wazahat nahi likhi ja saki: ")
                        yield _delta(note + failure.rstrip(".") + "._")
                        break
            yield "data: [DONE]\n\n"
            return

        # Nothing in the records matches. The model answers from a few live
        # figures and the rules, and says plainly when it cannot help.
        yield _status("Thinking…" if lang == L.EN else "Soch raha hoon…")
        facts = await overview(db, scope, lang) or ""
        prompt = (
            (f"Live school figures (as of {now_label()}):\n{facts[:800]}\n\n" if facts else "")
            + f"Question: {message}"
        )
        async for event in _model(_rules(lang), prompt, _trim_history(history), max_tokens=256):
            yield event
        yield "data: [DONE]\n\n"
    except Exception as exc:
        logger.exception("Copilot turn failed")
        try:
            await db.rollback()
        except Exception:
            pass
        # The reason is logged in full; the reader is told plainly that it
        # failed, without the SQL error text (which names tables and columns).
        yield _sse({"error": {"code": "copilot_failed",
                              "message": ("The Copilot could not read the records for that question. "
                                          "The error has been logged — please try again, or ask it differently.")
                              if lang == L.EN else
                              ("Is sawal ke liye record parhe nahi ja sake. Ghalti log kar li gayi hai — "
                               "dobara koshish karein ya sawal mukhtalif tareeqe se poochein.")}})
        yield "data: [DONE]\n\n"
