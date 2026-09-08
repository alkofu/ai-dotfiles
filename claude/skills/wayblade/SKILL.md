---
name: wayblade
description: Manually-invoked delivery-contract skill. A single continuous Claude Code context owns an entire delivery end-to-end — clarify, plan, implement, debug, validate, docs, commit/push, PR — delegating only for the mandatory Ruinor review and for specialists on explicit request. Use when one session should carry a whole change without full multi-agent orchestration.
argument-hint: "[--self-review] [review flags] <contract>"
disable-model-invocation: true
---

# Wayblade — Single-Context Delivery Contract

<!--
Behavioral note: `disable-model-invocation: true` removes this skill's `description`
from Claude's context entirely, so Wayblade never fires from model auto-invocation.
As of Claude Code v2.1.196 that flag also prevents the skill from firing via
scheduled tasks. Both consequences are intended for a manual-only skill — do not
mistake them for a defect. `user-invocable` is deliberately left at its default
(true) so Wayblade stays visible in the `/` menu; do not set it to `false`.
-->

Wayblade is invoked manually (`/wayblade`) when a user wants **one** continuous Claude Code context to own a whole delivery contract, rather than the full Dungeon Master multi-agent orchestration.

## Ownership + DM boundary

A single continuous root context owns the full delivery contract end-to-end: **clarify → plan → implement → debug → validate → docs → commit/push → PR**. This root context does the work itself with its full tool set — it does not decompose the contract across a planner/implementer/reviewer team. The only mandatory delegation is the Ruinor review gate (below); specialists are delegated only on explicit request.

**Topology-drift escape valve (routing by topology, not task size):** if mid-stream the work turns out to be *multiple independent streams*, or it *needs formal planner/implementer separation*, or it *needs the resumable audit lifecycle*, **STOP and recommend starting a fresh Dungeon Master session.** This is a routing decision about the shape of the work, not its size — a large-but-single-stream contract stays in Wayblade; a small-but-genuinely-multi-stream one does not.

## Constitution handling

Wayblade reads the target repo's `.claude/constitution.md` directly (root session, real cwd) — there is no heavyweight preflight. Constitution injection happens at exactly **one** point: the Ruinor delegation handoff.

## Ruinor handoff (mandatory gate)

Mirror the Dungeon Master's handoff. The Ruinor delegation prompt contains:

- A `## Project Constitution` block at the **top** of the prompt, formatted per the shared block format in `claude/references/constitution-block-format.md` (wrap the verbatim contents of the target repo's `.claude/constitution.md`).
- The **worktree-absolute** file paths of the changed files.
- Changed-files / commit-range context so Ruinor can locate the work; **Ruinor runs its own `git diff`** and is **NOT** given the Worktree Context Block.

**Conditional constitution injection:** include the `## Project Constitution` block **only when** the target repo's `.claude/constitution.md` exists. Wayblade is installed globally and invoked in arbitrary repos, most of which will NOT contain that file (it is ai-tpk-specific). When the file is absent, **skip constitution injection silently — no warning, no error, and no empty, placeholder, or hallucinated block** — exactly mirroring DM's conditional/no-op behavior. Everything else in the Ruinor handoff is unchanged.

## Gate 1 — Review (do not skip)

**Before declaring the contract done, you MUST call Ruinor.** This gate is mandatory by default and is waivable **only** via the `--self-review` flag. When `--self-review` is passed, do not silently self-approve: present the raw diff and collect a verdict, acting purely as a conduit for the review outcome. Absent `--self-review`, a contract is never "done" until Ruinor has reviewed it.

## Gate 2 — Validate before PR (do not skip)

**Before opening any PR, you MUST run the `validate-before-pr` skill.** No PR is opened until its lint and format checks pass.

Both gates above are written as deliberately unmissable prose for compaction/salience resilience — so they survive long contexts and are not dropped when the conversation is compacted. (The compaction-resilience rationale is partly empirical, not an over-engineered guarantee.)

## Delivery

Invoke the existing skills in order — do not reproduce their contents: use `commit-message-guide` for commit messages, run `validate-before-pr` as the pre-PR gate, then use `open-pull-request` to open the PR.

## Specialists

Specialists (Riskmancer / Windwarden / Knotcutter / Truthhammer) run on **explicit request only** — Wayblade does not reproduce DM's specialist-triggering matrix.

## Worktrees + capability-gap note

Use native `claude -w` worktrees. Wayblade intentionally does **NOT** reproduce DM's `.worktrees/` sidecar subroutine, plan-file lifecycle, resumability, or audit trail. These are deliberate trade-offs for a lean single-context path — when a contract genuinely needs them, use the topology-drift escape valve and recommend a fresh DM session.
