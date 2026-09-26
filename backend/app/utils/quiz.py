"""
MCQ quizzes stored in an assignment's description.

Two forms exist: ``[ALTRIX_QUIZ_JSON]:{"questions": [...]}`` and the text the
AI lesson planner writes ("Q1: ... A. ... B. ... Correct Answer: C
Explanation: ..."). Both carry the answer key, which students could read:
the preview printed "Correct Answer: C" under each question, and the browser
graded the quiz and wrote the marks itself, so a student could submit any
mark. Now a student is sent the questions only (``student_view``), the server
grades (``grade``), and the answers are revealed once the quiz is handed in.

Nothing is invented: a question without an answer key is not gradable (it
used to count "A" as correct), and one without options has none (it used to
get "Option A" to "Option D").
"""
import json
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional

JSON_PREFIX = "[ALTRIX_QUIZ_JSON]:"
_Q = re.compile(r"^(?:\*\*)?(?:Q(?:uestion)?\s*[-.:\d\s]+|\d+\.)", re.I)
_OPT = re.compile(r"^(?:\*\*)?([A-D])[-.)\s]+(.*)", re.I)
_ANS = re.compile(r"(?:Correct\s+)?Answer\s*[-.:\s*]+([A-D])\b", re.I)
_EXP = re.compile(r"(?:Explanation|Exp)\s*[-.:\s*]+(.*)", re.I)


def _clean(s: str) -> str:
    return re.sub(r"^\*+|\*+$", "", s).strip()


def parse(description: Optional[str]) -> Optional[dict]:
    """{"instructions": str, "questions": [{questionNumber, question, options, correctAnswer, explanation}]}"""
    if not description:
        return None
    if description.startswith(JSON_PREFIX):
        try:
            data = json.loads(description[len(JSON_PREFIX):])
        except ValueError:
            return None
        qs = []
        for i, q in enumerate(data.get("questions") or [], 1):
            opts = q.get("options") or []
            if isinstance(opts, dict):
                opts = [opts[k] for k in sorted(opts)]
            ans = str(q.get("correctAnswer") or q.get("correct_answer") or "").strip().upper()[:1] or None
            qs.append({"questionNumber": q.get("questionNumber") or i, "question": q.get("question") or "",
                       "options": [str(o) for o in opts], "correctAnswer": ans,
                       "explanation": q.get("explanation") or ""})
        return {"instructions": data.get("instructions") or "", "questions": qs} if qs else None

    questions: List[dict] = []
    instructions: List[str] = []
    cur: Optional[dict] = None
    for raw in description.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if _Q.match(line):
            if cur:
                questions.append(cur)
            text = re.sub(r"^[Qq](?:uestion)?\s*[-.:\d\s]+", "", _clean(line))
            text = re.sub(r"^\d+\.\s*", "", text).strip()
            cur = {"questionNumber": len(questions) + 1, "question": text, "options": {},
                   "correctAnswer": None, "explanation": ""}
            continue
        if cur is None:
            instructions.append(line)
            continue
        m = _OPT.match(line)
        if m and not _ANS.search(line):
            cur["options"][m.group(1).upper()] = _clean(m.group(2))
            continue
        m = _ANS.search(line)
        if m:
            cur["correctAnswer"] = m.group(1).upper()
            e = _EXP.search(line)
            if e:
                cur["explanation"] = _clean(e.group(1))
            continue
        m = _EXP.match(line)
        if m:
            cur["explanation"] = _clean(m.group(1))
            continue
        if cur["explanation"]:
            cur["explanation"] += " " + line
        elif not cur["options"]:
            cur["question"] += " " + line
    if cur:
        questions.append(cur)
    for q in questions:
        q["options"] = [q["options"][k] for k in "ABCD" if k in q["options"]]
    if not questions:
        return None
    return {"instructions": "\n".join(instructions), "questions": questions}


def is_quiz(description: Optional[str]) -> bool:
    return parse(description) is not None


def student_view(description: Optional[str]) -> Optional[str]:
    """The description with the answer key and explanations taken out."""
    if not description:
        return description
    if description.startswith(JSON_PREFIX):
        data = parse(description)
        if not data:
            return description
        return JSON_PREFIX + json.dumps({
            "instructions": data["instructions"],
            "questions": [{k: q[k] for k in ("questionNumber", "question", "options")} for q in data["questions"]],
        })
    if not _ANS.search(description):
        return description
    out = []
    for raw in description.split("\n"):
        line = _ANS.sub("", raw)
        line = _EXP.sub("", line)
        if raw.strip() and not re.sub(r"[\s*_\-.:]+", "", line):
            continue  # the line held only the answer or explanation
        out.append(line.rstrip())
    return "\n".join(out)


def grade(quiz: dict, answers: Dict[str, str], max_marks) -> dict:
    """Marks for the answers given: questions without a key are not counted."""
    qs = quiz["questions"]
    gradable = [q for q in qs if q.get("correctAnswer")]
    correct = sum(1 for q in gradable if str(answers.get(str(q["questionNumber"]), "")).upper() == q["correctAnswer"])
    marks = None
    if gradable:
        out_of = Decimal(str(max_marks)) if max_marks not in (None, "") else Decimal(len(gradable))
        marks = (Decimal(correct) * out_of / Decimal(len(gradable))).quantize(Decimal("0.01"), ROUND_HALF_UP)
    return {"total": len(qs), "gradable": len(gradable), "correct": correct, "marks": marks}
