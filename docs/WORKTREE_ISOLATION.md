# Parallel DungeonMaster Sessions via Git Worktrees

## Overview

The Dungeon Master orchestration agent now supports **parallel isolated sessions** via Git worktrees. This feature enables multiple simultaneous `claude --agent dungeonmaster` terminals to work on unrelated issues without git conflicts or interference.

Each constructive or investigative DungeonMaster session automatically creates a dedicated git worktree on an isolated branch, ensuring clean separation of concerns and enabling truly parallel development workflows.

## Agent Artifacts Storage

Agent-produced artifacts (plans, open-questions files, lessons) are stored in user-global directories under `~/.ai-tpk/` to decouple them from worktree lifecycle and make them accessible across repositories:

- **Plans** → `~/.ai-tpk/plans/{repo-slug}/` — One subdirectory per repository, containing plan files and associated open-questions files
- **Lessons** → `~/.ai-tpk/lessons/` — Flat structure for Everwise Scout analysis recommendations (cross-repo)

These directories are created automatically when you run `install.sh`.

## Quick Start

### Running Parallel DungeonMaster Sessions

Start your first DungeonMaster session normally:

```bash
claude --agent dungeonmaster
# Prompt: "Add OAuth login"
```

The session automatically:
1. Captures session variables (Phase 0)
2. Creates an isolated git worktree at `.worktrees/feat-add-oauth-login/` (Phase 1)
3. Creates a dedicated branch `feat/add-oauth-login`
4. Executes all planning, implementation, and reviews within that worktree
5. Logs the branch as ready at completion; run `/open-pr` to create a pull request or handle cleanup manually

In another terminal, start a second DungeonMaster session:

```bash
claude --agent dungeonmaster
# Prompt: "Fix database query performance on issue #42"
```

Both sessions operate independently:
- Session 1 works on branch `feat/add-oauth-login` in `.worktrees/feat-add-oauth-login/`
- Session 2 works on branch `fix/db-perf-issue-42` in `.worktrees/fix-db-perf-issue-42/`
- No git conflicts, no interference, completely isolated development

## How It Works

### Phase 0: Session Variable Capture

DM performs **Phase 0: Session Isolation** before any other work. Phase 0 only captures session-scoped variables in conversation memory — no worktree is created here.

For the authoritative Phase 0 specification — including the exact variable definitions, the re-entry guard logic, slash-command bypass behavior, and session reset triggers — see [`claude/agents/dungeonmaster.md`](/claude/agents/dungeonmaster.md#phase-0-session-isolation).

### Phase 1: Worktree Creation Subroutine

Worktree creation happens in **Phase 1**, not Phase 0. After intent classification, the routing branch invokes the **Worktree Creation Subroutine** when required.

For the authoritative subroutine specification — including branch-name derivation rules with conventional commit prefixes, the exact Bash command sequence delegated to Bitsmith, branch-collision retry logic (numeric suffix retries, fallback after 3 failures), and session-context propagation — see [`claude/references/worktree-creation-subroutine.md`](/claude/references/worktree-creation-subroutine.md).

### When a Worktree is Created vs. Not Created

The subroutine is invoked **only by routing branches that require implementation work**. Advisory sessions never invoke it:

| Session type | Worktree created? |
|---|---|
| Constructive (`/feature`, free-form feature request) | Yes — subroutine invoked in Phase 1 |
| Investigative (`/bug`, free-form "why is X broken?") | Conditional — subroutine is **deferred** until after Tracebloom's Diagnostic Report. Created only when the report routes to a fix (Pathfinder or Bitsmith); skipped entirely on "Inconclusive" (and user does not proceed) or "No bug found." |
| Advisory (`/ask`, `/ops`, `/do`, free-form questions) | No — advisory branches do not invoke the subroutine |

Advisory sessions (`INTENT: advisory`) bypass the constructive/investigative pipeline entirely. They capture session variables in Phase 0 but never proceed to a routing branch that invokes the subroutine. No worktree, no plan file, no code changes.

### Worktree Structure

After the subroutine completes, your repository structure looks like:

```
.
├── .git/                        # Main repo git directory (shared across worktrees)
├── .worktrees/                  # Worktrees directory (gitignored)
│   ├── feat-add-oauth-login/    # Session 1 worktree
│   │   ├── .git                 # Pointer to main .git (shared objects)
│   │   ├── src/
│   │   └── ...
│   └── fix-db-perf-issue-42/    # Session 2 worktree
│       ├── .git
│       └── ...
├── src/
├── ~/.ai-tpk/plans/{repo-slug}/ # Plans (user-scoped, outside repo)
└── .gitignore                   # Contains .worktrees/
```

## Managing Worktrees

### Listing Active Worktrees

To see all active worktrees:

```bash
git worktree list
```

Output example:

```
/path/to/repo                     abc1234 [main]
/path/to/repo/.worktrees/feat-add-oauth-login
                                  def5678 [feat/add-oauth-login]
/path/to/repo/.worktrees/fix-db-perf-issue-42
                                  ghi9012 [fix/db-perf-issue-42]
```

### Cleanup

At Phase 5 (session completion), DungeonMaster logs the branch as ready and advises you to run `/open-pr`. The worktree and branch are always preserved — nothing is removed automatically.

Use standard git worktree commands to remove stale worktrees and branches:

```bash
git worktree remove .worktrees/{slug}
git worktree prune
git branch -d feat/{slug}
```

Or use the `/merged` command after a PR is merged — it removes the worktree and local branch automatically.

## Worktree Awareness in Sub-Agents

When a DungeonMaster session has an active worktree, Pathfinder, Bitsmith, Quill, and Tracebloom automatically receive the worktree context block:

```
WORKING_DIRECTORY: /absolute/path/to/.worktrees/feat-add-oauth-login
WORKTREE_BRANCH: feat/add-oauth-login
REPO_SLUG: my-project
All file operations and Bash commands must use this directory as the working root.
```

(Bitsmith delegations may also include a `SKIP_TREE_AUDIT: true` line outside this block — see "Bitsmith's Worktree Safeguards" below. `REPO_SLUG:` is always present.)

Sub-agents respect this context:

- **Pathfinder:** Writes plans to `~/.ai-tpk/plans/{REPO_SLUG}/` (user-scoped, not worktree-relative)
- **Bitsmith:** Performs all code changes within the worktree; commits land on the worktree's branch
- **Quill:** Writes documentation updates relative to the worktree
- **Tracebloom:** Reads files from the worktree when investigating

Ruinor does not receive the worktree context block. Instead, DM inserts a `## Project Constitution` block at the top of every Ruinor delegation prompt. For the full injection logic — detection path, bootstrap exception, and placement rules — see [`claude/agents/dungeonmaster.md`](/claude/agents/dungeonmaster.md) (Project Constitution Injection section).

### Bitsmith's Worktree Safeguards

Bitsmith has two complementary safeguards that enforce write isolation when a session worktree is active.

**Path Mismatch Guard** fires before every Write, Edit, or file-modifying Bash command and verifies that the target path sits under `WORKING_DIRECTORY`. It prevents silent writes to the main working tree. For the authoritative specification, see [`claude/agents/bitsmith.md`](/claude/agents/bitsmith.md#path-mismatch-guard).

**Working-Tree Audit** fires once per invocation, immediately before the first write. By default it runs `git -C {WORKING_DIRECTORY} status --porcelain` and halts if the worktree is unexpectedly dirty (or the command itself fails), surfacing a structured `## Working-Tree Audit Halt` report to DM rather than silently writing into a contaminated worktree. DM may suppress the audit by emitting `SKIP_TREE_AUDIT: true` in the delegation prompt for re-delegations into a worktree where prior in-session writes are expected. For the authoritative specification, see [`claude/agents/bitsmith.md`](/claude/agents/bitsmith.md#working-tree-audit).

## Phase 5 Completion Log

At session completion (Phase 5), DungeonMaster logs a status line and leaves the worktree and branch intact:

```
Branch `feat/add-oauth-login` is ready at `.worktrees/feat-add-oauth-login`.
Run `/open-pr` to create a pull request, or handle cleanup manually.
```

No interactive prompt is shown. The worktree is never removed automatically. When you are ready to create a PR, run `/open-pr` in the same session or a new session. When you are done with the worktree, clean up manually:

```bash
git worktree remove .worktrees/feat-add-oauth-login
git branch -d feat/add-oauth-login
```

For the authoritative Phase 5e specification, see [`claude/agents/dungeonmaster.md`](/claude/agents/dungeonmaster.md#phase-5-completion).

## Example: Two Parallel Sessions

### Session 1: OAuth Implementation

**Terminal A:**

```bash
$ claude --agent dungeonmaster
> Add OAuth login to the authentication system
...
[Phase 0: session variables captured]
[Phase 1: Worktree Creation Subroutine creates .worktrees/feat-add-oauth-login/ on branch feat/add-oauth-login]
[Pathfinder creates plan at ~/.ai-tpk/plans/{repo-slug}/20260401-143022-add-oauth-login.md]
[Bitsmith implements OAuth in the worktree]
[Ruinor and Riskmancer review in the worktree context]
[Quill updates documentation in the worktree]
...
Branch `feat/add-oauth-login` is ready at `.worktrees/feat-add-oauth-login`. Run `/open-pr` to create a pull request, or handle cleanup manually.
```

### Session 2: Database Performance

**Terminal B (same time):**

```bash
$ claude --agent dungeonmaster
> Fix slow database queries on issue #42
...
[Phase 0: session variables captured]
[Phase 1: Investigative Gate fires — Tracebloom investigates against main repo root (no worktree yet)]
[Tracebloom returns Diagnostic Report — root cause: missing index on frequently-filtered column]
[Premise Check surfaced to user — user confirms diagnosis]
[Phase 1: Worktree Creation Subroutine invoked now (post-investigation) — branch named from root cause fix-essence]
[Worktree created at .worktrees/fix-db-perf-issue-42/ on branch fix/db-perf-issue-42]
[Pathfinder creates plan at ~/.ai-tpk/plans/{repo-slug}/20260401-144500-fix-db-perf-issue-42.md]
[Bitsmith implements query fixes in the worktree]
[Ruinor and Windwarden review in the worktree context]
...
Branch `fix/db-perf-issue-42` is ready at `.worktrees/fix-db-perf-issue-42`. Run `/open-pr` to create a pull request, or handle cleanup manually.
```

**Result:**
- Session 1: Branch `feat/add-oauth-login` preserved at `.worktrees/feat-add-oauth-login`; run `/open-pr` when ready
- Session 2: Branch `fix/db-perf-issue-42` preserved at `.worktrees/fix-db-perf-issue-42`; run `/open-pr` when ready
- Main branch untouched until you merge or create a PR
- Zero git conflicts between sessions

## Advisory Sessions: No Worktree

Advisory sessions (triggered via `/ask`, `/ops`, `/do`, or any free-form question classified as advisory) never create a worktree:

```bash
$ claude --agent dungeonmaster
> How does the session isolation work with worktrees?
...
[Phase 0: session variables captured]
[Advisory branch: Worktree Creation Subroutine not invoked]
[DM answers directly via Phases A-B-C — no plan, no code, no worktree]
```

The advisory workflow bypasses the entire constructive/investigative pipeline. No `.worktrees/` entry is created, no branch is created, and no plan file is written.

For the authoritative bypass rule, see [`claude/agents/dungeonmaster.md`](/claude/agents/dungeonmaster.md#phase-1-planning) — the advisory branch of the Mutual Exclusivity note.

## Workflow Flags Summary

| Flag | Effect | Use Case |
|------|--------|----------|
| `--explore-options` | Scope-exploration mode: invoke Pathfinder to surface scope and implementation options, then stop before plan generation until the user confirms | Architectural decisions, technology selection, multiple viable paths |
| `--trivial` / `-t` | Asserts the trivial tier for a single-file, single-unambiguous-change task: skips Pathfinder and Phase 2 Ruinor plan review, subject to the Case A/Case B doubt rule and a post-hoc diff-size guardrail. Phase 4 Ruinor implementation review still runs unless `--self-review` is also present. | Typo fixes, one-line config tweaks, and other self-evidently trivial single-file changes |
| `--self-review` / `-S` | Implies `--trivial` and additionally waives the Phase 4 Ruinor implementation review: DM presents the raw diff verbatim and the user returns one of the four standard verdicts (REJECT / REVISE / ACCEPT / ACCEPT-WITH-RESERVATIONS) directly, with DM acting as a pure conduit. | Trivial changes the user wants to review personally instead of delegating to Ruinor |

Note: the `--explore-options`, `--trivial`, and `--self-review` flags are constructive-pipeline flags. They have no effect when the session is classified as advisory (`INTENT: advisory`) — `--trivial`/`--self-review` are captured-but-ignored-with-warning in that case. See the `--trivial` and `--self-review` rows in DM's Workflow Flags table (`claude/agents/dungeonmaster.md`) for the full definition, including the Case A/Case B doubt rule and diff-size guardrail.

## Troubleshooting

### "Branch already exists" Error

If you see this error during worktree creation:

```
fatal: 'feat/add-oauth-login' already exists.
```

**Solution:** The branch already exists from a previous session. Either:

1. Delete the stale branch: `git branch -D feat/add-oauth-login`
2. Start a new session with a different task description
3. Use `/clean-the-desk` to remove merged branches and their worktrees in bulk

DungeonMaster retries with a numeric suffix (e.g., `feat/add-oauth-login-2`) after 3 attempts before falling back to the main working tree.

### Stale or Crashed Worktrees

If a session crashes before Phase 5, use the cleanup commands above to remove the orphaned worktree and branch.

### Worktree on Wrong Branch

If you manually switch branches within a worktree, git may confuse the worktree state. To fix:

```bash
git worktree remove .worktrees/feat-corrupted-task
git worktree prune
```

### Merge Conflicts When Merging Manually

Merge conflicts are resolved in the worktree using standard git conflict resolution. See standard git documentation for merge conflict workflows. Clean up the worktree and branch when done (see Cleanup above).

## Design Rationale

Worktree isolation was introduced to solve a critical limitation: multiple concurrent DungeonMaster sessions on the same repository would conflict over:

- **Shared git working tree:** Both sessions modify the same files simultaneously
- **Shared branch:** Both sessions try to checkout different branches, causing confusion
- **Shared plans/ directory:** Both sessions try to write plans to the same files

Git worktrees provide a lightweight solution:

- Each worktree has its own working directory
- Each worktree can be on a different branch
- Worktrees share git object storage (efficient)
- Cleanup is simple: `git worktree remove`

Deferring worktree creation to Phase 1 (rather than Phase 0) means advisory sessions never incur the cost of worktree creation, and re-entry guard continuations don't redundantly create a second worktree for an already-established session.

## Best Practices

1. **Use descriptive task descriptions** so worktree branch names are meaningful
   - Good: "Add OAuth login with multi-factor authentication"
   - Bad: "Stuff"

2. **Monitor your worktrees** periodically — see the Cleanup section above for the commands.

3. **Clean up worktrees after completion**
   - Stale worktrees consume disk space
   - `git worktree remove` is quick and safe
   - `/merged` automates cleanup after a PR is merged

4. **Run `/open-pr`** to create a pull request when your branch is ready
   - The worktree stays active for feedback iteration after the PR is created
   - Delete the worktree when the PR is merged

5. **Merge manually** when you are confident the work needs no review — then remove the worktree and branch (see Cleanup section above).

## Related Documentation

- [Agent Reference: Dungeon Master](/docs/AGENTS.md#dungeon-master---orchestrator) - Orchestration workflow details
- [Hooks](/docs/HOOKS.md) - Settings and the four Claude Code hooks
- [MCP Servers](/docs/MCP.md) - MCP server roster and configuration
- [Slash Commands](/docs/SLASH_COMMANDS.md) - Available slash commands
- [Review Workflow](/docs/adrs/REVIEW_WORKFLOW.md) - Quality gate and review process
