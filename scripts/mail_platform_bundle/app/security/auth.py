import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from app.database import get_db

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000).hex()
    return pw_hash, salt

def verify_password(password, stored_hash, salt):
    try:
        salt_str = str(salt or "")
        test_hash = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt_str.encode("utf-8"), 200000).hex()
        return hmac.compare_digest(test_hash, str(stored_hash or ""))
    except Exception:
        return False

_IN_MEMORY_SESSIONS = {}

def create_session(username, role, ip, ttl_hours=24):
    token = secrets.token_urlsafe(32)
    created_at = datetime.utcnow()
    expires_at = created_at + timedelta(hours=ttl_hours)
    
    _IN_MEMORY_SESSIONS[token] = {
        "username": username,
        "role": role,
        "expires_at": expires_at
    }
    
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO admin_session (token, username, role, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)",
            (token, username, role, created_at.strftime("%Y-%m-%d %H:%M:%S"), expires_at.strftime("%Y-%m-%d %H:%M:%S"), ip)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database session insert warning (using in-memory fallback): {e}")
        
    return token, expires_at

def validate_session(token):
    if not token:
        return None
        
    if token in _IN_MEMORY_SESSIONS:
        sess = _IN_MEMORY_SESSIONS[token]
        if datetime.utcnow() > sess["expires_at"]:
            del _IN_MEMORY_SESSIONS[token]
            return None
        return {"username": sess["username"], "role": sess["role"]}

    try:
        conn = get_db()
        cur = conn.cursor()
        row = cur.execute(
            "SELECT username, role, expires_at FROM admin_session WHERE token = ?",
            (token,)
        ).fetchone()
        conn.close()
        
        if not row:
            return None
        
        expires_at = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S")
        if datetime.utcnow() > expires_at:
            revoke_session(token)
            return None
            
        return {"username": row["username"], "role": row["role"]}
    except Exception:
        return None

def revoke_session(token):
    if token in _IN_MEMORY_SESSIONS:
        del _IN_MEMORY_SESSIONS[token]
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM admin_session WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    except Exception:
        pass
