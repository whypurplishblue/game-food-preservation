/**
 * Credit coverage check.
 *
 * Every .glb under public/assets/models must be listed in
 * src/content/credits.js — either in MODEL_CREDITS (a downloaded asset that
 * carries a license) or SELF_MADE (authored in-house, nothing to attribute).
 * This is what actually enforces "add the credit when you add the model":
 * a new file with neither entry fails this check, so it can't quietly ship
 * unattributed.
 *
 *   node tools/check-credits.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_CREDITS, SELF_MADE } from '../src/content/credits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '../public/assets/models');

function glbsIn(dir, base = dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(glbsIn(full, base));
    else if (entry.name.endsWith('.glb')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const onDisk = glbsIn(MODELS_DIR).sort();
const credited = new Set(MODEL_CREDITS.map((c) => c.file));
const selfMade = new Set(SELF_MADE.map((s) => s.file));
const nonModelEntries = [...credited].filter((f) => !f.endsWith('.glb'));

// Every file that actually exists must have exactly one kind of entry.
const missing = onDisk.filter((f) => !credited.has(f) && !selfMade.has(f));
const doubleListed = onDisk.filter((f) => credited.has(f) && selfMade.has(f));

// Entries whose file no longer exists — stale bookkeeping, not a hard
// failure on its own, but worth flagging so credits.js does not silently
// accumulate dead rows as models get renamed or removed. Only .glb entries
// are checked here; credits.js also carries non-model assets (e.g. audio)
// that this script does not track.
const stale = [...credited, ...selfMade].filter((f) => f.endsWith('.glb') && !onDisk.includes(f));

const line = (name, arr) =>
  console.log(name.padEnd(24) + (arr.length === 0 ? 'PASS' : `FAIL (${arr.length})\n    ` + arr.join('\n    ')));

console.log(`models on disk: ${onDisk.length}  |  credited: ${credited.size}  |  self-made: ${selfMade.size}`);
line('missing credit', missing);
line('listed twice', doubleListed);
line('non-model entries', nonModelEntries);
line('stale entries', stale);

const failed = missing.length + doubleListed.length + nonModelEntries.length + stale.length;
console.log('\n' + (failed ? `${failed} problem(s)` : 'every model file is credited'));
process.exit(failed ? 1 : 0);
