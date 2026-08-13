import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { deepMergeJson, installMergedJson } from './settings.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tpk-test-'));

after(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('deepMergeJson', () => {
  it('preserves a base-only top-level key', () => {
    const base = { apiKeyHelper: 'helper.sh', model: 'claude-opus-4-8[1m]' };
    const overlay = { allowedTools: ['Bash'] };
    const merged = deepMergeJson(base, overlay);
    assert.strictEqual(merged.apiKeyHelper, 'helper.sh');
    assert.strictEqual(merged.model, 'claude-opus-4-8[1m]');
  });

  it('takes the overlay value on a conflicting top-level key', () => {
    const base = { defaultMode: 'old-mode' };
    const overlay = { defaultMode: 'new-mode' };
    const merged = deepMergeJson(base, overlay);
    assert.strictEqual(merged.defaultMode, 'new-mode');
  });

  it('deep-merges nested objects, applying template keys and retaining local-only keys', () => {
    const base = {
      env: {
        ANTHROPIC_BASE_URL: 'https://local.example.com',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'old-model',
      },
    };
    const overlay = {
      env: {
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'new-model',
      },
    };
    const merged = deepMergeJson(base, overlay) as typeof base;
    assert.strictEqual(
      merged.env.ANTHROPIC_BASE_URL,
      'https://local.example.com',
    );
    assert.strictEqual(merged.env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'new-model');
  });

  it('replaces an array key wholesale rather than concatenating', () => {
    const base = { allowedTools: ['Bash', 'Read'] };
    const overlay = { allowedTools: ['Read', 'Write'] };
    const merged = deepMergeJson(base, overlay);
    assert.deepStrictEqual(merged.allowedTools, ['Read', 'Write']);
  });

  it('does not mutate its inputs', () => {
    const base = { env: { A: '1' } };
    const overlay = { env: { B: '2' } };
    const baseCopy = JSON.parse(JSON.stringify(base));
    const overlayCopy = JSON.parse(JSON.stringify(overlay));
    deepMergeJson(base, overlay);
    assert.deepStrictEqual(base, baseCopy);
    assert.deepStrictEqual(overlay, overlayCopy);
  });
});

describe('installMergedJson', () => {
  it('merges into an existing valid-JSON dest and creates a backup', () => {
    const src = path.join(tmpDir, 'template-valid.json');
    const dest = path.join(tmpDir, 'dest-valid.json');
    fs.writeFileSync(
      src,
      JSON.stringify({ allowedTools: ['Bash'], env: { A: 'template' } }),
    );
    fs.writeFileSync(
      dest,
      JSON.stringify({ apiKeyHelper: 'helper.sh', env: { B: 'local' } }),
    );
    installMergedJson(src, dest);
    const merged = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert.strictEqual(merged.apiKeyHelper, 'helper.sh');
    assert.deepStrictEqual(merged.allowedTools, ['Bash']);
    assert.strictEqual(merged.env.A, 'template');
    assert.strictEqual(merged.env.B, 'local');
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('dest-valid.json.backup.'));
    assert.strictEqual(backups.length, 1);
  });

  it('writes the template verbatim when dest is missing, without a backup', () => {
    const src = path.join(tmpDir, 'template-missing.json');
    const dest = path.join(tmpDir, 'dest-missing.json');
    fs.writeFileSync(src, JSON.stringify({ allowedTools: ['Bash'] }));
    installMergedJson(src, dest);
    const written = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert.deepStrictEqual(written, { allowedTools: ['Bash'] });
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('dest-missing.json.backup.'));
    assert.strictEqual(backups.length, 0);
  });

  it('falls back to overwrite-with-backup when dest is malformed JSON', () => {
    const src = path.join(tmpDir, 'template-malformed.json');
    const dest = path.join(tmpDir, 'dest-malformed.json');
    fs.writeFileSync(src, JSON.stringify({ allowedTools: ['Bash'] }));
    fs.writeFileSync(dest, '{ not valid json');
    assert.doesNotThrow(() => installMergedJson(src, dest));
    const written = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert.deepStrictEqual(written, { allowedTools: ['Bash'] });
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('dest-malformed.json.backup.'));
    assert.strictEqual(backups.length, 1);
  });

  it('falls back to overwrite-with-backup when dest parses to a non-object', () => {
    const src = path.join(tmpDir, 'template-nonobject.json');
    const dest = path.join(tmpDir, 'dest-nonobject.json');
    fs.writeFileSync(src, JSON.stringify({ allowedTools: ['Bash'] }));
    fs.writeFileSync(dest, JSON.stringify(['not', 'an', 'object']));
    assert.doesNotThrow(() => installMergedJson(src, dest));
    const written = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert.deepStrictEqual(written, { allowedTools: ['Bash'] });
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('dest-nonobject.json.backup.'));
    assert.strictEqual(backups.length, 1);
  });
});
