# Investigative Gate Delegation Templates

These four templates are used by DM in the Phase 1 Investigative Gate. Each has a labeled subsection below.

## Tracebloom Delegation Template

(The first four lines of the template below are the canonical Worktree Context Block — see `claude/references/worktree-protocol.md` § Canonical Worktree Context Block Template for the source of truth. Per the format-change protocol defined in that subsection, do not edit these lines in isolation; if the canonical format changes, update the subsection first, then update every consumer site in lockstep.)

```
WORKING_DIRECTORY: {REPO_ROOT}
WORKTREE_BRANCH: (none — pre-worktree investigation)
REPO_SLUG: {REPO_SLUG}
All file operations and Bash commands must use this directory as the working root.
Note: this investigation runs **before** any session worktree is created. `{REPO_ROOT}` is the main repository root (`git rev-parse --show-toplevel`); `WORKTREE_BRANCH` is the literal string `(none — pre-worktree investigation)`.

## Investigation Request

**Reported symptom:** "{user's description of the problem, verbatim}"

**Error messages or context (if any):**
{any error output, logs, or additional context the user provided, or "None provided." if absent}

## Instructions
Investigate the reported symptom. Produce a Diagnostic Report with all 5 required fields. Do not plan or fix -- investigate only.
```

## Premise Check Template

```
Tracebloom completed its investigation. Before I hand this off to Pathfinder for planning, please confirm the diagnosis matches your understanding of the problem.

**Root cause:** {one-sentence root cause}

**Affected files/components:**
- {file or component 1}
- {file or component 2}
- {…}

**Recommended next action:** {verbatim recommended next action}

Reply with "proceed" to continue to planning, or describe any corrections or scope adjustments you would like Pathfinder to incorporate.
```

## Diagnostic Report Handoff to Pathfinder Template

(The first four lines of the template below are the canonical Worktree Context Block — see `claude/references/worktree-protocol.md` § Canonical Worktree Context Block Template for the source of truth. Per the format-change protocol defined in that subsection, do not edit these lines in isolation; if the canonical format changes, update the subsection first, then update every consumer site in lockstep.)

```
WORKING_DIRECTORY: {WORKTREE_PATH}
WORKTREE_BRANCH: {WORKTREE_BRANCH}
REPO_SLUG: {REPO_SLUG}
All file operations and Bash commands must use this directory as the working root.

The following Diagnostic Report was produced by Tracebloom after investigating a user-reported issue. Use it as your problem definition input. Do not re-investigate facts already established in this report.

**Path translation note:** the Diagnostic Report below was produced before this worktree existed. Any absolute file paths in the report's `Evidence` section are rooted at the main repository (`{REPO_ROOT}`). When you read those files, substitute `{WORKTREE_PATH}` for the `{REPO_ROOT}` prefix — the file contents are byte-identical between the main repo at `HEAD` and this worktree's initial commit, assuming a clean main-repo working tree at investigation time; if the main repo had uncommitted changes when Tracebloom ran, some evidence paths may reflect those changes rather than HEAD. Do not attempt to read or write files at the original main-repo paths.

{Tracebloom's Diagnostic Report, verbatim -- this is the single, one-time verbatim passthrough authored at handoff; it is the report's single reproduction point downstream (see `dungeonmaster.md` Investigative Gate preventive guardrail)}

[Rest of Pathfinder delegation as normal]
```

## Diagnostic Report Handoff to Bitsmith (Trivial-Fix Branch) Template

(The first four lines of the template below are the canonical Worktree Context Block — see `claude/references/worktree-protocol.md` § Canonical Worktree Context Block Template for the source of truth. Per the format-change protocol defined in that subsection, do not edit these lines in isolation; if the canonical format changes, update the subsection first, then update every consumer site in lockstep.)

```
WORKING_DIRECTORY: {WORKTREE_PATH}
WORKTREE_BRANCH: {WORKTREE_BRANCH}
REPO_SLUG: {REPO_SLUG}
All file operations and Bash commands must use this directory as the working root.

The following Diagnostic Report was produced by Tracebloom after investigating a user-reported issue. Tracebloom's `Recommended next action` field marked the fix as trivial; you are being delegated directly (Pathfinder is skipped). Use the report as your problem definition input. Do not re-investigate facts already established in this report.

**Path translation note:** the Diagnostic Report below was produced before this worktree existed. Any absolute file paths in the report's `Evidence` section are rooted at the main repository (`{REPO_ROOT}`). When you read those files, substitute `{WORKTREE_PATH}` for the `{REPO_ROOT}` prefix — the file contents are byte-identical between the main repo at `HEAD` and this worktree's initial commit, assuming a clean main-repo working tree at investigation time; if the main repo had uncommitted changes when Tracebloom ran, some evidence paths may reflect those changes rather than HEAD. Do not attempt to read or write files at the original main-repo paths.

{Tracebloom's Diagnostic Report, verbatim -- this is the single, one-time verbatim passthrough authored at handoff; it is the report's single reproduction point downstream (see `dungeonmaster.md` Investigative Gate preventive guardrail)}

## Instructions
Implement the trivial fix described in the report's `Recommended next action`. Follow the standard Bitsmith implementation protocol. Do not modify scope beyond what the report identifies.
```
