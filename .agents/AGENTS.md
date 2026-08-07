# Project Rules

- Always use the FastAPI backend for any backend features in this project (never use Supabase Edge Functions or other serverless technologies).

## Execution & Reporting Protocol (Mandatory for all tasks)
- Whenever a task is given: Analyze request -> Create plan -> Execute scripts -> Perform all validations -> Verify results -> **Immediately and automatically return the full execution report in the final output of the response turn**.
- Never stop after running a background script or command without presenting the complete report in the same turn.
- Every report must include:
  1. Executive Summary
  2. Files Modified
  3. Commands Executed
  4. Validation Performed
  5. Verification Results (PASS / FAIL / WARNING table)
  6. Safety Verification (SSH, Docker, Internet, Firewall, Unrelated files)
  7. Rollback Information
  8. Remaining Work
  9. Final Status (`COMPLETED` | `COMPLETED WITH WARNINGS` | `FAILED`)

