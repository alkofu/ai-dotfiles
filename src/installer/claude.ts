import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { c } from './colors.js';
import { installPath } from './fs-utils.js';
import { installMergedJson } from './settings.js';
import { CLAUDE_WHITELIST_DIRS, CLAUDE_WHITELIST_FILES } from './constants.js';

export function installClaudeWhitelist(
  scriptDir: string,
  destRoot: string = os.homedir(),
): void {
  const claudeSrc = path.join(scriptDir, 'claude');

  try {
    const claudeSrcStat = fs.statSync(claudeSrc);
    if (!claudeSrcStat.isDirectory()) {
      console.log(c.yellow('Skipping claude/ (not found in repository)'));
      return;
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      console.log(c.yellow('Skipping claude/ (not found in repository)'));
      return;
    }
    throw err;
  }

  const dotClaudePath = path.join(destRoot, '.claude');

  fs.mkdirSync(dotClaudePath, { recursive: true });

  // Standalone files
  for (const fileName of CLAUDE_WHITELIST_FILES) {
    const fileSrc = path.join(claudeSrc, fileName);
    const fileDest = path.join(dotClaudePath, fileName);
    try {
      const stat = fs.statSync(fileSrc);
      if (stat.isFile()) {
        if (fileName === 'settings.json') {
          installMergedJson(fileSrc, fileDest);
        } else {
          installPath(fileSrc, fileDest);
        }
      } else {
        console.log(
          c.yellow(`Skipping claude/${fileName} (not a regular file)`),
        );
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        console.log(
          c.yellow(`Skipping claude/${fileName} (not found in repository)`),
        );
      } else {
        throw err;
      }
    }
  }

  // Sub-directories
  for (const name of CLAUDE_WHITELIST_DIRS) {
    const subSrc = path.join(claudeSrc, name);
    try {
      const subStat = fs.statSync(subSrc);
      if (subStat.isDirectory()) {
        installPath(subSrc, path.join(dotClaudePath, name));
      } else {
        console.log(
          c.yellow(`Skipping claude/${name}/ (not found in repository)`),
        );
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        console.log(
          c.yellow(`Skipping claude/${name}/ (not found in repository)`),
        );
      } else {
        throw err;
      }
    }
  }
}
