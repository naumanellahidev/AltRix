"""
Which language the question was asked in, and the few phrases the answers use.

Schools write in English, in Roman Urdu, and in Urdu script, and they mix them
in one sentence. The answer is given back in the language of the question. The
small model on the server often slips into English whatever it is told, which
is one more reason the figures are rendered here rather than by the model.
"""
import re

EN = "en"
UR = "ur"          # Roman Urdu
UR_SCRIPT = "urs"  # Urdu in its own script

#: Words that mark a sentence as Roman Urdu. Only words that are not also
#: ordinary English words, so "me" and "is" do not tip an English question.
_ROMAN_URDU = {
    "kya", "kia", "kitne", "kitni", "kitna", "hain", "hai", "hy", "hen", "ka", "ki", "ke",
    "mein", "main", "aur", "batao", "btao", "bataen", "dikhao", "dikhaen", "mera", "meri",
    "mere", "aaj", "kal", "konsa", "konsi", "kaun", "kon", "kis", "kisne", "wala", "wali",
    "nahi", "nahin", "ni", "sab", "tamam", "kab", "kahan", "kyun", "kyu", "hua", "hui",
    "gaye", "gayi", "raha", "rahi", "rahe", "karo", "kren", "karen", "chahiye", "bachay",
    "bache", "bachon", "bacha", "talaba", "ustad", "asatza", "baqaya", "wajib", "hazri",
    "haziri", "ghair", "chutti", "chhutti", "tankhwah", "kharcha", "shikayat", "imtihan",
    "natija", "dakhla", "mahine", "hafte", "saal", "pichle", "agle", "aane", "abhi",
    "wale", "walay", "hoe", "hoye", "liye", "sath", "saath", "bhi", "b", "yeh", "ye", "wo",
}
_URDU_SCRIPT = re.compile(r"[؀-ۿ]")
_WORD = re.compile(r"[a-zA-Z]+")


def detect(text: str) -> str:
    """en, ur (Roman Urdu) or urs (Urdu script)."""
    if not text:
        return EN
    if len(_URDU_SCRIPT.findall(text)) >= 3:
        return UR_SCRIPT
    words = [w.lower() for w in _WORD.findall(text)]
    if not words:
        return EN
    hits = sum(1 for w in words if w in _ROMAN_URDU)
    # One marker in a short question is enough ("aaj absent?"); in a long one,
    # a couple are needed so an English sentence with "Ali ki fee" in it
    # still reads as mixed rather than as Urdu.
    return UR if hits >= (1 if len(words) <= 5 else 2) else EN


PHRASES = {
    "none_found": {
        EN: "No records match that.",
        UR: "Is ke mutabiq koi record nahi mila.",
        UR_SCRIPT: "اس کے مطابق کوئی ریکارڈ نہیں ملا۔",
    },
    "nothing_recorded": {
        EN: "Nothing has been recorded for {title} {period} yet.",
        UR: "{title} ka {period} abhi tak koi record darj nahi hua.",
        UR_SCRIPT: "{title} کا {period} ابھی تک کوئی ریکارڈ درج نہیں ہوا۔",
    },
    "none_of": {
        EN: "None — out of {n} {noun} recorded for this period.",
        UR: "Koi nahi — is muddat ke {n} {noun} mein se.",
        UR_SCRIPT: "کوئی نہیں — اس مدت کے {n} {noun} میں سے۔",
    },
    "and_more": {
        EN: "…and {n} more. Open the {module} screen for the full list.",
        UR: "…aur {n} mazeed. Poori list {module} screen par dekhein.",
        UR_SCRIPT: "…اور {n} مزید۔ پوری فہرست {module} اسکرین پر دیکھیں۔",
    },
    "as_of": {
        EN: "Live data · as of {time}",
        UR: "Live data · {time} tak",
        UR_SCRIPT: "لائیو ڈیٹا · {time} تک",
    },
    "not_allowed": {
        EN: "Your role does not have access to {title}.",
        UR: "Aap ke role ko {title} dekhne ki ijazat nahi hai.",
        UR_SCRIPT: "آپ کے رول کو {title} دیکھنے کی اجازت نہیں ہے۔",
    },
    "yes": {EN: "Yes", UR: "Haan", UR_SCRIPT: "ہاں"},
    "no": {EN: "No", UR: "Nahi", UR_SCRIPT: "نہیں"},
    "filters": {EN: "Filtered by", UR: "Filter", UR_SCRIPT: "فلٹر"},
}


def phrase(key: str, lang: str, **values) -> str:
    table = PHRASES[key]
    return (table.get(lang) or table[EN]).format(**values)


_PERIODS = {
    "today": ("aaj", "آج"), "yesterday": ("kal", "کل"), "tomorrow": ("kal (aane wala)", "آنے والا کل"),
    "this week": ("is hafte", "اس ہفتے"), "last week": ("pichle hafte", "پچھلے ہفتے"),
    "this month": ("is mahine", "اس مہینے"), "last month": ("pichle mahine", "پچھلے مہینے"),
    "this year": ("is saal", "اس سال"), "last year": ("pichle saal", "پچھلے سال"),
    "upcoming": ("aane wale", "آنے والے"), "past": ("guzre hue", "گزرے ہوئے"),
}


def period(label, lang: str) -> str:
    """A period label ("today", "this month") in the question's language."""
    if not label:
        return ""
    if lang == EN or label not in _PERIODS:
        return label
    return _PERIODS[label][0 if lang == UR else 1]

