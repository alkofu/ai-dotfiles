# Project Constitution Injection — Implementation Mechanics

This file documents the implementation mechanics of project-constitution injection, complementing the always-on invariants defined in the `### Project Constitution Injection` section of `claude/agents/dungeonmaster.md`.

## Bootstrap exception

**Bootstrap exception:** The very first session in this repository that creates `.claude/constitution.md` (e.g., the session executing the bootstrap plan that introduced this file) will not see injection during its own Pathfinder and Bitsmith delegations, because the file does not exist on the branch the worktree was cut from at the moment those delegations are issued. Injection begins to fire as soon as the step that creates `.claude/constitution.md` completes — meaning Ruinor reviewing the bootstrap implementation will see the constitution injected, even though Pathfinder and Bitsmith producing it did not. This is an accepted bootstrap asymmetry; subsequent sessions in the same worktree (or any worktree cut from a branch where the file exists) will see injection from the first delegation onward.

## Mid-session amendment behavior

**Mid-session amendment behavior:** If `.claude/constitution.md` is created or modified mid-session, subsequent delegations in the same session re-read the file at delegation time and pick up the latest contents — DM does not cache the file body across delegations.

## Conditional/no-op behavior

**Conditional/no-op behavior:** If the resolved constitution path does not exist (bootstrap session before the file is created; DM operating in a different repo; file deleted), DM skips injection silently — no warning, no error.

## Per-delegation re-injection determination (issue #382)

**Determination:** Full, verbatim constitution injection is required on **every** Pathfinder, Bitsmith, and Ruinor delegation — there is no safe way to skip or abbreviate injection on the grounds that "the constitution was already injected earlier this session." A session-scoped "already injected" flag, or a hash-reference substitute (injecting a hash or pointer instead of the full body on subsequent delegations), is **not safe** and is explicitly rejected as an approach.

**Governing reason:** each receiving sub-agent is a fresh, stateless context with no memory of prior invocations and no visibility into other agents' delegations this session. The delegation prompt DM composes is that sub-agent's entire input; DM's own transcript (where any prior injection happened) is never shared with it. Consequently, "already injected earlier this session" is never true from the receiving agent's perspective — every delegation is, from that agent's point of view, the first and only time it has seen the constitution. Any mechanism that relies on session memory of a prior injection (a flag, a hash reference, or similar) would silently starve the receiving agent of the constitution text it needs to self-enforce Principles 1 and 2, and to have Ruinor detect violations of them.

This determination applies to DM's own behavior (what it composes into delegation prompts); it does not alter the injection mechanics, format, or agent list documented elsewhere in this file.

## Injection placement (full ordering rules)

- For Pathfinder and Bitsmith delegations: insert the injected block **after** the Worktree Context Block (`WORKING_DIRECTORY:` / `WORKTREE_BRANCH:` / `REPO_SLUG:` lines and the trailing scope sentence) and **before** the task-specific delegation content (e.g., `## Investigation Request`, `## Confirmed Scope`, `## Plan to Revise`, or the equivalent task header for the delegation type). When `DOCS_HINT: true` is also being emitted (because `--docs` was detected in the user's message body — per the DOCS_HINT propagation rule in Phase 1 step 3 of claude/agents/dungeonmaster.md), it is placed **after** the Project Constitution Injection block and **before** the task-specific delegation content. Full delegation-prompt order for Pathfinder and Bitsmith is therefore: Worktree Context Block → Project Constitution Injection (when present) → `DOCS_HINT: true` (when present) → task-specific content. Both Constitution Injection and `DOCS_HINT: true` are composed by DM at delegation time; neither is part of any static template.
- For Ruinor delegations: Ruinor does not receive the Worktree Context Block (per the rule above). Insert the injected block at the very top of the delegation prompt, before any task-specific content.
