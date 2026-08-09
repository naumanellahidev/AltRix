# Project Rules

- Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).

## Permanent Non-Negotiable Evidence & Security Rules
- Do not create a Python script that simply writes PASS into an audit report.
- Every PASS must be generated from real command execution and captured output.
- If a test cannot actually be performed, mark it UNVERIFIED.
- Never fabricate evidence.
- Never hardcode PASS, VERIFIED, HEALTHY, SUCCESS, GO, or similar results into an audit report without executing the underlying test.
- Audit reports must be generated from actual observed system state.
- Never modify production data during restore testing.
- Restore tests must use isolated temporary locations, disposable test databases, or another explicitly non-production target.
- Never claim that a security control is implemented merely because configuration files were created. Verify the effective runtime state.
- Configuration syntax validation is not sufficient. Where applicable, verify the active runtime behavior.
- Never disable SSH, UFW, Docker networking, Nginx, or application services without a verified rollback path.
- Never perform destructive security testing against production data.
- Every production modification must have a recovery checkpoint.
- Before modifying SSH or firewall configuration, establish and verify an independent recovery/administrative access path.
- Never close the currently working SSH session until a second independent administrative connection has been successfully tested.
- After every security modification, perform real regression tests for SSH, UFW, Docker, Nginx, FastAPI, Supabase connectivity, and React frontend.
- If any critical regression occurs, stop the phase immediately and roll back the affected change.
- Never report 100% completion if any required control remains unverified.

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

