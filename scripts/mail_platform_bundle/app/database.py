import sqlite3
import hashlib
import secrets
import os
from datetime import datetime

_default_db = os.environ.get("DB_PATH", "/data/main.db")
try:
    if not os.path.exists(os.path.dirname(_default_db)):
        os.makedirs(os.path.dirname(_default_db), exist_ok=True)
    DB_PATH = _default_db
except Exception:
    _base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _local_data = os.path.join(_base_dir, "data")
    os.makedirs(_local_data, exist_ok=True)
    DB_PATH = os.path.join(_local_data, "main.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def log_audit(actor, ip, action, resource, status, details=""):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_log (timestamp, actor, ip, action, resource, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), actor, ip or "127.0.0.1", action, resource, status, details)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print("Audit log write error:", e)

def init_security_tables():
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS control_center_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(80) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        role VARCHAR(32) DEFAULT 'SUPER_ADMIN',
        created_at DATETIME NOT NULL,
        last_login DATETIME,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS admin_session (
        token VARCHAR(128) PRIMARY KEY,
        username VARCHAR(80) NOT NULL,
        role VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        ip VARCHAR(45)
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        actor VARCHAR(80) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        action VARCHAR(64) NOT NULL,
        resource VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL,
        details TEXT
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS mailbox_access_grant (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_id VARCHAR(80) NOT NULL,
        mailbox_email VARCHAR(255) NOT NULL,
        permission_scope VARCHAR(32) DEFAULT 'READ_WRITE',
        created_at DATETIME NOT NULL,
        created_by VARCHAR(80) NOT NULL,
        revoked_at DATETIME,
        UNIQUE(principal_id, mailbox_email)
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS user_active_mailbox (
        principal_id VARCHAR(80) PRIMARY KEY,
        mailbox_email VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS user_mail_preferences (
        principal_id VARCHAR(80) PRIMARY KEY,
        density VARCHAR(32) DEFAULT 'comfortable',
        page_size INTEGER DEFAULT 25,
        reading_pane VARCHAR(32) DEFAULT 'split',
        preview_lines INTEGER DEFAULT 1,
        default_mailbox VARCHAR(255),
        default_folder VARCHAR(100) DEFAULT 'INBOX',
        remote_images VARCHAR(32) DEFAULT 'block',
        updated_at DATETIME NOT NULL
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS mailbox_identity_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_id VARCHAR(80) NOT NULL,
        mailbox_email VARCHAR(255) NOT NULL,
        display_name VARCHAR(120),
        signature_plain TEXT,
        signature_html TEXT,
        reply_to VARCHAR(255),
        auto_save_drafts BOOLEAN DEFAULT 1,
        updated_at DATETIME NOT NULL,
        UNIQUE(principal_id, mailbox_email)
    )
    ''')

    admin_exists = cur.execute("SELECT COUNT(*) FROM control_center_admin").fetchone()[0]
    if admin_exists == 0:
        salt = secrets.token_hex(16)
        default_pw = "MasterAdmin2026!#"
        pw_hash = hashlib.pbkdf2_hmac("sha256", default_pw.encode("utf-8"), salt.encode("utf-8"), 200000).hex()
        cur.execute(
            "INSERT INTO control_center_admin (username, password_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?)",
            ("admin", pw_hash, salt, "SUPER_ADMIN", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
        )

    conn.commit()
    conn.close()
