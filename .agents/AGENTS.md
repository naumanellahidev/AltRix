# Project Rules

- **FastAPI Backend Rule**: Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).
- **Realtime Git Sync Rule**: Automatically commit and push all code and configuration changes to GitHub for realtime sync upon completing each task.

---

# RULE SCOPE OPTIMIZATION & FAST EXECUTION POLICY

To maintain maximum engineering velocity while preserving rock-solid safety and operational integrity, the project follows a two-tier workflow:

> **IMPLEMENT FIRST → LIGHTWEIGHT TARGETED VERIFICATION → MOVE TO NEXT PHASE → FINAL COMPREHENSIVE AUDIT ONCE AT THE END**

Do **NOT** spend 20–60+ minutes creating forensic evidence directories, SHA-256 evidence checksums, behavioral evaluator unit tests, recovery checkpoints, or auditing unrelated historical controls during standard implementation phases.

Core Verification Principle:
> **"VERIFY WHAT YOU CHANGED, NOT EVERYTHING THAT EXISTS."**

---

## 1. SCOPE A — ALWAYS APPLY (Universal Safety Rules)

These lightweight safety rules apply universally to every task without exception:

1. **Never fabricate results**: Every stated result must come from actual execution and observed evidence.
2. **Never claim a test was performed if it was not performed**: If a check could not be run, state it truthfully or mark it `UNVERIFIED`.
3. **Never expose secrets**: Do not log or commit private keys, passwords, API tokens, or credentials.
4. **Never silently ignore real errors**: Do not swallow exceptions or convert non-zero command exits into fake success.
5. **Never make destructive changes without explicit authorization**: Preserve existing data, schema, and operational state.
6. **Preserve working functionality**: Keep changes strictly focused on the requested task without breaking existing features.
7. **Keep changes strictly scoped to the requested task**: Avoid unrequested refactoring or scope creep.
8. **Do not modify unrelated infrastructure**: Never touch unrelated services, ports, or databases.
9. **Do not perform unrelated historical audits**: Do not waste time re-verifying old phases unless explicitly instructed.
10. **Firewall strictly protected**: NEVER modify UFW, iptables, or nftables unless the user explicitly requests firewall work.
11. **SSH strictly protected**: Preserve the existing hardened SSH baseline unless the current task explicitly concerns SSH.

---

## 2. TASK CLASSIFICATION (Mandatory First Step)

Before executing any task, classify it as exactly one of the following:

| Task Classification | Scope | Execution & Verification Level | Evidence / Checkpoints? |
| :--- | :---: | :--- | :---: |
| **`NORMAL_DEVELOPMENT`** | Scope A + C | Lightweight targeted verification (build, unit tests, affected routes) | **NO** |
| **`SECURITY_IMPLEMENTATION`** | Scope A + Fast Mode | Fast implementation + targeted verification of modified components | **NO** (Only targeted checks) |
| **`DEPLOYMENT_INFRASTRUCTURE`** | Scope A + Deploy Mode | Proportional service, container, and endpoint health verification | Only if infra config changes |
| **`FINAL_SECURITY_AUDIT`** | Scope A + Scope B | Full forensic verification engine (all 20 rules, SHA-256 evidence, report) | **YES** (Only when explicitly requested) |

### Classification Definitions:

- **`NORMAL_DEVELOPMENT`**:
  - Frontend: React components, TypeScript, Tailwind styling, JSX, UI layouts, navigation, modals, forms, tables, hooks, state management, accessibility.
  - Backend: FastAPI endpoints, Pydantic schemas, routers, middleware, business logic, CRUD operations, database queries.
  - Features: Attendance tracking, fee management, student/teacher modules, reports, notifications UI, PDF generation, application bug fixes, refactoring.

- **`SECURITY_IMPLEMENTATION`**:
  - Security hardening phases (e.g. Phase 16A, 16B, 16C, 16D, etc.).
  - VPS hardening, SSH hardening, OS hardening, PAM/sudo, Nginx/TLS hardening, Fail2Ban, systemd service security, network attack-surface reduction, domain/TLS infrastructure hardening.

- **`DEPLOYMENT_INFRASTRUCTURE`**:
  - Production deployment, Docker deployment, Nginx reverse-proxy rollout, domain deployment, production configuration changes.

- **`FINAL_SECURITY_AUDIT`**:
  - **SPECIAL TASK**: Entered **ONLY** when the user explicitly requests a comprehensive security audit, full forensic review, or complete VPS verification.

---

## 3. SECURITY_IMPLEMENTATION — FAST IMPLEMENTATION MODE

For normal security-hardening phases (Phase 16A, 16B, 16C, etc.):
- **DO NOT** automatically invoke the full forensic verification engine.
- The objective of these phases is **fast, clean implementation**.
- Use only **targeted verification directly related to the changes made in that phase**:
  - **OS Service change**: Verify the intended service state (`systemctl status <service>`) and relevant configuration.
  - **Nginx change**: Run `nginx -t`, reload safely (`systemctl reload nginx`), and verify the affected endpoint.
  - **Fail2Ban change**: Verify `fail2ban-client status` and the specific affected jail.
  - **Sudo change**: Verify the intended sudoers rule, run `sudo -n id`, and verify admin SSH access remains functional.
  - **SSH change**: Perform the minimum necessary lockout protection and targeted SSH connection verification.

### What NOT to do during SECURITY_IMPLEMENTATION:
- ❌ **NO** 20+ test forensic verification matrices.
- ❌ **NO** behavioral evaluator self-tests.
- ❌ **NO** AST self-audit of every execution script.
- ❌ **NO** SHA-256 evidence directory creation (`/var/log/altrix/phaseXX-evidence/...`).
- ❌ **NO** full recovery checkpoints for every small change.
- ❌ **NO** audits of historical or previous phases.
- ❌ **NO** complete VPS security regression sweeps.
- ❌ **NO** unrelated firewall inspection.
- ❌ **NO** unrelated TLS / SSL verification.
- ❌ **NO** unrelated Docker / database / frontend audits.
- ❌ **NO** formal forensic markdown reports (`phaseXX_security_hardening.md`).

---

## 4. SECURITY IMPLEMENTATION SAFETY

Fast mode does **NOT** mean careless mode. Always uphold core safety:
- Preserve working functionality and avoid destructive changes.
- Never expose credentials or passwords in logs/code.
- Never fabricate verification results.
- Stop immediately on critical errors.
- Verify the specific configuration that was modified and minimum affected production functionality.
- Keep the firewall completely untouched unless explicitly authorized.
- Preserve the existing SSH baseline unless SSH is the requested task.
- For SSH or lockout-sensitive changes, maintain proportional safety precautions (e.g. keep an active session open while testing), but do not expand the task into a complete audit.

---

## 5. FIREWALL ISOLATION

The following firewall components are strictly protected:
- **UFW**
- **iptables**
- **nftables**

**Rules**:
1. Do NOT modify them unless the user explicitly requests firewall work.
2. Do NOT waste execution time auditing firewall state during unrelated implementation phases.
3. Only inspect firewall state if:
   - The current task directly depends on firewall behavior, **OR**
   - The user explicitly requests a firewall check.
4. *Context*: Firewall rules will be configured through Cloudflare / API infrastructure later, so firewall hardening must remain excluded from unrelated phases.

---

## 6. SSH PROTECTION

The existing hardened SSH baseline must remain protected:
```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
altrixadmin Ed25519 authentication
MaxStartups 10:30:60
MaxSessions 10
TCPKeepAlive yes
```

**Rules**:
- Do not modify SSH during unrelated tasks.
- If the current phase explicitly modifies SSH:
  - Preserve at least one verified administrative session.
  - Avoid lockout and apply changes safely.
  - Perform targeted post-change SSH verification.
  - Do **NOT** automatically launch a full historical SSH forensic audit unless explicitly requested.

---

## 7. NORMAL DEVELOPMENT MODE

For normal application development tasks, use lightweight targeted verification:
- **Frontend**: Run TypeScript compilation / build verification (`npm run build` or `npx tsc --noEmit`), targeted lint if relevant, and check affected routes/UI.
- **Backend**: Run syntax check, targeted endpoint test, or affected API response verification.
- **Database**: Run targeted migration/query verification against Supabase.
- **No VPS security audits** during normal development work.

---

## 8. DEPLOYMENT INFRASTRUCTURE MODE

For deployment tasks, perform only proportional verification:
- Docker container health (`docker ps`, container logs).
- Affected systemd service status.
- Affected HTTP/HTTPS endpoint response.
- Relevant reverse-proxy configuration (`nginx -t`).
- Application health endpoint check (`/health` or `/api/v1/health`).
- **No complete forensic security audit** unless specifically requested.

---

## 9. FINAL_SECURITY_AUDIT — FULL FORENSIC MODE

The heavy forensic verification engine is reserved for **ONE dedicated final audit** after the complete security-hardening roadmap is finished.

### Trigger Condition:
Only enter this mode when the user explicitly requests it, such as:
- *"perform the final security audit"*
- *"audit the complete VPS"*
- *"run the full forensic security verification"*
- *"verify all security phases"*
- *"complete final security assessment"*

### Mandatory Full Forensic Verification Engine (Rules 1–20):
When triggered, execute the full forensic workflow:
1. **Rule 1 — No Hardcoded Verification Outcomes**: Never assign `status = "PASS"`, `status = "FAIL"`, or `status = "GO"` directly.
2. **Rule 2 — PASS Must Be Computed**: Derived from live boolean assertions (`status = "PASS" if result.returncode == 0 else "FAIL"`).
3. **Rule 3 — Required Verification Pipeline**: `COMMAND → OUTPUT → EXIT CODE → ASSERTION → STATUS → EVIDENCE RECORD → FINAL REPORT`.
4. **Rule 4 — Separate Execution From Evaluation**: Separate `run_cmd()`, `evaluate_test()`, and report generation.
5. **Rule 5 — Raw Evidence Is Authoritative**: Retain command, timestamp, exit code, stdout, stderr, and calculated status.
6. **Rule 6 — Failed Command = FAIL**: Non-zero exit code evaluates to `FAIL`.
7. **Rule 7 — UNVERIFIED Is a Valid Result**: If a check cannot be executed, output `UNVERIFIED`.
8. **Rule 8 — Expected State Is Not Observed State**: Dynamic live inspection required.
9. **Rule 9 — Previous Phase Results Are Never Trusted**: Independently evaluate controls with live commands.
10. **Rule 10 — Regression Tests Must Be Live**: Execute live checks rather than referencing old reports.
11. **Rule 11 — Final GO/NO-GO Must Be Computed**: Automated decision based on fail/unverified counts.
12. **Rule 12 — Static Self-Audit Is Mandatory**: AST/regex inspection of execution scripts.
13. **Rule 13 — Behavioral Evaluator Self-Tests**: Test evaluator logic before running.
14. **Rule 14 — No Exception-to-PASS Fallback**: Uncaught errors produce `FAIL` or `UNVERIFIED`.
15. **Rule 15 — No Silent Command Fallbacks**: Do not use `cmd || true` to mask failures.
16. **Rule 16 — Dumb Report Generation**: Renders already-calculated `EvidenceRecord[]`.
17. **Rule 17 — Evidence Hashing**: Save raw outputs to `/var/log/altrix/final-audit-evidence/<timestamp>/` with `checksums.sha256`.
18. **Rule 18 — Production Lockout Protection**: Active checkpoints and dual verified admin sessions.
19. **Rule 19 — Never Optimize for a PASS Result**: Truthful FAIL/UNVERIFIED is mandatory.
20. **Rule 20 — Agent Narrative Is Not Evidence**: Only raw output and computed exit codes count.

---

## 10. FINAL AUDIT MUST BE A SEPARATE TASK

Never automatically perform the final audit at the end of each implementation phase.

```text
Phase 16A → IMPLEMENT → TARGETED VERIFY → COMPLETE
Phase 16B → IMPLEMENT → TARGETED VERIFY → COMPLETE
Phase 16C → IMPLEMENT → TARGETED VERIFY → COMPLETE
Phase 16D → IMPLEMENT → TARGETED VERIFY → COMPLETE
...
(All Planned Phases Completed)
↓
User explicitly requests: "Run final security audit"
↓
FULL FORENSIC AUDIT → COMPLETE SECURITY MATRIX → FINAL GO / NO-GO
```

---

## 11. EXECUTION TIME OPTIMIZATION

Do not create long-running scripts merely to satisfy historical audit patterns.
- If a task can safely be completed with **1–5 targeted commands**, do not turn it into a 20+ test forensic suite with evaluator tests, AST self-audits, and evidence hashing.
- Verification must always be proportional to the actual change.

---

## 12. REPORTING FORMAT FOR IMPLEMENTATION PHASES

For `SECURITY_IMPLEMENTATION` tasks, return a concise, high-signal implementation report:

```markdown
### What Changed
- [Brief bullet points of exact configurations / services modified]

### Targeted Verification
- [Command run & exact observed result]

### Result
- **COMPLETED** | **PARTIALLY COMPLETED** | **FAILED** (based strictly on actual execution)

### Remaining Items
- [Next planned phase or follow-up task]
```

Do **NOT** generate a large forensic report artifact unless the user explicitly requested `FINAL_SECURITY_AUDIT`.

---

# FINAL OPERATING PRINCIPLE

The project security roadmap is divided into two distinct modes:

### 1. IMPLEMENTATION MODE (Fast, focused, proportional)
```text
PLAN → IMPLEMENT → TARGETED VERIFY → REPORT → NEXT PHASE
```

### 2. FINAL AUDIT MODE (Comprehensive & forensic)
```text
ALL SECURITY PHASES COMPLETE → USER EXPLICITLY REQUESTS FINAL AUDIT → FULL FORENSIC VERIFICATION → LIVE EVIDENCE → SHA-256 EVIDENCE → FULL SECURITY MATRIX → FINAL GO / NO-GO
```

Never mix these two modes. Classifying a task as `SECURITY_IMPLEMENTATION` does **NOT** trigger a forensic audit. The forensic engine is strictly reserved for the explicit `FINAL_SECURITY_AUDIT` task.
