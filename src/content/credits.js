/**
 * Attribution for external creative work used by the game.
 *
 * Keep each kind of work in its own list. CREDIT_CATEGORIES is the single
 * registry used by the Credits screen, while tools/check-credits.mjs uses
 * MODEL_CREDITS and SELF_MADE to audit every .glb under public/assets/models.
 *
 * For model entries, `file` is relative to public/assets/models/, for example
 * 'foods/prawns.glb'. For other assets it is relative to public/.
 *
 * ADDING A NEW DOWNLOADED MODEL
 * Drop the .glb into public/assets/models/, then add a MODEL_CREDITS entry
 * with the same `file` path in the same commit — `npm run test:credits` fails
 * otherwise, so a downloaded model cannot silently ship unattributed.
 *
 * ADDING A NEW SELF-MADE MODEL
 * Add a SELF_MADE entry instead — no external license to carry, just a note
 * of what it is. Self-made models are not shown on the Credits screen.
 *
 * ADDING A DIFFERENT KIND OF ASSET
 * Add it to the matching list below and add a category to CREDIT_CATEGORIES
 * if that kind is not already represented there.
 */

export const MODEL_CREDITS = [
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
];

export const AUDIO_CREDITS = [
  {
    file: 'assets/sounds/creatorshome-turn-a-page-336933.mp3',
    title: 'Turn a Page',
    author: 'CreatorsHome',
    sourceUrl: 'https://pixabay.com/sound-effects/film-special-effects-turn-a-page-336933/',
    license: 'Pixabay Content License',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
  },
];

// Reserve a separate home for visual, educational, or other inspiration
// sources that are not shipped assets. Empty categories stay hidden in the UI.
export const INSPIRATION_CREDITS = [];

export const CREDIT_CATEGORIES = [
  { titleKey: 'ui.credits3dAssets', entries: MODEL_CREDITS },
  { titleKey: 'ui.creditsAudio', entries: AUDIO_CREDITS },
  { titleKey: 'ui.creditsInspiration', entries: INSPIRATION_CREDITS },
];

// Authored in-house — confirmed by the project owner (2026-08-18). No
// external license to carry; listed here only so check-credits.mjs has
// something to match every .glb on disk against.
export const SELF_MADE = [
  { file: 'foods/bananas.glb', note: 'in-house model' },
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
