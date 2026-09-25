"""
Which module a question is about.

Scored, not classified by a model: a model round trip on this server costs
several seconds before it has said a word, and the answer to "which table is
'aaj kitne bachay absent hain' about" is not a hard one. A keyword that appears
as a whole phrase scores by its length, so "teachers absent" (staff attendance)
beats "absent" (student attendance); a status word the source understands adds
a point; the screen the user is on breaks ties.
"""
from typing import Iterable, List, Optional, Tuple

from app.utils.copilot.params import words
from app.utils.copilot.registry import Source


def _normalised(text: str) -> str:
    return f" {' '.join(words(text))} "


#: Screen names the panel sends that cover several modules.
_SCREEN_ALIASES = {
    "finance": {"fees", "expenses", "salaries", "payroll"},
    "hr": {"staff", "leave", "payroll", "salaries", "contracts", "recruitment", "appraisals"},
    "communication": {"diary", "notices"},
    "crm": {"admissions"},
    "results": {"exams", "report"},
}


def _on_screen(source: Source, hint: str) -> bool:
    """Whether the screen the user is on ("Exams & Results", "Finance") is this module's."""
    hint_words = set(words(hint))
    if not hint_words or hint_words == {"general"}:
        return False
    mine = set(words(source.module)) | set(source.key.split("_"))
    if hint_words & mine:
        return True
    return any(mine & _SCREEN_ALIASES.get(w, set()) for w in hint_words)


def score(text: str, source: Source, module_hint: Optional[str] = None) -> float:
    norm = _normalised(text)
    tokens = norm.split()
    total = 0.0
    for keyword in source.keywords:
        kw = keyword.lower()
        if f" {kw} " in norm:
            total += 3.0 * len(kw.split())
        elif len(kw) >= 5 and " " not in kw and any(t.startswith(kw[:5]) for t in tokens):
            # "invoicez", "attendence", "salaries" for "salary" — close enough
            # to count, never enough to beat an exact match.
            total += 1.0
    for status in source.statuses:
        if any(f" {w} " in norm for w in status.words):
            total += 1.0
            break
    if module_hint and _on_screen(source, module_hint):
        total += 1.5
    if source.generic:
        total *= 0.9
    return total


def rank(text: str, sources: Iterable[Source], module_hint: Optional[str] = None) -> List[Tuple[float, Source]]:
    scored = [(score(text, s, module_hint), s) for s in sources]
    scored = [pair for pair in scored if pair[0] > 0]
    # Stable on ties, so the curated order — the more common module first —
    # decides between two equally good matches.
    scored.sort(key=lambda pair: -pair[0])
    return scored


#: Below this, nothing in the question points at a module strongly enough to
#: answer from records rather than admit there is no match.
MIN_SCORE = 2.5
