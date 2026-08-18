# Contributing

This document covers the Continuous Integration setup and the configuration update workflow for this repository.

## Continuous Integration

Pull requests targeting `main` are validated by a GitHub Actions workflow at `.github/workflows/ci.yml`. See the workflow file for the specific checks that run. For formatting failures, run `pnpm run format` and commit the result.

## Dependency Updates

Dependency updates are automated via Dependabot (`.github/dependabot.yml`). On a weekly Monday schedule, Dependabot opens PRs for both the npm (pnpm-managed) and GitHub Actions ecosystems. Minor and patch updates are grouped into a single PR per ecosystem; major updates arrive as individual PRs so breaking changes can be reviewed in isolation. For the npm ecosystem, Dependabot uses `versioning-strategy: lockfile-only`, so its PRs update only `pnpm-lock.yaml` and leave `package.json` version ranges unchanged. No manual action is required — review and merge the Dependabot PRs as they appear.

## Python Tooling (`dungeon/`)

The `dungeon/` directory is a Python library subproject. Any commit that touches `dungeon/**/*.py` triggers `lefthook` hooks that run `ruff` (lint and format), `mypy` (type-check), and `pytest` (tests); `mypy` and `pytest` are skipped automatically during merge and rebase operations. These hooks require `uv` to be installed — see the [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/) if the hooks fail with a `uv: command not found` error.

The same checks run in CI via the parallel `python` job in `.github/workflows/ci.yml`. For formatting failures, run `cd dungeon && uv run ruff format .` and commit the result.

## Configuration Updates

When updating Claude configurations (agents, skills, commands, hooks, references, or settings):

1. Make changes in this repository
2. Test the configurations
3. Commit and push changes
4. Pull on other machines to sync

When adding new hooks, agents, or skills, update the relevant documentation file under `docs/` — `HOOKS.md` for hooks, `MCP.md` for MCP servers, `SKILLS.md` for agents, references, and skills, `SLASH_COMMANDS.md` for slash commands, `TPK.md` for the session launcher, and `INSTRUCTIONS.md` for instruction-level changes.
