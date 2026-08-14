# Phase 2 Pathfinder Revision Delegation Template

This template is used by DM in Phase 2 step 4 every time a plan revision is delegated back to Pathfinder, including subsequent revision rounds. The `REVISION_MODE` and `USER_FLAGS` lines are revision-specific additions outside the canonical Worktree Context Block.

**Phase-agnostic note:** although this file is titled for the Phase 2 Pathfinder revision loop, the canonical scoping rule and carry-forward rule defined below are **phase-agnostic** — they are the single source of truth also governing the Phase 4 Bitsmith fix loop (`dungeonmaster.md` Phase 4 step 4). A Phase 4 reader following the cross-reference from that section should read the rule below as applying identically, with "Pathfinder" read as "Bitsmith."

## Canonical scoping rule for consolidated reviewer feedback (issue #382)

DM does not indiscriminately re-append "consolidated feedback from Ruinor and all invoked specialists" on every revision round. Instead, the `## Reviewer Feedback` block in a revision delegation is composed from two distinct sources, scoped as follows:

1. **Reviewers guaranteed to re-run every round** — Ruinor (re-run unconditionally, per `dungeonmaster.md` Phase 2 step 4 / line 507) and any **user-flagged** specialist (re-run every round because the original user flag persists for the session) — re-review the whole artifact each round. For these reviewers, the revision delegation carries **only the current round's output**. DM does **not** re-append their prior-round findings: any still-active finding of theirs is re-stated verbatim by the reviewer in its current-round output, so nothing is lost by dropping the prior round's copy.
2. **Specialists that are only conditionally re-run** — invoked in a prior round via a Ruinor recommendation (not a user flag) and **NOT re-invoked** this round — do not re-state their findings this round, because they did not run. For these, DM **carries forward verbatim** every still-unresolved blocking finding (REJECT rationale; CRITICAL/MAJOR/HIGH; Truthhammer CRITICAL/HIGH treated as equivalent per the aggregation rule) into the current round's delegation. Such a finding remains in every subsequent delegation until that specialist is re-invoked in a later round and no longer raises it — that later re-review is the **only** signal that clears it. A specialist finding is **never** treated as resolved merely because the specialist was not re-run this round.

**Verbatim carve-out.** Every current-round finding (from rule 1 reviewers) **and** every carried-forward finding (from rule 2 non-re-invoked specialists) is reproduced **verbatim** in the delegation — never compressed, summarized, or paraphrased. The scoping rule above drops only the prior-round findings of rule-1 reviewers that the current round no longer raises (because they are resolved or no longer being raised); it never compresses any active finding and never drops a rule-2 carried-forward finding.

   (The four canonical Worktree Context Block lines below — `WORKING_DIRECTORY`, `WORKTREE_BRANCH`, `REPO_SLUG`, and the trailing scope sentence — are defined in `claude/references/worktree-protocol.md` § Canonical Worktree Context Block Template. `REVISION_MODE` and `USER_FLAGS` are revision-specific additions. Per the format-change protocol defined in that subsection, do not edit the canonical lines in isolation; if the canonical format changes, update the subsection first, then update every consumer site in lockstep.)

   ```
   REVISION_MODE: true
   WORKING_DIRECTORY: {WORKTREE_PATH}
   WORKTREE_BRANCH: {WORKTREE_BRANCH}
   REPO_SLUG: {REPO_SLUG}
   USER_FLAGS: {comma-separated flags from original user request (e.g. --review-security), or "None"}
   All file operations and Bash commands must use this directory as the working root.

   ## Plan to Revise
   ~/.ai-tpk/plans/{REPO_SLUG}/{SESSION_TS}-{feature-slug}.md

   ## Reviewer Feedback

   {This block contains the current round's findings from re-running reviewers (Ruinor plus any user-flagged specialist), plus any carried-forward blocking findings from specialists not re-invoked this round -- per the canonical scoping rule above. Do not carry over *resolved* prior-round findings from re-running reviewers.}

   **Reviewer:** {reviewer name}
   **Verdict:** {REVISE | REJECT}

   ### F-1 ({severity}) -- {finding summary}
   {finding body}

   ### F-2 ({severity}) -- {finding summary}
   {finding body}

   **Reviewer:** {reviewer name}
   **Verdict:** {REVISE | REJECT}

   ### F-1 ({severity}) -- {finding summary}
   {finding body}

   ## Instructions
   Revise the plan at the path listed above to address all reviewer findings. Overwrite the existing file when done. Do not re-interview the user — the reviewer feedback above is your requirements input for this revision.
   ```
