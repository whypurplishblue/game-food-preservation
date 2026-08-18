/**
 * One palette for the whole game. Every colour in the 3D scene and the DOM UI
 * resolves from here, which is what keeps assets looking like one set rather
 * than six unrelated machines.
 *
 * Hues are lifted from the Preservation Panic concept art: warm honey wood,
 * bright saturated machine bodies, cream UI panels, deep teal shadow.
 */

export const PALETTE = {
  // --- environment
  wood:        0xc98f4e,
  woodDark:    0x9c6835,
  woodLight:   0xe3b378,
  counter:     0xd9a468,
  floor:       0x6f5642,
  wallWarm:    0xf3e2c7,
  wallCool:    0xcfe0e8,
  shadowTint:  0x2b1d33,

  // --- neutrals for machine bodies
  steel:       0xd6dde4,
  steelDark:   0x8d99a6,
  steelDeep:   0x59636e,
  plasticWhite:0xf5f7fa,
  rubber:      0x3a4048,
  brass:       0xd9a441,
  glass:       0xbfe4ef,

  // --- station identity (mirrors METHODS[].colour, kept in sync by test)
  drying:      0xffa726,
  dryingDeep:  0xe8801a,
  freezing:    0x42a5f5,
  freezingDeep:0x1668b8,
  vacuum:      0xab47bc,
  vacuumDeep:  0x7b2d8e,
  pickling:    0x66bb6a,
  picklingDeep:0x3d8c42,
  salting:     0xef5350,
  saltingDeep: 0xb3312f,
  pasteurising:0x29b6f6,
  pasteurisingDeep: 0x0288c4,

  // --- feedback
  success:     0x76d275,
  successDeep: 0x3f9e42,
  danger:      0xff5252,
  dangerDeep:  0xc62828,
  warn:        0xffca28,
  gold:        0xffc107,
  goldDeep:    0xe0a000,

  // --- microbes: hue encodes activity, so colour itself carries the lesson
  microbeStrong:    0xe53935,
  microbeWeakening: 0xfb8c00,
  microbeWeak:      0xf0b429,
  microbeSafe:      0x66bb6a,

  // --- food freshness ramp
  freshTint:   0xffffff,
  spoilTint:   0x6e7a4a,
  mould:       0x9ab973,
  mouldDark:   0x5f7a46,
};

/** Microbe colour for an activity level 0..1 (1 = rampant). */
export function microbeColour(activity) {
  if (activity > 0.62) return PALETTE.microbeStrong;
  if (activity > 0.30) return PALETTE.microbeWeakening;
  if (activity > 0.12) return PALETTE.microbeWeak;
  return PALETTE.microbeSafe;
}

/** CSS custom properties so the DOM UI and the 3D scene never diverge. */
export function injectCssVariables() {
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(PALETTE)) {
    root.style.setProperty(`--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, hex(v));
  }
}
