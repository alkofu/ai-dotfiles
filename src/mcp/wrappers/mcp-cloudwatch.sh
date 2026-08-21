#!/usr/bin/env bash
set -euo pipefail

# Resolve AWS profile: dotfile takes priority over env var
DOTFILE="$HOME/.claude/.current-aws-profile"
if [[ -f "$DOTFILE" ]] && [[ -s "$DOTFILE" ]]; then
  IFS= read -r AWS_PROFILE <"$DOTFILE"
  # Trim leading/trailing whitespace (bash-native, since we already require bash for [[ ]])
  AWS_PROFILE="${AWS_PROFILE#"${AWS_PROFILE%%[! $'\t']*}"}"
  AWS_PROFILE="${AWS_PROFILE%"${AWS_PROFILE##*[! $'\t']}"}"
fi

# Validate profile name if set
if [[ -n "${AWS_PROFILE:-}" ]]; then
  # Valid AWS profile names: letters, digits, hyphens, underscores, dots (per AWS SDKref)
  if [[ ! "$AWS_PROFILE" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    printf 'Error: invalid AWS profile name "%s" -- must match [a-zA-Z0-9_.-]+\n' "$AWS_PROFILE" >&2
    exit 1
  fi
  export AWS_PROFILE
  echo "CloudWatch MCP: using AWS profile '$AWS_PROFILE'" >&2
  # Constrain the mcp SDK to <2.0: awslabs.cloudwatch-mcp-server@0.0.19 imports
  # 'mcp.server.fastmcp', which mcp>=2.0 removed. Without this cap uv resolves
  # mcp==2.0.0 and the server crashes at import (ModuleNotFoundError). Revisit
  # only when bumping the server package to a release built against mcp>=2.0.
  exec uvx --with 'mcp<2.0' awslabs.cloudwatch-mcp-server@0.0.19 "$@"
fi

# Neither dotfile nor env var provided a profile -- fail helpfully
printf 'Error: no AWS profile set.\n' >&2
printf 'Set one by running /set-aws-profile in Claude Code, or:\n' >&2
printf '  echo "my-profile" > ~/.claude/.current-aws-profile\n\n' >&2
printf 'Available profiles:\n' >&2
if [[ -f "$HOME/.aws/config" ]]; then
  grep -E '^\[(default|profile [^]]+)\]' "$HOME/.aws/config" \
    | sed 's/^\[profile //;s/^\[//;s/\]$//' >&2
elif [[ -f "$HOME/.aws/credentials" ]]; then
  grep -E '^\[[^]]+\]' "$HOME/.aws/credentials" \
    | sed 's/^\[//;s/\]$//' \
    | awk '{key=$0; gsub(/\./, "_", key); if(!seen[key]++) print $0}' \
    | sort >&2
else
  printf '  (no ~/.aws/config or ~/.aws/credentials found)\n' >&2
fi
exit 1
