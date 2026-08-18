import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  expandVars,
  loadMcpServers,
  buildAddArgs,
  computeConfigSignature,
  readStamps,
  writeStamps,
  registerGithubAccounts,
  removeStaleGithubRegistrations,
  removeLegacyGithubRegistration,
  assertWrappersDirNotWorldWritable,
  updateGithubAllowList,
  addMcpServer,
} from './mcp.js';

// ---------------------------------------------------------------------------
// Shared temp directory — cleaned up after all tests complete
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tpk-mcp-test-'));

after(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Helper: write a minimal mcp-servers.json to a temp repo root and return the
// path to that root directory.
// ---------------------------------------------------------------------------

function writeMcpFile(servers: unknown[]): string {
  const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-'));
  fs.mkdirSync(path.join(repoRoot, 'src/mcp'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'src/mcp/mcp-servers.json'),
    JSON.stringify({ servers }),
    'utf8',
  );
  return repoRoot;
}

// ---------------------------------------------------------------------------
// expandVars
// ---------------------------------------------------------------------------

describe('expandVars', () => {
  it('expands $HOME', () => {
    const home = os.homedir();
    assert.strictEqual(expandVars('$HOME/.config'), `${home}/.config`);
  });

  it('expands ${HOME}', () => {
    const home = os.homedir();
    assert.strictEqual(expandVars('${HOME}/.config'), `${home}/.config`);
  });

  it('expands $USER', () => {
    const user = os.userInfo().username;
    assert.strictEqual(expandVars('hello-$USER'), `hello-${user}`);
  });

  it('expands ${USER}', () => {
    const user = os.userInfo().username;
    assert.strictEqual(expandVars('${USER}-name'), `${user}-name`);
  });

  it('does not expand arbitrary env vars like $GRAFANA_URL', () => {
    const original = '$GRAFANA_URL';
    assert.strictEqual(expandVars(original), original);
  });

  it('leaves a string with no vars unchanged', () => {
    assert.strictEqual(expandVars('no-vars-here'), 'no-vars-here');
  });
});

// ---------------------------------------------------------------------------
// loadMcpServers — validation
// ---------------------------------------------------------------------------

describe('loadMcpServers', () => {
  it('returns [] when mcp-servers.json does not exist', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-empty-'));
    const result = loadMcpServers(repoRoot);
    assert.deepStrictEqual(result, []);
  });

  it('loads a valid command-based entry (no wrapper)', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'kubernetes',
        scope: 'user',
        transport: 'stdio',
        command: 'kubectl',
        args: ['mcp', 'serve'],
      },
    ]);
    const servers = loadMcpServers(repoRoot);
    assert.strictEqual(servers.length, 1);
    assert.strictEqual(servers[0]?.name, 'kubernetes');
  });

  it('loads a valid wrapper-based entry (no command)', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'grafana',
        scope: 'user',
        transport: 'stdio',
        wrapper: 'wrappers/mcp-grafana.sh',
      },
    ]);
    const servers = loadMcpServers(repoRoot);
    assert.strictEqual(servers.length, 1);
    assert.strictEqual(servers[0]?.name, 'grafana');
  });

  it('throws when entry has both wrapper and command', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'bad-server',
        scope: 'user',
        transport: 'stdio',
        command: 'some-cmd',
        wrapper: 'wrappers/some.sh',
      },
    ]);
    assert.throws(
      () => loadMcpServers(repoRoot),
      (err: unknown) =>
        err instanceof Error && err.message.includes('must not have both'),
    );
  });

  it('throws when entry has neither wrapper nor command', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'bad-server',
        scope: 'user',
        transport: 'stdio',
      },
    ]);
    assert.throws(
      () => loadMcpServers(repoRoot),
      (err: unknown) =>
        err instanceof Error && err.message.includes('must have either'),
    );
  });

  it('throws on invalid scope', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'bad-scope',
        scope: 'global',
        transport: 'stdio',
        command: 'some-cmd',
      },
    ]);
    assert.throws(
      () => loadMcpServers(repoRoot),
      (err: unknown) =>
        err instanceof Error && err.message.includes('invalid scope'),
    );
  });

  it('throws on invalid transport', () => {
    const repoRoot = writeMcpFile([
      {
        name: 'bad-transport',
        scope: 'user',
        transport: 'websocket',
        command: 'some-cmd',
      },
    ]);
    assert.throws(
      () => loadMcpServers(repoRoot),
      (err: unknown) =>
        err instanceof Error && err.message.includes('invalid transport'),
    );
  });
});

// ---------------------------------------------------------------------------
// buildAddArgs — wrapper-based servers
// ---------------------------------------------------------------------------

describe('buildAddArgs — wrapper-based server', () => {
  it('returns correct args with absolute wrapper path and no -e flags when wrapper file exists', () => {
    // Create a real wrapper file so statSync succeeds
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-wrapper-'));
    const fakeHomedir = fs.mkdtempSync(path.join(tmpDir, 'home-wrapper-'));
    const wrappersDir = path.join(fakeHomedir, '.claude', 'wrappers');
    fs.mkdirSync(wrappersDir, { recursive: true });
    const wrapperFile = path.join(wrappersDir, 'mcp-grafana.sh');
    fs.writeFileSync(
      wrapperFile,
      '#!/usr/bin/env bash\nexec uvx mcp-grafana\n',
    );

    const server = {
      name: 'grafana',
      scope: 'user' as const,
      transport: 'stdio' as const,
      wrapper: 'wrappers/mcp-grafana.sh',
    };

    const args = buildAddArgs(server, repoRoot, fakeHomedir);

    const expectedWrapperPath = path.join(
      fakeHomedir,
      '.claude',
      'wrappers/mcp-grafana.sh',
    );
    assert.deepStrictEqual(args, [
      '-s',
      'user',
      '-t',
      'stdio',
      '--',
      'grafana',
      expectedWrapperPath,
    ]);

    // Must not contain any -e flags
    assert.ok(
      !args.includes('-e'),
      'wrapper-based args must not contain -e flags',
    );
  });

  it('throws with descriptive error when wrapper file does not exist', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-missing-'));
    const fakeHomedir = fs.mkdtempSync(path.join(tmpDir, 'home-missing-'));

    const server = {
      name: 'grafana',
      scope: 'user' as const,
      transport: 'stdio' as const,
      wrapper: 'wrappers/mcp-grafana.sh',
    };

    const expectedWrapperPath = path.join(
      fakeHomedir,
      '.claude',
      'wrappers/mcp-grafana.sh',
    );

    assert.throws(
      () => buildAddArgs(server, repoRoot, fakeHomedir),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes('Wrapper script not found'),
          `expected "Wrapper script not found" in: ${err.message}`,
        );
        assert.ok(
          err.message.includes(expectedWrapperPath),
          `expected path "${expectedWrapperPath}" in: ${err.message}`,
        );
        assert.ok(
          err.message.includes('grafana'),
          `expected server name "grafana" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('resolves user-scope wrapper against homedir/.claude/ instead of repoRoot', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-user-scope-'));
    const fakeHomedir = fs.mkdtempSync(path.join(tmpDir, 'home-user-scope-'));
    const wrappersDir = path.join(fakeHomedir, '.claude', 'wrappers');
    fs.mkdirSync(wrappersDir, { recursive: true });
    fs.writeFileSync(
      path.join(wrappersDir, 'mcp-test.sh'),
      '#!/usr/bin/env bash\nexec echo test\n',
    );

    const server = {
      name: 'test-server',
      scope: 'user' as const,
      transport: 'stdio' as const,
      wrapper: 'wrappers/mcp-test.sh',
    };

    const args = buildAddArgs(server, repoRoot, fakeHomedir);

    const expectedWrapperPath = path.join(
      fakeHomedir,
      '.claude',
      'wrappers/mcp-test.sh',
    );
    assert.ok(
      args.includes(expectedWrapperPath),
      `expected args to contain "${expectedWrapperPath}", got: ${JSON.stringify(args)}`,
    );
  });

  it('resolves project-scope wrapper against repoRoot', () => {
    const fakeRepoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-proj-scope-'));
    const wrappersDir = path.join(fakeRepoRoot, 'wrappers');
    fs.mkdirSync(wrappersDir);
    fs.writeFileSync(
      path.join(wrappersDir, 'some.sh'),
      '#!/usr/bin/env bash\nexec echo some\n',
    );

    const server = {
      name: 'some-server',
      scope: 'project' as const,
      transport: 'stdio' as const,
      wrapper: 'wrappers/some.sh',
    };

    const args = buildAddArgs(server, fakeRepoRoot);

    const expectedWrapperPath = path.join(fakeRepoRoot, 'wrappers/some.sh');
    assert.ok(
      args.includes(expectedWrapperPath),
      `expected args to contain "${expectedWrapperPath}", got: ${JSON.stringify(args)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// buildAddArgs — command-based servers
// ---------------------------------------------------------------------------

describe('buildAddArgs — command-based server', () => {
  it('returns correct args with -e flags and command', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-cmd-'));

    const server = {
      name: 'kubernetes',
      scope: 'user' as const,
      transport: 'stdio' as const,
      command: 'kubectl',
      args: ['mcp', 'serve'],
      env: {
        KUBECONFIG: '/home/user/.kube/config',
      },
    };

    const args = buildAddArgs(server, repoRoot);

    assert.deepStrictEqual(args, [
      '-s',
      'user',
      '-t',
      'stdio',
      '-e',
      'KUBECONFIG=/home/user/.kube/config',
      '--',
      'kubernetes',
      'kubectl',
      'mcp',
      'serve',
    ]);
  });

  it('expands $HOME in env values', () => {
    const home = os.homedir();
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-home-'));

    const server = {
      name: 'mytool',
      scope: 'user' as const,
      transport: 'stdio' as const,
      command: 'mytool',
      env: {
        CONFIG: '$HOME/.config/mytool',
      },
    };

    const args = buildAddArgs(server, repoRoot);

    const envFlag = args.find((a) => a.startsWith('CONFIG='));
    assert.ok(envFlag !== undefined, 'should have CONFIG= env flag');
    assert.strictEqual(envFlag, `CONFIG=${home}/.config/mytool`);
  });

  it('appends args after the command', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-args-'));

    const server = {
      name: 'cloudwatch',
      scope: 'user' as const,
      transport: 'stdio' as const,
      command: 'uvx',
      args: ['awslabs.cloudwatch-mcp-server@0.0.19'],
    };

    const args = buildAddArgs(server, repoRoot);

    // Command and args appear after "--"
    const separatorIndex = args.indexOf('--');
    assert.ok(separatorIndex !== -1, 'args must contain "--" separator');
    const afterSep = args.slice(separatorIndex + 1);
    assert.deepStrictEqual(afterSep, [
      'cloudwatch',
      'uvx',
      'awslabs.cloudwatch-mcp-server@0.0.19',
    ]);
  });

  it('handles a server with no env and no args', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-noenv-'));

    const server = {
      name: 'simple',
      scope: 'project' as const,
      transport: 'sse' as const,
      command: 'simple-cmd',
    };

    const args = buildAddArgs(server, repoRoot);

    assert.deepStrictEqual(args, [
      '-s',
      'project',
      '-t',
      'sse',
      '--',
      'simple',
      'simple-cmd',
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeConfigSignature
// ---------------------------------------------------------------------------

describe('computeConfigSignature', () => {
  const baseServer = {
    name: 'grafana',
    scope: 'user' as const,
    transport: 'stdio' as const,
    wrapper: 'wrappers/mcp-grafana.sh',
  };
  const repoRoot = '/tmp/fake-repo';
  const fakeHomedir = '/tmp/fake-home';

  it('produces identical signatures for identical inputs', () => {
    const sig1 = computeConfigSignature(baseServer, repoRoot, fakeHomedir);
    const sig2 = computeConfigSignature(baseServer, repoRoot, fakeHomedir);
    assert.strictEqual(sig1, sig2);
  });

  it('produces different signatures when wrapper path changes', () => {
    const other = { ...baseServer, wrapper: 'wrappers/mcp-other.sh' };
    const sig1 = computeConfigSignature(baseServer, repoRoot, fakeHomedir);
    const sig2 = computeConfigSignature(other, repoRoot, fakeHomedir);
    assert.notStrictEqual(sig1, sig2);
  });

  it('produces different signatures when transport changes', () => {
    const other = { ...baseServer, transport: 'sse' as const };
    const sig1 = computeConfigSignature(baseServer, repoRoot, fakeHomedir);
    const sig2 = computeConfigSignature(other, repoRoot, fakeHomedir);
    assert.notStrictEqual(sig1, sig2);
  });

  it('produces different signatures when scope changes', () => {
    const other = { ...baseServer, scope: 'project' as const };
    const sig1 = computeConfigSignature(baseServer, repoRoot, fakeHomedir);
    const sig2 = computeConfigSignature(other, repoRoot, fakeHomedir);
    assert.notStrictEqual(sig1, sig2);
  });

  it('resolves user-scope wrapper against homedir', () => {
    const localHome = '/custom/home';
    const sig = computeConfigSignature(baseServer, repoRoot, localHome);
    const expectedPath = path.join(
      localHome,
      '.claude',
      'wrappers/mcp-grafana.sh',
    );
    assert.ok(
      sig.includes(expectedPath),
      `expected signature to contain "${expectedPath}", got: ${sig}`,
    );
  });

  it('throws when server has no wrapper field', () => {
    const commandServer = {
      name: 'kubernetes',
      scope: 'user' as const,
      transport: 'stdio' as const,
      command: 'kubectl',
    };
    assert.throws(() => computeConfigSignature(commandServer, repoRoot));
  });
});

// ---------------------------------------------------------------------------
// readStamps
// ---------------------------------------------------------------------------

describe('readStamps', () => {
  it('returns empty object when file does not exist', () => {
    const nonexistent = path.join(tmpDir, 'no-such-stamps.json');
    const result = readStamps(nonexistent);
    assert.deepStrictEqual(result, {});
  });

  it('returns parsed stamps from valid JSON file', () => {
    const stampsPath = path.join(tmpDir, 'valid-stamps.json');
    const stamps = {
      grafana: '{"name":"grafana"}',
      kubernetes: '{"name":"k8s"}',
    };
    fs.writeFileSync(stampsPath, JSON.stringify(stamps), 'utf8');
    const result = readStamps(stampsPath);
    assert.deepStrictEqual(result, stamps);
  });

  it('returns empty object and does not throw on corrupted JSON', () => {
    const stampsPath = path.join(tmpDir, 'corrupt-stamps.json');
    fs.writeFileSync(stampsPath, 'not valid json {{{', 'utf8');
    const result = readStamps(stampsPath);
    assert.deepStrictEqual(result, {});
  });
});

// ---------------------------------------------------------------------------
// writeStamps
// ---------------------------------------------------------------------------

describe('writeStamps', () => {
  it('writes stamps to disk as pretty JSON', () => {
    const stampsPath = path.join(tmpDir, 'written-stamps.json');
    const stamps = { grafana: 'sig1', kubernetes: 'sig2' };
    writeStamps(stampsPath, stamps);
    const written = fs.readFileSync(stampsPath, 'utf8');
    assert.strictEqual(written, JSON.stringify(stamps, null, 2));
  });

  it('does not throw when path is unwritable', () => {
    const stampsPath = path.join(tmpDir, 'no', 'such', 'dir', 'stamps.json');
    assert.doesNotThrow(() => writeStamps(stampsPath, { key: 'value' }));
  });
});

// ---------------------------------------------------------------------------
// Helpers for GitHub multi-account tests
// ---------------------------------------------------------------------------

/**
 * Creates a fake homedir with the necessary directory structure.
 * Returns the path to the fake homedir.
 */
function makeFakeHome(): string {
  const fakeHome = fs.mkdtempSync(path.join(tmpDir, 'home-gh-'));
  fs.mkdirSync(path.join(fakeHome, '.config', 'tpk'), { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.claude', 'wrappers'), { recursive: true });
  return fakeHome;
}

/**
 * Writes a github-pats.json to the fake home's .config directory and sets
 * the given octal mode on it.
 */
function writePatsFile(
  fakeHome: string,
  contents: unknown,
  mode: number = 0o600,
): string {
  const patsPath = path.join(fakeHome, '.config', 'tpk', 'github-pats.json');
  fs.writeFileSync(patsPath, JSON.stringify(contents), 'utf8');
  fs.chmodSync(patsPath, mode);
  return patsPath;
}

/** Creates a settings.json with an allowedTools array (and optional extra tools). */
function writeSettings(
  fakeHome: string,
  allowedTools: string[],
  extra: Record<string, unknown> = {},
): string {
  const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
  const content = { allowedTools, ...extra };
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(content, null, 2) + '\n',
    'utf8',
  );
  return settingsPath;
}

function readSettings(fakeHome: string): Record<string, unknown> {
  const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<
    string,
    unknown
  >;
}

/** Captured spawnSync call record. */
interface SpawnCall {
  cmd: string;
  args: string[];
}

/**
 * Replaces execFileSync with a stub that records calls and optionally
 * throws on certain command patterns. Returns the call log and a restore fn.
 *
 * The stub is injected via the module-level override pattern: we monkey-patch
 * the `child_process` module's execFileSync by temporarily replacing it on
 * the mcp module's internal binding. Because the TypeScript source imports
 * execFileSync as a named import at module load time, we cannot replace it
 * after the fact. Instead, we pass a `spawnFn` override to functions that
 * accept it (registerGithubAccounts etc. accept an optional last parameter).
 */

// ---------------------------------------------------------------------------
// removeLegacyGithubRegistration
// ---------------------------------------------------------------------------

/** Stub that always throws — used to assert error-tolerance. */
function alwaysThrowStub(_cmd: string, _args: string[]): void {
  throw new Error('command failed');
}

/** No-op stub — used in tests that only check thrown errors and don't need call capture. */
function noOpStub(_cmd: string, _args: string[]): void {
  // intentionally empty
}

describe('removeLegacyGithubRegistration', () => {
  it('invokes claude mcp remove -s user github exactly once', () => {
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
    };

    removeLegacyGithubRegistration(stub);

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      cmd: 'claude',
      args: ['mcp', 'remove', '-s', 'user', 'github'],
    });
  });

  it('does not throw when the command fails (legacy registration absent)', () => {
    assert.doesNotThrow(() => removeLegacyGithubRegistration(alwaysThrowStub));
  });
});

// ---------------------------------------------------------------------------
// addMcpServer
// ---------------------------------------------------------------------------

function withCapturedLog<T>(fn: () => T): { result: T; logLines: string[] } {
  const originalLog = console.log;
  const logLines: string[] = [];
  console.log = (...args: unknown[]) => logLines.push(args.join(' '));
  try {
    const result = fn();
    return { result, logLines };
  } finally {
    console.log = originalLog;
  }
}

describe('addMcpServer', () => {
  const commandServer = {
    name: 'kubernetes',
    scope: 'user' as const,
    transport: 'stdio' as const,
    command: 'kubectl',
    args: ['mcp', 'serve'],
  };

  it('returns true and logs green on success', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-add-ok-'));
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
    };

    const { result, logLines } = withCapturedLog(() =>
      addMcpServer(commandServer, repoRoot, stub),
    );

    assert.strictEqual(result, true);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0]!.args, [
      'mcp',
      'add',
      '-s',
      'user',
      '-t',
      'stdio',
      '--',
      'kubernetes',
      'kubectl',
      'mcp',
      'serve',
    ]);
    assert.ok(
      logLines.some((l) =>
        l.includes(`MCP server '${commandServer.name}' added`),
      ),
      `expected added log, got: ${logLines.join(', ')}`,
    );
  });

  it('returns false and logs red on failure', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-add-fail-'));

    const { result, logLines } = withCapturedLog(() =>
      addMcpServer(commandServer, repoRoot, alwaysThrowStub),
    );

    assert.strictEqual(result, false);
    assert.ok(
      logLines.some((l) =>
        l.includes(`Failed to add MCP server '${commandServer.name}'`),
      ),
      `expected failure log, got: ${logLines.join(', ')}`,
    );
  });

  it('warns yellow on ENOENT prereq but still calls spawnFn', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-add-prereq-'));
    const missingPrereq = path.join(repoRoot, 'does-not-exist');
    const server = { ...commandServer, prereq: missingPrereq };

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
    };

    const { result, logLines } = withCapturedLog(() =>
      addMcpServer(server, repoRoot, stub),
    );

    assert.strictEqual(result, true);
    assert.strictEqual(calls.length, 1);
    assert.ok(
      logLines.some(
        (l) =>
          l.includes('Warning:') &&
          l.includes(missingPrereq) &&
          l.includes(`${server.name} MCP will fail until this file is created`),
      ),
      `expected prereq warning, got: ${logLines.join(', ')}`,
    );
  });

  it('does not warn when prereq is undefined, and calls spawnFn normally', () => {
    const repoRoot = fs.mkdtempSync(path.join(tmpDir, 'repo-add-no-prereq-'));

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
    };

    const { result, logLines } = withCapturedLog(() =>
      addMcpServer(commandServer, repoRoot, stub),
    );

    assert.strictEqual(result, true);
    assert.strictEqual(calls.length, 1);
    assert.ok(
      !logLines.some((l) => l.includes('Warning:')),
      `expected no warning, got: ${logLines.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// assertWrappersDirNotWorldWritable
// ---------------------------------------------------------------------------

describe('assertWrappersDirNotWorldWritable', () => {
  it('is silent when wrappers dir mode is 0755', () => {
    const fakeHome = makeFakeHome();
    const wrappersDir = path.join(fakeHome, '.claude', 'wrappers');
    fs.chmodSync(wrappersDir, 0o755);

    const warnings: string[] = [];
    assertWrappersDirNotWorldWritable(fakeHome, (msg) => warnings.push(msg));

    assert.strictEqual(warnings.length, 0);
  });

  it('prints warning when wrappers dir mode is 0775 (group-writable)', () => {
    const fakeHome = makeFakeHome();
    const wrappersDir = path.join(fakeHome, '.claude', 'wrappers');
    fs.chmodSync(wrappersDir, 0o775);

    const warnings: string[] = [];
    assertWrappersDirNotWorldWritable(fakeHome, (msg) => warnings.push(msg));

    assert.ok(warnings.length > 0, 'expected at least one warning');
    assert.ok(
      warnings.some((w) => w.includes('wrappers')),
      `expected 'wrappers' in warning, got: ${warnings.join(', ')}`,
    );
  });

  it('prints warning when wrappers dir mode is 0777 (world-writable)', () => {
    const fakeHome = makeFakeHome();
    const wrappersDir = path.join(fakeHome, '.claude', 'wrappers');
    fs.chmodSync(wrappersDir, 0o777);

    const warnings: string[] = [];
    assertWrappersDirNotWorldWritable(fakeHome, (msg) => warnings.push(msg));

    assert.ok(warnings.length > 0, 'expected at least one warning');
  });
});

// ---------------------------------------------------------------------------
// registerGithubAccounts
// ---------------------------------------------------------------------------

describe('registerGithubAccounts', () => {
  it('registers one server per key in sorted order with only GITHUB_ACCOUNT env, no PAT in argv', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, { work: 'ghp_b', personal: 'ghp_a' });

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
    };

    const result = registerGithubAccounts(fakeHome, stub);

    // Should have registered 2 accounts (each: remove + add = 2 calls per account)
    const addCalls = calls.filter(
      (c) => c.cmd === 'claude' && c.args.includes('add'),
    );
    assert.strictEqual(addCalls.length, 2, 'expected exactly 2 mcp add calls');

    // Sorted order: personal before work
    const firstAdd = addCalls[0]!;
    const secondAdd = addCalls[1]!;
    assert.ok(
      firstAdd.args.includes('github-personal'),
      `expected first add to be for 'personal', got: ${JSON.stringify(firstAdd.args)}`,
    );
    assert.ok(
      secondAdd.args.includes('github-work'),
      `expected second add to be for 'work', got: ${JSON.stringify(secondAdd.args)}`,
    );

    // Each add must contain -e GITHUB_ACCOUNT=<key>
    assert.ok(
      firstAdd.args.includes('-e') &&
        firstAdd.args.includes('GITHUB_ACCOUNT=personal'),
      `expected GITHUB_ACCOUNT=personal in argv: ${JSON.stringify(firstAdd.args)}`,
    );
    assert.ok(
      secondAdd.args.includes('-e') &&
        secondAdd.args.includes('GITHUB_ACCOUNT=work'),
      `expected GITHUB_ACCOUNT=work in argv: ${JSON.stringify(secondAdd.args)}`,
    );

    // No GITHUB_PERSONAL_ACCESS_TOKEN anywhere in any call's args
    for (const call of calls) {
      for (const arg of call.args) {
        assert.ok(
          !arg.includes('GITHUB_PERSONAL_ACCESS_TOKEN'),
          `found GITHUB_PERSONAL_ACCESS_TOKEN in argv: ${JSON.stringify(call.args)}`,
        );
      }
    }

    // No PAT values in any arg
    for (const call of calls) {
      for (const arg of call.args) {
        assert.ok(
          !arg.includes('ghp_a') && !arg.includes('ghp_b'),
          `found PAT value in argv: ${JSON.stringify(call.args)}`,
        );
      }
    }

    // Wrapper path resolves to fakeHome/.claude/wrappers/mcp-github.sh
    const expectedWrapperPath = path.join(
      fakeHome,
      '.claude',
      'wrappers',
      'mcp-github.sh',
    );
    assert.ok(
      firstAdd.args.includes(expectedWrapperPath),
      `expected wrapper path in add args: ${JSON.stringify(firstAdd.args)}`,
    );

    // Returns the set of registered keys
    assert.deepStrictEqual(result, new Set(['personal', 'work']));
  });

  it('returns empty set and prints warning when github-pats.json is absent', () => {
    const fakeHome = makeFakeHome();
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    const warnings: string[] = [];
    const result = registerGithubAccounts(fakeHome, stub, (msg) =>
      warnings.push(msg),
    );

    assert.deepStrictEqual(result, new Set());
    assert.ok(
      warnings.some((w) => w.includes('not found')),
      `expected 'not found' warning, got: ${warnings.join(', ')}`,
    );
    const addCalls = calls.filter((c) => c.args.includes('add'));
    assert.strictEqual(addCalls.length, 0);
  });

  it('returns empty set and prints warning when github-pats.json is empty object', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, {});
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    const warnings: string[] = [];
    const result = registerGithubAccounts(fakeHome, stub, (msg) =>
      warnings.push(msg),
    );

    assert.deepStrictEqual(result, new Set());
    assert.ok(
      warnings.some((w) => w.includes('empty')),
      `expected 'empty' warning, got: ${warnings.join(', ')}`,
    );
    const addCalls = calls.filter((c) => c.args.includes('add'));
    assert.strictEqual(addCalls.length, 0);
  });

  it('throws on invalid JSON and error message does not include file contents', () => {
    const fakeHome = makeFakeHome();
    const patsPath = path.join(fakeHome, '.config', 'tpk', 'github-pats.json');
    fs.writeFileSync(patsPath, 'not-valid-json-{{{', 'utf8');
    fs.chmodSync(patsPath, 0o600);

    assert.throws(
      () => registerGithubAccounts(fakeHome, noOpStub),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // Must not include file contents
        assert.ok(
          !err.message.includes('not-valid-json'),
          `error message must not include file contents, got: ${err.message}`,
        );
        // Must include path
        assert.ok(
          err.message.includes('github-pats.json'),
          `error message must include path, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('throws when PAT value is a number, error identifies key only not value', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, { personal: 123 });

    assert.throws(
      () => registerGithubAccounts(fakeHome, noOpStub),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes('personal'),
          `expected key name in error: ${err.message}`,
        );
        assert.ok(
          !err.message.includes('123'),
          `must not include value '123' in error: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('throws when PAT value is empty string, error identifies key only', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, { personal: '' });

    assert.throws(
      () => registerGithubAccounts(fakeHome, noOpStub),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes('personal'),
          `expected key name in error: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('throws when key contains invalid characters', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, { 'per sonal': 'ghp_x' });

    assert.throws(
      () => registerGithubAccounts(fakeHome, noOpStub),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('prints mode warning when github-pats.json mode is 0644 but continues to register', () => {
    const fakeHome = makeFakeHome();
    writePatsFile(fakeHome, { personal: 'ghp_a' }, 0o644);
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    const warnings: string[] = [];
    registerGithubAccounts(fakeHome, stub, (msg) => warnings.push(msg));

    assert.ok(
      warnings.some((w) => w.includes('644') || w.includes('0644')),
      `expected mode warning, got: ${warnings.join(', ')}`,
    );
    const addCalls = calls.filter((c) => c.args.includes('add'));
    assert.strictEqual(addCalls.length, 1, 'should still register 1 account');
  });
});

// ---------------------------------------------------------------------------
// removeStaleGithubRegistrations
// ---------------------------------------------------------------------------

describe('removeStaleGithubRegistrations', () => {
  it('removes stale github-old but not desired github-personal or unrelated grafana', () => {
    const fakeHome = makeFakeHome();
    const claudeJsonPath = path.join(fakeHome, '.claude.json');
    fs.writeFileSync(
      claudeJsonPath,
      JSON.stringify({
        mcpServers: {
          'github-old': { type: 'stdio', command: '/some/wrapper' },
          'github-personal': { type: 'stdio', command: '/some/wrapper' },
          grafana: { type: 'stdio', command: '/some/wrapper' },
        },
      }),
      'utf8',
    );

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    removeStaleGithubRegistrations(new Set(['personal']), fakeHome, stub);

    const removeCalls = calls.filter(
      (c) => c.cmd === 'claude' && c.args.includes('remove'),
    );
    assert.strictEqual(removeCalls.length, 1, 'expected exactly 1 remove call');
    assert.ok(
      removeCalls[0]!.args.includes('github-old'),
      `expected github-old to be removed, got: ${JSON.stringify(removeCalls[0]!.args)}`,
    );

    // Assert grafana and github-personal not removed
    for (const call of removeCalls) {
      assert.ok(!call.args.includes('grafana'), 'must not remove grafana');
      assert.ok(
        !call.args.includes('github-personal'),
        'must not remove github-personal (still desired)',
      );
    }
  });

  it('removes stale github-my_account (underscore suffix, F-10 mirror)', () => {
    const fakeHome = makeFakeHome();
    const claudeJsonPath = path.join(fakeHome, '.claude.json');
    fs.writeFileSync(
      claudeJsonPath,
      JSON.stringify({
        mcpServers: {
          'github-my_account': { type: 'stdio', command: '/some/wrapper' },
        },
      }),
      'utf8',
    );

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    removeStaleGithubRegistrations(new Set(['personal']), fakeHome, stub);

    const removeCalls = calls.filter(
      (c) => c.cmd === 'claude' && c.args.includes('remove'),
    );
    assert.strictEqual(removeCalls.length, 1);
    assert.ok(removeCalls[0]!.args.includes('github-my_account'));
  });

  it('does not remove the legacy github (no hyphen suffix) server', () => {
    const fakeHome = makeFakeHome();
    const claudeJsonPath = path.join(fakeHome, '.claude.json');
    fs.writeFileSync(
      claudeJsonPath,
      JSON.stringify({
        mcpServers: {
          github: { type: 'stdio', command: '/some/wrapper' },
        },
      }),
      'utf8',
    );

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    removeStaleGithubRegistrations(new Set(), fakeHome, stub);

    const removeCalls = calls.filter(
      (c) => c.cmd === 'claude' && c.args.includes('remove'),
    );
    assert.strictEqual(
      removeCalls.length,
      0,
      'legacy github should not be removed by removeStale (removeLegacy handles it)',
    );
  });

  it('returns silently when ~/.claude.json is absent', () => {
    const fakeHome = makeFakeHome();
    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });

    assert.doesNotThrow(() =>
      removeStaleGithubRegistrations(new Set(), fakeHome, stub),
    );
    assert.strictEqual(calls.length, 0);
  });

  it('prints yellow warning and returns without throwing when ~/.claude.json is malformed', () => {
    const fakeHome = makeFakeHome();
    const claudeJsonPath = path.join(fakeHome, '.claude.json');
    fs.writeFileSync(claudeJsonPath, 'not-valid-json', 'utf8');

    const calls: SpawnCall[] = [];
    const stub = (cmd: string, args: string[]) => calls.push({ cmd, args });
    const warnings: string[] = [];

    assert.doesNotThrow(() =>
      removeStaleGithubRegistrations(new Set(), fakeHome, stub, (msg) =>
        warnings.push(msg),
      ),
    );
    assert.ok(
      warnings.some(
        (w) => w.includes('invalid JSON') || w.includes('claude.json'),
      ),
      `expected warning about invalid JSON, got: ${warnings.join(', ')}`,
    );
    assert.strictEqual(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// updateGithubAllowList
// ---------------------------------------------------------------------------

describe('updateGithubAllowList', () => {
  it('adds mcp__github-personal__* and mcp__github-work__* in sorted order', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, ['Bash(git *)']);

    updateGithubAllowList(new Set(['work', 'personal']), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    assert.ok(tools.includes('mcp__github-personal__*'));
    assert.ok(tools.includes('mcp__github-work__*'));
    // sorted: personal before work when appended
    const piIdx = tools.indexOf('mcp__github-personal__*');
    const wiIdx = tools.indexOf('mcp__github-work__*');
    assert.ok(piIdx < wiIdx, 'personal should appear before work (sorted)');
    // Unrelated entry preserved
    assert.ok(tools.includes('Bash(git *)'));
  });

  it('is idempotent: calling twice with same input produces byte-identical output', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, ['Bash(git *)']);

    updateGithubAllowList(new Set(['personal']), fakeHome);
    const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
    const after1 = fs.readFileSync(settingsPath, 'utf8');

    updateGithubAllowList(new Set(['personal']), fakeHome);
    const after2 = fs.readFileSync(settingsPath, 'utf8');

    assert.strictEqual(
      after1,
      after2,
      'file must be byte-identical on second run',
    );
  });

  it('removes stale mcp__github-old__* when key is no longer in desired set', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, ['mcp__github-old__*', 'Bash(git *)']);

    updateGithubAllowList(new Set(['personal']), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    assert.ok(
      !tools.includes('mcp__github-old__*'),
      'stale entry must be removed',
    );
    assert.ok(
      tools.includes('mcp__github-personal__*'),
      'new entry must be added',
    );
    assert.ok(
      tools.includes('Bash(git *)'),
      'unrelated entry must be preserved',
    );
  });

  it('removes mcp__github-my_account__* (underscore in key, F-10)', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, ['mcp__github-my_account__*', 'Bash(git *)']);

    updateGithubAllowList(new Set(['personal']), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    assert.ok(
      !tools.includes('mcp__github-my_account__*'),
      'underscore-suffix stale entry must be removed',
    );
    assert.ok(tools.includes('mcp__github-personal__*'));
  });

  it('removes multi-character-class entries (dots, dashes, underscores) when desired set is empty', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, [
      'mcp__github-foo.bar__*',
      'mcp__github-foo-bar__*',
      'mcp__github-foo_bar__*',
      'Bash(git *)',
    ]);

    updateGithubAllowList(new Set(), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    assert.ok(!tools.includes('mcp__github-foo.bar__*'));
    assert.ok(!tools.includes('mcp__github-foo-bar__*'));
    assert.ok(!tools.includes('mcp__github-foo_bar__*'));
    assert.ok(tools.includes('Bash(git *)'));
  });

  it('removes github entry when desired set is empty', () => {
    const fakeHome = makeFakeHome();
    writeSettings(fakeHome, ['mcp__github-foo__*', 'Bash(git *)']);

    updateGithubAllowList(new Set(), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    assert.ok(!tools.includes('mcp__github-foo__*'));
    assert.ok(tools.includes('Bash(git *)'));
  });

  it('does not reorder or modify unrelated entries', () => {
    const fakeHome = makeFakeHome();
    const originalTools = [
      'Bash(git *)',
      'mcp__grafana__search_dashboards',
      'Write(~/.ai-tpk/**)',
    ];
    writeSettings(fakeHome, originalTools);

    updateGithubAllowList(new Set(['personal']), fakeHome);

    const settings = readSettings(fakeHome);
    const tools = settings['allowedTools'] as string[];
    // Original entries preserved and in original order
    const gitIdx = tools.indexOf('Bash(git *)');
    const grafanaIdx = tools.indexOf('mcp__grafana__search_dashboards');
    const writeIdx = tools.indexOf('Write(~/.ai-tpk/**)');
    assert.ok(gitIdx < grafanaIdx, 'original order preserved');
    assert.ok(grafanaIdx < writeIdx, 'original order preserved');
  });

  it('throws when settings file is malformed and does not write', () => {
    const fakeHome = makeFakeHome();
    const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
    fs.writeFileSync(settingsPath, 'not-valid-json', 'utf8');

    assert.throws(
      () => updateGithubAllowList(new Set(['personal']), fakeHome),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );

    // File must remain unchanged
    const onDisk = fs.readFileSync(settingsPath, 'utf8');
    assert.strictEqual(onDisk, 'not-valid-json');
  });

  it('prints warning and returns when settings file does not exist', () => {
    const fakeHome = makeFakeHome();
    // Don't write settings file
    const warnings: string[] = [];
    assert.doesNotThrow(() =>
      updateGithubAllowList(new Set(['personal']), fakeHome, (msg) =>
        warnings.push(msg),
      ),
    );
    assert.ok(
      warnings.some((w) => w.includes('settings.json')),
      `expected warning about missing settings.json, got: ${warnings.join(', ')}`,
    );
  });

  it('uses atomic temp+rename write pattern', () => {
    const fakeHome = makeFakeHome();
    const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
    writeSettings(fakeHome, ['Bash(git *)']);

    // Collect file ops by checking what files are created/modified in the .claude dir
    // We verify by checking that no .tmp file remains after the call
    updateGithubAllowList(new Set(['personal']), fakeHome);

    // The final file must exist and be valid JSON
    const content = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    assert.ok(
      Array.isArray(parsed['allowedTools']),
      'allowedTools must be an array',
    );

    // No temp files should remain in .claude dir
    const claudeDir = path.join(fakeHome, '.claude');
    const entries = fs.readdirSync(claudeDir);
    const tempFiles = entries.filter((e) => e.includes('.tmp.'));
    assert.strictEqual(
      tempFiles.length,
      0,
      `temp files must be cleaned up, found: ${tempFiles.join(', ')}`,
    );
  });
});
