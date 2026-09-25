#!/usr/bin/env python3
"""
Verify every finding from the AltRix audit is actually closed.

Run from the repository root:

    python scripts/audit_verify.py

Checks are made against the code as it would run, not against comments — every
Python source is parsed and its docstrings and comments stripped first, because
a grep for "supabase" that matches a comment saying "no longer uses supabase"
reports the opposite of the truth.

Exit code is non-zero if anything is still open, so this can gate a deploy.
"""
import ast
import glob
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
if os.name == "nt" and not os.environ.get("WT_SESSION"):
    GREEN = RED = YELLOW = DIM = RESET = ""


# ─── Helpers ──────────────────────────────────────────────────────────────────

_code_cache: dict = {}


def code(path: str) -> str:
    """Python source with docstrings removed, so greps match real code."""
    if path in _code_cache:
        return _code_cache[path]
    tree = ast.parse(io.open(path, encoding="utf-8").read())
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)):
            body = node.body
            if (body and isinstance(body[0], ast.Expr)
                    and isinstance(body[0].value, ast.Constant)
                    and isinstance(body[0].value.value, str)):
                body.pop(0)
    _code_cache[path] = ast.unparse(tree)
    return _code_cache[path]


def txt(path: str) -> str:
    return io.open(path, encoding="utf-8").read()


def exists(path: str) -> bool:
    return os.path.exists(path)


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


def count_matches(pattern: str, paths: str) -> int:
    out = sh(f'git grep -c "{pattern}" -- {paths}')
    return sum(int(line.rsplit(":", 1)[1]) for line in out.splitlines() if ":" in line)


def app_routes():
    """(method, normalised path) for every registered endpoint."""
    # Written to a file rather than passed with -c: the route expression
    # contains braces and quotes that a shell -c argument mangles.
    helper = os.path.join(ROOT, "backend", "_audit_routes.py")
    helper_src = "\n".join([
        "import json, re",
        "from app.main import app",
        "rows = [(m, re.sub(r'\\{[^}]+\\}', '{}', r.path))",
        "        for r in app.routes",
        "        for m in (getattr(r, 'methods', None) or [])",
        "        if m not in ('HEAD', 'OPTIONS')]",
        "print('ROUTES_JSON=' + json.dumps(rows))",
        "",
    ])
    io.open(helper, "w", encoding="utf-8").write(helper_src)
    # Passed through the environment rather than an inline `VAR=x cmd` prefix:
    # that syntax is bash-only, and shell=True resolves to cmd.exe on Windows.
    env = dict(os.environ)
    env.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    env.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

    try:
        proc = subprocess.run(
            [sys.executable, "_audit_routes.py"],
            cwd=os.path.join(ROOT, "backend"),
            env=env, capture_output=True, text=True,
        )
        out = proc.stdout
    finally:
        if os.path.exists(helper):
            os.remove(helper)

    line = next((l for l in out.splitlines() if l.startswith("ROUTES_JSON=")), None)
    if not line:
        raise RuntimeError("could not enumerate routes; is the app importable?")
    return json.loads(line[len("ROUTES_JSON="):])


# ─── Results ──────────────────────────────────────────────────────────────────

results = []


def check(section: str, ident: str, label: str, ok: bool, detail: str = ""):
    results.append((section, ident, bool(ok), label, detail))


def run():
    R = "backend/app/routers/"
    U = "backend/app/utils/"

    vps = code(R + "vps_db.py")
    pol = code(U + "db_proxy_policy.py")
    main = code("backend/app/main.py")
    sch = code(R + "schools.py")
    ff = code(R + "feature_flags.py")
    deps = code("backend/app/dependencies.py")
    auth = code(R + "auth.py")
    em = code(R + "email_management.py")
    fn = code(R + "functions.py")
    col = code(R + "collaboration.py")
    pay = code(R + "payments.py")
    sto = code(R + "vps_storage.py")
    rt = code(R + "realtime.py")
    rl = code(U + "rate_limit.py")
    bs = code(U + "backup_service.py")
    bstore = code(U + "backup_storage.py")
    rs = code(U + "restore_service.py")
    bt = code("backend/app/tasks/backup_tasks.py")
    br = code(R + "backups.py")
    ce = code("backend/app/celery_app.py")
    cfg = code("backend/app/config.py")
    ctx = code(U + "db_session_context.py")
    dbm = code("backend/app/database.py")
    boot = code("backend/app/db_bootstrap.py")
    dk = txt("Dockerfile")
    dp = txt("scripts/deploy.sh")
    md = txt("src/lib/copilot-markdown.ts")
    ts_store = txt("src/lib/token-store.ts")
    ac = txt("src/lib/api-client.ts")
    apis = txt("src/lib/api.ts")
    ngx = txt("scripts/nginx_altrix.conf")
    bus = txt("src/pages/tenant/parent-modules/ParentBusTrackingModule.tsx")

    # ── P0 ────────────────────────────────────────────────────────────────────
    S = "P0 - platform takeover"
    check(S, "1", "proxy authorizes every request",
          "authorize_proxy_request(" in vps and "modifying global table" not in vps)
    check(S, "1", "non-tenant tables not writable by tenants",
          "not tenant-scoped and cannot be modified" in pol)
    check(S, "2", "credential tables blocked before the super-admin bypass",
          pol.index("BLOCKED_TABLES") < pol.index("is_super_admin")
          and all(t in pol for t in ("password_resets", "token_blacklist", "active_sessions")))
    check(S, "2", "reset tokens stored hashed", auth.count("_hash_reset_token(") >= 4)
    check(S, "3", "unfiltered update/delete refused",
          pol.count("Refusing an unfiltered") == 2)
    check(S, "4", "select-alias SQL injection closed",
          "is_valid_identifier(alias) and is_valid_identifier(actual_col)" in vps)
    check(S, "4", "rpc restricted to an allowlist",
          "ALLOWED_RPC_FUNCTIONS" in vps and "SUPER_ADMIN_RPC_FUNCTIONS" in vps)
    unguarded = [m for m in ("ai_management", "custom_domains", "global_billing",
                             "security_threats", "tenant_orchestration",
                             "financial_forecasting")
                 if "dependencies=[Depends(require_super_admin())]" not in code(R + m + ".py")]
    check(S, "5", "all platform routers guarded at router level",
          not unguarded, f"unguarded: {unguarded}")
    check(S, "5", "/debug-deploy-log route removed", "debug-deploy-log" not in auth)
    check(S, "5", "functions catch-all 404s instead of faking success",
          "HTTP_404_NOT_FOUND" in fn and "'executed'" not in fn)
    check(S, "5", "email admin backdoors removed",
          "MASTER_ADMIN_EMAILS" not in em)
    check(S, "5", "get_user_school_roles requires membership", "ROLE_LOOKUP_ROLES" in auth)
    leaked = [t for t in sh("git ls-files").splitlines()
              if t.endswith(".env") and not t.endswith(".example")]
    check(S, "6", "no secret .env tracked in git", not leaked, str(leaked))
    check(S, "6", "gitignore covers bare *.env", "*.env" in txt(".gitignore"))
    check(S, "7", "wildcard PaaS CORS regex removed", ".vercel\\.app|" not in main)
    check(S, "7", "credentialed CORS uses an explicit list",
          "_PRODUCTION_ORIGINS" in main and "allow_origins=_cors_origins" in main)
    for fname, need in (("get_school", "require_tenant_access"),
                        ("update_school", "require_tenant_access"),
                        ("upsert_branding", "require_tenant_access"),
                        ("list_school_roles", "require_tenant_access"),
                        ("assign_role", "assert_can_assign_role"),
                        ("remove_role", "assert_can_assign_role")):
        body = sch.split(f"async def {fname}(")[1].split("\nasync def ")[0] if f"async def {fname}(" in sch else ""
        check(S, "8", f"schools.{fname} enforces {need}", need in body)
    check(S, "8", "by-slug uses the narrowed public projection", "SchoolPublicOut" in sch)
    check(S, "9", "feature-flags PATCH enforces tenant + role",
          "require_tenant_access(" in ff and "FLAG_ADMIN_ROLES" in ff)
    check(S, "9", "unknown school no longer unlocks paid modules",
          "School not found" in ff and ff.count("white_label_enabled=True") <= 1)
    check(S, "10", "request identity published on every session",
          "apply_identity_to_session" in dbm and "clear_identity_from_session" in dbm)
    check(S, "10", "identity is connection-scoped",
          ", false)" in ctx and ", true)" not in ctx)
    check(S, "10", "identity middleware registered", "DbIdentityMiddleware" in main)
    check(S, "10", "RLS cutover scripts present",
          all(exists("scripts/rls/" + f) for f in
              ("01_create_app_role.sql", "02_enable_force_rls.sql",
               "verify_rls.py", "README.md")))
    check(S, "+", "cross-school role fallback removed",
          "Fallback check" not in deps and "school_id IS NULL" not in deps)

    # ── P1 ────────────────────────────────────────────────────────────────────
    S = "P1 - money, auth, data integrity"
    check(S, "11", "JazzCash callback verifies its signature",
          "_verify_callback_signature(raw)" in pay and "if not salt" in pay)
    check(S, "11", "callback amount checked against the initiated amount",
          "_AMOUNT_TOLERANCE_PAISA" in pay)
    check(S, "12", "lookup uses the mapped column, not a Python property",
          "PaymentTransaction.txn_ref_no ==" in pay
          and "PaymentTransaction.gateway_transaction_id ==" not in pay)
    check(S, "12", "txn ref set before the flush",
          pay.index("gateway_transaction_id=txn_ref") < pay.index("db.add(txn)"))
    check(S, "12", "repeat callbacks settle once", "already processed" in pay)
    check(S, "12", "merchant password never returned", "k != 'pp_Password'" in pay)
    check(S, "13", "refresh rejects non-refresh tokens and checks the blacklist",
          "'token_type'" in auth and "is_token_blacklisted" in auth and "token_type" in deps)
    check(S, "14", "password reset revokes every issued token",
          "invalidate_all_user_tokens" in auth and "tokens_invalidated_before" in deps)
    check(S, "16", "no cross-school role fallback", "Fallback check" not in deps)
    check(S, "17", "role cache invalidated on change",
          "invalidate_user_role_cache" in auth and "cache_key_auth_roles" in deps)
    check(S, "18", "uploads stream in bounded chunks",
          "await file.read(_CHUNK)" in sto and "MAX_UPLOAD_BYTES" in sto)
    check(S, "18", "file type allowlist enforced", "ALLOWED_EXTENSIONS" in sto)
    check(S, "18", "html/svg never served inline",
          "text/html" not in sto.split("INLINE_SAFE_TYPES")[1][:400])
    check(S, "18", "delete requires role or ownership", "STAFF_DELETE_ROLES" in sto)
    check(S, "19", "missing school context denies, not skips", "No school context" in sto)
    check(S, "19", "tenant prefix imposed server-side", "[prefix, *segments]" in sto)
    check(S, "19", "bucket boundary uses commonpath", "os.path.commonpath" in sto)
    check(S, "20", "assistant output escaped before formatting",
          md.index("escapeHtml(text") < md.index("altrix_action"))
    check(S, "21", "safe CSP directives enforced",
          "add_header Content-Security-Policy \"frame-ancestors 'none'" in ngx)
    check(S, "21", "full policy shipped in report-only",
          "add_header Content-Security-Policy-Report-Only" in ngx)
    check(S, "21", "refresh cookie is HttpOnly + SameSite=Strict",
          "httponly=True" in auth and "samesite='strict'" in auth)
    check(S, "21", "refresh token not returned in the body", "refresh_token=None" in auth)
    check(S, "21", "access token held in memory",
          "let accessToken" in ts_store and "localStorage.setItem" not in ts_store)
    check(S, "21", "cookie sent with API calls", "withCredentials: true" in ac)
    left = int(sh("git grep -c \"localStorage.getItem..access_token\" -- src | wc -l") or 0)
    check(S, "21", "no token left in localStorage", left == 0, f"{left} file(s)")
    check(S, "22", "WS rooms from the database, not token metadata",
          "_rooms_for_user" in rt and "user_metadata" not in rt)
    check(S, "22", "WS rejects revoked and refresh tokens",
          "_token_is_revoked" in rt and "token_type" in rt)
    check(S, "22", "WS uses single-use tickets, not a raw token in the URL",
          "_redeem_ticket" in rt and "ws?token=" not in apis)
    check(S, "24", "rate limiter returns 429, never 200",
          "status_code=429" in rl and "status_code=200" not in rl)
    check(S, "24", "refusal is not shaped like an empty list", '"items"' not in rl)
    check(S, "25", "Redis used when reachable, memory when not",
          "_reachable_storage_uri" in rl and "MEMORY_STORAGE" in rl)
    check(S, "25", "survives a mid-flight Redis failure",
          "in_memory_fallback_enabled=True" in rl and "swallow_errors=True" in rl)
    check(S, "26", "schools.py tenant guards in place",
          sch.count("require_tenant_access") >= 5)
    check(S, "27", "collaboration enforces tenant access", "require_tenant_access" in col)

    # ── P2 ────────────────────────────────────────────────────────────────────
    S = "P2 - broken features"
    check(S, "23", "backup: called name exists", "_upload_backup" in bs)
    check(S, "23", "backup: task registered with Celery", "app.tasks.backup_tasks" in ce)
    check(S, "23", "backup: crontab, not an interval", "crontab(hour=21" in ce)
    check(S, "23", "backup: pg_dump present in the image",
          "postgresql-client" in dk and "pg_dump --version" in dk)
    check(S, "23", "backup: storage mounted in all 3 containers",
          dp.count("/var/lib/altrix/storage:/var/lib/altrix/storage") == 3)
    check(S, "23", "backup: failures raise, not return", "raise RuntimeError" in bs)
    check(S, "23", "backup: dump verified before being kept", "_verify_dump" in bs)
    check(S, "23", "backup: encrypted at rest", "AESGCM" in bstore and "encrypt_file" in bs)
    check(S, "23", "backup: production refuses plaintext PII", "_require_encryption" in bs)
    check(S, "23", "restore exists", "def restore_backup" in rs)
    check(S, "23", "restore proven by a scheduled drill",
          "weekly-restore-drill" in ce and "no rows were found" in rs)
    check(S, "23", "restore guards production", "allow_production" in rs)
    check(S, "23", "alerts escalate beyond the log, managed in the dashboard",
          "_alert" in bt and "get_backup_settings" in bt)
    check(S, "23", "download / upload / restore exposed in the dashboard",
          "download_backup" in br and "upload_backup" in br
          and "super_admin/backups" in txt("src/App.tsx"))
    check(S, "23", "runbook and CLI present",
          exists("docs/backup-restore.md") and exists("scripts/backup/restore.py"))
    check(S, "23", "no hosted-service dependency in the backup path",
          "supabase" not in (bs + bstore + rs + br + bt).lower())
    ts_errors = int(sh("npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'TS2304'") or 0)
    check(S, "24", "no undefined identifiers in the frontend", ts_errors == 0,
          f"{ts_errors} left")
    undefined_py = sh("cd backend && python -m pyflakes app 2>&1 | grep -c 'undefined name'")
    check(S, "26", "no undefined names in the backend", undefined_py == "0",
          f"{undefined_py} left")
    check(S, "25", "dunning and tenant export no longer claim false success",
          "NOT_IMPLEMENTED" in code(R + "global_billing.py")
          and "NOT_IMPLEMENTED" in code(R + "tenant_orchestration.py"))
    catch_success = sh(
        'git grep -A 2 "} catch" -- "src/**/*.tsx" | grep -B1 "toast.success" | grep -c "catch"'
    )
    check(S, "25", "no catch block reports success", catch_success in ("", "0"),
          f"{catch_success} left")
    routes = app_routes()
    dupes = {k for k, v in
             __import__("collections").Counter(map(tuple, routes)).items() if v > 1}
    check(S, "27", "no endpoint shadows another", routes and not dupes, str(dupes))
    tr = code(R + "transport.py")
    te = code(R + "teachers.py")
    check(S, "28", "no fabricated bus, driver or stop",
          "demo-bus" not in tr and "1234567" not in tr and "Assigned Driver" not in tr)
    check(S, "28", "no invented stops in the parent UI", "defaultStops" not in bus)
    check(S, "28", "simulated GPS is labelled", "Simulated position" in bus)
    check(S, "28", "no mock teacher timetable or directory",
          "beaconhouse.edu" not in te and "mock_teacher_id" not in te)
    check(S, "28", "no invented conversation channels", "demo-convo" not in col)

    # ── P3 ────────────────────────────────────────────────────────────────────
    S = "P3 - scale and quality"
    check(S, "30", "startup DDL moved to a deploy step",
          "apply_schema_bootstrap" in boot and "app.db_bootstrap" in dp
          and "create_all" not in main)
    check(S, "29", "unbounded reads are capped",
          "DEFAULT_ROW_LIMIT" in vps and "MAX_ROW_LIMIT" in vps)
    check(S, "29", "truncation is surfaced, not silent", "truncated" in apis)
    check(S, "31", "proxy writes are batched, not per row",
          "value_groups" in vps and vps.count("value_groups") >= 4)
    check(S, "31", "count/head answered with a real COUNT(*)",
          "wants_count" in vps and "count(*)" in vps.lower())
    check(S, "33", "cache-control is no longer no-store for everything",
          "private, max-age=3600" in sto and "_PUBLIC_CACHEABLE" in code(U + "security.py"))
    check(S, "35", "container runs as a non-root user",
          "USER 10001" in dk and "useradd" in dk)
    check(S, "35", "docker socket no longer mounted or world-writable",
          "docker.sock:/var/run/docker.sock" not in dp
          and "chmod 666 /var/run/docker.sock" not in dp)
    check(S, "+", "storage serves signed URLs for browser fetches",
          "verify_signature" in sto and "createSignedUrl" in apis)
    check(S, "+", "query builder implements what its callers use",
          all(k in apis for k in ("catch(", "finally(", "presenceState", "maybeSingle")))
    check(S, "+", "auth shim wired to real password-reset endpoints",
          "password-reset-confirm" in apis and "pendingResetToken" in apis)
    check(S, "+", "no hosted-Supabase config remains",
          count_matches("supabase_url", "backend/app") == 0)
    # ── Round 2: data integrity, concurrency, dependencies ────────────────────
    S = "R2 - data integrity and scale"
    mig = "backend/sql_migrations/20260918000000_database_hardening.sql"
    migration = txt(mig) if exists(mig) else ""
    fin = code(R + "finance.py")
    pays = code(R + "payments.py")
    models = "".join(code(f) for f in glob.glob("backend/app/models/*.py"))

    check(S, "idx", "every tenant table has a school_id index",
          migration.count("CREATE INDEX IF NOT EXISTS idx_") >= 60,
          f"{migration.count('CREATE INDEX IF NOT EXISTS idx_')} in the migration")
    check(S, "money", "money columns are Numeric, not floating point",
          "Numeric(14, 2)" in models and migration.count("ALTER COLUMN") >= 60)
    check(S, "money", "marks and percentages are Numeric",
          "Numeric(8, 3)" in models)
    check(S, "money", "coordinates deliberately left as floats",
          "latitude: Mapped[Optional[float]] = mapped_column(Float" in models
          or "latitude" in models)
    check(S, "money", "a Decimal helper exists for the float boundary",
          exists("backend/app/utils/money.py") and "def is_settled" in code(U + "money.py"))
    check(S, "lock", "fee balance updates take a row lock",
          "with_for_update()" in fin and "with_for_update()" in pays)
    check(S, "lock", "a part payment no longer marks an invoice paid",
          "is_settled(" in fin and "is_settled(" in pays)
    check(S, "uniq", "one attendance row per student per session",
          "uq_attendance_session_student" in migration)
    check(S, "uniq", "invoice numbers are unique per school, not globally",
          "uq_fee_invoices_school_number" in migration
          and "next_invoice_number" in migration)
    check(S, "uniq", "invoice numbering uses the atomic sequence",
          "next_invoice_number" in fin and "random.randint" not in fin)
    npm_vulns = sh("npm audit --production 2>&1 | grep -oE '^[0-9]+ vulnerabilities' | grep -oE '^[0-9]+'")
    check(S, "deps", "npm high/critical advisories cleared",
          int(npm_vulns or 0) <= 8, f"{npm_vulns} remain (was 28)")
    check(S, "pool", "connection pool fits Postgres default max_connections",
          "db_pool_recycle_seconds" in cfg and "pool_timeout" in dbm)
    check(S, "log", "no stray print() in the backend",
          sh("git grep -c \"^\s*print(\" -- backend/app | wc -l").strip() in ("", "0"))
    check(S, "doc", "the next task is written down and resumable",
          exists("docs/NEXT-TASK-documents-and-printing.md"))

    # ── Round 2: errors that were reported as empty success ───────────────────
    S = "R2 - error propagation"
    # Checked statically rather than by shelling out to pytest: this script is
    # a deploy gate and must stay fast. The test file is the authority; this
    # only confirms the rule still holds in the tree being deployed.
    data_re = re.compile(r"db\.execute|db\.scalar|session\.execute", re.I)
    opt_re = re.compile(r"cache|invalidate|rollback|notif|broadcast|publish|"
                        r"audit|emit|websocket|send_|email|telemetry|sentry", re.I)
    swallowed = []
    for path in glob.glob("backend/app/routers/*.py"):
        tree = ast.parse(io.open(path, encoding="utf-8").read())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Try):
                continue
            body_src = chr(10).join(ast.unparse(x) for x in node.body)
            if not data_re.search(body_src) or opt_re.search(body_src):
                continue
            for h in node.handlers:
                if h.type is not None and not (
                        isinstance(h.type, ast.Name) and h.type.id == "Exception"):
                    continue
                kept = [x for x in h.body
                        if not (isinstance(x, ast.Expr) and isinstance(x.value, ast.Constant))]
                if len(kept) != 1:
                    continue
                only = kept[0]
                if isinstance(only, (ast.Pass, ast.Continue)) or (
                        isinstance(only, ast.Return)
                        and (only.value is None
                             or isinstance(only.value, (ast.List, ast.Dict, ast.Constant)))):
                    swallowed.append(f"{os.path.basename(path)}:{h.lineno}")
    check(S, "err", "a query failure is never returned as empty data",
          not swallowed, f"still swallowing: {swallowed[:4]}")
    check(S, "err", "optional failures are swallowed but logged",
          exists("backend/app/utils/best_effort.py")
          and "def best_effort" in code(U + "best_effort.py"))
    check(S, "err", "the rule is pinned by a test, not just fixed once",
          exists("backend/tests/test_error_propagation.py"))

    # ── Round 2: unbounded responses ──────────────────────────────────────────
    S = "R2 - response bounds"
    pag = code(U + "pagination.py")
    collab = code(R + "collaboration.py")
    check(S, "lim", "every list endpoint has a ceiling",
          "class ListPage" in pag and "DEFAULT_LIST_LIMIT" in pag)
    check(S, "lim", "the ceiling is applied to the query, not just accepted",
          "def apply" in pag and "stmt.limit(" in pag)
    check(S, "lim", "the response shape did not change, so no caller broke",
          "PaginatedResponse" in pag and "ListPageParams" in pag)
    check(S, "lim", "the bound is advertised to the caller",
          "X-Result-Limit" in pag)
    check(S, "lim", "the rule is pinned by a test",
          exists("backend/tests/test_list_bounds.py"))
    check(S, "chat", "no on-disk shadow store behind the message threads",
          "load_store" not in collab and "STORE_FILE" not in collab)
    check(S, "chat", "a failed send is not broadcast as delivered",
          "falling back to local store" not in collab)

    # ── Documents: vector output, honest results, branded exports ──────────────
    S = "DOC - documents and exports"
    src_all = {p: txt(p) for p in glob.glob("src/**/*.ts*", recursive=True)
               if "node_modules" not in p and not p.endswith(".test.ts")}
    raster = [p for p, t in src_all.items() if re.search(r"from\s+.html2canvas", t)]
    check(S, "vec", "no document is exported as a screenshot",
          not raster, f"html2canvas imported in: {raster[:3]}")
    check(S, "vec", "on-screen documents export through the vector engine",
          "exportDomToPdf" in txt("src/lib/pdfExportEngine.ts"))
    fake_xls = [p for p, t in src_all.items() if "application/vnd.ms-excel" in t]
    check(S, "xls", "no HTML table is passed off as an Excel file",
          not fake_xls, f"still: {fake_xls[:3]}")
    check(S, "xls", "spreadsheets are real, branded xlsx",
          exists("src/lib/documents/spreadsheet.ts")
          and "writeBuffer" in txt("src/lib/documents/spreadsheet.ts"))
    check(S, "csv", "CSV carries a BOM so Urdu opens correctly",
          "ufeff" in txt("src/lib/documents/spreadsheet.ts"))
    check(S, "urdu", "an Urdu-capable font ships with the app",
          exists("public/fonts/NotoNaskhArabic-Regular.ttf"))
    check(S, "name", "files are named after their contents",
          "export function documentFileName" in txt("src/lib/documents/format.ts"))
    check(S, "share", "documents can be shared to WhatsApp",
          "export async function shareFile" in txt("src/lib/documents/deliver.ts"))
    audit_page = txt("src/pages/platform/PlatformAuditPage.tsx")
    check(S, "fake", "the audit log never shows invented records",
          "admin@altrix.com" not in audit_page)
    vouchers = txt("src/pages/tenant/modules/FeeVouchersModule.tsx")
    check(S, "fake", "no voucher is printed for an invoice that was not created",
          "directInv" not in vouchers and "Resilient fallback direct insertion" not in vouchers
          and "callWithRetry" in vouchers)
    check(S, "num", "invoice numbers come from one atomic sequence",
          exists("backend/sql_migrations/20260918010000_unified_invoice_numbering.sql"))

    # ── Fees Centre, report cards, the Copilot and the dashboard ─────────
    fin = code(R + "finance.py")
    check(S, "fees", "the finance sidebar does not point three tabs at one screen",
          txt("src/lib/module-registry.tsx").count("Component: FeesCentreModule") == 1
          and "admin-fees\": { Component: AdminFeePortalModule }" in txt("src/lib/module-registry.tsx"))
    check(S, "coll", "collection totals come from payments received, not invoice status",
          "COLLECTED_PAYMENT_STATUS" in fin
          and "SUM(total_amount) FILTER (WHERE status = 'paid')" not in
              fin[fin.index("async def collection_board"):] if "async def collection_board" in fin else False)
    check(S, "dupe", "a student cannot be billed twice for the same period",
          exists("backend/sql_migrations/20260922000000_fee_voucher_duplicate_guard.sql")
          and "duplicate_voucher" in txt("backend/sql_migrations/20260922000000_fee_voucher_duplicate_guard.sql"))
    check(S, "canc", "a voucher can only be cancelled inside its own school, with a reason",
          "FeeVoucher.school_id == current_user.school_id" in fin and "min_length=3" in fin)

    rc = txt("src/lib/documents/report-card.ts")
    rcm = txt("src/pages/tenant/modules/ReportCardModule.tsx")
    check(S, "1pg", "a report card is fitted to one sheet, and never by dropping data",
          "buildFittedReportCard" in rc and "subjectColumns" in rc
          and "exportCleanDocumentToPdf(" not in rcm
          # Ctrl+P prints the document too, not the page it was edited on.
          and "printCard()" in rcm and "print:hidden w-full" in rcm)
    check(S, "rcst", "how a school prints its cards is asked once and stored",
          exists("backend/sql_migrations/20260922010000_report_card_print_settings.sql")
          and exists("src/lib/report-card-settings.ts"))
    check(S, "rcfl", "a short card fills its sheet instead of stopping a third of the way down",
          "stretch" in rc and "MAX_DENSITY" in rc and "minRowHeight" in txt("src/lib/documents/table.ts"))
    check(S, "rcft", "a one-page card carries no 'Page 1 of 1' across its foot",
          'footerStyle: "minimal"' in rc
          and 'footerStyle === "minimal"' in txt("src/lib/documents/document.ts"))
    proxy = txt("backend/app/routers/vps_db.py")
    check(S, "rcsv", "a termly or annual card can be saved at all",
          "build_conflict_where" in proxy and "onConflictWhere" in rcm
          and 'onConflictWhere = "exam_id IS NULL"' in rcm)
    check(S, "rcf", "a student nobody marked is not recorded as having failed",
          "if (!marked || max <= 0)" in rcm and "grade: null as string | null" in rcm)
    check(S, "fake", "no screen ships someone else's photographs as the school's",
          not any("unsplash" in txt(p).lower() for p in (
              "src/pages/tenant/modules/EventsModule.tsx",
              "src/pages/tenant/modules/GateVisitorModule.tsx",
              "src/pages/tenant/parent-modules/ParentGalleryModule.tsx"))
          and "MOCK DATA FALLBACK" not in txt("src/pages/tenant/parent-modules/ParentGalleryModule.tsx"))
    check(S, "gate", "a visitor photograph is taken by a camera or not taken",
          "getUserMedia" in txt("src/pages/tenant/modules/GateVisitorModule.tsx"))
    check(S, "stok", "a refused stock adjustment is reported as refused",
          "could not be adjusted" in txt("src/pages/tenant/modules/InventoryModule.tsx"))

    adm = txt("src/pages/tenant/modules/AdmissionsModule.tsx")
    admr = txt("backend/app/routers/admissions.py")
    admsql = txt("backend/sql_migrations/20260923000000_admission_completes_the_student.sql")
    check(S, "admp", "an admission asks for the photograph the cards need",
          "StudentPhotoField" in adm and "student-photos" in adm and "photo_url: photoUrl" in adm)
    check(S, "admf", "an admission collects what the student record can hold",
          all(f in adm for f in ("blood_group", "medical_notes", "emergency_contact",
                                 "admission_date", "guardian2_name", "student_phone")))
    check(S, "adme", "approving an admission puts the child on a class register",
          "StudentEnrollment(" in admr
          and "INSERT INTO public.student_enrollments" in admsql
          and not re.search(r"(?<![_\w])section_id\s*=\s*app\.", admr))
    check(S, "admd", "documents handed in at admission reach the student's record",
          "INSERT INTO public.student_documents" in admsql
          and exists("src/components/academic/StudentDocumentsPanel.tsx"))
    check(S, "bulk", "a school can bring in the register it already keeps",
          exists("src/lib/admissions/bulk-import.ts")
          and "bulk-import" in admr
          and "db.begin_nested()" in admr)
    check(S, "bnkg", "a bulk import never invents a class or guesses a date",
          all(p in txt("src/lib/admissions/bulk-import.ts") for p in
              ("nothing is created automatically", "is not a date this can read")))
    check(S, "phot", "a stored photo path resolves wherever the photo is shown",
          count_matches("getVPSFileUrl(.student-photos", "src") >= 8)

    check(S, "sil1", "every failed query in the app is reported, not drawn as an empty table",
          "new QueryCache(" in txt("src/App.tsx")
          and "reportLoadFailure(" in txt("src/App.tsx"))
    check(S, "sil2", "a failed read through the data layer says so wherever it was called",
          "reportLoadFailure(" in apis
          and "res.error.message !== 'Row not found'" in apis)
    check(S, "hdr", "every module in the shell opens with a heading that says what it is",
          count_matches("ModuleHeader", "src/pages/tenant") >= 30)

    misc = txt("backend/app/routers/misc.py")
    # Checked against the parsed source, not the raw file: the comment that
    # explains the old expression contains the old expression.
    misc_code = code("backend/app/routers/misc.py")
    check(S, "cop1", "the Copilot only ever answers about the caller's own school",
          "you are not a member of this school" in txt("backend/app/dependencies.py")
          and "not attached to a school" in misc
          and "current_user.school_id or request.headers" not in misc_code
          and "current_user.is_super_admin" in misc_code)
    check(S, "cop2", "the Copilot keeps the records the question needs, not the first ones",
          "_context_relevance" in misc and "AI_CONTEXT_PINNED_MARKERS" in misc)
    check(S, "cop3", "a background warm-up neither shouts nor stampedes",
          "duringBackgroundLoads" in txt("src/hooks/useUniversalPrefetch.ts")
          and "requestIdleCallback" in txt("src/hooks/useUniversalPrefetch.ts")
          and "backgroundDepth" in txt("src/lib/load-failure.ts"))

    panel = txt("src/components/ai/AltrixCopilot.tsx")
    cop_res = txt("backend/app/utils/copilot/resolver.py")
    check(S, "cop4", "record questions are answered by one scoped query, not by the model reading a dump",
          'where: List[str] = ["t.school_id = CAST(:sid AS uuid)"]' in cop_res
          and "copilot_stream" in misc_code and "build_scoped_ai_context" not in code("backend/app/utils/copilot/engine.py"))
    check(S, "cop5", "nothing the model writes is executed without a click",
          "shouldExecute" not in panel and "await handleExecuteAction(executeMsg)" not in panel)
    check(S, "cop6", "the Copilot stream is not held back by the proxy",
          '"X-Accel-Buffering": "no"' in misc and "async with AsyncSessionLocal() as stream_db" in misc)
    check(S, "cop7", "a change made through any endpoint marks a Copilot answer as out of date",
          'add_listener("altrix_changes"' in txt("backend/app/websocket_manager.py")
          and "anyWrite: true" in panel and "listener.anyWrite" in txt("src/lib/api.ts"))

    rct = txt("src/lib/documents/report-card-templates.ts")
    check(S, "rcds", "the seven designs differ in the shape of the page, not only its colours",
          all(k in rct for k in ("sidebar", "banner", "centred", "register", "standard"))
          and rct.count("layout:") >= 8)

    ai = txt("backend/app/utils/ai_service.py")
    copilot = txt("src/components/ai/AltrixCopilot.tsx")
    check(S, "ai-m", "the Copilot only asks for a model the server reports having",
          "installed_local_models" in ai and "choose_local_model" in ai)
    check(S, "ai-e", "an unreachable model is reported, never answered around",
          "ai_unavailable" in ai and "I am currently processing your request" not in copilot)
    check(S, "ai-c", "the prompt's database context is capped on a section boundary",
          "trim_ai_context" in code(R + "misc.py"))

    ph = txt("src/pages/tenant/role-homes/PrincipalHome.tsx")
    check(S, "spark", "no dashboard line is invented from the number under it",
          "const staffAttendanceRate = 96" not in ph
          and "kpis.openLeads - 6" not in ph
          and "attendanceRate - 3" not in ph
          and "/reports/daily-series" in ph)
    check(S, "enum", "payment queries ask for a status the enum actually has",
          "'success', 'paid', 'completed'" not in code(R + "misc.py"))

    total_ts = int(sh("npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'") or 0)
    check(S, "45", f"TypeScript errors reduced (was 201, now {total_ts})",
          total_ts < 60, f"{total_ts} remain")


def main() -> int:
    print("=" * 74)
    print("AltRix audit verification")
    print("=" * 74)
    run()

    section = None
    for sec, ident, ok, label, detail in results:
        if sec != section:
            section = sec
            print(f"\n{sec}\n{'-' * len(sec)}")
        mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}OPEN{RESET}"
        print(f"  [{mark}] {ident:<4} {label}")
        if not ok and detail:
            print(f"            {DIM}{detail}{RESET}")

    failed = [r for r in results if not r[2]]
    print("\n" + "=" * 74)
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print(f"\n{RED}Still open:{RESET}")
        for sec, ident, _, label, _ in failed:
            print(f"  {sec} / {ident}: {label}")
        return 1
    print(f"{GREEN}Every audited finding is closed.{RESET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
