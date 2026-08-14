#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO_SHA = '0000000000000000000000000000000000000000';
const SHA_RE = /^[0-9a-f]{40}$/;

// Strips ASCII control characters and ESC bytes from attacker-controllable strings
// before writing them to stderr, preventing terminal output spoofing.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0B-\x1F\x7F\x1B]/g;

function sanitize(s) {
  return String(s).replace(CONTROL_RE, '?');
}

function git(args, opts = {}) {
  return spawnSync('git', args, { encoding: 'utf8', ...opts });
}

// Returns true if `ref` looks like a resolvable, non-null commit-ish SHA.
function isResolvableSha(ref) {
  return typeof ref === 'string' && SHA_RE.test(ref) && ref !== ZERO_SHA;
}

function diffTreeNames(fromRef, toRef) {
  const result = git([
    'diff-tree',
    '-r',
    '--name-only',
    '--no-commit-id',
    fromRef,
    toRef,
  ]);
  if (result.status !== 0) {
    process.stderr.write(
      `rebuild-dist-if-installer-changed: git diff-tree failed for ${sanitize(fromRef)}..${sanitize(toRef)}: ${sanitize(result.stderr)}\n`,
    );
    process.exit(1);
  }
  return result.stdout.split('\n').filter((l) => l.length > 0);
}

const IN_SCOPE_PREFIXES = ['src/installer/', 'src/launcher/'];
const IN_SCOPE_PATHS = new Set(['build.ts', 'package.json']);

function isInScope(path) {
  if (IN_SCOPE_PATHS.has(path)) return true;
  return IN_SCOPE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const hookType = process.argv[2];

let changed;

if (hookType === 'post-merge') {
  const origHead = git(['rev-parse', '--verify', 'ORIG_HEAD']);
  if (origHead.status !== 0) {
    // ORIG_HEAD unresolvable (e.g. no merge actually happened) — nothing to compare.
    process.exit(0);
  }
  changed = diffTreeNames(origHead.stdout.trim(), 'HEAD');
} else if (hookType === 'post-checkout') {
  const [prevRef, newRef, flag] = process.argv.slice(3);
  if (flag !== '1') {
    // flag === '0' is a file-level checkout; anything else is unexpected — no-op either way.
    process.exit(0);
  }
  if (!isResolvableSha(prevRef) || !isResolvableSha(newRef)) {
    // All-zeros SHA or otherwise unresolvable ref — nothing to compare.
    process.exit(0);
  }
  if (prevRef === newRef) {
    process.exit(0);
  }
  changed = diffTreeNames(prevRef, newRef);
} else if (hookType === 'post-rewrite') {
  const raw = readFileSync(0, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);

  const pairs = [];
  for (const line of lines) {
    const fields = line.split(/\s+/);
    const [oldSha, newSha] = fields;
    if (!isResolvableSha(oldSha) || !isResolvableSha(newSha)) {
      // Malformed or unresolvable pair — skip it rather than failing the whole hook.
      continue;
    }
    pairs.push([oldSha, newSha]);
  }

  const changedSet = new Set();
  for (const [oldSha, newSha] of pairs) {
    for (const path of diffTreeNames(oldSha, newSha)) {
      changedSet.add(path);
    }
  }
  changed = [...changedSet];
} else {
  process.stderr.write(
    `rebuild-dist-if-installer-changed: unknown hook type ${sanitize(hookType)}; expected post-merge, post-checkout, or post-rewrite\n`,
  );
  process.exit(1);
}

// Note on post-checkout rebase noise: git fires post-checkout repeatedly while a rebase
// replays each commit (each internal checkout has flag=1). We do not add a
// rebase-in-progress guard to suppress these — an extra `pnpm run build` is harmless
// because the build is idempotent, and detecting "rebase in progress" reliably across
// all rebase backends (am vs merge) adds complexity for no real benefit.

if (!changed.some(isInScope)) {
  process.exit(0);
}

const build = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
process.exit(build.status ?? 1);
