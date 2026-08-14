# Step 3 Verification Notes: auto-rebuild dist bundle hooks

This file records the manual verification performed for Step 3 of the plan
`20260813T090033-auto-rebuild-stale-dist-bundle.md` ("Verify the rebuild fires on the right
operations and not the wrong ones"). It covers the `post-merge` / `post-checkout` / `post-rewrite`
hooks in `lefthook.yml` that invoke `scripts/rebuild-dist-if-installer-changed.js`.

Environment: `git version 2.50.1 (Apple Git-155)`, `lefthook v2.1.10`, run inside the worktree
`.worktrees/stale-dist-installer-bundle` (branch `fix/stale-dist-installer-bundle`, base commit
`2a612509b8c86c35c77aeefdadb524dd0401df53`). All test branches/commits were scratch-only, created
under names prefixed `scratch-step3-`, and deleted after verification; no permanent branch history was
disturbed.

## 1. Hook registration

```
pnpm exec lefthook install
```

Confirmed `.git/hooks/post-merge`, `.git/hooks/post-checkout`, `.git/hooks/post-rewrite` shims
exist (in the repository's common `.git/hooks/`, shared across worktrees) after this command.
**Result: PASS.**

## 2. Positive — `post-merge`, fast-forward, `src/installer/**` / `build.ts` / `package.json`

For each of the three scoped paths, the same pattern was used: create a scratch branch off the
base commit, add a trivial comment-only change to the target file, commit it, switch back to a
second scratch branch pinned at the base commit, then fast-forward merge:

```
git checkout -b scratch-step3-<base>
git checkout -b scratch-step3-<topic> scratch-step3-<base>
# edit <target-file>, e.g. append a comment
git add <target-file>
git commit -m "..."
git checkout scratch-step3-<base>
git merge --ff-only scratch-step3-<topic>
```

Observed for all three targets (`src/installer/settings.ts`, `build.ts`, `package.json`): the
`post-merge` hook fired, ran `pnpm run build` (`tsx build.ts`), and `dist/installer.js`'s mtime
advanced. **Result: PASS** for all three sub-cases.

## 3. Positive — `post-merge`, launcher-only change

Same fast-forward-merge pattern, with the scratch commit touching only `src/launcher/main.ts`.
Observed: `post-merge` fired, ran `pnpm run build`, and `dist/launcher.cjs`'s mtime advanced.
**Result: PASS.**

## 4. Positive — `post-checkout` branch switch (flag=1)

```
git checkout -b scratch-step3-installer   # (branch with an installer-touching commit)
git checkout scratch-step3-base           # tip differs under src/installer/**
```

Observed: `post-checkout` fired with flag=1, prev-ref and new-ref differing under
`src/installer/**`, and the helper ran `pnpm run build` (`dist/installer.js` mtime advanced from
`1786630043` to a later value). This is also the mechanism incidentally exercised by every
scratch-branch checkout performed during this verification session whenever the two commits
differed under an in-scope path — all of those incidental checkouts also correctly triggered (or
correctly no-op'd, when the two commits were identical) exactly as expected, reinforcing this
result. **Result: PASS.** (Confirms the `{1} {2} {3}` positional arg-forwarding wired in Step 2
works correctly end-to-end, consistent with the prior delegation's empirical confirmation.)

## 5. Positive — `post-rewrite` genuine rebase — RESULT: FAIL (plan-design gap, not implementation bug)

Setup:

```
git checkout -b scratch-step3-rebase-new-base 2a61250   # "upstream" — diverges with a docs-only commit
# edit docs/AGENTS.md, commit  -> b07aa7c
git checkout -b scratch-step3-rebase-topic 2a61250      # local topic branch, same old base
# edit src/installer/settings.ts, commit -> 1e387bf
git rebase scratch-step3-rebase-new-base                # replays 1e387bf onto b07aa7c -> a61b53d
```

**Observed:** the `post-rewrite` hook fired (stdin received the `1e387bf a61b53d` pair) but
**did not** run `pnpm run build` (0.04s no-op, matching the no-op timing pattern seen throughout
this session, vs. ~0.45-0.6s whenever a build actually ran).

**Root cause, confirmed by direct reproduction of the helper's exact git plumbing:**

```
$ git diff-tree -r --name-only --no-commit-id 1e387bf a61b53d
docs/AGENTS.md
$ git diff-tree -r --name-only --no-commit-id a61b53d^ a61b53d
src/installer/settings.ts
```

`git diff-tree <old-sha> <new-sha>` (the exact command specified by the plan's Step 1 design and
implemented as specified) compares the two _full commit snapshots_. When a rebase replays a commit
onto a new, diverged base, the file the commit itself touches (`src/installer/settings.ts`) is
**identical** in both the old and new snapshot — only files touched by the _base's_ divergence
(`docs/AGENTS.md`) show up in this diff. The local commit's own installer change is invisible to
this comparison whenever the rebase target base has any unrelated changes of its own — which is
the ordinary case for "rebase a local branch onto an updated upstream." A correct implementation
would need to diff each new commit against its _own_ parent (e.g.
`git diff-tree -r --name-only --no-commit-id <new-sha>~1 <new-sha>` per rewritten commit) rather
than old-sha-vs-new-sha.

As a control, `git commit --amend` (the other documented `post-rewrite` trigger) was also tested
and behaves correctly, because amend keeps the same parent, so old-sha-vs-new-sha _does_ correctly
isolate just the amended file:

```
git checkout -b scratch-step3-amend-test 2a61250
# commit docs-only change, then `git add` an installer edit and `git commit --amend --no-edit`
```

Observed: `post-rewrite` fired and correctly ran `pnpm run build` for the amend case.

**Result: FAIL for the "genuine rebase onto a diverged base" sub-case; PASS for the
`commit --amend` sub-case.** This is a discrepancy between the plan's Step 1 design/acceptance
criteria and its actual behavior, not an implementation deviation from the plan — the helper does
exactly what Step 1 specifies. Flagged for Dungeon Master / Pathfinder attention; not fixed here
(architecture/plan-design change, outside Bitsmith's Step 3 verification scope).

## 6. Negative — file-level checkout (flag=0)

```
# uncommitted edit to src/installer/settings.ts
git checkout -- src/installer/settings.ts
```

Observed: `post-checkout` fired with flag=0, exited as a no-op (0.04s), `dist/installer.js` mtime
unchanged. **Result: PASS.**

## 7. Negative — unrelated-only change (docs-only)

Fast-forward merge of a scratch branch containing only a `docs/AGENTS.md` change. Observed:
`post-merge` fired but ran no build (0.05s no-op), `dist/installer.js` mtime unchanged.
**Result: PASS.**

## 8. Known-gap confirmation — clean fast-forward `git pull --rebase` — RESULT: gap does NOT reproduce on git 2.50.1

Setup: an "upstream" scratch branch with one installer-touching commit ahead of the base, and a
"current" scratch branch pinned at the base with **zero** local commits ahead:

```
git checkout -b scratch-step3-gap-upstream 2a61250
# edit src/installer/settings.ts, commit -> 481ee08
git checkout -b scratch-step3-gap-current 2a61250
git pull --rebase . scratch-step3-gap-upstream
```

**Observed:** contrary to the plan's documented "known gap," this fired the `post-merge` hook (not
silence) — `ORIG_HEAD` was set to the pre-pull commit, and the helper correctly ran `pnpm run
build`. Root cause: on git 2.50.1, when the current branch is a strict ancestor of the pulled ref
(nothing to replay), `git pull --rebase` short-circuits to a plain fast-forward implemented via the
same merge machinery as a non-rebase pull — it sets `ORIG_HEAD` and invokes `post-merge`, not
`post-rewrite`, and does not skip hook invocation entirely as the plan assumed.

**Result: the known-gap scenario, as literally described in the plan (Guardrails, Step 3, Success
Criteria), does not reproduce on git 2.50.1 — the rebuild fires anyway, via `post-merge`.** This
does not mean coverage is _complete_ in general (older/newer git versions, or a pull that fast-
forwards purely via the rebase sequencer rather than the merge fast-forward path, could still
behave differently), but the specific claim "no rebuild fires" was not observed to hold in this
environment. Flagged for Dungeon Master / Pathfinder attention — Step 4 documentation should not
assert this gap without re-validating against the target git version(s), or should soften the
claim to acknowledge it is version-dependent.

## 9. Rebuild leaves tracked-file `git status` clean

Every positive case above was followed by `git status --porcelain`, which returned empty output
each time (`dist/` is gitignored per `.gitignore:31`). **Result: PASS.**

## Summary

| #   | Case                                                       | Result                                                                                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hook registration (`lefthook install`)                     | PASS                                                                                                                                              |
| 2   | `post-merge` positive: installer / build.ts / package.json | PASS (all three)                                                                                                                                  |
| 3   | `post-merge` positive: launcher-only                       | PASS                                                                                                                                              |
| 4   | `post-checkout` positive (flag=1)                          | PASS                                                                                                                                              |
| 5   | `post-rewrite` positive: genuine rebase onto diverged base | **FAIL** (plan-design gap; `commit --amend` sub-case PASSes)                                                                                      |
| 6   | `post-checkout` negative (flag=0)                          | PASS                                                                                                                                              |
| 7   | `post-merge` negative: unrelated-only (docs)               | PASS                                                                                                                                              |
| 8   | Known-gap: clean fast-forward `git pull --rebase`          | Gap does **not** reproduce on git 2.50.1 (rebuild fires via `post-merge`) — plan's known-gap claim needs re-validation before Step 4 documents it |
| 9   | Rebuild leaves tracked `git status` clean                  | PASS                                                                                                                                              |

Two findings (#5 and #8) diverge from the plan's stated design/acceptance criteria and are
surfaced here rather than silently patched, per the Step 3 delegation's explicit instruction.
Neither required a source change under `src/installer/**` or `src/launcher/**`; no such files were
modified during this verification.

## Addendum: Step 3 re-confirmation and Step 4 runtime verification matrix

The plan was subsequently corrected (design-of-record: the per-pair `old..new` diff in
`post-rewrite` is a net-delta/whole-snapshot diff, not a per-commit parent diff — it correctly
declines byte-identical content and correctly catches a genuinely diverged base carrying a
build-input change) and re-reviewed by Ruinor (ACCEPT, 0/0/0 findings). This addendum records the
re-confirmation of Step 3 and the full Step 4 runtime verification matrix executed against that
corrected design, on the same environment (`git version 2.50.1 (Apple Git-155)`, `lefthook
v2.1.10`, worktree `.worktrees/stale-dist-installer-bundle`, branch
`fix/stale-dist-installer-bundle`).

### Step 3 re-confirmation

`git diff 2a61250 -- scripts/rebuild-dist-if-installer-changed.js` returned empty output: the
helper is byte-for-byte unchanged from commit `2a61250`. Code inspection of the `post-rewrite`
branch confirms it reads stdin `<old-sha> <new-sha>` pairs, unions
`git diff-tree -r --name-only --no-commit-id <old-sha> <new-sha>` across all pairs, and contains no
`ORIG_HEAD..HEAD` source and no `<new-sha>^ <new-sha>` parent diff. The idempotency/rebase-noise
comment (lines 106-110) is also unchanged and remains accurate. **Result: PASS.**

### Step 4 runtime verification matrix

All test branches were created off a shared `scratch-step4-base` chain (itself descended from
`2a61250`) and deleted after verification; no permanent branch history was disturbed. `src/installer/**`
and `src/launcher/**` were never modified except as scratch, throwaway commits on these scratch
branches.

| #   | Case                                                                                                                                                                                                                 | Result                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hook registration (`pnpm exec lefthook install`)                                                                                                                                                                     | PASS                                                                                                                                                                                                        |
| 2   | `post-merge` positive: installer / `build.ts` / `package.json` (ff-merge)                                                                                                                                            | PASS (all three)                                                                                                                                                                                            |
| 3   | `post-merge` positive: launcher-only                                                                                                                                                                                 | PASS                                                                                                                                                                                                        |
| 4   | `post-merge` positive: clean fast-forward `git pull --rebase`, zero local commits                                                                                                                                    | PASS — fires via `post-merge` (`ORIG_HEAD` set by git's ff-via-merge-machinery short-circuit); confirms Discrepancy 2 from the original Step 3 notes was a plan-claim issue, not an implementation bug      |
| 5   | `post-checkout` positive (flag=1, branch switch)                                                                                                                                                                     | PASS                                                                                                                                                                                                        |
| 6   | `post-rewrite` positive: local commit rebased onto a genuinely diverged base carrying an installer change (Ruinor's required case)                                                                                   | PASS — the per-pair `old..new` diff correctly surfaces the installer change carried in via the new base                                                                                                     |
| 7   | `post-rewrite` positive: `git commit --amend`                                                                                                                                                                        | PASS                                                                                                                                                                                                        |
| 8   | `post-rewrite` positive: multi-commit rebase, one of several replayed commits touches an installer file, onto a diverged base                                                                                        | PASS (after correcting an initial flawed test setup that inadvertently produced the byte-identical case instead — see case 10)                                                                              |
| 9   | `post-rewrite` positive: squash-during-interactive-rebase                                                                                                                                                            | PASS — two `post-rewrite` invocations fired (one per squash step), both real builds; consistent with the documented idempotency rationale (no rebase-in-progress guard needed)                              |
| 10  | `post-rewrite` negative: byte-identical-installer rebase (local installer commit rebased onto a base whose own divergence does not touch the installer, so the commit's full snapshot is unchanged pre/post rewrite) | PASS — no-op (0.04s), no rebuild; this is the correctly-declined counterpart to case 6, and is mechanically identical to the "pre-existing local staleness" limitation below                                |
| 11  | `post-checkout` negative: file-level checkout (flag=0) of an in-scope file                                                                                                                                           | PASS — no-op (0.04s), mtime unchanged, working tree clean                                                                                                                                                   |
| 12  | Negative: unrelated-only change (docs-only), via ff-merge                                                                                                                                                            | PASS — `post-merge` fires but no-ops (0.05s), mtime unchanged                                                                                                                                               |
| 13  | Limitation: `git cherry-pick <commit touching src/installer/**>`                                                                                                                                                     | Confirmed limitation — no hook fires at all (cherry-pick isn't wired to `post-merge`/`post-checkout`/`post-rewrite`); installer content changes with no rebuild, as documented                              |
| 14  | Limitation: `git reset --hard <ref>` reverting an installer change                                                                                                                                                   | Confirmed limitation — no hook fires at all; installer content reverts with no rebuild, as documented                                                                                                       |
| 15  | Limitation: pre-existing local staleness (local installer commit never rebuilt, later rebased onto a base with no net installer delta)                                                                               | Confirmed limitation — mechanically identical to case 10 (byte-identical full-snapshot diff across the pair); the detector is a net-delta diff so it cannot distinguish "always stale" from "never changed" |
| 16  | `git status --porcelain` clean after rebuild                                                                                                                                                                         | PASS — checked after every case above; `dist/` is gitignored and never appears as a tracked-file diff                                                                                                       |

All 16 items pass against their expected outcome (positive cases rebuild, negative/limitation cases
correctly do not). No changes were made to `scripts/rebuild-dist-if-installer-changed.js`,
`lefthook.yml`, `src/installer/**`, or `src/launcher/**` during this verification pass.
