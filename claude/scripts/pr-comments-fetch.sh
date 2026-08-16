#!/usr/bin/env bash

# This script's internals are exempt from `claude/references/bash-style.md` — that file
# governs agent-level Bash tool calls only. Internal use of `&&`, `;`, `|`, and `$(...)` is
# permitted.

set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'Error: not inside a git repository\n' >&2
  exit 1
}

# Arg validation: require a positive integer PR number.
pr_number="${1:-}"
if [[ -z "$pr_number" ]] || ! [[ "$pr_number" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Usage: pr-comments-fetch.sh <pr-number>\n' >&2
  exit 2
fi

# Verify GitHub authentication.
if ! gh auth status >/dev/null 2>&1; then
  # shellcheck disable=SC2016  # backtick inside single-quoted printf is intentional (literal output)
  printf 'GitHub authentication is required. Run `gh auth login` and try again.\n' >&2
  exit 1
fi

# Derive owner and repo from the git remote URL.
origin_url="$(git remote get-url origin)"
if [[ "$origin_url" =~ ^git@github\.com:([^/]+)/(.+)$ ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]%.git}"
elif [[ "$origin_url" =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]%.git}"
else
  printf 'Could not parse owner/repo from origin URL\n' >&2
  exit 1
fi

# Verify the active gh account can resolve the target repo. `gh auth status` only confirms
# that some account is logged in -- it does not confirm the currently-active account has
# access to this specific repo. Catch that mismatch here with an explicit, actionable
# message instead of letting a later `gh api graphql` failure exit via `set -e` with gh's
# raw, unwrapped error.
if ! gh repo view "$owner/$repo" >/dev/null 2>&1; then
  printf 'Could not access %s/%s via the active gh account.\n' "$owner" "$repo" >&2
  # shellcheck disable=SC2016  # backticks are intentional literal output, not command substitution
  printf 'If you are logged into multiple gh accounts, run `gh auth status` to see which\n' >&2
  # shellcheck disable=SC2016
  printf 'account is active, then `gh auth switch --hostname github.com --user <account>`\n' >&2
  printf 'to switch to an account with access.\n' >&2
  exit 1
fi

# Fetch all pages of unresolved review threads via GraphQL and merge them.
# NOTE (F-001): `gh api graphql --paginate` emits one separate JSON document per page
# concatenated to stdout — NOT a single merged document. `jq -s` (slurp) is required to
# collect all pages into an array before merging the per-page nodes arrays.
#
# The GraphQL query string and the jq merge filter are stored in variables so that
# single-quote characters do not conflict with the surrounding $(...) command substitution.

# shellcheck disable=SC2016  # GraphQL variables like $owner are not shell expansions
graphql_query='
query($owner: String!, $repo: String!, $prNumber: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      title
      state
      reviewThreads(first: 100, after: $endCursor) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            nodes {
              fullDatabaseId
              author {
                login
              }
              body
              createdAt
              diffHunk
              url
            }
          }
        }
      }
    }
  }
}
'

# shellcheck disable=SC2016  # jq variables like $pr are not shell expansions
jq_merge_filter='
  if length == 0 then null
  else
    (.[0].data.repository.pullRequest) as $pr
    | if $pr == null then null
      else
        {
          title: $pr.title,
          state: $pr.state,
          threads: [ .[] | .data.repository.pullRequest.reviewThreads.nodes[] ]
        }
      end
  end
'

result="$(gh api graphql --paginate \
  -f query="$graphql_query" \
  -f owner="$owner" \
  -f repo="$repo" \
  -F prNumber="$pr_number" \
  | jq -s "$jq_merge_filter")"

# Check that the PR was found.
if [[ "$result" == "null" ]] || [[ -z "$result" ]]; then
  printf 'PR #%s not found in %s/%s\n' "$pr_number" "$owner" "$repo" >&2
  exit 1
fi

# Transform into final output shape: filter to unresolved threads only and rename fields.
# F-002: no bare "id" in output — use thread_id, comment_full_database_id,
#         first_comment_full_database_id.
jq -n \
  --argjson data "$result" \
  --argjson pr_number "$pr_number" \
  --arg owner "$owner" \
  --arg repo "$repo" \
  '
    $data
    | .threads |= map(select(.isResolved == false))
    | {
        pr_number: $pr_number,
        title: .title,
        state: .state,
        owner: $owner,
        repo: $repo,
        threads: [
          .threads[] | {
            thread_id: .id,
            is_resolved: .isResolved,
            is_outdated: .isOutdated,
            path: .path,
            line: .line,
            start_line: .startLine,
            first_comment_full_database_id: .comments.nodes[0].fullDatabaseId,
            comments: [
              .comments.nodes[] | {
                comment_full_database_id: .fullDatabaseId,
                author: .author.login,
                body: .body,
                created_at: .createdAt,
                diff_hunk: .diffHunk,
                url: .url
              }
            ]
          }
        ]
      }
  '
