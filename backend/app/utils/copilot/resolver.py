"""
A question about one module, answered with one query and exact figures.

Everything that decides *which* rows are counted is here, not in a prompt:
the school (from the caller's token), what the caller's role may see, the
period, the status, the class and the name the question mentions. Every
identifier in the SQL comes from the registry; every value from the question
is a bind parameter. Totals are summed by Postgres over numeric columns, so a
fee balance is the ledger's balance to the paisa — not a small model's reading
of a table.
"""
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import text

from app.utils.copilot import lang as L
from app.utils.copilot.params import SCHOOL_TZ, Params, date_range, has_any, now_label, today, words
from app.utils.copilot.registry import FAMILY, Source

#: Words that ask about a stretch of time rather than today.
OVER_TIME_WORDS = (
    "percentage", "percent", "rate", "rates", "trend", "trends", "sharah", "history",
    "record", "summary", "overall", "average",
)

LIST_LIMIT = 15
COUNT_SHAPE_LIMIT = 10
CELL_LIMIT = 60


@dataclass
class Scope:
    """Who is asking, and what that lets them see."""
    school_id: str
    user_id: str
    roles: frozenset
    #: Sections a teacher is attached to (None when not a teacher).
    teacher_sections: Optional[List[str]] = None
    #: A parent's children, or a student's own id (None for staff).
    child_ids: Optional[List[str]] = None
    child_sections: Optional[List[str]] = None
    #: The student the screen is showing, validated against the above.
    active_student_id: Optional[str] = None
    currency: str = "Rs."

    @property
    def is_family_only(self) -> bool:
        return bool(self.roles) and self.roles <= FAMILY


@dataclass
class Answer:
    markdown: str
    count: int
    rows: List[Dict[str, Any]] = field(default_factory=list)
    facts: str = ""               # compact text for the model to explain
    denied: bool = False
    tables: List[str] = field(default_factory=list)


# ── Access ──────────────────────────────────────────────────────────────────
@dataclass
class Access:
    allowed: bool
    where: List[str] = field(default_factory=list)
    binds: Dict[str, Any] = field(default_factory=dict)
    note: str = ""


def access(source: Source, scope: Scope, params: Params) -> Access:
    """What this caller may see of this source, as extra predicates."""
    granted = scope.roles & source.roles
    beyond_teacher = granted - {"teacher"}
    out = Access(True)

    def self_only():
        out.where.append(f"{source.self_expr} = CAST(:uid AS uuid)")
        out.binds["uid"] = scope.user_id

    if beyond_teacher:
        # Full access for the role — "mine" is still honoured as a choice.
        if params.mine and source.self_expr:
            self_only()
        return out

    if "teacher" in granted:
        if params.mine and source.self_expr:
            self_only()
        elif source.section_expr and scope.teacher_sections is not None:
            out.where.append(f"{source.section_expr} = ANY(CAST(:tsec AS uuid[]))")
            out.binds["tsec"] = scope.teacher_sections or ["00000000-0000-0000-0000-000000000000"]
        elif source.student_expr and scope.teacher_sections is not None:
            out.where.append(
                f"{source.student_expr} IN (SELECT se.student_id FROM student_enrollments se "
                "WHERE se.class_section_id = ANY(CAST(:tsec AS uuid[])) AND se.end_date IS NULL)"
            )
            out.binds["tsec"] = scope.teacher_sections or ["00000000-0000-0000-0000-000000000000"]
        return out

    if source.family and (scope.roles & FAMILY):
        kids = scope.child_ids or []
        if scope.active_student_id and scope.active_student_id in kids:
            kids = [scope.active_student_id]
        if source.student_expr:
            out.where.append(f"{source.student_expr} = ANY(CAST(:kids AS uuid[]))")
            out.binds["kids"] = kids or ["00000000-0000-0000-0000-000000000000"]
        elif source.section_expr:
            sections = scope.child_sections or []
            out.where.append(f"{source.section_expr} = ANY(CAST(:ksec AS uuid[]))")
            out.binds["ksec"] = sections or ["00000000-0000-0000-0000-000000000000"]
        return out

    if source.self_expr and scope.roles and not scope.is_family_only:
        # A member of staff without the HR role may still read their own
        # payslip, leave or contract — and only their own.
        self_only()
        return out

    return Access(False)


# ── Matching words to the table ─────────────────────────────────────────────
def matched_statuses(question: str, source: Source):
    """Status groups the question names, dropping any whose matching phrase
    sits inside a longer phrase another group matched ("not paid" must not
    also count as "paid")."""
    norm = f" {' '.join(words(question))} "
    hits = []
    for status in source.statuses:
        best = None
        for w in status.words:
            if f" {w} " in norm and (best is None or len(w) > len(best)):
                best = w
        if best:
            hits.append((best, status))
    kept = []
    for phrase, status in hits:
        if any(phrase != other and f" {phrase} " in f" {other} " for other, _ in hits):
            continue
        kept.append(status)
    return kept


async def resolve_sections(db, school_id: str, question: str) -> Tuple[List[str], List[str], List[str]]:
    """Class/section ids the question names, their labels, and the words used."""
    rows = (await db.execute(text(
        "SELECT cs.id::text, ac.name, cs.name FROM class_sections cs "
        "JOIN academic_classes ac ON ac.id = cs.class_id WHERE cs.school_id = CAST(:sid AS uuid)"
    ), {"sid": school_id})).all()
    if not rows:
        return [], [], []
    norm = f" {' '.join(words(question))} "
    chosen: Dict[str, str] = {}
    used: List[str] = []
    for sec_id, class_name, section_name in rows:
        cname = " ".join(words(class_name or ""))
        if not cname:
            continue
        # A class named only "2" must not match every "2" in a question
        # ("last 2 weeks"), so a bare number is only matched as "class 2".
        variants = set() if cname.isdigit() else {cname}
        # "Class 3" is also asked as "3rd class", "grade 3", "class 3".
        m = re.search(r"(\d+)", cname)
        if m:
            n = m.group(1)
            variants |= {f"class {n}", f"grade {n}", f"{n} class", f"jamaat {n}"}
        hit = next((v for v in sorted(variants, key=len, reverse=True) if f" {v} " in norm), None)
        if not hit:
            continue
        sname = " ".join(words(section_name or ""))
        # A section named in the question narrows the class to that section.
        if sname and f" {hit} {sname} " in norm:
            chosen[sec_id] = f"{class_name} {section_name}"
            used += hit.split() + sname.split()
        else:
            chosen.setdefault(sec_id, f"{class_name} {section_name}".strip())
            used += hit.split()
    # If any section was named explicitly, keep only the named ones.
    if chosen:
        named = {k: v for k, v in chosen.items() if any(
            f" {' '.join(words(v))} " in norm for _ in [0])}
        if named:
            chosen = named
    return list(chosen.keys()), sorted(set(chosen.values())), used


#: Everyone a name in a question might belong to.
_PEOPLE_SQL = (
    "SELECT 1 WHERE EXISTS (SELECT 1 FROM students p WHERE p.school_id = CAST(:sid AS uuid) "
    "AND trim(concat_ws(' ', p.first_name, p.last_name)) ILIKE :nm) "
    "OR EXISTS (SELECT 1 FROM hr_staff_directory p WHERE p.school_id = CAST(:sid AS uuid) AND p.full_name ILIKE :nm)"
)


async def resolve_names(db, source: Source, base_where: str, binds: Dict[str, Any],
                        candidates: Sequence[str]) -> List[str]:
    """The leftover words that are names — in this table, or of anyone the school has.

    A word that names a real student or member of staff is applied even when
    this table holds nothing for them: "Adnan ki fee" with no invoices for
    Adnan is answered "0 invoices — Adnan", not with every invoice in the school.
    """
    if not source.name_cols or not candidates:
        return []
    matched: List[str] = []
    for word in candidates[:4]:
        cond = " OR ".join(f"COALESCE(({c})::text, '') ILIKE :nm" for c in source.name_cols)
        sql = f"SELECT 1 FROM {source.frm} WHERE {base_where} AND ({cond}) LIMIT 1"
        pattern = f"%{word}%"
        found = (await db.execute(text(sql), {**binds, "nm": pattern})).first()
        if not found:
            found = (await db.execute(text(_PEOPLE_SQL), {"sid": binds["sid"], "nm": pattern})).first()
        if found:
            matched.append(word)
    return matched


# ── Formatting ──────────────────────────────────────────────────────────────
def fmt(value: Any, kind: str, lang: str, currency: str) -> str:
    if value is None or value == "":
        return "—"
    if kind == "money":
        return f"{currency} {Decimal(str(value)):,.2f}"
    if kind == "percent":
        return f"{Decimal(str(value)):.1f}%"
    if kind == "number":
        d = Decimal(str(value))
        return f"{int(d):,}" if d == d.to_integral_value() else f"{d:,.2f}"
    if kind == "bool":
        return L.phrase("yes" if value else "no", lang)
    if kind == "date":
        if isinstance(value, (date, datetime)):
            return value.strftime("%d %b %Y")
        return str(value)[:10]
    if kind == "datetime":
        if isinstance(value, datetime):
            if value.tzinfo:
                value = value.astimezone(SCHOOL_TZ)
            return value.strftime("%d %b %Y, %H:%M")
        return str(value)[:16]
    text_ = str(value).replace("|", "/").replace("\n", " ").strip()
    return text_ if len(text_) <= CELL_LIMIT else text_[: CELL_LIMIT - 1] + "…"


def _singular(noun: str) -> str:
    """"1 invoice", not "1 invoices" — the last word only, English only."""
    head, _, last = noun.rpartition(" ")
    if last.endswith("ies") and len(last) > 4:
        last = last[:-3] + "y"
    elif last.endswith(("sses", "ches", "shes", "xes")):
        last = last[:-2]
    elif last.endswith("s") and not last.endswith("ss") and len(last) > 3:
        last = last[:-1]
    return f"{head} {last}".strip()


def _headers(source: Source, lang: str) -> List[str]:
    return [(c.label_ur if lang != L.EN and c.label_ur else c.label) for c in source.columns]


# ── The query ───────────────────────────────────────────────────────────────
async def answer(db, source: Source, params: Params, scope: Scope, question: str, lang: str) -> Answer:
    acc = access(source, scope, params)
    title = source.title_ur if lang != L.EN else source.title
    if not acc.allowed:
        return Answer(L.phrase("not_allowed", lang, title=title), 0, denied=True)

    binds: Dict[str, Any] = {"sid": scope.school_id, "today": today(), **acc.binds}
    where: List[str] = ["t.school_id = CAST(:sid AS uuid)"]
    if source.always_where:
        where.append(source.always_where)
    where += acc.where
    described: List[str] = []

    # Status words ("unpaid", "ghair hazir"); the table's default otherwise.
    statuses = matched_statuses(question, source)
    if statuses:
        for st in statuses:
            where.append(f"({st.sql})")
            described.append(st.label_ur if lang != L.EN and st.label_ur else st.label)
    elif source.default_where and not params.everything:
        where.append(f"({source.default_where})")

    # Class and section.
    sec_ids, sec_labels, class_words = await resolve_sections(db, scope.school_id, question)
    if sec_ids and (source.section_expr or source.student_expr):
        binds["qsec"] = sec_ids
        if source.section_expr:
            where.append(f"{source.section_expr} = ANY(CAST(:qsec AS uuid[]))")
        else:
            where.append(
                f"{source.student_expr} IN (SELECT se.student_id FROM student_enrollments se "
                "WHERE se.class_section_id = ANY(CAST(:qsec AS uuid[])) AND se.end_date IS NULL)"
            )
        described += sec_labels

    # Names — only words that really are names in this table.
    base_where = " AND ".join(where)
    status_words = {x for st in source.statuses for w in st.words for x in w.split()}
    candidates = [w for w in params.leftovers if w not in class_words and w not in status_words]
    names = await resolve_names(db, source, base_where, binds, candidates)
    for i, word in enumerate(names):
        key = f"nm{i}"
        binds[key] = f"%{word}%"
        where.append("(" + " OR ".join(f"COALESCE(({c})::text, '') ILIKE :{key}" for c in source.name_cols) + ")")
    if names:
        described.append(" ".join(n.capitalize() for n in names))
    # A named active student (the child on screen) narrows staff answers too.
    if (not names and scope.active_student_id and source.student_expr
            and not scope.is_family_only and has_any(question, ("this student", "is bache", "iska", "iski", "iske"))):
        where.append(f"{source.student_expr} = CAST(:active AS uuid)")
        binds["active"] = scope.active_student_id

    # The period.
    before_period = len(where)
    d_from, d_to, d_label = params.date_from, params.date_to, params.date_label
    if d_from is None and not names and not params.everything:
        if source.default_when == "today" and (scope.is_family_only or has_any(question, OVER_TIME_WORDS)):
            # A parent asking for "my child's attendance", or anyone asking
            # for a rate, means the month so far, not just today.
            d_from, d_to, d_label = date_range("this month")
        elif source.default_when == "today":
            d_from = d_to = today()
            d_label = "today"
        elif source.default_when == "upcoming" and not params.past:
            d_from, d_to, d_label = today(), None, "upcoming"
    if d_from is None and params.upcoming:
        d_from, d_to, d_label = today(), None, "upcoming"
    if d_from is None and params.past:
        d_from, d_to, d_label = None, today() - timedelta(days=1), "past"

    if source.dow_expr and d_label in ("today", "tomorrow", "yesterday") and d_from:
        where.append(f"{source.dow_expr} = :dow")
        binds["dow"] = d_from.isoweekday()
        described.append(L.period(d_label, lang))
    elif source.span and (d_from or d_to):
        start, end = source.span
        if d_to is not None:
            where.append(f"{start} <= :dto")
            binds["dto"] = d_to
        if d_from is not None:
            where.append(f"COALESCE({end}, {start}) >= :dfrom")
            binds["dfrom"] = d_from
        described.append(L.period(d_label, lang))
    elif source.date_col and (d_from or d_to):
        if d_from is not None:
            where.append(f"{source.date_col} >= :dfrom")
            binds["dfrom"] = d_from
        if d_to is not None:
            where.append(f"{source.date_col} <= :dto")
            binds["dto"] = d_to
        described.append(L.period(d_label, lang))

    where_sql = " AND ".join(where)

    # Totals: counted and summed by Postgres, exact.
    agg_sql = ", ".join([f"{source.count_expr} AS n"] + [f"{a.sql} AS a{i}" for i, a in enumerate(source.aggregates)])
    summary = (await db.execute(text(f"SELECT {agg_sql} FROM {source.frm} WHERE {where_sql}"), binds)).mappings().first()
    count = int(summary["n"] or 0) if summary else 0

    # "0 absent" and "attendance was not taken" are different answers. When a
    # status filter leaves nothing, count the same period without it, so the
    # reply can say which one it is.
    recorded_without_status: Optional[int] = None
    status_sqls = {f"({st.sql})" for st in statuses}
    if count == 0 and statuses:
        loose = " AND ".join(w for w in where if w not in status_sqls)
        row = (await db.execute(text(f"SELECT {source.count_expr} FROM {source.frm} WHERE {loose}"), binds)).first()
        recorded_without_status = int(row[0] or 0) if row else 0
    period_applied = len(where) > before_period
    if count == 0 and period_applied and not statuses:
        # "Today's attendance" with nothing marked today is "not taken yet",
        # not "no records match".
        recorded_without_status = 0

    # When nothing was recorded for the period, say when something last was:
    # "attendance has not been marked today; the last was on 20 Sep 2026".
    latest_seen: Optional[str] = None
    latest_col = source.date_col or (source.span[0] if source.span else None)
    if count == 0 and period_applied and recorded_without_status == 0 and latest_col:
        undated = " AND ".join(w for w in where[:before_period] if w not in status_sqls)
        undated_binds = {k: v for k, v in binds.items() if k not in ("dfrom", "dto", "dow")}
        try:
            row = (await db.execute(text(
                f"SELECT MAX({latest_col}) FROM {source.frm} WHERE {undated}"), undated_binds)).first()
            if row and row[0] is not None:
                latest_seen = fmt(row[0], "date", lang, scope.currency)
        except Exception:
            await db.rollback()

    # Rows.
    order = source.order_by
    if params.shape == "top" and source.top_order:
        order = source.top_order
    elif params.shape == "lowest" and source.lowest_order:
        order = source.lowest_order
    limit = COUNT_SHAPE_LIMIT if params.shape in ("count", "total") else LIST_LIMIT
    select_cols = ", ".join(f"{c.sql} AS c{i}" for i, c in enumerate(source.columns))
    rows = []
    if count:
        rows = [dict(r) for r in (await db.execute(
            text(f"SELECT {select_cols} FROM {source.frm} WHERE {where_sql} ORDER BY {order} LIMIT {limit}"),
            binds,
        )).mappings().all()]

    # ── Render ──────────────────────────────────────────────────────────────
    noun = source.count_noun_ur if lang != L.EN else source.count_noun
    if count == 1 and lang == L.EN:
        noun = _singular(noun)
    head = f"**{count:,} {noun}**"
    tags = [d for d in described if d]
    if tags:
        head += " — " + " · ".join(tags)
    agg_parts = []
    if summary:
        for i, a in enumerate(source.aggregates):
            v = summary.get(f"a{i}")
            if v is not None:
                label = a.label_ur if lang != L.EN and a.label_ur else a.label
                agg_parts.append(f"{label}: **{fmt(v, a.kind, lang, scope.currency)}**")
    lines = [head]
    if agg_parts:
        lines.append(" · ".join(agg_parts))

    headers = _headers(source, lang)
    rendered_rows: List[List[str]] = []
    for r in rows:
        rendered_rows.append([fmt(r[f"c{i}"], c.kind, lang, scope.currency) for i, c in enumerate(source.columns)])
    # Drop columns that are empty on every row shown — a column of dashes is
    # noise, and on a narrow chat panel it pushes the useful ones off screen.
    keep = [i for i in range(len(headers)) if any(row[i] != "—" for row in rendered_rows)] or list(range(len(headers)))
    if count == 0:
        lines.append("")
        if recorded_without_status == 0:
            period = L.period(d_label, lang)
            if d_label == "upcoming":
                lines.append(L.phrase("none_upcoming", lang, title=title))
            else:
                lines.append(L.phrase("nothing_recorded", lang, title=title, period=period).replace("  ", " ").strip())
            if latest_seen:
                lines.append(L.phrase("latest", lang, date=latest_seen))
        elif recorded_without_status:
            lines.append(L.phrase("none_of", lang, n=f"{recorded_without_status:,}", noun=noun))
        else:
            lines.append(L.phrase("none_found", lang))
    elif rendered_rows:
        lines.append("")
        lines.append("| " + " | ".join(headers[i] for i in keep) + " |")
        lines.append("|" + "|".join(" --- " for _ in keep) + "|")
        for row in rendered_rows:
            lines.append("| " + " | ".join(row[i] for i in keep) + " |")
        if count > len(rendered_rows):
            lines.append("")
            lines.append(L.phrase("and_more", lang, n=f"{count - len(rendered_rows):,}", module=source.module))
    lines.append("")
    lines.append(f"_{L.phrase('as_of', lang, time=now_label())}_")

    # The same result, compact, for the model to explain without re-reading
    # the whole table — and without ids, which it never needs.
    # Labelled so a small model cannot mistake a sample for the whole: shown
    # three rows of fourteen, it added the three up and called that the total.
    # In English whatever the question's language: the facts are for the
    # model, which read "Kul bill · Wusool" as something missing from them.
    en_noun = _singular(source.count_noun) if count == 1 else source.count_noun
    en_tags = [st.label for st in statuses] + sec_labels + [n.capitalize() for n in names]
    if d_label:
        en_tags.append(d_label)
    facts_lines = [f"Result (complete count): {count:,} {en_noun}"
                   + (" — " + " · ".join(t for t in en_tags if t) if en_tags else "")]
    if summary and source.aggregates:
        totals = [f"{a.label}: {fmt(summary.get(f'a{i}'), a.kind, L.EN, scope.currency)}"
                  for i, a in enumerate(source.aggregates) if summary.get(f"a{i}") is not None]
        if totals:
            facts_lines.append(f"Totals over all {count:,} (exact): " + " · ".join(totals))
    if rendered_rows:
        shown = min(len(rendered_rows), 10)
        facts_lines.append(f"Example rows ({shown} of {count:,}; do not add these up or count them):")
    en_headers = [c.label for c in source.columns]
    for r in rows[:10]:
        facts_lines.append("; ".join(
            f"{en_headers[i]}: {fmt(r[f'c{i}'], source.columns[i].kind, L.EN, scope.currency)}" for i in keep))
    facts = "\n".join(facts_lines)[:1500]

    return Answer(
        markdown="\n".join(lines),
        count=count,
        rows=rows,
        facts=facts,
        tables=[source.table or source.frm.split()[0]],
    )
