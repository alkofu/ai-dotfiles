import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { c } from './colors.js';

/** Matches test-script file names (e.g. test-permission-learn.sh) that must never be installed. */
const TEST_FILE_PATTERN = /^test-.*\.sh$/;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

function timestamp(): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const SS = pad(now.getSeconds());
  return `${YYYY}${MM}${DD}_${HH}${mm}${SS}`;
}

export function backupIfExists(targetPath: string): void {
  try {
    fs.statSync(targetPath);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return;
    }
    throw err;
  }
  const backupPath = `${targetPath}.backup.${timestamp()}`;
  console.log(c.yellow(`Backing up existing ${targetPath} to ${backupPath}`));
  fs.renameSync(targetPath, backupPath);
}

export function installPath(src: string, dest: string): void {
  backupIfExists(dest);

  console.log(c.green(`Copying: ${src} -> ${dest}`));
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (source) => !TEST_FILE_PATTERN.test(path.basename(source)),
  });
}

export function installDir(
  scriptDir: string,
  srcName: string,
  destName: string,
  destRoot: string = os.homedir(),
): void {
  const srcPath = path.join(scriptDir, srcName);
  const destPath = path.join(destRoot, destName);

  try {
    const srcStat = fs.statSync(srcPath);
    if (!srcStat.isDirectory()) {
      console.log(c.yellow(`Skipping ${srcName} (not found in repository)`));
      return;
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      console.log(c.yellow(`Skipping ${srcName} (not found in repository)`));
      return;
    }
    throw err;
  }

  installPath(srcPath, destPath);
}
