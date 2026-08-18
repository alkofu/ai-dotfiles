import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { backupIfExists, installPath, installDir } from './fs-utils.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tpk-test-'));

after(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('backupIfExists', () => {
  it('renames an existing file', () => {
    const target = path.join(tmpDir, 'backup-file.txt');
    fs.writeFileSync(target, 'hello');
    backupIfExists(target);
    assert.ok(!fs.existsSync(target), 'original path should be gone');
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('backup-file.txt.backup.'));
    assert.strictEqual(backups.length, 1);
  });

  it('renames an existing directory', () => {
    const target = path.join(tmpDir, 'backup-dir');
    fs.mkdirSync(target);
    backupIfExists(target);
    assert.ok(!fs.existsSync(target));
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('backup-dir.backup.'));
    assert.strictEqual(backups.length, 1);
  });

  it('is a no-op for a non-existent path', () => {
    const target = path.join(tmpDir, 'does-not-exist');
    assert.doesNotThrow(() => backupIfExists(target));
    assert.ok(!fs.existsSync(target));
  });
});

describe('installPath', () => {
  it('recursively copies a directory', () => {
    const srcDir = path.join(tmpDir, 'copy-src');
    const destDir = path.join(tmpDir, 'copy-dest');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'nested.txt'), 'nested');
    installPath(srcDir, destDir);
    assert.ok(fs.existsSync(path.join(destDir, 'nested.txt')));
  });

  it('backs up existing copy on second call', () => {
    const srcDir = path.join(tmpDir, 'copy-src2');
    const destDir = path.join(tmpDir, 'copy-dest2');
    fs.mkdirSync(srcDir);
    installPath(srcDir, destDir);
    installPath(srcDir, destDir);
    const backups = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('copy-dest2.backup.'));
    assert.strictEqual(backups.length, 1);
  });

  it('excludes top-level test-*.sh files while copying other files', () => {
    const srcDir = path.join(tmpDir, 'copy-src-test-filter');
    const destDir = path.join(tmpDir, 'copy-dest-test-filter');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'keep.sh'), 'echo keep');
    fs.writeFileSync(path.join(srcDir, 'test-something.sh'), 'echo test');
    installPath(srcDir, destDir);
    assert.ok(fs.existsSync(path.join(destDir, 'keep.sh')));
    assert.ok(!fs.existsSync(path.join(destDir, 'test-something.sh')));
  });

  it('excludes nested test-*.sh files while copying other nested files', () => {
    const srcDir = path.join(tmpDir, 'copy-src-test-filter-nested');
    const destDir = path.join(tmpDir, 'copy-dest-test-filter-nested');
    const nestedSrc = path.join(srcDir, 'nested');
    fs.mkdirSync(nestedSrc, { recursive: true });
    fs.writeFileSync(path.join(nestedSrc, 'keep.sh'), 'echo keep');
    fs.writeFileSync(path.join(nestedSrc, 'test-nested.sh'), 'echo test');
    installPath(srcDir, destDir);
    assert.ok(fs.existsSync(path.join(destDir, 'nested', 'keep.sh')));
    assert.ok(!fs.existsSync(path.join(destDir, 'nested', 'test-nested.sh')));
  });
});

describe('installDir', () => {
  it('skips when source directory does not exist', () => {
    const destPath = path.join(tmpDir, '.nonexistent-dest');
    installDir(tmpDir, 'nonexistent-src', '.nonexistent-dest', tmpDir);
    assert.ok(
      !fs.existsSync(destPath),
      'dest should not be created when src is missing',
    );
  });

  it('installs when source directory exists', () => {
    const srcDir = path.join(tmpDir, 'real-src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'file.txt'), 'data');
    installDir(tmpDir, 'real-src', '.real-dest', tmpDir);
    const destPath = path.join(tmpDir, '.real-dest');
    assert.ok(fs.statSync(destPath).isDirectory());
  });
});
