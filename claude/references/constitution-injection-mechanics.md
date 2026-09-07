# Project Constitution Injection — Implementation Mechanics

This file documents the implementation mechanics of project-constitution injection, complementing the always-on invariants defined in the `### Project Constitution Injection` section of `claude/agents/dungeonmaster.md`.

The mechanics below describe DM's implementation specifically. Other delegating root contexts (e.g., the Wayblade delivery skill) follow the same shared block format (see `claude/references/constitution-block-format.md`) but may differ in worktree resolution and placement mechanics.

## Bootstrap exception

**Bootstrap exception:** The very first session in this repository that creates `.claude/constitution.md` (e.g., the session executing the bootstrap plan that introduced this file) will not see injection during its own Pathfinder and Bitsmith delegations, because the file does not exist on the branch the worktree was cut from at the moment those delegations are issued. Injection begins to fire as soon as the step that creates `.claude/constitution.md` completes — meaning Ruinor reviewing the bootstrap implementation will see the constitution injected, even though Pathfinder and Bitsmith producing it did not. This is an accepted bootstrap asymmetry; subsequent sessions in the same worktree (or any worktree cut from a branch where the file exists) will see injection from the first delegation onward.

## Mid-session amendment behavior

**Mid-session amendment behavior:** If `.claude/constitution.md` is created or modified mid-session, subsequent delegations in the same session re-read the file at delegation time and pick up the latest contents — DM does not cache the file body across delegations.

## Conditional/no-op behavior

**Conditional/no-op behavior:** If the resolved constitution path does not exist (bootstrap session before the file is created; DM operating in a different repo; file deleted), DM skips injection silently — no warning, no error.

## Injection placement (full ordering rules)

- For Pathfinder and Bitsmith delegations: insert the injected block **after** the Worktree Context Block (`WORKING_DIRECTORY:` / `WORKTREE_BRANCH:` / `REPO_SLUG:` lines and the trailing scope sentence) and **before** the task-specific delegation content (e.g., `## Investigation Request`, `## Confirmed Scope`, `## Plan to Revise`, or the equivalent task header for the delegation type). When `DOCS_HINT: true` is also being emitted (because `--docs` was detected in the user's message body — per the DOCS_HINT propagation rule in Phase 1 step 3 of claude/agents/dungeonmaster.md), it is placed **after** the Project Constitution Injection block and **before** the task-specific delegation content. Full delegation-prompt order for Pathfinder and Bitsmith is therefore: Worktree Context Block → Project Constitution Injection (when present) → `DOCS_HINT: true` (when present) → task-specific content. Both Constitution Injection and `DOCS_HINT: true` are composed by DM at delegation time; neither is part of any static template.
- For Ruinor delegations: Ruinor does not receive the Worktree Context Block (per the rule above). Insert the injected block at the very top of the delegation prompt, before any task-specific content.
