import * as fs from 'node:fs';
import { c } from './colors.js';
import { backupIfExists, installPath } from './fs-utils.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `overlay` onto `base`, returning a new object.
 *
 * For every key in `overlay`: if both `base[key]` and `overlay[key]` are
 * plain (non-array) objects, they are merged recursively; otherwise
 * `overlay[key]` replaces `base[key]` wholesale (scalars, arrays, and
 * `null` all replace rather than combine). Keys present only in `base`
 * are carried through unchanged. Neither input is mutated.
 *
 * This is intentionally a 2-way "template overlays live" merge, not a
 * 3-way merge: it has no concept of a prior common ancestor, so a key
 * that the template used to define and has since removed will NOT be
 * removed from an already-installed live file (only additions and
 * value-changes propagate). This is a known, accepted non-goal.
 */
export function deepMergeJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(overlay)) {
    const baseValue = base[key];
    const overlayValue = overlay[key];

    if (isPlainObject(baseValue) && isPlainObject(overlayValue)) {
      result[key] = deepMergeJson(baseValue, overlayValue);
    } else {
      result[key] = overlayValue;
    }
  }

  return result;
}

/**
 * Installs a JSON file at `dest`, merging it with the pre-existing live
 * file at `dest` (if any) rather than overwriting it wholesale.
 *
 * - If `dest` does not exist, the template at `src` is written verbatim.
 * - If `dest` exists and parses to a plain JSON object, the merged result
 *   (`deepMergeJson(live, template)`) is written, with the prior file
 *   preserved via `backupIfExists`.
 * - If `dest` exists but is malformed JSON, or parses to a non-object
 *   (e.g. a scalar or array), this falls back to the existing
 *   overwrite-with-backup behavior of `installPath` rather than
 *   attempting to merge non-object/malformed live data.
 */
export function installMergedJson(src: string, dest: string): void {
  // The template is repo-controlled and expected to always be valid JSON;
  // a parse failure here indicates a repo-side bug, so we deliberately let
  // it throw rather than silently falling back.
  const template = JSON.parse(fs.readFileSync(src, 'utf8')) as unknown;

  let live: unknown;
  try {
    live = JSON.parse(fs.readFileSync(dest, 'utf8'));
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      console.log(c.green(`Copying: ${src} -> ${dest}`));
      backupIfExists(dest);
      fs.writeFileSync(dest, JSON.stringify(template, null, 2) + '\n');
      return;
    }
    console.log(
      c.yellow(`Existing ${dest} is not valid JSON; falling back to overwrite`),
    );
    installPath(src, dest);
    return;
  }

  if (!isPlainObject(live) || !isPlainObject(template)) {
    console.log(
      c.yellow(
        `Existing ${dest} is not a JSON object; falling back to overwrite`,
      ),
    );
    installPath(src, dest);
    return;
  }

  const merged = deepMergeJson(live, template);
  backupIfExists(dest);
  console.log(c.green(`Merging: ${src} -> ${dest}`));
  fs.writeFileSync(dest, JSON.stringify(merged, null, 2) + '\n');
}
