# Installation Guide

This guide covers the installation lifecycle for ai-tpk: cloning, running install.sh, setting up a development environment, updating, recovering or cleaning backups, and cleaning up agent-produced artifacts. For configuration details, see [docs/HOOKS.md](/docs/HOOKS.md), [docs/MCP.md](/docs/MCP.md), [docs/TPK.md](/docs/TPK.md), [docs/SKILLS.md](/docs/SKILLS.md), and [docs/SLASH_COMMANDS.md](/docs/SLASH_COMMANDS.md).

## Prerequisites

Node.js >= 18.18.0 is required to run `install.sh`. The installer is implemented in TypeScript and pre-built to a standalone bundle (`dist/installer.js`) via esbuild.

## Quick Install

Clone the repository:

```bash
git clone git@github.com:alkofu/ai-tpk.git
cd ai-tpk
```

Run the installation script:

```bash
./install.sh
```

The installer accepts an optional `--target-agent <name>` flag to select which agent to install for. The only currently supported value is `claude`, which is also the default.

The installer copies the whitelisted paths (`CLAUDE.md`, `settings.json`, `skills/`, `agents/`, `commands/`, `hooks/`, `references/`, `scripts/`) from `claude/` into `~/.claude/` and, when present, into `~/.cursor/`. Anything else in the repo or on disk under those destinations is left untouched except where those paths are replaced (after a timestamped backup). `settings.json` is the one exception to a wholesale replace: the installer deep-merges the template over any existing live file, so local-only keys (e.g. `apiKeyHelper`, `model`, extra `env` entries) are preserved rather than dropped. Local additions to `allowedTools` are also preserved: the installer unions the live and template `allowedTools` lists (template entries first, then local-only entries) rather than replacing the array wholesale, so a tool pattern you add locally survives future `install.sh` runs while new template entries still propagate. All other arrays (e.g. `hooks.*`) continue to be replaced wholesale by the template, and template entries that have since been removed are not pruned from an already-installed live file.

The `.claude/` directory is never synced by the installer — it remains project-local.

**GitHub MCP setup:** To enable multi-account GitHub MCP servers, create `~/.config/tpk/github-pats.json` before (or after) running `install.sh` and set its mode to `0600`. See [docs/MCP.md § Server Roster](/docs/MCP.md#server-roster) for the file format, key naming rules, and operational details.

## Development Setup

To contribute to this repository, you'll need to set up the development environment:

```bash
# Clone the repository
git clone git@github.com:alkofu/ai-tpk.git
cd ai-tpk

# Install dependencies (requires pnpm)
pnpm install

# Build the installer bundle and test it
pnpm run build
pnpm run setup
```

**Note:** The `pnpm run build` command bundles the installer via esbuild into `dist/installer.js`. The `pnpm run setup` command executes the pre-built bundle, ensuring your development environment uses the same code path as end-users. This keeps installer behavior consistent during development.

After setup, you can test changes locally. Lefthook runs shellcheck + markdownlint at pre-commit and signed-commit verification, JS/TS lint, format checks, YAML lint, shell format check, spell-check, mypy, and pytest at pre-push. Lefthook also auto-rebuilds both dist bundles (`dist/installer.js` and `dist/launcher.cjs`) at `post-merge`, `post-checkout`, and `post-rewrite` via `scripts/rebuild-dist-if-installer-changed.js`, whenever `src/installer/**`, `src/launcher/**`, `build.ts`, or `package.json` change — see the Auto-Rebuild Hooks section below for coverage details and limitations.

**Note:** The installer automatically backs up any existing configurations with a timestamp before overwriting them.

The installation logic is implemented in TypeScript under `src/installer/`. See the source files there for implementation details.

The `install.sh` shim in the repo root runs the pre-built esbuild bundle (`dist/installer.js`) and verifies Node.js >= 18.18.0 is available.

### Running Tests

The installer includes a comprehensive test suite using `node:test`:

```bash
pnpm test
```

This runs all test files colocated with source under `src/installer/` and `src/launcher/` (files matching `*.test.ts`) with isolated temporary directories. For more details, see the `*.test.ts` files beside their respective source modules.

### Code Quality: Linting and Formatting

The project uses **oxlint** (TypeScript linter) and **oxfmt** (code formatter) to maintain consistent code quality. An `.editorconfig` file at the repo root configures indent style, line endings, charset, trailing whitespace, and final newlines for editors that support it.

**pnpm scripts:**

- `pnpm run lint` — Run oxlint to check for TypeScript errors and code quality issues
- `pnpm run lint:md` — Run markdownlint across all Markdown files (ignores `node_modules`, `plans`, `lessons`, `docs/superpowers`, `claude/cache`)
- `pnpm run spellcheck` — Run cspell across `*.{md,ts,sh}` files (excludes `node_modules`, `dist`, `pnpm-lock.yaml`, `plans`, `lessons`, `docs/superpowers`, `claude/cache`, `.git`, `.worktrees`)
- `pnpm run format` — Apply oxfmt formatting to all TypeScript files in `src/`
- `pnpm run format:check` — Check formatting without modifying files (used in CI)

**Developer workflow:**

Before committing code, run `pnpm run format` to auto-format your changes. This keeps the codebase consistent and prevents formatting failures in CI.

**Pre-Commit Hook:**

Lefthook runs shellcheck (`pnpm run lint:sh`) on staged `.sh` files and markdownlint (`pnpm run lint:md`) on staged `.md` files at commit time. If either check fails, the commit is blocked. These checks run only at pre-commit; they are not repeated at pre-push. Hook configuration lives in `lefthook.yml`.

**Pre-Push Hook:**

Lefthook runs signed-commit verification, lint, format, shell format-check, spell-check, and YAML lint on every push. The `verify-signed-commits` check runs first (unconditionally, via stdin): it inspects every commit being pushed that was authored by the current user and fails if any commit is unsigned or has a bad or revoked signature. Signatures that are valid but whose key is not in the local signers database are accepted — no `gpg.ssh.allowedSignersFile` configuration is required. JS/TS file changes trigger `pnpm run lint` and `pnpm run format:check`; shell file changes trigger `pnpm run format:check:sh`; YAML file changes trigger `pnpm run lint:yaml`; Markdown, TypeScript, or shell file changes trigger `pnpm run spellcheck`. If any check fails, the push is blocked. To satisfy the signed-commit check, ensure your commits are GPG- or SSH-signed — see the [GitHub documentation on signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits). Run `pnpm run format` to auto-fix TypeScript formatting issues. Markdown, YAML, and spelling violations must be fixed manually. Hook configuration lives in `lefthook.yml`.

**Note for sibling-worktree onboarding:** After pulling this change into existing worktrees, run `pnpm install` to pick up the new `cspell` dependency. Without this, the pre-push hook will fail with `cspell: command not found`.

**Auto-Rebuild Hooks (dist bundle staleness):**

Because `dist/installer.js` and `dist/launcher.cjs` are pre-built bundles checked into the repo, they can go stale relative to their TypeScript sources after operations like `git pull` or `git rebase`. Lefthook's `post-merge`, `post-checkout`, and `post-rewrite` hooks run `scripts/rebuild-dist-if-installer-changed.js`, which inspects the changed files and runs `pnpm run build` (regenerating both bundles) whenever `src/installer/**`, `src/launcher/**`, `build.ts`, or `package.json` are affected. Coverage varies by hook:

| Hook | Covered operations |
| --- | --- |
| `post-merge` | `git merge`, non-rebase `git pull` (including fast-forward), and a **clean fast-forward `git pull --rebase` with no local commits** — its fast-forward path uses git's merge machinery and sets `ORIG_HEAD`, so `post-merge` fires. This is empirically verified on git 2.50.1, not an officially documented git guarantee. |
| `post-checkout` | Branch switches only (`flag=1`); a file-level `git checkout -- <file>` (`flag=0`) is a deliberate no-op. |
| `post-rewrite` | `git rebase`, `git pull --rebase`, and `git commit --amend` that actually rewrite commits — including rebasing local commits onto a diverged base, since the per-pair `old..new` snapshot diff surfaces a build-input change arriving via the new base through the tip pair. Detection uses the stdin `<old-sha> <new-sha>` pairs; there is no `ORIG_HEAD`-based source in `post-rewrite`. |

**Real limitations (not silent coverage gaps):** operations that fire none of the three hooks do not auto-rebuild — notably `git cherry-pick` and `git reset --hard`. File-level `git checkout -- <file>` (`flag=0`) is intentionally a no-op. And **pre-existing local staleness** — a local build-input commit whose `dist/` was never rebuilt, later surfaced by a rebase that does not change the net installer delta — is not caught, because the detector is a net-delta diff in which unchanged content cancels out. In all of these cases, run `pnpm run build` manually, or the next covered net-delta operation will rebuild the bundles.

**Existing-maintainer activation requirement:** after pulling this change, existing maintainers must run `pnpm install` (or `pnpm exec lefthook install`) **once** so Lefthook regenerates the `.git/hooks/post-merge`, `post-checkout`, and `post-rewrite` shims for the newly added hook types. Until this is done, the auto-rebuild silently does nothing.

**Fresh-clone limitation:** a brand-new clone has no git hooks installed until the first `pnpm install` (via the `prepare` script, which runs `lefthook install`), so the very first build must still be run manually (`pnpm run build`). This onboarding gap is unrelated to the hooks above and out of scope for this change.

### Code Quality: Shell Linting and Formatting

In addition to the JavaScript/TypeScript toolchain above, this repository lints and formats its shell scripts (`.sh` files under `claude/hooks/`, `claude/scripts/`, `src/launcher/`, `src/mcp/wrappers/`, and the repo root) with **ShellCheck** and **shfmt**.

**Install both locally** before running shell checks (lefthook runs them on pre-push):

```bash
brew install shellcheck shfmt
```

**pnpm scripts:**

- `pnpm run lint:sh` — Run ShellCheck across all 28 `.sh` files
- `pnpm run format:sh` — Apply `shfmt -i 2 -ci -bn` formatting to all 28 `.sh` files
- `pnpm run format:check:sh` — Check shfmt formatting without modifying files (used in CI and pre-push)

**CI version pin:** CI pins `shfmt` to `v3.8.0`. Minor version drift between local and CI is generally acceptable, but if `pnpm run format:check:sh` produces different output locally vs CI, install the pinned version via `mise use shfmt@3.8.0` or download the v3.8.0 binary from `https://github.com/mvdan/sh/releases/tag/v3.8.0`. `shellcheck` is not pinned; the latest Homebrew or apt version is fine.

**Pre-Commit Hook:** `pnpm run lint:sh` runs at pre-commit only. **Pre-Push Hook:** `pnpm run format:check:sh` runs at pre-push — shfmt format checking is intentionally deferred to push. Hook configuration lives in `lefthook.yml`.

### Code Quality: YAML Linting

In addition to the JavaScript/TypeScript and shell toolchains above, this repository lints its YAML files (`lefthook.yml`, `.github/workflows/*.yml`, `.github/ISSUE_TEMPLATE/*.yml`, and `.yamllint.yml` itself) with **yamllint**. The generated `pnpm-lock.yaml` is excluded.

**Install yamllint locally** before running the YAML check (lefthook runs it on pre-push):

```bash
pipx install yamllint    # preferred — keeps the tool in an isolated venv
# or
brew install yamllint    # acceptable
```

**pnpm scripts:**

- `pnpm run lint:yaml` — Run yamllint across all hand-authored YAML files

**CI version:** CI installs yamllint via `apt-get` on `ubuntu-latest`; the version is whatever the distribution packages (not pinned). Minor version drift between local and CI is generally acceptable, but if `pnpm run lint:yaml` produces different output locally vs CI, compare versions with `yamllint --version`.

**Pre-Push Hook:** The same Lefthook hook that runs the JS and shell checks also runs `pnpm run lint:yaml` when YAML files change. Hook configuration lives in `lefthook.yml`. Lint configuration lives in `.yamllint.yml` at the repo root; deviations from the upstream `default` preset are documented inline in that file.

### Development Workflow

When making changes to this repository:

1. **Setup** — Follow the Development Setup section above to install dependencies and build the bundle
2. **Make changes** — Edit TypeScript files in `src/installer/` or `src/launcher/`, or configuration files in `claude/`
3. **Build and reinstall** — Run `pnpm run build` to rebuild the installer bundle, then `./install.sh` to deploy to `~/.claude/`, then `./clean-backups.sh` to remove stale backups. The `/build-and-install` repo-scope slash command automates all three steps in sequence.
4. **Test** — Run `pnpm test` to execute the test suite
5. **Lint and format** — Run `pnpm run format` to auto-fix TypeScript formatting, then `pnpm run lint` to verify code quality, `pnpm run lint:md` to verify Markdown style, `pnpm run lint:yaml` to verify YAML style, and `pnpm run spellcheck` to verify spelling
6. **Commit and push** — The pre-push hook (Lefthook) automatically verifies that all pushed commits authored by the current user (per `git config user.email`) are cryptographically signed and runs linting and format checks; both must pass before pushing

## Updating

```bash
cd ai-tpk
git pull
./install.sh
```

Re-running the installer after `git pull` copies the latest configurations into place. Any files already present are backed up with a timestamp before being replaced.

## Recovering Backups

The installer automatically creates timestamped backups (e.g., `settings.json.backup.20260407_143022`) before overwriting any existing files. To browse and restore a backup interactively:

```bash
./recover.sh
```

The script scans `~/.claude` and `~/.cursor` for machine-generated backups, lists them newest-first with their original paths and human-readable timestamps, and prompts you to select one by number. If the original path currently exists, it is itself backed up before the selected backup is moved into place.

## Cleaning Up Old Backups

Over time the installer may accumulate multiple timestamped backups for the same file. `clean-backups.sh` removes all but the most recent backup for each original path, keeping your `~/.claude` and `~/.cursor` directories tidy.

```bash
./clean-backups.sh
```

The script scans the same directories as `recover.sh` (`~/.claude` and `~/.cursor`), groups backups by their original file path, and displays the list of files it will delete before proceeding immediately. Original paths that have only one backup are left untouched.

## Cleaning Up Agent Artifacts

Agent-produced files (Pathfinder plans, Everwise lessons) accumulate in `~/.ai-tpk/` over time. Two mechanisms are available for cleanup:

### /merged Command — Post-Merge Plan Cleanup

When you run `/merged` after a PR is merged, the command silently auto-deletes plan files from `~/.ai-tpk/plans/{repo-slug}/` that belong to the current session (matched by session timestamp prefix). No prompt is shown for these files.

If the session timestamp is unavailable (e.g. `/merged` was run in a new session without worktree context), no plan files are touched and no prompt is shown.

Files from other sessions are never mentioned or deleted by `/merged`. Use `/clean-ai-tpk-artifacts` for cross-session cleanup.

This is useful for removing planning artifacts after a feature is shipped without any interruption to the cleanup flow.

### /clean-ai-tpk-artifacts Command — Age-Based Cleanup

For periodic housekeeping across all repositories, use the age-based cleanup command:

```bash
/clean-ai-tpk-artifacts          # Delete artifacts older than 14 days (default)
/clean-ai-tpk-artifacts 30       # Delete artifacts older than 30 days
/clean-ai-tpk-artifacts 7 --all  # Delete 7-day-old artifacts from ALL repos
```

**Scope behavior:**
- **Default (no `--all`):** Searches `~/.ai-tpk/plans/{current-repo-slug}/` for old plans, and `~/.ai-tpk/lessons/` for old lessons. Plans are scoped to the current repository; lesson files are always searched globally (lessons are not repo-scoped).
- **With `--all` flag:** Searches all repositories' plan directories under `~/.ai-tpk/plans/` and `~/.ai-tpk/lessons/`. Displays a warning that files from other repositories may be included.

The command lists files to be deleted and asks for confirmation before proceeding.
