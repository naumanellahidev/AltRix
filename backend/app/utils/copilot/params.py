"""
What a question asks for, read without a model.

A date range ("aaj", "is mahine", "last week"), the shape of the answer (a
count, a total, a list, the top few), whether it is about the person asking
("meri", "my"), and whether it wants an explanation rather than a figure.
None of this needs a language model, and doing it here is what lets most
answers come back in a fraction of a second instead of a minute.
"""
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

#: Schools on this platform keep Pakistan time. "Aaj" means the day in Lahore,
#: not the day in UTC, which is still yesterday until five in the morning.
SCHOOL_TZ = ZoneInfo("Asia/Karachi")


def today() -> date:
    return datetime.now(SCHOOL_TZ).date()


def now_label() -> str:
    return datetime.now(SCHOOL_TZ).strftime("%H:%M")


_WORD = re.compile(r"[a-zA-Z؀-ۿ]+|\d+")


def words(text: str) -> List[str]:
    return [w.lower() for w in _WORD.findall(text or "")]


def has_any(text: str, phrases) -> bool:
    """Whole-word or whole-phrase match, so "fee" does not match "feedback"."""
    low = f" {' '.join(words(text))} "
    return any(f" {p} " in low for p in phrases)


# ── Shape ───────────────────────────────────────────────────────────────────
COUNT_WORDS = (
    "how many", "number of", "count", "kitne", "kitni", "kitna", "tadaad", "total number",
    "kitne log", "kitne bache", "kitne bachay",
)
TOTAL_WORDS = (
    "total", "kul", "sum", "amount", "raqam", "rupees", "rupay", "paise", "paisa",
    "collection", "collected", "kitni fee", "kitna paisa", "kitne paise",
)
#: Amount words that win over a counting word in the same question.
TOTAL_FIRST_WORDS = (
    "kitni fee", "kitna paisa", "kitne paise", "kitni raqam", "kitna amount", "kul raqam",
    "sum", "amount", "raqam", "collection", "collected", "wusool",
)
TOP_WORDS = (
    "top", "highest", "most", "biggest", "largest", "sab se zyada", "sabse zyada",
    "zyada", "best",
)
LOWEST_WORDS = ("lowest", "least", "sab se kam", "sabse kam", "worst", "kam se kam")
#: Not "me", "mujhe" or "hamara": "show me the leave requests" and "hamare
#: school ke students" are about everyone, and a principal who asked them
#: was shown only their own rows.
MINE_WORDS = (
    "my", "mine", "mera", "meri", "mere", "apna", "apni", "apne",
)
EXPLAIN_WORDS = (
    "why", "explain", "analyse", "analyze", "analysis", "compare", "comparison", "trend",
    "reason", "suggest", "suggestion", "advice", "improve", "recommend", "insight",
    "kyun", "kyu", "kiyun", "wajah", "tajziya", "mashwara", "behtar", "samjhao", "samjha",
)
UPCOMING_WORDS = (
    "upcoming", "next", "coming", "future", "agle", "agla", "agli", "aane wale", "aanay wale",
    "aane wala", "aane wali", "ane wale", "baad", "hone wale", "hone wala",
)
PAST_WORDS = ("past", "previous", "pichle", "pichla", "pichli", "guzre", "purane", "last")
ALL_WORDS = ("all", "sab", "tamam", "saare", "sare", "saray", "every", "poore", "pure")


@dataclass
class Params:
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    date_label: Optional[str] = None
    shape: str = "list"            # list | count | total | top | lowest
    mine: bool = False
    explain: bool = False
    upcoming: bool = False
    past: bool = False
    everything: bool = False
    #: Words left over once the vocabulary above is removed — candidates for
    #: a person's name, a book title, a class.
    leftovers: List[str] = field(default_factory=list)


def _week(d: date) -> Tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def _month(d: date) -> Tuple[date, date]:
    start = d.replace(day=1)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start, nxt - timedelta(days=1)


def date_range(text: str, now: Optional[date] = None) -> Tuple[Optional[date], Optional[date], Optional[str]]:
    """The period a question names, or (None, None, None) when it names none."""
    d = now or today()
    if has_any(text, ("today", "aaj", "aj", "abhi", "today's", "todays")):
        return d, d, "today"
    if has_any(text, ("yesterday", "kal", "guzishta roz")):
        # "Kal" is both yesterday and tomorrow in Urdu. For records that have
        # already happened — attendance, payments — it is yesterday; the
        # upcoming-words below override it for things still to come.
        y = d - timedelta(days=1)
        if has_any(text, UPCOMING_WORDS) or has_any(text, ("tomorrow",)):
            t = d + timedelta(days=1)
            return t, t, "tomorrow"
        return y, y, "yesterday"
    if has_any(text, ("tomorrow",)):
        t = d + timedelta(days=1)
        return t, t, "tomorrow"
    if has_any(text, ("this week", "is hafte", "is haftay", "iss hafte", "current week")):
        a, b = _week(d)
        return a, b, "this week"
    if has_any(text, ("last week", "pichle hafte", "pichlay hafte", "previous week")):
        a, b = _week(d - timedelta(days=7))
        return a, b, "last week"
    if has_any(text, ("this month", "is mahine", "iss mahine", "is month", "current month", "mtd")):
        a, b = _month(d)
        return a, b, "this month"
    if has_any(text, ("last month", "pichle mahine", "pichlay mahine", "previous month")):
        a, b = _month(d.replace(day=1) - timedelta(days=1))
        return a, b, "last month"
    if has_any(text, ("this year", "is saal", "iss saal", "current year", "ytd")):
        return d.replace(month=1, day=1), d.replace(month=12, day=31), "this year"
    if has_any(text, ("last year", "pichle saal", "previous year")):
        return d.replace(year=d.year - 1, month=1, day=1), d.replace(year=d.year - 1, month=12, day=31), "last year"
    return None, None, None


def parse(text: str, vocabulary: set) -> Params:
    p = Params()
    p.date_from, p.date_to, p.date_label = date_range(text)
    if has_any(text, LOWEST_WORDS):
        p.shape = "lowest"
    elif has_any(text, TOP_WORDS):
        p.shape = "top"
    elif has_any(text, TOTAL_FIRST_WORDS):
        # "Kitni fee aayi" asks for an amount, though "kitni" also counts.
        p.shape = "total"
    elif has_any(text, COUNT_WORDS):
        p.shape = "count"
    elif has_any(text, TOTAL_WORDS):
        p.shape = "total"
    p.mine = has_any(text, MINE_WORDS)
    p.explain = has_any(text, EXPLAIN_WORDS)
    p.upcoming = has_any(text, UPCOMING_WORDS)
    p.past = has_any(text, PAST_WORDS) and not p.date_label
    p.everything = has_any(text, ALL_WORDS)

    stop = set(vocabulary)
    for group in (COUNT_WORDS, TOTAL_WORDS, TOP_WORDS, LOWEST_WORDS, MINE_WORDS, EXPLAIN_WORDS,
                  UPCOMING_WORDS, PAST_WORDS, ALL_WORDS):
        for phrase_ in group:
            stop.update(phrase_.split())
    stop.update(COMMON_STOPWORDS)
    p.leftovers = [w for w in words(text) if len(w) >= 3 and w not in stop and not w.isdigit()]
    return p


#: Words with no bearing on what is being looked up.
COMMON_STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "what", "when", "how", "with", "that", "this",
    "have", "has", "about", "which", "where", "please", "could", "would", "from", "school",
    "show", "tell", "give", "list", "get", "find", "any", "there", "who", "whose", "can",
    "you", "our", "your", "their", "them", "they", "all", "some", "than", "then", "into",
    "kya", "kia", "hai", "hain", "hy", "hen", "mein", "main", "aur", "batao", "btao", "bataen",
    "dikhao", "dikhaen", "ka", "ki", "ke", "ko", "se", "par", "pe", "wala", "wali", "wale",
    "walay", "kaun", "kon", "kis", "kisi", "nahi", "nahin", "hua", "hui", "hue", "gaya", "gayi",
    "gaye", "raha", "rahi", "rahe", "karo", "kren", "karen", "kar", "chahiye", "yeh", "wo",
    "woh", "unka", "unki", "unke", "iska", "iski", "iske", "sirf", "bhi", "liye", "sath",
    "saath", "abhi", "kitne", "kitni", "kitna", "status", "detail", "details", "information",
    "info", "record", "records", "data", "report", "hoe", "hoye", "hoi", "hy", "mujhe", "hamein",
}
