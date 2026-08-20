/**
 * Attribution for every 3D model under public/assets/models.
 *
 * This is the one place attribution lives. The Credits screen (Screens.js)
 * imports CREDITS and renders it directly — no separate copy to keep in
 * sync — and tools/check-credits.mjs walks public/assets/models/**\/*.glb and
 * fails if any file has neither a CREDITS nor a SELF_MADE entry here.
 *
 * `file` is the path relative to public/assets/models/, e.g. 'foods/prawns.glb'.
 *
 * ADDING A NEW DOWNLOADED MODEL
 * Drop the .glb into public/assets/models/, then add a CREDITS entry below
 * with the same `file` path in the same commit — `npm run test:credits`
 * fails otherwise, so a downloaded asset can't silently ship unattributed.
 *
 * ADDING A NEW SELF-MADE MODEL
 * Add a SELF_MADE entry instead — no external license to carry, just a note
 * of what it is. Self-made models are not shown on the Credits screen.
 */

export const CREDITS = [
  {
    file: 'foods/prawns.glb',
    title: 'Shrimp [Low Poly]',
    author: 'Fecalis',
    sourceUrl: 'https://skfb.ly/oKoOB',
    license: 'CC BY 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  },
  {
    file: 'foods/meat.glb',
    title: 'Steak',
    author: 'unclef',
    sourceUrl: 'https://skfb.ly/JD7w',
    license: 'CC BY 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  },
  {
    // Recovered from a prior (uncommitted) credits.txt in git history — the
    // working copy of credits.txt had already dropped this entry by the time
    // this file was written. Do not remove without checking that history.
    file: 'foods/low_poly_fish.glb',
    title: 'low poly fish',
    author: 'mastergames2435',
    sourceUrl: 'https://skfb.ly/pK8ZJ',
    license: 'CC BY 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  },
  {
    file: 'sounds/creatorshome-turn-a-page-336933.mp3',
    title: 'Turn a Page',
    author: 'CreatorsHome',
    sourceUrl: 'https://pixabay.com/sound-effects/film-special-effects-turn-a-page-336933/',
    license: 'Pixabay Content License',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
  },
];

// Authored in-house — confirmed by the project owner (2026-08-18). No
// external license to carry; listed here only so check-credits.mjs has
// something to match every .glb on disk against.
export const SELF_MADE = [
  { file: 'foods/chicken.glb', note: 'in-house model' },
  { file: 'foods/fish.glb', note: 'in-house model' },
  { file: 'foods/prawns-generated.glb', note: 'in-house model' },
  { file: 'foods/squid.glb', note: 'in-house model' },
  { file: 'stations/DryingRack.glb', note: 'in-house model' },
  { file: 'stations/Freezer.glb', note: 'in-house model' },
  { file: 'stations/Pasteuriser.glb', note: 'in-house model' },
  { file: 'stations/PicklingJar.glb', note: 'in-house model' },
  { file: 'stations/SaltTable.glb', note: 'in-house model' },
  { file: 'stations/VacuumSealer.glb', note: 'in-house model' },
];
