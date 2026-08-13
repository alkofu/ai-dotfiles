# /ops Save-Report Bitsmith Delegation Template

This template is used by DM in step 3 of the `--save-report` post-synthesis step of the Advisory Workflow, after the inline answer has been delivered and the report path (`{REPO_ROOT}/reports/{SESSION_TS}-{SESSION_SLUG}.md`) has been computed. DM substitutes the placeholder values at delegation time.

```
## Report Write Task

Write the advisory report to disk. This is a single file write — no code changes, no tests, no review needed.

**Report path:** {REPO_ROOT}/reports/{SESSION_TS}-{SESSION_SLUG}.md
**Directory creation:** Run `mkdir -p {REPO_ROOT}/reports` before writing.

**Report content:** Write the following content to the file:

---begin report content---
# Advisory Report: {SESSION_SLUG}

**Date:** {SESSION_TS}
**Question:** {user's original question, verbatim}

## Answer

{Phase C synthesis output — the full answer as delivered inline, including agent attributions}

## Sources

{Sources list compiled during Phase C}
---end report content---
```
