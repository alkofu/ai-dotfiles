# MCP Servers

This document covers the MCP (Model Context Protocol) servers configured by this repository: the server roster, stamp-based skipping, and the configuration file format.

## Server Roster

The installer automatically configures user-scoped MCP servers in `~/.claude.json` when the `claude` CLI is available. Server definitions are read from a declarative `src/mcp/mcp-servers.json` file, allowing you to add or modify servers without editing TypeScript code.

Currently configured servers:

- **Kubernetes MCP Server** (`mcp-server-kubernetes@3.4.0`) — Read-only Kubernetes cluster access via `~/.kube/config`. Skips setup gracefully if that file does not exist.
- **AWS CloudWatch MCP Server** (`awslabs.cloudwatch-mcp-server@0.0.19`) — CloudWatch Metrics, Alarms, and Logs access via `~/.aws` credentials. Uses `src/mcp/wrappers/mcp-cloudwatch.sh` for dynamic AWS profile selection (set with `/set-aws-profile`). Requires `uvx`. Skips setup gracefully if `~/.aws/credentials` does not exist. The wrapper constrains the transitive `mcp` SDK to `<2.0` (`uvx --with 'mcp<2.0' ...`) because the pinned server version imports `mcp.server.fastmcp`, which was removed in `mcp>=2.0`; without the cap, `uv` resolves `mcp==2.0.0` and the server crashes at import.
- **Grafana MCP Server** (`mcp-grafana`) — Grafana dashboards, datasources, and incident access. Uses `src/mcp/wrappers/mcp-grafana.sh`, which requires `GRAFANA_URL` and `GRAFANA_SERVICE_ACCOUNT_TOKEN` in the shell environment.
- **GitHub MCP Server** (`@modelcontextprotocol/server-github@2025.4.8`) — Multi-account GitHub repository, issue, PR, and code search access via `~/.config/tpk/github-pats.json`. Define your accounts as a flat JSON object mapping account names to PATs:

  ```json
  {"personal": "ghp_xxx", "work": "ghp_yyy"}
  ```

  **Set the file mode to `0600` immediately after creation: `chmod 600 ~/.config/tpk/github-pats.json`.** The file holds long-lived GitHub PATs in plaintext; on multi-user hosts a default umask (`022`) leaves it world-readable. The wrapper refuses to read the file at MCP-server boot if the mode is broader than `0600`, and the installer prints a warning.

  Each key becomes the suffix of a registered MCP server (`github-personal`, `github-work`) and a tool namespace (`mcp__github-personal__*`, `mcp__github-work__*`). Account keys must match `^[a-zA-Z0-9_.-]+$`.

  The wrapper at `~/.claude/wrappers/mcp-github.sh` selects the token at runtime via the `GITHUB_ACCOUNT` env var injected by the installer. **The PAT is not stored in `~/.claude.json`**; rotating the token in `~/.config/tpk/github-pats.json` takes effect on the next MCP server boot without re-running `install.sh`.

  The wrapper invokes **`pnpx`** (pnpm's equivalent of the npm runner) because this repository uses pnpm. Users without pnpm installed must install it (<https://pnpm.io/installation>) before GitHub MCP servers can spawn. The wrapper pins `@modelcontextprotocol/server-github@2025.4.8` to protect against any future "latest" publish on the abandoned package name (archived 2025-05-29; the Docker-based successor `ghcr.io/github/github-mcp-server` is not used here to avoid a Docker dependency).

  If `~/.config/tpk/github-pats.json` is missing or empty (`{}`) at install time, GitHub MCP setup is skipped with a yellow warning and installation continues. On each run, the installer also removes the legacy `github` (no suffix) registration, removes stale `github-<key>` registrations, and removes stale `mcp__github-<key>__*` allow-list entries for keys no longer present in the PATs file.
- **ArgoCD MCP Server** (`argocd-mcp@0.5.0`) — Multi-cluster ArgoCD access via `~/.config/tpk/argocd-accounts.json`. Define your clusters as a JSON object mapping cluster names to `{ url, token }` pairs:

  ```json
  { "prod": { "url": "https://argocd.prod.example.com", "token": "..." }, "staging": { "url": "https://argocd.staging.example.com", "token": "..." } }
  ```

  **Set the file mode to `0600` immediately after creation: `chmod 600 ~/.config/tpk/argocd-accounts.json`.** ArgoCD tokens are equivalent in sensitivity to GitHub PATs; the wrapper refuses to read the file if the mode is broader than `0600`.

  Cluster names (keys) must match `^[a-zA-Z0-9_.-]+$`. The selected cluster is written to `~/.claude/.current-argocd-cluster` by the launcher and read at wrapper boot time. Rotating a token in `~/.config/tpk/argocd-accounts.json` takes effect on the next MCP server boot without re-running `install.sh`.

  The wrapper requires **`python3`** (available by default on macOS and Linux) to parse the accounts file.
- **GCP Observability MCP Server** (`@google-cloud/observability-mcp@0.2.3`) — Read-only access to GCP Cloud Logging, Monitoring, Trace, and Error Reporting. Requires Node.js 20+ and the gcloud CLI. Authenticate before running `install.sh`: `gcloud auth application-default login` then `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`.

MCP servers are available in all repositories once configured.

**Stamp-based skipping:** After a wrapper-based server is registered, the installer records a config signature in `~/.claude/.mcp-install-stamps.json`. On subsequent runs, if the signature matches and the registration is intact, the server is skipped. To force re-registration of all wrapper servers (e.g., after a broken install or to pick up manual `src/mcp/mcp-servers.json` edits that the installer did not detect), delete this file and re-run `./install.sh`.

## MCP Server Configuration Format

Server definitions live in `src/mcp/mcp-servers.json`. Each server uses either a `command` field (inline command array) or a `wrapper` field (path relative to `~/.claude/` pointing to an installed wrapper script) — the two are mutually exclusive. Wrapper scripts live in `src/mcp/wrappers/` in the repo and are installed to `~/.claude/wrappers/` by `install.sh`, so a `wrapper` value of `wrappers/mcp-cloudwatch.sh` resolves to `~/.claude/wrappers/mcp-cloudwatch.sh` at runtime. `$HOME` and `$USER` variable expansion is supported in string values.

Two key operational behaviors: a missing `src/mcp/mcp-servers.json` produces a warning and skips MCP setup (installation continues); a malformed JSON file or schema violation stops installation with a non-zero exit code. See `src/mcp/mcp-servers.json` for the schema and `src/installer/mcp.ts` for the installation logic.
