/**
 * CURRICULUM — language-neutral structure.
 * ============================================================================
 * SOURCE OF TRUTH: "Year 6 Science — Unit 8: Food Preservation Technology".
 *
 * RULES FOR EDITING THIS FILE
 *  1. Every food→method pairing below appears in the notes. Do not add pairings
 *     that the notes do not list, even if they are true in real life.
 *  2. All human-readable text lives in ./locales/*.json, keyed by the ids here.
 *     Adding Malay or Chinese must never require touching gameplay code.
 *  3. `sourceRef` on each method points at the section of the notes it came
 *     from, so a teacher can audit the game against the handout.
 *
 * The notes list ten methods. Six are playable stations in this build; the
 * remaining four (boiling, waxing, smoking, canning) are defined here with
 * `playable: false` so the Fact Book can still teach them and so a later build
 * can promote them to stations without a data migration.
 * ============================================================================
 */

/** What a method physically changes. Drives microbe-defeat animation + quizzes. */
export const MECHANISM = {
  REMOVES_WATER: 'removes_water',
  LOW_TEMPERATURE: 'low_temperature',
  REMOVES_AIR: 'removes_air',
  CHANGES_ENVIRONMENT: 'changes_environment',
  HIGH_TEMPERATURE: 'high_temperature',
  SEALS_SURFACE: 'seals_surface',
  // §5I is explicit that pasteurising is heat AND immediate cooling. Sharing
  // boiling's plain HIGH_TEMPERATURE made the quiz teach only half the method.
  HEAT_THEN_COOL: 'heat_then_cool',
};

export const METHODS = {
  // ---------------------------------------------------------------- playable
  drying: {
    id: 'drying',
    playable: true,
    station: 'DryingRack',
    sourceRef: '§5B',
    mechanism: MECHANISM.REMOVES_WATER,
    // "Drying removes water from food. Microorganisms cannot survive or become
    //  inactive when there is no water." — §5B
    changes: 'water',
    microbeEffect: 'shrivel',
    colour: 0xffa726,
    accent: 0xffd54f,
    icon: 'sun',
    foods: ['fish', 'prawns', 'squid', 'fruits'],
    interaction: 'hang-and-sun',
  },
  /**
   * §5E is one section but TWO methods: different temperatures, different food
   * lists, and §7 lists them as separate rows. They share a station (one
   * cabinet, one dial) but they are NOT the same method — labelling milk
   * "freezing" would teach the opposite of what the exam asks for.
   */
  freezing: {
    id: 'freezing',
    playable: true,
    station: 'Freezer',
    sourceRef: '§5E',
    mechanism: MECHANISM.LOW_TEMPERATURE,
    changes: 'temperature',
    microbeEffect: 'freeze',
    colour: 0x42a5f5,
    accent: 0x81d4fa,
    icon: 'snowflake',
    foods: ['chicken', 'meat', 'prawns', 'squid'],
    interaction: 'dial-temperature',
    targetC: -18,
    acceptC: [-30, 0],          // "0°C and below"
  },
  cooling: {
    id: 'cooling',
    playable: true,
    station: 'Freezer',         // same cabinet, different setting
    sourceRef: '§5E',
    mechanism: MECHANISM.LOW_TEMPERATURE,
    changes: 'temperature',
    microbeEffect: 'freeze',
    colour: 0x26c6da,
    accent: 0xb2ebf2,
    icon: 'snowflake',
    foods: ['fruits', 'vegetables', 'milk'],
    interaction: 'dial-temperature',
    targetC: 4,
    acceptC: [1, 7],            // "around 4°C"
  },
  vacuum: {
    id: 'vacuum',
    playable: true,
    station: 'VacuumSealer',
    sourceRef: '§5D',
    mechanism: MECHANISM.REMOVES_AIR,
    changes: 'air',
    microbeEffect: 'crush',
    colour: 0xab47bc,
    accent: 0xce93d8,
    icon: 'vacuum',
    foods: ['meat', 'sausages', 'mushrooms'],
    interaction: 'hold-to-evacuate',
  },
  pickling: {
    id: 'pickling',
    playable: true,
    station: 'PicklingJar',
    sourceRef: '§5C',
    mechanism: MECHANISM.CHANGES_ENVIRONMENT,
    changes: 'acidity / concentration',
    microbeEffect: 'dissolve',
    colour: 0x66bb6a,
    accent: 0xa5d6a7,
    icon: 'jar',
    foods: ['fruits', 'vegetables'],
    interaction: 'pour-and-seal',
    /** All three are correct per §5C — the player picks any one. */
    solutions: ['vinegar', 'sugar_solution', 'salt_solution'],
  },
  salting: {
    id: 'salting',
    playable: true,
    station: 'SaltTable',
    sourceRef: '§5F',
    mechanism: MECHANISM.REMOVES_WATER, // "Salt removes moisture from food"
    changes: 'moisture',
    microbeEffect: 'dehydrate',
    colour: 0xef5350,
    accent: 0xff8a80,
    icon: 'salt',
    foods: ['fish', 'eggs', 'vegetables'],
    interaction: 'scoop-and-spread',
  },
  pasteurising: {
    id: 'pasteurising',
    playable: true,
    station: 'Pasteuriser',
    sourceRef: '§5I',
    // NOT plain HIGH_TEMPERATURE: §5I's answer is "heating it to kill
    // microorganisms AND THEN cooling it quickly". Sharing boiling's mechanism
    // made the quiz mark half the method as the whole answer.
    mechanism: MECHANISM.HEAT_THEN_COOL,
    changes: 'temperature',
    microbeEffect: 'zap',
    colour: 0x29b6f6,
    accent: 0xb3e5fc,
    icon: 'thermometer',
    foods: ['milk', 'fruit_juice'],
    interaction: 'heat-then-chill',
    /** Both programmes are given in §5I; either is correct. */
    programmes: [
      { id: 'p63', holdC: 63, holdLabelSeconds: 1800, gameHoldMs: 2600 },
      { id: 'p72', holdC: 72, holdLabelSeconds: 15, gameHoldMs: 1400 },
    ],
    /** "Then it is cooled immediately at 4°C" — the time window enforces this. */
    chill: { targetC: 4, windowMs: 3200 },
  },

  // ------------------------------------------------ fact-book only (not yet playable)
  boiling: {
    id: 'boiling', playable: false, sourceRef: '§5A',
    mechanism: MECHANISM.HIGH_TEMPERATURE, changes: 'temperature',
    colour: 0xff7043, foods: ['rendang', 'jam'],
  },
  waxing: {
    id: 'waxing', playable: false, sourceRef: '§5G',
    mechanism: MECHANISM.SEALS_SURFACE, changes: 'surface',
    colour: 0xd4e157, foods: ['apples', 'oranges', 'tomatoes'],
  },
  smoking: {
    id: 'smoking', playable: false, sourceRef: '§5H',
    mechanism: MECHANISM.REMOVES_WATER, changes: 'moisture',
    colour: 0x8d6e63, foods: ['fish', 'meat', 'bananas'],
  },
  canning: {
    id: 'canning', playable: false, sourceRef: '§5J',
    mechanism: MECHANISM.HIGH_TEMPERATURE, changes: 'temperature + sealing',
    colour: 0x78909c, foods: ['meat', 'fruits', 'vegetables'],
  },
};

/**
 * FOODS. `valid` is derived from METHODS[].foods at load time (see deriveFoodMethods)
 * so the two can never drift apart. `primary` is the association the notes lead
 * with, used for hint badges and for choosing a target in guided stages.
 */
export const FOODS = {
  fish:        { id: 'fish',        primary: 'drying',       model: 'fish',      scale: 1.0,  category: 'seafood' },
  prawns:      { id: 'prawns',      primary: 'freezing',     model: 'prawns',    scale: 0.95, category: 'seafood' },
  squid:       { id: 'squid',       primary: 'drying',       model: 'squid',     scale: 1.0,  category: 'seafood' },
  chicken:     { id: 'chicken',     primary: 'freezing',     model: 'chicken',   scale: 1.0,  category: 'meat' },
  meat:        { id: 'meat',        primary: 'vacuum',       model: 'meat',      scale: 1.0,  category: 'meat' },
  sausages:    { id: 'sausages',    primary: 'vacuum',       model: 'sausages',  scale: 1.0,  category: 'meat' },
  mushrooms:   { id: 'mushrooms',   primary: 'vacuum',       model: 'mushrooms', scale: 0.9,  category: 'produce' },
  fruits:      { id: 'fruits',      primary: 'pickling',     model: 'fruits',    scale: 1.0,  category: 'produce' },
  vegetables:  { id: 'vegetables',  primary: 'pickling',     model: 'vegetables',scale: 1.05, category: 'produce' },
  eggs:        { id: 'eggs',        primary: 'salting',      model: 'eggs',      scale: 0.9,  category: 'other' },
  milk:        { id: 'milk',        primary: 'pasteurising', model: 'milk',      scale: 1.0,  category: 'liquid' },
  fruit_juice: { id: 'fruit_juice', primary: 'pasteurising', model: 'juice',     scale: 1.0,  category: 'liquid' },
};

/**
 * Mechanism quiz bank. Each entry: the correct answer is the method's own
 * mechanism; distractors are OTHER real mechanisms from the notes, never
 * invented ones. This is what makes the wrong answers educational.
 */
export const MECHANISM_OPTIONS = [
  MECHANISM.REMOVES_WATER,
  MECHANISM.REMOVES_AIR,
  MECHANISM.LOW_TEMPERATURE,
  MECHANISM.HIGH_TEMPERATURE,
  MECHANISM.CHANGES_ENVIRONMENT,
  MECHANISM.HEAT_THEN_COOL,
];

const ALL_SIX = ['drying', 'freezing', 'cooling', 'vacuum', 'pickling', 'salting', 'pasteurising'];

/**
 * Six stages, per the brief. Difficulty is data, not code.
 *
 * FLAGS THAT MATTER
 *  showStationLabels   name plates on the machines
 *  showMethodHintOnFood a chip on the food naming its method (Stage 1 only)
 *  shufflePositions    re-deal the slots at stage start, so a position learned
 *                      in an earlier stage carries no information
 *  reshuffleMidStage   also re-deal DURING play (Mastery only)
 */
export const STAGES = [
  {
    id: 1, key: 'learn',
    methods: ['drying', 'freezing'],
    showStationLabels: true, showMethodHintOnFood: true,
    spoilRateMul: 0.35, spawnIntervalMs: 7000, maxActiveFoods: 2,
    quizChance: 0.0, targetPreserved: 6,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 2, key: 'practice',
    // Cooling joins here, so the dial stops having one right answer.
    methods: ['drying', 'freezing', 'cooling', 'vacuum', 'pickling'],
    // Badge off: the Stage 2 brief promises the food no longer tells you the
    // method, and the copy must be true.
    showStationLabels: true, showMethodHintOnFood: false,
    spoilRateMul: 0.6, spawnIntervalMs: 5600, maxActiveFoods: 3,
    quizChance: 0.25, targetPreserved: 8,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 3, key: 'panic',
    methods: ALL_SIX,
    showStationLabels: true, showMethodHintOnFood: false,
    spoilRateMul: 1.0, spawnIntervalMs: 4000, maxActiveFoods: 4,
    quizChance: 0.3, targetPreserved: 10,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 4, key: 'recall',
    methods: ALL_SIX,
    showStationLabels: false, showMethodHintOnFood: false,
    spoilRateMul: 1.0, spawnIntervalMs: 4200, maxActiveFoods: 4,
    quizChance: 0.35, targetPreserved: 10,
    // From here on the slots are re-dealt every stage. Otherwise a child could
    // read the labels in Stage 3, memorise the six positions, and clear the
    // label-free stages without ever looking at a machine.
    shufflePositions: true, reshuffleMidStage: false, allowFactBook: false,
  },
  {
    id: 5, key: 'why',
    methods: ALL_SIX,
    showStationLabels: false, showMethodHintOnFood: false,
    spoilRateMul: 0.85, spawnIntervalMs: 4600, maxActiveFoods: 3,
    quizChance: 1.0, targetPreserved: 10,
    shufflePositions: true, reshuffleMidStage: false, allowFactBook: false,
  },
  {
    id: 6, key: 'mastery',
    methods: ALL_SIX,
    showStationLabels: false, showMethodHintOnFood: false,
    spoilRateMul: 1.15, spawnIntervalMs: 3600, maxActiveFoods: 5,
    // Mastery must not ask fewer questions than the stage before it.
    quizChance: 1.0, targetPreserved: 14,
    shufflePositions: true, reshuffleMidStage: true, allowFactBook: false,
  },
];

export const SCORING = {
  base: 100,
  perfectInteractionBonus: 50,   // clean execution of the station mini-game
  quizCorrect: 150,
  quizWrong: 0,
  comboStep: 0.25,               // multiplier gained per consecutive success
  comboMax: 8,
  spoiledPenalty: -75,
  wrongStationPenalty: -50,
  starThresholds: [0.55, 0.75, 0.92], // fraction of achievable score
};

/** Derived: food -> every method the notes allow for it. Built once, frozen. */
export function deriveFoodMethods() {
  const map = {};
  for (const id of Object.keys(FOODS)) map[id] = [];
  for (const m of Object.values(METHODS)) {
    if (!m.playable) continue;
    for (const f of m.foods) if (map[f]) map[f].push(m.id);
  }
  return Object.freeze(map);
}

export const FOOD_METHODS = deriveFoodMethods();

/** station id -> the method ids that share it (Freezer serves freezing + cooling). */
export const STATION_METHODS = (() => {
  const map = {};
  for (const m of Object.values(METHODS)) {
    if (!m.playable) continue;
    (map[m.station] ||= []).push(m.id);
  }
  return Object.freeze(map);
})();

/** Unique station ids for a list of method ids, in order, deduplicated. */
export function stationsFor(methodIds) {
  const out = [];
  for (const id of methodIds) {
    const st = METHODS[id]?.station;
    if (st && !out.includes(st)) out.push(st);
  }
  return out;
}

/**
 * Which of a station's methods applies to this food.
 *
 * This is what keeps milk reported as "Cooling" and chicken as "Freezing" even
 * though both go into the same cabinet — the station is shared, the method
 * taught is not.
 *
 * @param {string[]|null} allowed restrict to methods unlocked this stage
 */
export function methodAtStation(stationId, foodId, allowed = null) {
  for (const id of STATION_METHODS[stationId] || []) {
    if (allowed && !allowed.includes(id)) continue;
    if (METHODS[id].foods.includes(foodId)) return id;
  }
  return null;
}

/** Dev-time guard: catches a food listed on a method but missing from FOODS. */
export function validateCurriculum() {
  const problems = [];
  for (const m of Object.values(METHODS)) {
    if (!m.playable) continue;
    for (const f of m.foods) {
      if (!FOODS[f]) problems.push(`METHODS.${m.id} lists unknown food "${f}"`);
    }
  }
  for (const f of Object.values(FOODS)) {
    if (!METHODS[f.primary]) problems.push(`FOODS.${f.id}.primary "${f.primary}" is not a method`);
    if (!FOOD_METHODS[f.id]?.includes(f.primary)) {
      problems.push(`FOODS.${f.id}.primary "${f.primary}" does not list ${f.id} in its foods[]`);
    }
    if (!FOOD_METHODS[f.id]?.length) problems.push(`FOODS.${f.id} has no valid playable method`);
  }
  // A food must not be claimed by two methods that share one station, or the
  // station could not decide which method name to report for it.
  for (const [stationId, ids] of Object.entries(STATION_METHODS)) {
    const seen = new Map();
    for (const id of ids) {
      for (const f of METHODS[id].foods) {
        if (seen.has(f)) problems.push(`${stationId}: "${f}" is claimed by both ${seen.get(f)} and ${id}`);
        seen.set(f, id);
      }
    }
  }
  // Every stage must reference only real methods.
  for (const st of STAGES) {
    for (const id of st.methods) {
      if (!METHODS[id]?.playable) problems.push(`STAGES[${st.id}] lists non-playable method "${id}"`);
    }
  }
  return problems;
}
