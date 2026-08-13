# Review Gates — Shared Reference

This file defines the shared two-gate framework for all reviewer agents. Each reviewer agent (Ruinor, Riskmancer, Windwarden, Knotcutter, Truthhammer) operates at both gates. Domain-specific criteria for each gate are defined inline in each agent's definition file.

## Plan Review Gate

Before implementation begins, reviewers examine the specific plan file provided by Dungeon Master (typically `~/.ai-tpk/plans/{REPO_SLUG}/{SESSION_TS}-{feature-slug}.md`).

**Note:** Only review the plan file specified in the request, not all plans in the directory.

## Implementation Review Gate

After execution completes, reviewers examine the changed files and paths that were produced during implementation.

## Operational Constraints

- Reviewers operate read-only — Write and Edit tools are blocked.
- Return reviews in-memory — provide verdict and findings directly in your response to Dungeon Master. Do NOT write review files.
- Reviewer agents may run verification commands (tests, linting, static analysis) during reviews. This does not override DM's own no-implementation constraint -- DM delegates review work, it does not execute it.

### Output-Format and Verbosity Contract

Binding on all five reviewer agents (Ruinor, Riskmancer, Windwarden, Knotcutter, Truthhammer) for every invocation, at both gates. Each agent's own `## Output Format` / `## Output Standards` section points here rather than restating this contract.

These are per-invocation **verbosity** caps only. They do not alter verdict or severity vocabulary, Dungeon Master's parsing keywords, or the meaning of any label defined in `claude/references/verdict-taxonomy.md`. They also do not reduce how often reviewers are invoked -- that is a separate, unaddressed concern.

**Soft caps** (concrete guidance, not hard truncation -- exceeding a cap to preserve necessary evidence or nuance is acceptable; these are soft guidelines, not hard limits that drop content):

- **Per-finding block**: aim for approximately 10-12 lines per finding (covering the ID/header plus its labeled fields, e.g. Severity, Location, Description, Evidence, Impact, Recommendation).
- **Prose sections** (e.g. Gap Analysis, Verdict Rationale, Performance Analysis, and equivalent overview/rationale sections): aim for approximately 8-10 lines each.

**Cite, don't reproduce:** Findings must cite the location (`file:line`, or plan step reference) rather than reproducing surrounding context or diff content. This rule extends the Evidence Doctrine in `claude/references/verdict-taxonomy.md` (`## Evidence Doctrine`) -- cite concrete evidence at the location; don't restate it.

**No restated context, no reproduced diff:** Do not paste back the diff, the full surrounding code block, or lengthy excerpts already visible to Dungeon Master. Quote only the minimal fragment necessary to support a finding.

**REJECT-only extended rationale escape hatch:** When, and only when, issuing a REJECT verdict, a rationale section may run up to +10 lines beyond the standard prose-section cap to explain a fundamental or systemic problem. This escape hatch still forbids restating context or reproducing diff content, and does not apply to REVISE, ACCEPT-WITH-RESERVATIONS, or ACCEPT verdicts.

These caps govern verbosity only; they do not add, remove, or reword any required field, verdict, or severity label defined elsewhere.

## Note on Domain-Specific Criteria

Each reviewer agent defines its domain-specific criteria for each gate inline in its own definition file.
