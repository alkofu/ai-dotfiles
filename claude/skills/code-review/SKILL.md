---
name: code-review
description: Defines the high-signal review contract for code and diff reviews. Use whenever the user asks for a code review, PR review, diff review, asks to review a pull request, asks "is this code OK to merge", asks to identify issues in a changeset, or invokes a `/review-pr` command — even when the user does not explicitly say "skill". This skill determines what qualifies as a reportable finding, what does not, and how findings are structured and validated before being reported. Invoke it before surfacing any review findings, not after.
---

# Code Review

This skill defines the high-signal review contract: what qualifies as a reportable finding, what does not, and how findings are structured before reporting. Its central purpose is to enforce a deliberate two-pass identify-then-validate workflow that separates reading from concluding — the single highest-leverage mechanism for suppressing false positives. A review produced without this contract is a list of opinions; a review produced with it is a defensible set of findings a reasonable senior engineer would stand behind.

## When to Use This Skill

Apply this skill during:

- Pull request reviews (full PR or partial diff)
- Standalone diff reviews (patches, git diff output, file comparisons)
- `/review-pr`-style commands that request structured review output
- The implementation review gate inside the TPK pipeline, where Ruinor evaluates whether work is ready to merge
- Any request to identify issues in a changeset, evaluate code quality, or answer "is this safe to merge?"

## When NOT to Use This Skill

Do not apply this skill when the task is:

- Writing new code or implementing a feature (that is implementation work)
- Creating or revising a plan (that is Pathfinder territory)
- Running lint or format checks (use the `validate-before-pr` skill)
- Deciding whether to simplify or restructure code (architectural reduction is Knotcutter territory)

## High-Signal Philosophy

Only flag findings that a reasonable senior engineer would raise in a review meeting — high confidence, concrete impact, no speculation.

Three categories of findings are reportable:

1. **Compile/parse failure** — Code that will fail to compile or parse: syntax errors, type errors, missing imports, unresolved references. Example: a function called with three arguments where the signature accepts two, causing a compile-time error.

2. **Definite logic error** — Logic that will *definitely* produce wrong results regardless of inputs. "Definitely" means the error is unconditional — it does not require a specific runtime state to trigger. Example: an off-by-one in a loop bound that always skips the last element, not one that might skip it under some condition. If you can only say "this might produce wrong results depending on inputs," do not flag it.

3. **Unambiguous convention violation** — A clear violation of a project convention where the violated rule can be quoted verbatim from project documentation, linting configuration, or an explicit team standard. Example: a public function missing a docstring in a codebase where `CONTRIBUTING.md` states "all public functions must have docstrings." If the rule cannot be cited, do not flag it.

## False-Positive Suppression

False positives erode trust and waste reviewer time; when in doubt, do not flag.

Do NOT flag:

1. **Pre-existing issues not introduced by this change.** Example: flagging a poorly named variable that existed in the file before the diff. That problem predates this review; it belongs in a separate cleanup task.

2. **Code style or formatting concerns detectable by a linter.** Example: flagging inconsistent spacing or a missing trailing comma. Linters handle these; reviewers should not re-do linter work.

3. **Potential issues that depend on specific runtime state or inputs.** Example: "This could fail if the list is empty" when the calling code always populates the list before this point. Speculative failures require evidence, not imagination.

4. **Nitpicks a senior engineer would not raise in a review meeting.** Example: suggesting a variable be renamed from `idx` to `index` because the latter is "more readable." If it would not block a merge in a real team, it does not belong in the findings list.

5. **Issues that cannot be validated without reading context outside the diff.** Example: flagging a missing null check when the upstream caller's null-safety guarantees are not visible in the changeset. If you cannot confirm the concern with evidence in the diff, drop it.

When a candidate finding falls into any of these categories, drop it during the validate pass — do not "soften" it into a COMMENT.

## Two-Pass Validation

Reviewers tend to write up findings as they read. Splitting identification from validation forces a deliberate confidence check before each finding ships, which is the single highest-leverage anti-false-positive mechanism.

### Pass 1 — Identify

- Read the diff (or artifact) end-to-end without writing findings yet
- Collect candidate findings into a working list — anything that *might* be a real issue
- Note the location, the suspected category (compile/logic/convention), and a one-line description for each candidate
- Do not assign severity or write recommendations during this pass

### Pass 2 — Validate

For each candidate from Pass 1, apply three sequential checks. A candidate must pass all three to become a finding:

1. **Category check:** Is this in one of the three reportable categories (compile failure, definite logic error, unambiguous convention violation)? If no — drop it.
2. **Suppression check:** Is this in any of the five suppressed categories (pre-existing, style/formatting, speculative, nitpick, requires outside context)? If yes — drop it.
3. **Evidence check:** Can you cite concrete evidence — file and line for code, a quoted excerpt for plans? If no — drop it.

Only candidates that survive all three checks become findings.

## Output Format

Every finding must include at minimum:

- **ID**: F-{number}
- **Location**: File path with line reference, or plan step reference
- **Category**: compile-failure | logic-error | convention-violation
- **Description**: Clear statement of the issue
- **Evidence**: Concrete citation (line of code, quoted text) — no evidence, no finding
- **Recommended action**: Specific, actionable fix

When this skill is invoked from within Ruinor's pipeline, Ruinor's output format is a superset of this floor — it adds Severity, Impact, and other fields. Those additions are Ruinor's responsibility; this skill defines the minimum required fields.

## Verdicts

After completing the two-pass validation, issue one of three verdicts:

**APPROVE** — No findings remain after the validate pass, or only trivial observations that do not affect correctness or convention. The change is ready to merge as-is. Example: a clean refactor with no reportable issues.

**REQUEST_CHANGES** — At least one finding from Pass 2 must be fixed before the change is merged. The finding is in a reportable category, passes suppression checks, and is backed by concrete evidence. Example: a type error that will cause a compile failure on the next build.

**COMMENT** — Minor observations that do not block merging but are worth noting. No finding rises to the level of blocking merge. Example: a note that a helper function would benefit from a docstring, where the project standard recommends but does not require them.

### Mapping to TPK Verdict Taxonomy

TPK reviewers use a four-verdict taxonomy defined in the `verdict-taxonomy.md` reference, installed alongside this skill at `~/.claude/references/verdict-taxonomy.md`.

| Skill verdict      | TPK verdict (Ruinor / specialist)                   |
|--------------------|-----------------------------------------------------|
| APPROVE            | ACCEPT (or ACCEPT-WITH-RESERVATIONS if minor notes) |
| COMMENT            | ACCEPT-WITH-RESERVATIONS                            |
| REQUEST_CHANGES    | REVISE (or REJECT for fundamental flaws)            |

The skill's three-verdict vocabulary matches the GitHub PR review API and is friendlier for standalone review sessions. Ruinor's four-verdict taxonomy adds REJECT for fundamental, unrecoverable flaws and splits the "approved" state into ACCEPT vs. ACCEPT-WITH-RESERVATIONS. When invoked from inside Ruinor's pipeline, the skill's verdict is translated to the TPK taxonomy via the table above; when invoked standalone (e.g., from a `/review-pr` command), the skill's three-verdict output may be used as-is.

The mapping table is **normative in the skill→TPK direction** (skill verdict to Ruinor equivalent) and informational only in the inverse direction, since both APPROVE and COMMENT can map to ACCEPT-WITH-RESERVATIONS from the TPK side.
