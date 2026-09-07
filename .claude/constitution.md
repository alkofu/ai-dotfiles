# Project Constitution — ai-tpk

This file defines repo-scoped invariants that govern all work in this repository. Violations of these principles must be caught at plan review (Ruinor) and rejected before execution proceeds. Because globally-installed agents (Pathfinder, Bitsmith, Ruinor) live at `~/.claude/agents/` and cannot load repo-scoped instructions from `~/.claude/`, the delegating root context (e.g., the Dungeon Master, or the Wayblade delivery skill) bridges the gap by inlining this constitution into every constitution-bearing (Pathfinder, Bitsmith, Ruinor) delegation prompt at delegation time.

## Definitions

**Session artifact:** any file written during a session that captures session-specific runtime state, output, or context. **Canonical anti-pattern (do not remove):** `~/.ai-tpk/session-context/current.json` from PR #187 — this example is the canonical reference for session-artifact violations across all agent definitions. Session artifacts MUST be session-namespaced (e.g., prefixed with `SESSION_TS` or a session-unique identifier) and MUST NOT use fixed/singleton paths shared across sessions.

**Static artifact:** any file that is not a session artifact — including documentation (e.g., `.claude/constitution.md`, `.claude/CLAUDE.md`), agent definitions (e.g., `~/.claude/agents/*.md`), configuration files (e.g., `claude/settings.json`), and per-repo (not per-session) artifacts. Static artifacts MAY use fixed paths. The shared parent directory `~/.ai-tpk/plans/{REPO_SLUG}/` is itself static; the per-session files inside it are session artifacts and ARE session-namespaced (e.g., `{SESSION_TS}-{feature-slug}.md`).

## Principle 1 — Parallel Session Isolation

ai-tpk is designed to support multiple sessions running concurrently. Every design, plan, and implementation must respect this invariant.

- Each session runs in its own isolated worktree — no two sessions share a working directory.
- No agent, hook, or artifact may write to a fixed/singleton path shared across sessions. (See Definitions above for what counts as a session artifact and the canonical anti-pattern.)
- All session artifacts (plan files, sidecar files, open-questions files) must be session-namespaced (e.g., prefixed with `SESSION_TS` or a session-unique identifier).
- No agent definition may assume it is the only active session.

## Principle 2 — Install-time Self-Containment

All artifacts in `claude/` (agents, skills, commands, hooks, references, settings) must be fully self-contained after `install.sh` copies them to `~/.claude/`. No runtime back-references to the repository are permitted — no relative paths that assume the repo exists on disk, no symlinks to repo directories, no instructions to read files at `.claude/` paths that only exist in the repo working tree.

## How These Principles Are Enforced

Three mechanisms enforce these principles across all work in this repository:

- **(a) `.claude/CLAUDE.md` summary** — the project-scope CLAUDE.md includes a `## Project Constitution` section that names both principles, summarises them, and points here as the canonical source. Any reader of the project-scope instructions sees the principles without needing the DM injection path.
- **(b) DM injection** — `claude/agents/dungeonmaster.md`'s `### Project Constitution Injection` section specifies how DM inlines this file's contents into every Pathfinder, Bitsmith, and Ruinor delegation prompt. This is the primary/canonical enforcement path — see the preamble above for why. Other delegating root contexts (e.g., the Wayblade delivery skill) inject via the same shared block format; DM remains the enforcement backbone.
- **(c) Agent-level hooks** — `claude/agents/ruinor.md`'s `#### Constitution Compliance Check` section (in Phase 3) makes both principles explicit checklist items on every plan and implementation review. `claude/agents/bitsmith.md`'s "What Bitsmith Does NOT Touch" list names constitutional violations as a halt-and-escalate condition so conflicts surface before implementation rather than at review time.

**Severity rule.** A demonstrable violation of either principle is at minimum a MAJOR finding and may be CRITICAL depending on impact. The verdict for an artifact containing an unresolved constitutional violation must not be ACCEPT.

**Worked example.** Positive (anti-pattern, must reject): a plan step that writes `~/.ai-tpk/foo/current.json` is a violation. Negative (acceptable, do not flag): a plan step that creates `.claude/constitution.md` at a fixed path is acceptable because `.claude/constitution.md` is a static artifact per the Definitions section above.
