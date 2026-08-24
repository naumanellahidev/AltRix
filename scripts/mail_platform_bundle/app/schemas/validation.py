import re
import ipaddress

def is_valid_domain(d):
    if not d or len(d) > 253:
        return False
    # Reject shell metacharacters
    if any(c in d for c in [";", "&", "|", "$", "`", "<", ">", "\\", "\n", "\r", " ", "\t"]):
        return False
    pattern = r"^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
    return bool(re.match(pattern, d))

def is_valid_email(e):
    if not e or len(e) > 254:
        return False
    if any(c in e for c in [";", "&", "|", "$", "`", "<", ">", "\\", "\n", "\r", " ", "\t"]):
        return False
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, e))

def is_valid_username(u):
    if not u or len(u) > 64:
        return False
    pattern = r"^[a-zA-Z0-9._-]+$"
    return bool(re.match(pattern, u))

def is_valid_password(p):
    return bool(p and len(p) >= 8 and len(p) <= 128)

def is_valid_token_name(n):
    return bool(n and len(n) >= 2 and len(n) <= 80 and not any(c in n for c in ["<", ">", ";", "`", "$"]))

def is_valid_destination(dest):
    if not dest or len(dest) > 1000:
        return False
    # Destination can be a single email or comma-separated list of emails
    emails = [e.strip() for e in dest.split(",") if e.strip()]
    if not emails:
        return False
    return all(is_valid_email(e) for e in emails)

def is_valid_ip_restriction(cidr):
    if not cidr or cidr.strip() == "":
        return True
    try:
        ipaddress.ip_network(cidr.strip(), strict=False)
        return True
    except ValueError:
        return False
