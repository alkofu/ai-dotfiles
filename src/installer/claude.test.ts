import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { installClaudeWhitelist } from './claude.js';
import { CLAUDE_WHITELIST_DIRS, CLAUDE_WHITELIST_FILES } from './constants.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tpk-test-'));

// Build a fake source tree: tmpDir/claude/ with all whitelisted items
function buildFakeClaudeSrc(
  base: string,
  include: string[] = [...CLAUDE_WHITELIST_FILES, ...CLAUDE_WHITELIST_DIRS],
) {
  const claudeSrc = path.join(base, 'claude');
  fs.mkdirSync(claudeSrc, { recursive: true });
  for (const name of include) {
    const p = path.join(claudeSrc, name);
    if (name === 'settings.json') {
      fs.writeFileSync(p, JSON.stringify({ fake: 'settings.json' }));
    } else if (CLAUDE_WHITELIST_FILES.includes(name)) {
      fs.writeFileSync(p, `fake ${name}`);
    } else {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  return base;
}

after(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('installClaudeWhitelist', () => {
  it('installs all whitelisted items into destRoot/.claude', () => {
    const src = path.join(tmpDir, 'full-install-src');
    const dest = path.join(tmpDir, 'full-install-dest');
    buildFakeClaudeSrc(src);
    installClaudeWhitelist(src, dest);
    const dotClaude = path.join(dest, '.claude');
    for (const name of CLAUDE_WHITELIST_FILES) {
      assert.ok(
        fs.existsSync(path.join(dotClaude, name)),
        `${name} should be installed`,
      );
    }
    for (const name of CLAUDE_WHITELIST_DIRS) {
      assert.ok(
        fs.existsSync(path.join(dotClaude, name)),
        `${name}/ should be installed`,
      );
    }
  });

  it('preserves the executable bit on installed scripts', () => {
    const src = path.join(tmpDir, 'exec-bit-src');
    const dest = path.join(tmpDir, 'exec-bit-dest');
    const claudeSrc = path.join(src, 'claude');
    const scriptsDir = path.join(claudeSrc, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const scriptFile = path.join(scriptsDir, 'sample.sh');
    fs.writeFileSync(scriptFile, '#!/bin/sh\necho hello\n');
    fs.chmodSync(scriptFile, 0o755);
    installClaudeWhitelist(src, dest);
    const destPath = path.join(dest, '.claude', 'scripts', 'sample.sh');
    assert.ok(
      (fs.statSync(destPath).mode & 0o100) !== 0,
      'installed script should have owner-execute bit set',
    );
  });

  it('skips missing items without throwing', () => {
    const src = path.join(tmpDir, 'partial-install-src');
    const dest = path.join(tmpDir, 'partial-install-dest');
    // Only include a subset
    buildFakeClaudeSrc(src, ['settings.json', 'skills']);
    assert.doesNotThrow(() => installClaudeWhitelist(src, dest));
    const dotClaude = path.join(dest, '.claude');
    assert.ok(fs.existsSync(path.join(dotClaude, 'settings.json')));
    assert.ok(fs.existsSync(path.join(dotClaude, 'skills')));
    assert.ok(!fs.existsSync(path.join(dotClaude, 'CLAUDE.md')));
  });

  it('merges settings.json, preserving local-only keys and applying template conflicts', () => {
    const src = path.join(tmpDir, 'merge-settings-src');
    const dest = path.join(tmpDir, 'merge-settings-dest');
    buildFakeClaudeSrc(src, ['settings.json']);
    fs.writeFileSync(
      path.join(src, 'claude', 'settings.json'),
      JSON.stringify({
        allowedTools: ['Bash', 'Read'],
        env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'template-model' },
      }),
    );
    const destSettingsPath = path.join(dest, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(destSettingsPath), { recursive: true });
    fs.writeFileSync(
      destSettingsPath,
      JSON.stringify({
        apiKeyHelper: 'helper.sh',
        model: 'claude-opus-4-8[1m]',
        env: {
          ANTHROPIC_BASE_URL: 'https://local.example.com',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'local-model',
        },
      }),
    );
    installClaudeWhitelist(src, dest);
    const merged = JSON.parse(fs.readFileSync(destSettingsPath, 'utf8'));
    assert.strictEqual(merged.apiKeyHelper, 'helper.sh');
    assert.strictEqual(merged.model, 'claude-opus-4-8[1m]');
    assert.strictEqual(
      merged.env.ANTHROPIC_BASE_URL,
      'https://local.example.com',
    );
    assert.strictEqual(
      merged.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
      'template-model',
    );
    assert.deepStrictEqual(merged.allowedTools, ['Bash', 'Read']);
  });
});
