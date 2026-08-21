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
    alsoWorks: ['meat', 'mushrooms', 'vegetables'],
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
    alsoWorks: ['fish', 'sausages'],
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
    alsoWorks: ['eggs', 'fruit_juice'],
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
    alsoWorks: ['fish', 'chicken', 'vegetables'],
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
    alsoWorks: ['eggs'],
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
    alsoWorks: ['meat'],
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
    alsoWorks: [],
    interaction: 'heat-then-chill',
    /** Both programmes are given in §5I; either is correct. */
    programmes: [
      { id: 'p63', holdC: 63, holdLabelSeconds: 1800, gameHoldMs: 2600 },
      { id: 'p72', holdC: 72, holdLabelSeconds: 15, gameHoldMs: 1400 },
    ],
    /** "Then it is cooled immediately at 4°C" — the time window enforces this. */
    chill: { targetC: 4, windowMs: 3200 },
  },

  /**
   * §5H — smoking. Its mechanism is REMOVES_WATER, the same as drying, and that
   * is exactly why it is worth playing: two different machines, two different
   * actions, one shared reason. A child who can say "smoking and drying both
   * take the water away" has understood mechanism rather than memorised a list.
   */
  smoking: {
    id: 'smoking', playable: true, station: 'Smokehouse', sourceRef: '§5H',
    mechanism: MECHANISM.REMOVES_WATER, changes: 'moisture',
    microbeEffect: 'shrivel',
    colour: 0x8d6e63, accent: 0xbcaaa4, icon: 'smoke',
    foods: ['fish', 'meat', 'bananas'],
    alsoWorks: ['chicken', 'sausages', 'squid'],
    interaction: 'hang-and-smoke',
    /** "This method takes a long time" — the bellows keep the fire going. */
    beats: 5,
  },
  /**
   * §5J — canning and bottling. Two actions in one method, and the notes say
   * both: cook at high temperature to kill, then seal in an airtight container.
   * The interaction has to be both, or it teaches half of it.
   */
  canning: {
    id: 'canning', playable: true, station: 'Cannery', sourceRef: '§5J',
    mechanism: MECHANISM.HIGH_TEMPERATURE, changes: 'temperature + sealing',
    microbeEffect: 'pop',
    colour: 0x78909c, accent: 0xb0bec5, icon: 'can',
    foods: ['meat', 'fruits', 'vegetables'],
    alsoWorks: ['fish', 'mushrooms'],
    interaction: 'fill-heat-seal',
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
/** Everything §5 makes playable: the six machines plus the smokehouse and the cannery. */
const EVERYTHING = [...ALL_SIX, 'smoking', 'canning'];

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
  /**
   * Stage 7 — the two new machines, taught by CONTRAST rather than by label.
   * Smoking sits next to drying because they share a mechanism, and canning
   * next to vacuum packing because one seals air out and the other takes it
   * away. Labels come back on: a machine nobody has ever seen cannot be
   * recalled, only guessed at.
   */
  {
    id: 7, key: 'newmachines',
    methods: ['drying', 'smoking', 'vacuum', 'canning', 'freezing', 'cooling'],
    showStationLabels: true, showMethodHintOnFood: false,
    spoilRateMul: 0.85, spawnIntervalMs: 4600, maxActiveFoods: 3,
    quizChance: 0.5, targetPreserved: 10,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  /**
   * Stage 8 — the whole kitchen. Eight machines, no labels, positions re-dealt
   * mid-stage, a question after every single preservation.
   */
  {
    id: 8, key: 'wholekitchen',
    methods: EVERYTHING,
    showStationLabels: false, showMethodHintOnFood: false,
    spoilRateMul: 1.25, spawnIntervalMs: 3400, maxActiveFoods: 5,
    quizChance: 1.0, targetPreserved: 14,
    shufflePositions: true, reshuffleMidStage: true, allowFactBook: false,
  },
];

/**
 * LEARNING mode — one clean pass through all nine playable methods, grouped
 * for contrast (cooling next to freezing, salting next to drying's mechanism,
 * smoking next to drying's machine). Labels and the food hint badge stay ON
 * throughout: the goal here is comprehension, not recall under pressure, so
 * nothing is ever hidden. `quizChance` is unused for these stages — Game.js
 * asks exactly one quiz per method, the first time it is correctly used,
 * rather than rolling a probability.
 */
export const LEARNING_STAGES = [
  {
    id: 1, key: 'learning1',
    methods: ['drying', 'freezing'],
    showStationLabels: true, showMethodHintOnFood: true,
    spoilRateMul: 0.5, spawnIntervalMs: 6000, maxActiveFoods: 2,
    quizChance: 0, targetPreserved: 2,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 2, key: 'learning2',
    // Cooling sits next to freezing on purpose — same cabinet, same dial,
    // different target temperature. The contrast IS the lesson.
    methods: ['cooling', 'vacuum', 'pickling'],
    showStationLabels: true, showMethodHintOnFood: true,
    spoilRateMul: 0.5, spawnIntervalMs: 5600, maxActiveFoods: 2,
    quizChance: 0, targetPreserved: 3,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 3, key: 'learning3',
    // Salting shares drying's mechanism (removes water) with a different
    // action — reinforces "mechanism, not machine".
    methods: ['salting', 'pasteurising'],
    showStationLabels: true, showMethodHintOnFood: true,
    spoilRateMul: 0.5, spawnIntervalMs: 5600, maxActiveFoods: 2,
    quizChance: 0, targetPreserved: 2,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
  {
    id: 4, key: 'learning4',
    methods: ['smoking', 'canning'],
    showStationLabels: true, showMethodHintOnFood: true,
    spoilRateMul: 0.5, spawnIntervalMs: 5600, maxActiveFoods: 2,
    quizChance: 0, targetPreserved: 2,
    shufflePositions: false, reshuffleMidStage: false, allowFactBook: true,
  },
];

/**
 * LEARNING mode scoring — correctness-weighted, not combo/speed-weighted, so
 * a leaderboard built on it reflects "how many methods do you actually know."
 * `maxPossible` deliberately excludes the time bonus: 100% is reachable by
 * being fully correct, the time bonus is a tiebreaker on top of that.
 */
export const LEARNING_SCORING = {
  firstAttemptBonus: 100,   // correct station, no wrong try first, for this food
  lateCorrectBonus: 50,     // correct eventually, after a wrong-station try
  quizCorrect: 50,          // one-shot, no retry credit
  quizWrong: -25,           // wrong quiz answer; visible penalty, but no dead end
  timeBonusMax: 5,          // per method, capped, tiebreak-only
  maxPossible: 9 * (100 + 50), // = 1350
};

export const SCORING = {
  base: 100,
  perfectInteractionBonus: 50,   // clean execution of the station mini-game
  quizCorrect: 150,
  quizWrong: 0,
  comboStep: 0.25,               // multiplier gained per consecutive success
  comboMax: 8,
  spoiledPenalty: -75,
  wrongStationPenalty: -50,
  // A pairing that works in a kitchen but is not the notes' example still
  // scores — half — because it is not wrong. The gap in points is what keeps
  // the exam answer worth aiming for.
  alsoWorksFactor: 0.5,
  starThresholds: [0.55, 0.75, 0.92], // fraction of achievable score
};

/**
 * Foods the notes name as examples but the game does not put on the counter.
 *
 * The Fact Book still prints them and the quiz bank still asks about them, so
 * §5 is covered in full — they just have no model and never spawn. Twelve foods
 * is already a lot to tell apart at counter size, and every extra one dilutes
 * the set without teaching anything the others do not.
 */
export const REFERENCE_ONLY_FOODS = [
  'rendang', 'jam',                      // §5A boiling
  'bananas',                             // §5H smoking
  'apples', 'oranges', 'tomatoes',       // §5G waxing
];

/**
 * TWO LISTS PER METHOD, and the difference matters.
 *
 *   foods      the notes' own examples. These are the exam answers: they are
 *              what the Fact Book prints, what the quiz treats as correct, and
 *              what earns full marks.
 *   alsoWorks  pairings that are true in a kitchen but are not this method's
 *              example in Unit 8 — sausages in the freezer, meat on the drying
 *              rack. The game accepts them, because telling a child that a true
 *              thing is false to protect a worksheet is the wrong trade. It
 *              scores them lower and names the notes' method, so the exam
 *              answer is still the one being rehearsed.
 *
 * A food may never appear in two methods that share a station (freezing and
 * cooling), in either list — the station could not then decide which method to
 * report. validateCurriculum() enforces that.
 */
export function acceptsFood(methodId, foodId) {
  const m = METHODS[methodId];
  return !!m && (m.foods.includes(foodId) || (m.alsoWorks || []).includes(foodId));
}

/** True when this pairing is one of the notes' own examples. */
export function isTaughtPairing(methodId, foodId) {
  return !!METHODS[methodId]?.foods.includes(foodId);
}

/** Derived: food -> every method the notes teach for it. Built once, frozen. */
export function deriveFoodMethods() {
  const map = {};
  // Reference-only foods get an entry too: without one, a quiz question about
  // bananas would treat smoking as an available distractor for itself.
  for (const id of [...Object.keys(FOODS), ...REFERENCE_ONLY_FOODS]) map[id] = [];
  for (const m of Object.values(METHODS)) {
    if (!m.playable) continue;
    for (const f of [...m.foods, ...(m.alsoWorks || [])]) if (map[f]) map[f].push(m.id);
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
    if (acceptsFood(id, foodId)) return id;
  }
  return null;
}

/** Dev-time guard: catches a food listed on a method but missing from FOODS. */
export function validateCurriculum() {
  const problems = [];
  for (const m of Object.values(METHODS)) {
    if (!m.playable) continue;
    for (const f of [...m.foods, ...(m.alsoWorks || [])]) {
      if (!FOODS[f] && !REFERENCE_ONLY_FOODS.includes(f)) {
        problems.push(`METHODS.${m.id} lists unknown food "${f}"`);
      }
    }
    for (const f of m.alsoWorks || []) {
      if (m.foods.includes(f)) problems.push(`METHODS.${m.id}: "${f}" is in both foods and alsoWorks`);
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
      for (const f of [...METHODS[id].foods, ...(METHODS[id].alsoWorks || [])]) {
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
  for (const st of LEARNING_STAGES) {
    for (const id of st.methods) {
      if (!METHODS[id]?.playable) problems.push(`LEARNING_STAGES[${st.id}] lists non-playable method "${id}"`);
    }
  }
  // Learning mode's premise is "every playable method appears exactly once."
  const learningMethods = LEARNING_STAGES.flatMap((st) => st.methods);
  const allPlayable = Object.values(METHODS).filter((m) => m.playable).map((m) => m.id);
  for (const id of allPlayable) {
    const n = learningMethods.filter((x) => x === id).length;
    if (n !== 1) problems.push(`LEARNING_STAGES: method "${id}" appears ${n} times, expected exactly 1`);
  }
  return problems;
}
