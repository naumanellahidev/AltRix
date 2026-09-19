# Making row-level security actually work

## The problem

`supabase/migrations` defines ~604 RLS policies. None of them protect the API,
for two independent reasons:

1. **Nothing told Postgres who was asking.** 394 of those policies call
   `auth.uid()`, which reads the `request.jwt.claim.sub` connection setting.
   Only `routers/vps_db.py` ever set it — and it set it transaction-locally,
   which any `COMMIT` discards (the routers commit mid-request in 131 places).
   For every other endpoint `auth.uid()` was `NULL`, so no policy could match.

2. **The API connects as `postgres`.** Postgres skips RLS entirely for
   superusers, and for a table's owner unless the table is marked `FORCE`.

Either one alone makes the policies inert. Both were true.

## What is already fixed in the application

Committed, and safe to deploy on its own — it changes no behaviour while the
API still connects as `postgres`:

| Change | File |
|---|---|
| Publishes the caller's id on every request's connection | [`app/utils/db_session_context.py`](../../backend/app/utils/db_session_context.py) |
| Extracts it from the JWT before dependencies resolve | `DbIdentityMiddleware` in [`app/middleware.py`](../../backend/app/middleware.py) |
| Applies and clears it around every session | `get_db` / `get_db_context` in [`app/database.py`](../../backend/app/database.py) |

It is applied **connection-scoped** rather than transaction-scoped so a
mid-request `COMMIT` cannot wipe it, and it is written on *every* session —
anonymous ones included — so a pooled connection can never inherit the previous
caller's identity.

Both `request.jwt.claim.sub` and `request.jwt.claims` are set, because
different Supabase builds define `auth.uid()` against one or the other.

## The remaining work: the cutover

This part needs your database, so it cannot be done from the repo alone.

### Prerequisite — remove the startup DDL (done)

This is no longer in the way. The schema bootstrap has moved out of the FastAPI
lifespan into [`app/db_bootstrap.py`](../../backend/app/db_bootstrap.py) and runs
as an explicit deploy step:

```bash
python -m app.db_bootstrap
```

`scripts/deploy.sh` runs it once, before any container starts serving. The app
no longer needs DDL rights on its connection, which is what made the
least-privilege role possible.

In development it still applies on boot (single process, no deploy pipeline);
`RUN_STARTUP_DDL` overrides either way.

### Step 0 — measure the damage first

Run against your **current** connection. It should fail, and the output tells
you exactly what is unprotected today:

```bash
python scripts/rls/verify_rls.py --url "$DATABASE_URL"
```

### Step 1 — create the role

```bash
psql "$ADMIN_DATABASE_URL" -f scripts/rls/01_create_app_role.sql
psql "$ADMIN_DATABASE_URL" -c "ALTER ROLE altrix_app WITH PASSWORD '<strong-password>';"
```

Confirm the final `SELECT` shows `is_superuser = f` and `bypasses_rls = f`.

### Step 2 — enforce, on a staging copy first

```bash
psql "$STAGING_URL" -f scripts/rls/02_enable_force_rls.sql
```

It only touches tables that already have at least one policy. A table with RLS
enabled and **no** policies denies every row, which surfaces as blank screens
rather than errors — the worst possible failure mode. The script prints the
tables it skipped; each one needs a decision:

- holds per-school data → write a policy, re-run
- reference data → add a permissive read-only policy
- internal/ops only → leave RLS off; it is reached through routers that do
  their own checks

### Step 3 — prove isolation before pointing traffic at it

```bash
python scripts/rls/verify_rls.py --url "postgresql://altrix_app:<pw>@<host>/<db>"
```

Check 4 is the one that matters: it takes a real non-admin user from one
school and tries to read another school's rows on that connection. Everything
else can look green while isolation is still broken.

### Step 4 — cut over

Point `DATABASE_URL` at `altrix_app` in staging, exercise every role
(owner, principal, teacher, accountant, parent, student), and watch for
**empty lists rather than errors** — that is what a too-strict policy looks
like. Then do production, keeping the old value to hand for rollback.

## What this does and does not buy you

RLS here is defence in depth, not the primary control. The application-level
authorization added alongside it — [`db_proxy_policy.py`](../../backend/app/utils/db_proxy_policy.py),
the tenant guards in the routers, the role hierarchy in `permissions.py` — is
what actually stops cross-tenant access today, and it works regardless of which
database role you connect as.

RLS is the second lock: it means a future missing tenant filter in one query
leaks nothing.
