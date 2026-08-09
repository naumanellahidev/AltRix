# Project Rules

- Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).

## Permanent Non-Negotiable Evidence & Security Rules

### Evidence Rule 1 — No Fabricated PASS
Never write a PASS result directly into an audit report. Every PASS must originate from a real command, real HTTP request, real service query, real filesystem inspection, or other independently observable evidence.

### Evidence Rule 2 — No Hardcoded Audit Status
Execution scripts MUST NOT contain hardcoded security status statements such as PASS, FAIL, GO, SECURE, VERIFIED, 100% OPERATIONAL unless these values are dynamically generated from actual test results.

### Evidence Rule 3 — Raw Evidence Required
Every security verification must preserve:
- command executed
- timestamp
- exit code
- stdout
- stderr
- expected result
- observed result
- calculated status

### Evidence Rule 4 — Unknown Means UNVERIFIED
If a test cannot actually be performed, UNVERIFIED must be reported. Never convert an unavailable test into PASS.

### Evidence Rule 5 — Previous Reports Are Not Evidence
A previous audit report saying PASS is NOT sufficient evidence for a new audit. Historical reports may be referenced for context only.

### Evidence Rule 6 — Previous Phase Status Must Not Be Inherited
Never do Phase 1–13 = PASS because previous reports said so. Each claimed control must be independently verified where technically possible.

### Evidence Rule 7 — No Fake Regression Testing
Do not claim Phase 1–13 regression: PASS unless the underlying controls were actually tested during the current verification run.

### Evidence Rule 8 — Restore Tests Must Be Non-Destructive
Never modify production database records, application data, active containers, production configuration, or live user data during restore testing. Use isolated temporary directories/databases/environments.

### Evidence Rule 9 — No Production Lockout
Never change SSH, UFW, networking, Docker, Nginx, authentication, or firewall configuration without:
1. backup/checkpoint
2. syntax validation
3. independent SSH session
4. rollback path
5. post-change regression

### Evidence Rule 10 — Execution Script Must Fail Safely
If a critical verification fails:
- stop dependent operations
- preserve evidence
- mark FAIL
- do not overwrite it with PASS
- do not continue pretending the system is healthy

### Evidence Rule 11 — Report Generator Must Be Data-Driven
The final Markdown report must be generated from structured test results. Do not manually type security statuses into the final report.

### Evidence Rule 12 — GO Decision Must Be Calculated
The final GO/NO-GO decision must be calculated from the actual verification matrix:
- FAIL in critical control -> NO-GO
- UNVERIFIED critical control -> NO-GO or GO WITH EXPLICIT UNVERIFIED depending on predefined policy
- All required critical controls PASS -> GO
Never hardcode FINAL DECISION: GO.

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
