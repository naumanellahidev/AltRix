"""
Input Sanitizer — Validation and sanitization for all API inputs.

Protects against:
- XSS (Cross-Site Scripting) via HTML stripping
- SQL injection via parameterized query enforcement and pattern detection
- Path traversal via filename sanitization
- Password policy enforcement
- Oversized payloads

Used in Pydantic validators and router endpoint logic.
All AltRix inputs MUST be validated before DB or AI access.
"""
import re
import logging
from typing import Optional
from uuid import UUID

logger = logging.getLogger("app.security.input")

# ─── Pattern Constants ────────────────────────────────────────────────────────

# HTML/Script injection patterns
_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.IGNORECASE)
_EVENT_ATTR_RE = re.compile(r'\bon\w+\s*=', re.IGNORECASE)  # onclick=, onerror=, etc.

# SQL injection suspicious patterns (for logging/alerting, not blocking — we use parameterized queries)
_SQL_PATTERN_RE = re.compile(
    r"(\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b"
    r"|\bEXEC\b|\bEXECUTE\b|--\s|;--|\bOR\s+1=1\b|'\s*OR\s*')",
    re.IGNORECASE,
)

# Email validation
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')

# UUID validation
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

# Password strength
_PASSWORD_COMMON = {
    "password", "password123", "123456", "qwerty", "admin", "letmein",
    "welcome", "monkey", "1234567890", "abc123", "iloveyou", "sunshine",
    "princess", "master", "superman", "batman", "altrix", "school123",
}

# Max lengths for various field types
MAX_LEN_NAME = 200
MAX_LEN_EMAIL = 320
MAX_LEN_TEXT = 10_000
MAX_LEN_SEARCH = 200
MAX_LEN_PHONE = 20
MAX_LEN_DESCRIPTION = 5_000


# ─── Sanitization Functions ───────────────────────────────────────────────────

def sanitize_string(
    value: Optional[str],
    *,
    max_len: int = MAX_LEN_TEXT,
    strip_html: bool = True,
    allow_newlines: bool = True,
) -> Optional[str]:
    """
    Sanitize a general string input:
    1. Strip leading/trailing whitespace
    2. Remove HTML tags and event attributes (if strip_html=True)
    3. Truncate to max_len
    4. Detect SQL injection patterns (log + continue — we use parameterized queries)
    """
    if value is None:
        return None

    value = value.strip()

    if strip_html:
        value = _SCRIPT_RE.sub("", value)
        value = _HTML_TAG_RE.sub("", value)
        value = _EVENT_ATTR_RE.sub("", value)

    if not allow_newlines:
        value = value.replace("\n", " ").replace("\r", " ")

    # Detect SQL patterns (informational — not used as a block condition)
    if _SQL_PATTERN_RE.search(value):
        logger.warning(f"Possible SQL injection pattern in input: {value[:100]!r}")

    return value[:max_len]


def sanitize_search_query(query: Optional[str]) -> Optional[str]:
    """Sanitize a search query string. Strict limits for search inputs."""
    if not query:
        return None
    q = sanitize_string(query, max_len=MAX_LEN_SEARCH, strip_html=True, allow_newlines=False)
    return q if q else None


def sanitize_name(value: Optional[str]) -> Optional[str]:
    """Sanitize a person/place name field."""
    return sanitize_string(value, max_len=MAX_LEN_NAME, strip_html=True, allow_newlines=False)


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename for storage.
    Removes path traversal, dangerous characters, and limits length.
    """
    # Strip directories
    name = filename.replace("\\", "/").split("/")[-1]
    # Remove dangerous characters
    name = re.sub(r'[^\w.\-]', '_', name)
    # Remove leading dots (hidden files)
    name = name.lstrip(".")
    # Prevent path traversal
    name = name.replace("..", "_")
    # Limit length
    return name[:255] or "upload"


# ─── Validation Functions ─────────────────────────────────────────────────────

def validate_email(email: str) -> str:
    """
    Validate and normalize an email address.
    Raises ValueError on invalid format.
    """
    email = email.strip().lower()
    if not email or len(email) > MAX_LEN_EMAIL:
        raise ValueError("Invalid email address length")
    if not _EMAIL_RE.match(email):
        raise ValueError(f"Invalid email format: {email}")
    return email


def validate_uuid(value: str, field_name: str = "ID") -> UUID:
    """
    Validate a UUID string.
    Raises ValueError on invalid format.
    """
    if not value:
        raise ValueError(f"{field_name} is required")
    val = str(value).strip()
    if not _UUID_RE.match(val):
        raise ValueError(f"Invalid {field_name} format: must be a valid UUID")
    return UUID(val)


def validate_phone(phone: Optional[str]) -> Optional[str]:
    """
    Validate and normalize a phone number.
    Allows digits, +, -, (, ), spaces.
    """
    if not phone:
        return None
    phone = phone.strip()
    clean = re.sub(r'[^\d+\-() ]', '', phone)
    if len(clean) < 7 or len(clean) > MAX_LEN_PHONE:
        raise ValueError("Invalid phone number")
    return clean


# ─── Password Security ────────────────────────────────────────────────────────

class PasswordStrengthError(ValueError):
    """Raised when a password doesn't meet strength requirements."""
    pass


def validate_password_strength(
    password: str,
    *,
    min_length: int = 8,
    require_uppercase: bool = True,
    require_lowercase: bool = True,
    require_digit: bool = True,
    require_special: bool = True,
) -> None:
    """
    Validate password strength against AltRix policy.
    Raises PasswordStrengthError with descriptive message on failure.

    Policy:
    - Minimum 8 characters (configurable)
    - Must contain uppercase, lowercase, digit, special character
    - Must not be in the common passwords list
    - Must not contain only repeated characters
    """
    errors = []

    if len(password) < min_length:
        errors.append(f"at least {min_length} characters")

    if require_uppercase and not re.search(r'[A-Z]', password):
        errors.append("at least one uppercase letter (A-Z)")

    if require_lowercase and not re.search(r'[a-z]', password):
        errors.append("at least one lowercase letter (a-z)")

    if require_digit and not re.search(r'\d', password):
        errors.append("at least one number (0-9)")

    if require_special and not re.search(r'[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;\'`~/]', password):
        errors.append("at least one special character (!@#$%^&*...)")

    if password.lower() in _PASSWORD_COMMON:
        errors.append("not a commonly used password")

    # Repeated character check (e.g., "aaaaaaa")
    if len(set(password)) < 3:
        errors.append("not made up of only repeated characters")

    if errors:
        raise PasswordStrengthError(
            f"Password must contain: {', '.join(errors)}"
        )


# ─── Numeric Validation ────────────────────────────────────────────────────────

def validate_positive_decimal(value, field_name: str = "value") -> float:
    """Validate that a numeric value is positive."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")
    if f < 0:
        raise ValueError(f"{field_name} must be 0 or greater")
    return f


def validate_date_string(value: str, field_name: str = "date") -> str:
    """Validate an ISO date string (YYYY-MM-DD)."""
    if not value:
        raise ValueError(f"{field_name} is required")
    date_re = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    if not date_re.match(value.strip()):
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format")
    return value.strip()
