# -*- coding: utf-8 -*-
"""
The Copilot answers from the records, for the right school, for the right role.

Most questions never reach the model: a router picks the module, a parser
reads the period and shape, and one scoped query returns exact figures
(app/utils/copilot). These tests hold that machinery to what the user asked
for — every module reachable in English and Roman Urdu, nothing read outside
the caller's school or role, and a stream that says honestly when something
failed.

No database is needed: a fake session records every statement and its binds.
"""
import asyncio
import io
import json
import os
import re
from datetime import date, datetime

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.utils.copilot import engine, generic  # noqa: E402
from app.utils.copilot import lang as L  # noqa: E402
from app.utils.copilot.params import date_range, parse  # noqa: E402
from app.utils.copilot.registry import (  # noqa: E402
    DENYLIST, FAMILY, GOV, SOURCES, SOURCES_BY_KEY, curated_tables, vocabulary,
)
from app.utils.copilot.resolver import Scope, access, answer, matched_statuses  # noqa: E402
from app.utils.copilot.router import MIN_SCORE, rank  # noqa: E402

SCHOOL = "11111111-1111-1111-1111-111111111111"
USER = "22222222-2222-2222-2222-222222222222"
SEC_A = "33333333-3333-3333-3333-333333333333"
KID = "44444444-4444-4444-4444-444444444444"
OTHER_KID = "55555555-5555-5555-5555-555555555555"


# ── A session that records what it is asked ─────────────────────────────────
class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    """Every statement and its binds, answered by `responder(sql, binds)`."""

    def __init__(self, responder=None, fail=False):
        self.calls = []
        self.responder = responder or (lambda sql, binds: [])
        self.fail = fail
        self.rolled_back = 0

    async def execute(self, stmt, binds=None):
        sql = str(stmt)
        self.calls.append((sql, dict(binds or {})))
        if self.fail:
            raise RuntimeError('relation "secret_table" does not exist at column internal_col')
        return _Result(self.responder(sql, binds or {}))

    async def rollback(self):
        self.rolled_back += 1


def _value(kind):
    return {"money": 1500, "number": 3, "percent": 90, "date": date(2026, 9, 24),
            "datetime": datetime(2026, 9, 24, 9, 30), "bool": True}.get(kind, "Ayesha Khan")


def responder_for(source, count=2):
    def respond(sql, binds):
        if sql.startswith("SELECT cs.id::text, ac.name, cs.name"):
            return [(SEC_A, "Class 5", "A")]
        if " AS n" in sql:
            row = {"n": count}
            for i, a in enumerate(source.aggregates):
                row[f"a{i}"] = _value(a.kind)
            return [row]
        if " AS c0" in sql:
            return [{f"c{i}": _value(c.kind) for i, c in enumerate(source.columns)}]
        return []
    return respond


def run(coro):
    return asyncio.run(coro)


def scope(roles, **kw):
    return Scope(school_id=SCHOOL, user_id=USER, roles=frozenset(roles), **kw)


VOCAB = vocabulary()


# ── Every module is reachable, in English and Roman Urdu ─────────────────────
ROUTES = [
    ("unpaid invoices this month", "fee_invoices"),
    ("fee vouchers baqaya", "fee_invoices"),
    ("fee collection today", "fee_payments"),
    ("kitni fee aayi is mahine", "fee_payments"),
    ("top defaulters", "defaulters"),
    ("kin bachon ki fee baqaya hai", "defaulters"),
    ("aaj kitne bachay absent hain", "attendance"),
    ("Class 3 attendance today", "attendance"),
    ("how many students in Class 5", "students"),
    ("new admissions this month", "admissions"),
    ("pending admissions", "admissions"),
    ("upcoming exams", "exams"),
    ("Class 8 results", "exam_results"),
    ("report cards", "report_cards"),
    ("homework for today", "homework"),
    ("aaj ka diary", "diary"),
    ("assignments due this week", "assignments"),
    ("aaj ka timetable", "timetable"),
    ("subjects list", "subjects"),
    ("class sections", "classes"),
    ("teacher assignments", "teacher_assignments"),
    ("staff list", "staff"),
    ("ustad kitne hain", "staff"),
    ("staff absent today", "staff_attendance"),
    ("teachers on leave today", "leave"),
    ("show me the leave requests", "leave"),
    ("meri payslip", "payslips"),
    ("salaries paid this month", "salaries"),
    ("contracts expiring", "contracts"),
    ("job openings", "jobs"),
    ("job applicants", "applicants"),
    ("staff appraisals", "appraisals"),
    ("open complaints", "complaints"),
    ("notices", "notices"),
    ("upcoming holidays", "holidays"),
    ("school events this month", "events"),
    ("overdue library books", "books"),
    ("book issues", "book_issues"),
    ("bus routes", "routes"),
    ("students on transport", "transport_students"),
    ("vehicles", "vehicles"),
    ("inventory items low stock", "inventory"),
    ("expenses this month", "expenses"),
    ("kharcha is mahine", "expenses"),
    ("visitors today", "visitors"),
    ("crm leads", "leads"),
    ("hostel rooms", "hostel_rooms"),
    ("alumni", "alumni"),
    ("behaviour notes", "behavior"),
    ("medical records", "medical"),
    ("first aid incidents", "first_aid"),
    ("certificates issued", "certificates"),
    ("ptm bookings", "ptm"),
    ("help me find unpaid invoices", "fee_invoices"),
    ("fee summary", "fee_invoices"),
]


@pytest.mark.parametrize("question,key", ROUTES)
def test_the_question_reaches_its_module(question, key):
    ranked = rank(question, SOURCES)
    assert ranked and ranked[0][0] >= MIN_SCORE, f"nothing matched {question!r}"
    assert ranked[0][1].key == key


def test_every_curated_module_has_a_route_in_the_tests():
    # A module nobody can reach by asking is a module the Copilot cannot help with.
    routed = {key for _, key in ROUTES}
    missing = {s.key for s in SOURCES} - routed
    assert not missing, f"no test question reaches: {sorted(missing)}"


@pytest.mark.parametrize("question", ["hi", "school ka haal", "dashboard", "kya haal hai"])
def test_chat_and_overview_words_do_not_pick_a_table(question):
    ranked = rank(question, SOURCES)
    assert not ranked or ranked[0][0] < MIN_SCORE


def test_the_screen_the_user_is_on_breaks_a_tie():
    hinted = rank("pending", SOURCES, module_hint="Admissions")
    assert hinted[0][1].key == "admissions" and hinted[0][0] >= MIN_SCORE
    assert rank("pending", SOURCES)[0][0] < MIN_SCORE  # ambiguous on its own


@pytest.mark.parametrize("screen,key", [
    ("Admissions & CRM", "admissions"),
    ("Finance", "fee_invoices"),
    ("Complaints", "complaints"),
])
def test_the_screen_names_the_panel_sends_are_understood(screen, key):
    # The panel sends "Finance" and "Exams & Results", not the registry's names.
    from app.utils.copilot.router import _on_screen
    assert _on_screen(SOURCES_BY_KEY[key], screen)
    assert not _on_screen(SOURCES_BY_KEY[key], "General")


# ── Reading the question without a model ─────────────────────────────────────
NOW = date(2026, 9, 24)  # a Thursday


@pytest.mark.parametrize("text,expected", [
    ("aaj absent", (NOW, NOW, "today")),
    ("attendance today", (NOW, NOW, "today")),
    ("kal kitne absent the", (date(2026, 9, 23), date(2026, 9, 23), "yesterday")),
    ("kal aane wale exams", (date(2026, 9, 25), date(2026, 9, 25), "tomorrow")),
    ("this week", (date(2026, 9, 21), date(2026, 9, 27), "this week")),
    ("pichle hafte", (date(2026, 9, 14), date(2026, 9, 20), "last week")),
    ("is mahine", (date(2026, 9, 1), date(2026, 9, 30), "this month")),
    ("last month", (date(2026, 8, 1), date(2026, 8, 31), "last month")),
    ("is saal", (date(2026, 1, 1), date(2026, 12, 31), "this year")),
    ("fee invoices", (None, None, None)),
])
def test_periods(text, expected):
    assert date_range(text, now=NOW) == expected


@pytest.mark.parametrize("text,shape", [
    ("how many students", "count"),
    ("kitne bachay", "count"),
    ("kitni fee aayi", "total"),
    ("total collection", "total"),
    ("top defaulters", "top"),
    ("sab se kam attendance", "lowest"),
    ("unpaid invoices", "list"),
])
def test_shape(text, shape):
    assert parse(text, VOCAB).shape == shape


@pytest.mark.parametrize("text,mine", [
    ("my payslip", True),
    ("meri tankhwah", True),
    ("show me the leave requests", False),
    ("mujhe unpaid invoices batao", False),
    ("hamare school ke students", False),
])
def test_only_words_that_mean_mine_narrow_to_the_caller(text, mine):
    assert parse(text, VOCAB).mine is mine


def test_fee_is_not_found_inside_feedback():
    assert not rank("feedback", [SOURCES_BY_KEY["fee_invoices"]]) or \
        rank("feedback", [SOURCES_BY_KEY["fee_invoices"]])[0][0] < MIN_SCORE


def test_not_paid_is_not_also_paid():
    src = SOURCES_BY_KEY["fee_invoices"]
    labels = [s.label for s in matched_statuses("invoices not paid", src)]
    assert labels and all("paid" != l.lower() for l in labels)


@pytest.mark.parametrize("text,expected", [
    ("how many students are enrolled", L.EN),
    ("aaj kitne bachay absent hain", L.UR),
    ("آج کتنے بچے غیر حاضر ہیں", L.UR_SCRIPT),
])
def test_language(text, expected):
    assert L.detect(text) == expected


# ── Who may see what ─────────────────────────────────────────────────────────
def test_leadership_sees_everything_in_the_school():
    for s in SOURCES:
        acc = access(s, scope({"principal"}), parse("list", VOCAB))
        assert acc.allowed, s.key
        assert not acc.where, s.key


def test_a_teacher_sees_only_their_own_sections():
    src = SOURCES_BY_KEY["attendance"]
    acc = access(src, scope({"teacher"}, teacher_sections=[SEC_A]), parse("absent today", VOCAB))
    assert acc.allowed
    assert any(":tsec" in w for w in acc.where)
    assert acc.binds["tsec"] == [SEC_A]


def test_a_teacher_with_no_sections_sees_nothing_rather_than_everything():
    src = SOURCES_BY_KEY["students"]
    acc = access(src, scope({"teacher"}, teacher_sections=[]), parse("students", VOCAB))
    assert acc.binds["tsec"] == ["00000000-0000-0000-0000-000000000000"]


@pytest.mark.parametrize("key", ["fee_invoices", "fee_payments", "expenses", "defaulters"])
def test_a_teacher_is_refused_the_schools_money(key):
    acc = access(SOURCES_BY_KEY[key], scope({"teacher"}, teacher_sections=[SEC_A]), parse("x", VOCAB))
    assert not acc.allowed


@pytest.mark.parametrize("key", ["salaries", "payslips", "contracts"])
def test_a_teacher_reads_their_own_pay_and_nobody_elses(key):
    acc = access(SOURCES_BY_KEY[key], scope({"teacher"}, teacher_sections=[SEC_A]), parse("salary", VOCAB))
    assert acc.allowed and acc.binds == {"uid": USER}


def test_a_teacher_reads_their_own_leave_and_nobody_elses():
    acc = access(SOURCES_BY_KEY["leave"], scope({"teacher"}, teacher_sections=[]), parse("leave", VOCAB))
    assert acc.allowed and acc.binds["uid"] == USER
    assert any(":uid" in w for w in acc.where)


def test_a_parent_sees_only_their_own_children():
    acc = access(SOURCES_BY_KEY["fee_invoices"], scope({"parent"}, child_ids=[KID]), parse("fee", VOCAB))
    assert acc.allowed and acc.binds["kids"] == [KID]


def test_a_parent_cannot_point_the_screen_at_another_family():
    s = scope({"parent"}, child_ids=[KID], active_student_id=OTHER_KID)
    acc = access(SOURCES_BY_KEY["fee_invoices"], s, parse("fee", VOCAB))
    assert acc.binds["kids"] == [KID]


def test_a_parent_with_no_linked_child_sees_nothing():
    acc = access(SOURCES_BY_KEY["exam_results"], scope({"parent"}, child_ids=[]), parse("results", VOCAB))
    assert acc.binds["kids"] == ["00000000-0000-0000-0000-000000000000"]


@pytest.mark.parametrize("key", ["salaries", "staff", "leave", "expenses", "applicants"])
def test_a_parent_is_refused_staff_records(key):
    assert not access(SOURCES_BY_KEY[key], scope({"parent"}, child_ids=[KID]), parse("x", VOCAB)).allowed


def test_a_refusal_is_said_not_answered_with_nothing():
    db = FakeDB()
    out = run(answer(db, SOURCES_BY_KEY["salaries"], parse("salaries", VOCAB),
                     scope({"parent"}, child_ids=[KID]), "salaries", L.EN))
    assert out.denied and "does not have access" in out.markdown
    assert db.calls == []  # nothing was read


# ── Every query is the caller's school ───────────────────────────────────────
@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.key)
@pytest.mark.parametrize("question", ["list", "how many class 5 this month", "top ayesha"])
def test_every_statement_is_scoped_to_the_school(source, question):
    db = FakeDB(responder_for(source))
    run(answer(db, source, parse(question, VOCAB), scope({"principal"}), question, L.EN))
    assert db.calls
    for sql, binds in db.calls:
        assert binds.get("sid") == SCHOOL, sql
        assert "school_id = CAST(:sid AS uuid)" in sql, sql


@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.key)
def test_an_answer_renders_without_ids_and_says_when_it_was_read(source):
    db = FakeDB(responder_for(source, count=1))
    out = run(answer(db, source, parse("list", VOCAB), scope({"principal"}), "list", L.EN))
    assert out.count == 1
    assert "Live data · as of" in out.markdown
    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-", out.markdown)
    assert out.tables and out.tables[0] in curated_tables()
    assert len(out.facts) <= 1500


def test_money_is_exact():
    src = SOURCES_BY_KEY["defaulters"]

    def respond(sql, binds):
        if " AS n" in sql:
            return [{"n": 3, **{f"a{i}": "84445.00" for i in range(len(src.aggregates))}}]
        return []
    out = run(answer(FakeDB(respond), src, parse("defaulters", VOCAB), scope({"principal"}), "defaulters", L.EN))
    assert "84,445.00" in out.markdown


def test_none_absent_is_told_apart_from_attendance_not_taken():
    src = SOURCES_BY_KEY["attendance"]
    out = run(answer(FakeDB(lambda s, b: [{"n": 0}] if " AS n" in s else [(0,)] if "SELECT COUNT" in s else []),
                     src, parse("absent today", VOCAB), scope({"principal"}), "absent today", L.EN))
    assert "Nothing has been recorded" in out.markdown


def test_no_bare_today_parameter_is_left_for_postgres_to_guess():
    # asyncpg read ":today - INTERVAL" as an interval and failed.
    for s in SOURCES:
        for part in (s.frm, s.always_where or "", s.default_where or "", s.order_by or "",
                     *(st.sql for st in s.statuses), *(c.sql for c in s.columns), *(a.sql for a in s.aggregates)):
            assert not re.search(r"(?<!CAST\():today\b", part), (s.key, part)


# ── The generic safety net ───────────────────────────────────────────────────
SCHEMA = {
    "sports_scorecards": [("id", "uuid"), ("school_id", "uuid"), ("title", "text"), ("score", "numeric"),
                          ("match_date", "date"), ("api_token", "text"), ("photo_url", "text"),
                          ("student_id", "uuid"), ("created_at", "timestamp with time zone")],
    "active_sessions": [("school_id", "uuid"), ("user_agent", "text")],
    "students": [("school_id", "uuid"), ("first_name", "text")],
    "global_things": [("name", "text")],
    "school_branding": [("school_id", "uuid"), ("tagline", "text")],
}


def test_generic_sources_cover_the_rest_and_nothing_sensitive():
    built = {s.table or s.frm.split()[0]: s for s in generic.build(SCHEMA)}
    assert "sports_scorecards" in built
    assert "active_sessions" not in built      # denylisted
    assert "students" not in built             # curated already
    assert "global_things" not in built        # not school-scoped
    src = built["sports_scorecards"]
    shown = " ".join(c.sql for c in src.columns)
    for bad in ("api_token", "photo_url", "student_id", "t.id"):
        assert bad not in shown
    assert src.roles == GOV and src.generic


def test_generic_keywords_do_not_claim_the_word_school():
    built = {s.key: s for s in generic.build(SCHEMA)}
    assert "school" not in built["generic:school_branding"].keywords


def test_the_denylist_holds_credentials_and_private_messages():
    for t in ("active_sessions", "payment_gateway_configs", "user_invitations", "audit_logs",
              "workspace_messages", "parent_messages", "support_messages"):
        assert t in DENYLIST


def test_a_failed_schema_read_rolls_back_so_the_next_query_can_run():
    generic._CACHE = ((), 0.0)
    db = FakeDB(fail=True)
    assert run(generic.generic_sources(db)) == ()
    assert db.rolled_back == 1


# ── The stream ───────────────────────────────────────────────────────────────
class User:
    def __init__(self, roles, is_super_admin=False):
        self.id = USER
        self.roles = roles
        self.is_super_admin = is_super_admin


def events(chunks):
    out = []
    for c in chunks:
        body = c.strip()[5:].strip()
        out.append("[DONE]" if body == "[DONE]" else json.loads(body))
    return out


async def _collect(gen):
    return [c async for c in gen]


def stream(db, roles, message, **kw):
    generic._CACHE = ((), 0.0)
    return events(run(_collect(engine.copilot_stream(db, User(roles), SCHOOL, message, **kw))))


@pytest.fixture
def no_model(monkeypatch):
    calls = []

    async def fake(system, prompt, history, max_tokens):
        calls.append({"system": system, "prompt": prompt, "history": history, "max_tokens": max_tokens})
        yield engine._delta("model words")
    monkeypatch.setattr(engine, "_model", fake)
    return calls


def test_a_greeting_is_answered_at_once_without_the_model(no_model):
    ev = stream(FakeDB(), ["principal"], "hi")
    assert ev[-1] == "[DONE]"
    assert "live records" in ev[0]["choices"][0]["delta"]["content"]
    assert no_model == []


def test_a_record_question_streams_status_meta_answer_done(no_model):
    src = SOURCES_BY_KEY["fee_invoices"]
    ev = stream(FakeDB(responder_for(src)), ["principal"], "unpaid invoices")
    kinds = ["status" if "status" in e else "meta" if "meta" in e else "delta" if e != "[DONE]" else "done"
             for e in ev]
    assert kinds == ["status", "meta", "delta", "done"]
    assert "fee_invoices" in ev[1]["meta"]["tables"]
    assert ev[1]["meta"]["as_of"]
    assert no_model == []  # exact figures, no model


def test_an_explanation_is_short_and_given_only_the_figures(no_model):
    src = SOURCES_BY_KEY["fee_invoices"]
    stream(FakeDB(responder_for(src)), ["principal"], "why are so many invoices unpaid")
    assert len(no_model) == 1
    assert no_model[0]["max_tokens"] <= 180
    assert len(no_model[0]["prompt"]) < 2200


def test_a_failed_explanation_leaves_the_figures_and_says_so(monkeypatch):
    async def down(system, prompt, history, max_tokens):
        yield engine._sse({"error": {"code": "ai_unavailable", "message": "No model is available"}})
    monkeypatch.setattr(engine, "_model", down)
    src = SOURCES_BY_KEY["fee_invoices"]
    ev = stream(FakeDB(responder_for(src)), ["principal"], "why are invoices unpaid")
    assert not any(isinstance(e, dict) and "error" in e for e in ev)
    text = "".join(e["choices"][0]["delta"]["content"] for e in ev if isinstance(e, dict) and "choices" in e)
    assert "The explanation could not be written" in text
    assert ev[-1] == "[DONE]"


def test_an_unmatched_question_goes_to_the_model_with_a_small_prompt(no_model):
    stream(FakeDB(lambda s, b: [] if "information_schema" in s else [(0, 0)]), ["principal"],
           "write a poem about spring")
    assert len(no_model) == 1
    assert no_model[0]["max_tokens"] <= 256
    assert len(no_model[0]["system"]) + len(no_model[0]["prompt"]) < 2000


def test_a_failure_is_reported_without_the_sql_error(no_model):
    ev = stream(FakeDB(fail=True), ["principal"], "unpaid invoices")
    errors = [e for e in ev if isinstance(e, dict) and "error" in e]
    assert errors and errors[0]["error"]["code"] == "copilot_failed"
    assert "secret_table" not in errors[0]["error"]["message"]
    assert ev[-1] == "[DONE]"


def test_an_attachment_is_read_by_the_model_not_the_records(no_model):
    stream(FakeDB(), ["principal"], "summarise", attachment_name="a.txt", attachment_text="hello")
    assert len(no_model) == 1 and "hello" in no_model[0]["prompt"]


def test_a_parents_screen_cannot_name_another_familys_child():
    def respond(sql, binds):
        if "student_guardians" in sql:
            return [(KID,)]
        return []
    s = run(engine.build_scope(FakeDB(respond), User(["parent"]), SCHOOL, OTHER_KID))
    assert s.child_ids == [KID]
    assert s.active_student_id is None


# ── Wiring ───────────────────────────────────────────────────────────────────
def _src(path):
    return io.open(path, encoding="utf-8").read()


def test_the_stream_is_not_buffered_by_the_proxy():
    misc = _src("app/routers/misc.py")
    assert '"X-Accel-Buffering": "no"' in misc


def test_the_stream_has_a_session_of_its_own():
    # The request's session is closed before a streamed body is sent.
    misc = _src("app/routers/misc.py")
    assert "async with AsyncSessionLocal() as stream_db" in misc


def test_nothing_the_model_writes_runs_by_itself():
    panel = _src("../src/components/ai/AltrixCopilot.tsx")
    assert "await handleExecuteAction(executeMsg)" not in panel
    assert "shouldExecute" not in panel


def test_every_watched_table_announces_its_changes():
    migration = _src("sql_migrations/20261029000000_copilot_change_notifications.sql")
    announced = set(re.findall(r"'([a-z_]+)'", migration.split("ARRAY[", 1)[1].split("]", 1)[0]))
    missing = (set(curated_tables()) | set(engine.OVERVIEW_TABLES)) - announced
    assert not missing, f"changes to these would never reach the panel: {sorted(missing)}"


def test_workers_pass_database_changes_to_open_screens():
    ws = _src("app/websocket_manager.py")
    assert 'add_listener("altrix_changes"' in ws
    assert "start_table_change_listener()" in _src("app/main.py")
    api = _src("../src/lib/api.ts")
    assert "table_changed" in api and "listener.anyWrite" in api
