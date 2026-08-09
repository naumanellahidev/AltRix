# Project Rules

- Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).

---

# RULE SCOPE OPTIMIZATION & VERIFICATION POLICY

To maintain high engineering velocity while preserving strict security standards, rules and verification procedures are strictly classified into scopes. Verification must always be proportional: **"VERIFY WHAT YOU CHANGED, NOT EVERYTHING THAT EXISTS."**

---

## 1. SCOPE A — ALWAYS APPLY (All Tasks)

These lightweight rules apply universally to every task:

1. **Never fabricate results**: Every stated result must come from actual execution and observed evidence.
2. **Never claim something was tested when it was not**: If a check could not be run, state it truthfully or mark it `UNVERIFIED`.
3. **No hardcoded verification outcomes**: Never write fake passing statements (`status = "PASS"`, `expected = observed`). Outcomes must be computed from live evidence.
4. **Never silently ignore errors**: Do not swallow exceptions or convert non-zero command exits into fake success.
5. **Never expose secrets**: Do not log or commit private keys, passwords, API tokens, or credentials.
6. **No unnecessary infrastructure modifications**: Never touch production infrastructure unless the task explicitly requires it.
7. **No destructive changes without explicit authorization**: Preserve existing data, schema, and operational state.
8. **Preserve working functionality**: Keep changes strictly focused on the requested task without breaking existing features.
9. **No unrelated audits or refactoring**: Do not perform 20–30 minute unrequested audits on unrelated historical phases.
10. **Firewall strictly protected**: Do NOT modify UFW, iptables, or nftables unless the user explicitly requests firewall work.
11. **SSH strictly protected**: Preserve the hardened SSH baseline (`PermitRootLogin no`, `PasswordAuthentication no`, `altrixadmin` Ed25519 public-key auth, `MaxStartups 10:30:60`, `MaxSessions 10`). Do not alter SSH during unrelated tasks.

---

## 2. SCOPE B — SECURITY / VPS / INFRASTRUCTURE TASKS ONLY

The heavy forensic verification engine applies **ONLY** when a task specifically involves security or infrastructure modifications:
- SSH hardening / authentication changes / user management
- VPS OS hardening / PAM / sudo configuration
- Nginx security configuration / TLS / SSL certificates / reverse proxy architecture
- Firewall configuration (UFW, iptables, nftables) when explicitly requested
- Fail2Ban / systemd service security / daemon hardening
- Network attack surface reduction / exposed port management
- Domain binding at the VPS / Nginx layer
- Security-critical production deployment / infrastructure rollouts

### Mandatory Verification Engine Policy (Rules 1–20 for Scope B)

#### Rule 1 — No Hardcoded Verification Outcomes
Never assign a verification result directly: `status = "PASS"`, `status = "FAIL"`, `status = "GO"`. Expected values may be hardcoded; verification outcomes must NOT be hardcoded.

#### Rule 2 — PASS Must Be Computed
Every PASS must originate from a boolean condition derived from actual live evidence:
```python
status = "PASS" if (result.returncode == 0 and "active" in result.stdout) else "FAIL"
```

#### Rule 3 — Required Verification Pipeline
```
LIVE COMMAND → RAW OUTPUT → EXIT CODE / RESPONSE → ASSERTION FUNCTION → CALCULATED STATUS → EVIDENCE RECORD → FINAL REPORT
```

#### Rule 4 — Separate Execution From Evaluation
Keep execution (`run_cmd()`), evaluation (`evaluate_test()`), and reporting distinct.

#### Rule 5 — Raw Evidence Is Authoritative
Each test must retain exact command, timestamp, exit code, stdout, stderr, HTTP status, and calculated status. If missing: `UNVERIFIED`.

#### Rule 6 — Failed Command = FAIL
Non-zero exit codes evaluate to `FAIL` unless explicitly defined as the expected condition.

#### Rule 7 — UNVERIFIED Is a Valid Result
If a test cannot be executed (e.g. missing external dependency or sensor): `UNVERIFIED`. Never convert to PASS.

#### Rule 8 — Expected State Is Not Observed State
Inspect the live system dynamically; never assume configured state is running state.

#### Rule 9 — Previous Phase Results Are Never Trusted
Every security phase independently evaluates its controls with live commands.

#### Rule 10 — Regression Tests Must Be Live
Execute live regression checks dynamically rather than referencing historical reports.

#### Rule 11 — Final GO/NO-GO Must Be Computed
```python
if fail_count > 0:
    decision = "NO-GO"
elif unverified_count > 0:
    decision = "GO WITH UNVERIFIED ITEMS"
else:
    decision = "GO"
```

#### Rule 12 — Static Self-Audit Is Mandatory
Before executing any security script, inspect the script source via AST/regex to verify:
- 0 hardcoded PASS/FAIL/GO assignments
- 0 unauthorized firewall modification commands
- 0 unauthorized SSH modification commands

#### Rule 13 — Behavioral Evaluator Self-Tests
Verify evaluator logic locally before production execution (success → PASS, failure → FAIL, missing → UNVERIFIED).

#### Rule 14 — No Exception-to-PASS Fallback
Exceptions in test execution must produce `FAIL` or `UNVERIFIED`.

#### Rule 15 — No Silent Command Fallbacks
Do not use constructs like `cmd || true` to mask failures during security verification.

#### Rule 16 — Dumb Report Generation
The report generator only renders already-calculated `EvidenceRecord[]`.

#### Rule 17 — Evidence Hashing
Save raw test outputs to `/var/log/altrix/phaseXX-evidence/<timestamp>/` and compute `checksums.sha256`.

#### Rule 18 — Production Lockout Protection
Before modifying SSH or Nginx:
1. Establish and verify primary admin session.
2. Establish and verify independent secondary admin session.
3. Create recovery checkpoint at `/root/altrix-phaseXX-backup/<timestamp>/`.
4. Only then apply changes. Verify post-change lockout gate before exiting.

#### Rule 19 — Never Optimize for a PASS Result
A truthful FAIL or UNVERIFIED is better than a fabricated PASS.

#### Rule 20 — Agent Narrative Is Not Evidence
Claims in chat are not evidence; raw output and computed exit codes are evidence.

---

## 3. SCOPE C — NORMAL APPLICATION DEVELOPMENT

For normal development tasks:
- **Frontend**: React components, TypeScript, JSX, Tailwind styling, CSS, pages, routing, navigation, modals, forms, tables, hooks, state management, UI accessibility.
- **Backend**: FastAPI endpoints, Pydantic schemas, routers, middleware, business logic, CRUD operations, database queries.
- **Features**: Attendance tracking, fee management, student/teacher modules, reports, notifications UI, PDF generation, bug fixes, refactoring.

### Proportional Lightweight Verification Workflow
**DO NOT run the heavy 20–30 minute forensic security workflow for Scope C tasks.**
- **No** VPS security audits (SSH, UFW, Fail2Ban, TLS).
- **No** SHA-256 evidence directory creation or recovery checkpoints (unless production rollback protection is explicitly needed).
- **No** behavioral security evaluator unit tests.
- **No** formal `phaseXX_security_hardening.md` forensic report.

### Required Verification for Scope C:
1. **Frontend Changes**: Run TypeScript compilation / Vite build (`npm run build` or `npx tsc --noEmit`), targeted linting, and targeted page/browser check if applicable.
2. **Backend Changes**: Run syntax check, targeted endpoint unit test, or API response verification.
3. **Database Changes**: Verify migration syntax and query execution against Supabase.
4. **Summary Format**: Return a concise, high-signal response:
   - What changed
   - Files modified
   - Tests/validations performed
   - Result / current status
   - Any remaining items or follow-ups

---

## 4. TASK CLASSIFICATION MATRIX

Before starting any task, classify it:

| Task Classification | Scope | Verification Level | Checkpoint / Evidence Required? |
| :--- | :---: | :--- | :---: |
| **`NORMAL_DEVELOPMENT`** | Scope A + C | Lightweight targeted verification (build, unit tests, affected routes) | **NO** |
| **`SECURITY_INFRASTRUCTURE`** | Scope A + B | Full forensic verification (lockout gates, checkpoints, SHA-256 evidence, report) | **YES** |
| **`DEPLOYMENT_INFRASTRUCTURE`** | Scope A + B/C | Proportional deployment verification (container health, endpoint health) | Only if infra config changes |

---

## 5. REALTIME GIT SYNC RULE
- Automatically commit and push all code changes to GitHub for realtime sync upon completing each task.
