
Learning syllabus docs/y6-sci-u8.md

## 3D model attribution

Every `.glb` under `public/assets/models/` must be listed in `src/content/credits.js`, either in:

- `CREDITS` — a downloaded asset that carries an external license (author, source URL, license name + URL). These are the ones shown to players on the in-game Credits screen (title screen and pause menu → © Credits).
- `SELF_MADE` — a model authored in-house. No external license, just a short note. Not shown on the Credits screen.

`tools/check-credits.mjs` (`npm run test:credits`) walks the models folder and fails if any file is missing from both lists, listed in both, or if an entry points at a file that no longer exists.

**When adding a new downloaded model:** drop the `.glb` into `public/assets/models/`, then add a `CREDITS` entry with the matching `file` path (relative to `public/assets/models/`, e.g. `foods/prawns.glb`) in the same commit. `npm run test:credits` will fail until you do.

**When adding a new self-made model:** add a `SELF_MADE` entry instead.

The Credits screen (`Screens.js` → `credits()`) renders `CREDITS` directly — there is no separate copy to keep in sync, so updating `credits.js` is the only step needed.
