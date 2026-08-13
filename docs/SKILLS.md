# Agents, References, and Skills

This document covers agents (with a pointer to the full roster), the shared reference files catalog, and the skills catalog (mandatory and additional).

## Agents (`claude/agents/`)

Agents are specialized AI assistants that help with specific tasks. They are automatically available in Claude Code.

See [docs/AGENTS.md](/docs/AGENTS.md) for the agent roster and quick reference. For detailed operational specs, tool lists, and workflows, see each agent's config file in `claude/agents/{name}.md`.

**Invoking an agent:**
Simply @-mention the agent by name (e.g., `@quill` or `@riskmancer`) in your Claude conversation to activate it.

## References

Reference files contain shared behavioral vocabulary loaded by agents at runtime. These files eliminate duplication across multiple agent definitions and ensure consistency in how agents apply shared concepts.

### Available References

- **`bash-style.md`** — Required Bash command style for all agents with Bash tool access. Defines six enforced rules: no compound commands (`&&`, `;`), no process substitution (`<(`, `>(`), no `--no-verify` on git commands, no command substitution (`$(...)`) or heredoc patterns in git commit commands (use multiple `-m` flags instead), no command substitution in redirect targets (use the Write tool for `~/.ai-tpk/` paths; inline a pre-computed literal path otherwise), and no `awk`/`sed` for line-range file reads (use the Read tool's `offset` and `limit` parameters instead). The PermissionRequest hook enforces the first three rules automatically; the last three are instruction-level overrides — Guard 5 (`is_simple_expansion_only`) in `permission-learn.sh` enforces rules four and five, and `awk`/`sed` are excluded from `allowedTools` so any invocation falls through to the manual dialog.

- **`implementation-standards.md`** — Shared behavioral norms for implementation, planning, and review agents: Minimal Diff, YAGNI, and Test-First Protocol. Bitsmith, Pathfinder, Ruinor, and Knotcutter cite this as the canonical source. Each agent may elaborate with role-specific depth in its own definition file.

- **`verdict-taxonomy.md`** — Shared verdict labels (REJECT, REVISE, ACCEPT-WITH-RESERVATIONS, ACCEPT) and severity scales (Ruinor's CRITICAL/MAJOR/MINOR and Specialist CRITICAL/HIGH/MEDIUM/LOW). Reviewer agents load this reference when issuing verdicts. Defines shared vocabulary while noting that domain-specific application is defined per-agent.

- **`worktree-protocol.md`** — Shared rules for interpreting the `WORKING_DIRECTORY:` context block. Agents that operate in isolated git worktrees load this reference to ensure consistent path handling across all file operations and bash commands.

- **`completion-templates.md`** — Four rigid per-command completion report templates and a shared Common Fields block. Defines what the DM must emit at the end of each pipeline: Template A (Constructive, `/feature`), Template B (Investigative, `/bug`), Template C (Operational PR, `/open-pr`), and Template D (Post-Merge, `/merged` and `/merge-pr`). The DM output contract references this file; templates are verbatim formats with no formatting discretion left to the model.

- **`dm-routing-examples.md`** — Worked routing examples for the Dungeon Master, covering multi-step plans, trivial changes, user flags, explore-options, worktrees, intake, investigation, scope confirmation, advisory queries, ops reports, and operational write actions via `/do`.

- **`github-auth-probe.md`** — Canonical procedure for verifying GitHub account access before pushing or committing. Referenced by the `commit-message-guide` and `open-pull-request` skills.

- **`review-gates.md`** — Shared two-gate review framework (Plan Review Gate and Implementation Review Gate) for all reviewer agents. Defines universal operational constraints and plan-file-scoping rules.

- **`quill-documentation-style.md`** — Documentation style guide used by Quill when authoring and updating documentation.

- **`agent-model-policy.md`** — Documents the three-priority model resolution chain, why Bitsmith uses `model: inherit` while all other 13 agents remain pinned, the exhaustive per-tier pinning enumeration (Opus=4, Sonnet=8, Haiku=1, Inherit=1), the alias-only constraint on per-invocation overrides, and the discipline for adding future override call sites.

- **`specialist-triggering.md`** — Canonical keyword list for the Dungeon Master's heuristic-fallback specialist-routing logic. Covers four keyword categories (security, performance, complexity, factual validation) and their corresponding specialist suggestions. DM consults this only when no user flag is present and Ruinor has not recommended specialists. Also documents why Truthhammer's keyword set is intentionally narrow. See [docs/adrs/REVIEW_WORKFLOW.md](/docs/adrs/REVIEW_WORKFLOW.md) for the broader specialist-triggering decision model.

- **`conflict-resolution-rebase.md`** — Canonical algorithm for resolving merge conflicts during a `git rebase`. Covers conflict detection, per-file resolution strategy (preserving the incoming branch's intent), round-limit guardrails, abort conditions, and the rebase-continue loop. Consumed by the `open-pull-request` skill (sub-step 6c) and the `/resolve-conflicts` command as thin pointers to this single authoritative source.

- **`constitution-injection-mechanics.md`** — Implementation mechanics for project-constitution injection in Dungeon Master delegations. Covers the bootstrap exception (when injection begins firing relative to file creation), mid-session amendment behavior (re-reading the file at each delegation), conditional/no-op behavior (silent skip when the file is absent), and the full injection placement ordering rules for Pathfinder, Bitsmith, and Ruinor delegation prompts. Loaded on-demand by DM; extracted from `dungeonmaster.md` to reduce always-on token cost.

- **`templates/`** — Delegation template bodies extracted from the Dungeon Master agent to keep its always-on prefix lean. Six files, each holding verbatim prompt text that DM embeds when delegating to sub-agents: `intake-gate-templates.md` (Askmaw and Pathfinder handoff), `investigative-gate-templates.md` (Tracebloom, Pathfinder handoff, Bitsmith trivial-fix, and Premise Check), `revision-delegation.md` (Phase 2 REVISE loop), `do-singlecommand-bitsmith-delegation.md` (`--execute` single-command path), `do-multistep-bitsmith-delegation.md` (`--execute` multi-step path), and `save-report-bitsmith-delegation.md` (Advisory Workflow `--save-report` write-task delegation). DM loads each file on demand via a precondition-framed pointer sentence; no other agents currently consume these files.

When updating a reference file, changes apply automatically to all agents that load it — no individual agent files need modification.

## Skills (`claude/skills/`)

Skills are reusable capabilities that enhance Claude's functionality. Three mandatory global skills are enforced via `CLAUDE.md`:

- **`commit-message-guide`** — Enforces conventional commit format for all git commits
- **`validate-before-pr`** — Runs lint and format checks (via stack detection: npm, Make, Python, Go, Rust) before opening a PR; gates PR creation on passing checks
- **`open-pull-request`** — Creates pull requests with conventional naming, draft mode, and pre-flight validation; covers post-creation lifecycle: mandatory implementation review and acting on reviewer feedback

Additional skills (non-mandatory):

- **`write-reliable-tests`** — Guides authorship and review of deterministic, isolated, and idempotent automated tests across unit, integration, and e2e levels; applied automatically whenever test code is being written or evaluated
- **`file-organization`** — Structural reference for file, module, and directory organization: when to split or merge files, when to create a new directory, where test files should live (co-located vs. separate `tests/`), and how to name directories so their responsibility is immediately legible
- **`bash-code-quality`** — Defensive coding standards for bash scripts authored as deliverables: strict mode, safe quoting, error trapping, recurring patterns, and anti-patterns; applied automatically when writing or editing `.sh` files or scripts with a bash shebang
- **`skill-creator`** — Creates and improves skills in this repository
- **`task-observer`** — Captures lightweight session observations (friction, repeated mistakes, workarounds) as individual timestamp-and-pid-namespaced files under `~/.ai-tpk/observations/`. Observations are reviewed and turned into skill improvements via `/review-observations`, with explicit user approval on a literal unified diff before any skill file is touched. Activates by description-match; does not modify skills autonomously.
- **`code-review`** — Defines the high-signal review contract for code and diff reviews: three reportable categories, five suppressed categories, a two-pass identify-then-validate workflow, and a three-verdict structure mapped to Ruinor's verdict taxonomy. Apply whenever reviewing a PR, diff, or changeset, or answering "is this safe to merge?"
- **`doc-review`** — Read-only documentation gap-detection methodology. Defines a structured discovery process across four analysis areas (Coverage, Accuracy, Discoverability, Onboarding Readability) and a three-tier finding classification (Critical, Important, Polish), with false-positive suppression rules. Used by Quill during its Gap Analysis step.
