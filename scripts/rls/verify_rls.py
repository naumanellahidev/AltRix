#!/usr/bin/env python3
"""
AltRix — Step 3 of 3: prove row-level security actually works before cutover.

Read-only. It writes nothing and changes nothing.

Run it twice:

    # against the current superuser connection, to see the problem
    python scripts/rls/verify_rls.py --url "$DATABASE_URL"

    # against the new least-privilege role, to confirm the fix
    python scripts/rls/verify_rls.py --url "postgresql://altrix_app:...@host/db"

What it checks
--------------
1. Role attributes            - superuser/BYPASSRLS silently disable RLS
2. auth.uid() plumbing        - the policies all funnel through this function;
                                if it cannot read our session setting, every
                                policy evaluates against NULL and matches nothing
3. Per-table enforcement      - RLS enabled? FORCE set? any policies?
4. Live tenant isolation      - with the identity of a real user from school A,
                                can the connection still see school B's rows?

Check 4 is the one that matters. Everything else can look correct while
isolation is still broken.

Exit code is non-zero if any check fails, so it can gate a deploy.
"""
import argparse
import asyncio
import os
import sys

try:
    import asyncpg
except ImportError:
    sys.exit("asyncpg is required:  pip install asyncpg")


GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
if os.name == "nt" and not os.environ.get("WT_SESSION"):
    GREEN = RED = YELLOW = DIM = RESET = ""

PASS, FAIL, WARN = f"{GREEN}PASS{RESET}", f"{RED}FAIL{RESET}", f"{YELLOW}WARN{RESET}"

#: Tables whose isolation failing would be most damaging.
SPOT_CHECK_TABLES = [
    "students", "fee_payments", "fee_invoices", "exam_results",
    "student_marks", "attendance_entries", "user_roles", "hr_staff_directory",
    "report_cards", "admin_messages",
]


def _normalize(url: str) -> str:
    """Accept the SQLAlchemy-style URL the app uses."""
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


class Report:
    def __init__(self):
        self.failures = 0
        self.warnings = 0

    def line(self, status: str, label: str, detail: str = ""):
        if status == FAIL:
            self.failures += 1
        elif status == WARN:
            self.warnings += 1
        print(f"  [{status}] {label}" + (f"  {DIM}{detail}{RESET}" if detail else ""))

    def section(self, title: str):
        print(f"\n{title}\n" + "-" * len(title))


async def check_role(conn, rep: Report):
    rep.section("1. Connection role")
    row = await conn.fetchrow("""
        SELECT current_user AS name, rolsuper, rolbypassrls
        FROM pg_roles WHERE rolname = current_user
    """)
    print(f"  connected as: {row['name']}")

    if row["rolsuper"]:
        rep.line(FAIL, "role is SUPERUSER",
                 "Postgres skips RLS entirely for superusers. "
                 "Connect the API as a non-superuser role.")
    else:
        rep.line(PASS, "role is not a superuser")

    if row["rolbypassrls"]:
        rep.line(FAIL, "role has BYPASSRLS", "RLS will never be evaluated.")
    else:
        rep.line(PASS, "role does not have BYPASSRLS")

    owned = await conn.fetchval("""
        SELECT count(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND pg_get_userbyid(c.relowner) = current_user
    """)
    if owned:
        rep.line(WARN, f"role owns {owned} table(s) in public",
                 "Owners bypass RLS unless the table is FORCE'd (step 2).")
    else:
        rep.line(PASS, "role owns no tables in public")


async def check_auth_uid(conn, rep: Report):
    rep.section("2. auth.uid() plumbing")
    exists = await conn.fetchval(
        "SELECT to_regprocedure('auth.uid()') IS NOT NULL"
    )
    if not exists:
        rep.line(FAIL, "auth.uid() does not exist",
                 "394 policies call it; without it none of them can match.")
        return

    probe = "11111111-1111-1111-1111-111111111111"
    await conn.execute(
        "SELECT set_config('request.jwt.claim.sub', $1, false)", probe
    )
    try:
        seen = await conn.fetchval("SELECT auth.uid()::text")
    except Exception as e:
        rep.line(FAIL, "auth.uid() raised", str(e))
        return
    finally:
        await conn.execute("SELECT set_config('request.jwt.claim.sub', '', false)")

    if seen == probe:
        rep.line(PASS, "auth.uid() reads request.jwt.claim.sub",
                 "matches what the API now publishes per request")
    else:
        rep.line(FAIL, "auth.uid() did not return the value we set",
                 f"expected {probe}, got {seen!r}. This Supabase build probably "
                 "reads request.jwt.claims (JSON) instead; the API sets both, "
                 "so re-check with the API's own session.")


async def check_tables(conn, rep: Report):
    rep.section("3. Per-table enforcement")
    rows = await conn.fetch("""
        SELECT c.relname                       AS name,
               c.relrowsecurity                AS rls,
               c.relforcerowsecurity           AS forced,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
               EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'school_id'
                         AND NOT a.attisdropped) AS tenant
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
    """)

    total = len(rows)
    tenant_rows = [r for r in rows if r["tenant"]]
    unprotected = [r for r in tenant_rows if r["policies"] == 0]
    not_forced = [r for r in tenant_rows if r["policies"] > 0 and not r["forced"]]
    deny_all = [r for r in rows if r["rls"] and r["policies"] == 0]

    print(f"  {total} tables in public, {len(tenant_rows)} carry a school_id")

    if unprotected:
        rep.line(FAIL, f"{len(unprotected)} tenant table(s) have no policy",
                 ", ".join(r["name"] for r in unprotected[:8])
                 + (" ..." if len(unprotected) > 8 else ""))
    else:
        rep.line(PASS, "every tenant table has at least one policy")

    if not_forced:
        rep.line(FAIL, f"{len(not_forced)} tenant table(s) not FORCE'd",
                 "run 02_enable_force_rls.sql")
    else:
        rep.line(PASS, "all policied tenant tables are FORCE'd")

    if deny_all:
        rep.line(FAIL, f"{len(deny_all)} table(s) have RLS on but no policies",
                 "these deny everything silently: "
                 + ", ".join(r["name"] for r in deny_all[:8]))
    else:
        rep.line(PASS, "no deny-all tables")


async def check_isolation(conn, rep: Report):
    rep.section("4. Live tenant isolation (the one that counts)")

    pair = await conn.fetchrow("""
        SELECT ur.user_id, ur.school_id AS own_school,
               (SELECT s.id FROM public.schools s
                WHERE s.id <> ur.school_id LIMIT 1) AS other_school
        FROM public.user_roles ur
        WHERE ur.role NOT IN ('super_admin')
        LIMIT 1
    """)
    if not pair or not pair["other_school"]:
        rep.line(WARN, "skipped",
                 "need at least two schools and one non-super-admin user")
        return

    is_super = await conn.fetchval("""
        SELECT EXISTS (SELECT 1 FROM public.platform_super_admins
                       WHERE user_id = $1)
    """, pair["user_id"])
    if is_super:
        rep.line(WARN, "skipped", "sample user is a platform super admin")
        return

    print(f"  acting as user {str(pair['user_id'])[:8]}… of school "
          f"{str(pair['own_school'])[:8]}…")
    print(f"  probing for rows from school {str(pair['other_school'])[:8]}…")

    await conn.execute(
        "SELECT set_config('request.jwt.claim.sub', $1, false)",
        str(pair["user_id"]),
    )
    await conn.execute(
        "SELECT set_config('request.jwt.claim.role', 'authenticated', false)"
    )
    try:
        for table in SPOT_CHECK_TABLES:
            present = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL",
                                          f"public.{table}")
            if not present:
                continue
            try:
                leaked = await conn.fetchval(
                    f'SELECT count(*) FROM public."{table}" WHERE school_id = $1',
                    pair["other_school"],
                )
            except asyncpg.UndefinedColumnError:
                continue
            except Exception as e:
                rep.line(WARN, f"{table}: could not probe", str(e)[:70])
                continue

            if leaked:
                rep.line(FAIL, f"{table}: {leaked} row(s) from another school visible",
                         "cross-tenant read is possible on this connection")
            else:
                rep.line(PASS, f"{table}: no cross-tenant rows visible")
    finally:
        await conn.execute("SELECT set_config('request.jwt.claim.sub', '', false)")
        await conn.execute("SELECT set_config('request.jwt.claim.role', '', false)")


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("DATABASE_URL"),
                    help="connection string (defaults to $DATABASE_URL)")
    args = ap.parse_args()

    if not args.url:
        return int(bool(sys.stderr.write(
            "No connection string. Pass --url or set DATABASE_URL.\n")))

    rep = Report()
    print("=" * 68)
    print("AltRix row-level security verification")
    print("=" * 68)

    conn = await asyncpg.connect(_normalize(args.url))
    try:
        await check_role(conn, rep)
        await check_auth_uid(conn, rep)
        await check_tables(conn, rep)
        await check_isolation(conn, rep)
    finally:
        await conn.close()

    print("\n" + "=" * 68)
    if rep.failures:
        print(f"{RED}{rep.failures} check(s) FAILED{RESET}"
              + (f", {rep.warnings} warning(s)" if rep.warnings else ""))
        print("Row-level security is NOT protecting this connection.")
        return 1
    print(f"{GREEN}All checks passed{RESET}"
          + (f", {rep.warnings} warning(s)" if rep.warnings else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
