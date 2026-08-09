# Project Rules

- Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).

## Permanent Mandatory Verification Engine Policy

This is a permanent engineering policy for ALL future security, infrastructure, VPS, deployment, audit, forensic, hardening, regression, and verification scripts. Every verification script MUST use an evidence-driven verification architecture.

### Rule 1 — No Hardcoded Verification Outcomes
Never assign a verification result directly:
`status = "PASS"`
`status = "FAIL"`
`status = "GO"`
Never create audit matrix entries with unconditional outcomes:
`("SSH", ..., "PASS")`
`("Docker", ..., "PASS")`
`("Database", ..., "PASS")`
Expected values may be hardcoded. Verification outcomes may NOT be hardcoded.

### Rule 2 — PASS Must Be Computed
Every PASS must originate from a boolean condition derived from actual live evidence.
Allowed:
```python
exit_code = result.returncode
status = "PASS" if exit_code == 0 else "FAIL"
```
Allowed:
```python
status = "PASS" if (result.returncode == 0 and "active" in result.stdout) else "FAIL"
```
Not allowed:
`status = "PASS"`
`status = expected_status`
`status = "PASS" if True else "FAIL"`

### Rule 3 — Required Verification Pipeline
Every test MUST follow this architecture:
```
LIVE COMMAND
↓
RAW OUTPUT
↓
EXIT CODE / HTTP STATUS / STRUCTURED RESPONSE
↓
ASSERTION FUNCTION
↓
CALCULATED STATUS
↓
EVIDENCE RECORD
↓
FINAL REPORT
```
The report generator MUST NEVER determine whether a test passes. The test evaluator determines the status. The report only displays the already-calculated result.

### Rule 4 — Separate Execution From Evaluation
Create separate functions/classes where practical:
- `run_command()`
- `capture_http()`
- `capture_ssh()`
- `evaluate_test()`
- `build_evidence_record()`
- `generate_report()`

The evaluator must calculate `PASS / FAIL / UNVERIFIED` directly from the result.

### Rule 5 — Raw Evidence Is Authoritative
A PASS is valid only if raw evidence exists. Each test must retain:
- exact command
- timestamp
- exit code
- stdout
- stderr
- HTTP status where applicable
- relevant response body
- expected condition
- calculated status

If raw evidence is missing: `UNVERIFIED`. Never `PASS`.

### Rule 6 — Failed Command = FAIL
Do not hide command failures. If a required command returns a non-zero exit code: `FAIL`, unless the test specification explicitly defines that non-zero exit code as the expected successful condition. Never replace failed output with a friendly PASS message.

### Rule 7 — UNVERIFIED Is a Valid Result
If a test cannot actually be executed: `UNVERIFIED`.
Examples:
- required credentials unavailable
- second SSH session cannot be established safely
- scanner not installed
- external DNS unavailable
- test account unavailable
- required dependency unavailable
Do NOT convert these into PASS.

### Rule 8 — Expected State Is Not Observed State
Never confuse "this configuration SHOULD be active" with "this configuration IS active." The script must inspect the live system.
- Bad: `expected = "active"`; `status = "PASS"`
- Good: `actual = run_command("systemctl is-active ssh")`; `status = "PASS" if actual.stdout.strip() == "active" else "FAIL"`

### Rule 9 — Previous Phase Results Are Never Trusted
Previous audit reports, previous phase reports, previous PASS values, previous checkpoints, and previous summaries are historical information only. They MUST NOT be used as evidence for current verification. Every current phase must independently verify the controls it claims.

### Rule 10 — Regression Tests Must Also Be Live
Do not optimize regression testing by writing: "Phase 1–14 regression: PASS". Instead execute the required regression checks. Each control gets its own live evidence and calculated status. Then calculate `pass_count`, `fail_count`, `unverified_count` from the actual results.

### Rule 11 — Final GO/NO-GO Must Also Be Computed
Never write `FINAL DECISION: GO` as a fixed string. Calculate it dynamically:
```python
if fail_count > 0:
    decision = "NO-GO"
elif unverified_count > 0:
    decision = "GO WITH UNVERIFIED ITEMS"
else:
    decision = "GO"
```
The decision must be derived exclusively from the verification matrix.

### Rule 12 — Static Self-Audit Is Mandatory
Before executing ANY security verification script, the script must inspect itself. Reject execution if it finds unconditional verification assignments such as `status = "PASS"`, `status = "FAIL"`, `status = "GO"`, or matrix records containing hardcoded outcomes. Static analysis must inspect:
- direct assignments
- tuples/lists/dictionaries
- summary counters
- final decisions
- report templates
- helper functions
- exception handlers
- fallback branches

### Rule 13 — Behavioral Self-Test Is Also Mandatory
Static inspection alone is insufficient. Before production execution, the verification engine MUST perform local evaluator self-tests:
1. Simulated successful evidence → PASS
2. Simulated failed evidence → FAIL
3. Simulated unavailable evidence → UNVERIFIED
4. Simulated malformed evidence → FAIL or UNVERIFIED according to specification
If these self-tests fail: **ABORT**.

### Rule 14 — No Exception-to-PASS Fallback
Never do:
```python
try:
    ...
except:
    status = "PASS"
```
Exceptions must produce `FAIL` or `UNVERIFIED` depending on whether the test could actually be completed.

### Rule 15 — No Silent Command Fallbacks
Do not use shell constructs that hide failures unless explicitly required. Avoid patterns such as `command || true` when the command's success/failure is part of the security verification. Do not convert errors into successful output.

### Rule 16 — Report Generation Must Be Dumb
The report generator must NOT contain security decisions. It should receive `EvidenceRecord[]` and render them. Security decisions belong in evaluator functions.

### Rule 17 — Evidence Hashing
For forensic phases, raw evidence must be written to a timestamped directory (e.g. `/var/log/altrix/phaseXX-evidence/<timestamp>/`). Then calculate SHA-256 checksums over the evidence files. The report must reference the actual evidence files.

### Rule 18 — Production Safety
Before any modifying phase:
1. Establish primary SSH session.
2. Establish independent SSH session.
3. Verify both sessions execute commands.
4. Create recovery checkpoint.
5. Verify checkpoint.
6. Only then modify production.
If lockout protection cannot be established: **ABORT**.

### Rule 19 — Never Optimize for a PASS Result
The objective of the script is NOT "make the audit pass." The objective is "discover the actual state of the system." A truthful FAIL is better than a fabricated PASS. A truthful UNVERIFIED is better than a fabricated PASS.

### Rule 20 — Agent Completion Claims Are Not Evidence
Never trust statements such as "Completed successfully", "All tests passed", "Security is fully hardened", "Zero findings", "Production is GO" unless the underlying live evidence supporting those claims is present. The agent's narrative is not evidence.

## Mandatory Pre-Execution Check
Before running any new security script, print:
```
SELF-AUDIT:
* Hardcoded verification outcomes: 0
* Dynamic evaluators detected: YES
* Raw evidence capture: YES
* Exit-code evaluation: YES
* UNVERIFIED handling: YES
* Behavioral evaluator tests: PASS
* Final decision dynamically calculated: YES
```
If any item fails: **DO NOT EXECUTE THE PRODUCTION SCRIPT**.

## Execution & Reporting Protocol (Mandatory for all tasks)
- Whenever a task is given: Analyze request -> Create plan -> Execute scripts -> Perform all validations -> Verify results -> **Immediately and automatically return the full execution report in the final output of the response turn**.
- Never stop after running a background script or command without presenting the complete report in the same turn.
- Every report must include:
  1. Executive Summary
  2. Files Modified
  3. Commands Executed
  4. Validation Performed
  5. Verification Results (PASS / FAIL / WARNING / UNVERIFIED table)
  6. Safety Verification (SSH, Docker, Internet, Firewall, Unrelated files)
  7. Rollback Information
  8. Remaining Work
  9. Final Status (`COMPLETED` | `COMPLETED WITH UNVERIFIED ITEMS` | `FAILED`)
