/**
 * Quiz generation. Questions are BUILT from the curriculum, never hand-written,
 * so they cannot drift from the notes. Distractors are always other real
 * mechanisms/methods from the notes — a wrong answer is still something the
 * child has to know, which is what makes the wrong options teach.
 */
import { METHODS, MECHANISM, MECHANISM_OPTIONS, FOOD_METHODS } from './curriculum.js';
import { t, methodName, foodName, mechShort, mechLong } from './i18n.js';

const playable = () => Object.values(METHODS).filter((m) => m.playable);

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(pool, correct, n, rnd) {
  return shuffle(pool.filter((x) => x !== correct), rnd).slice(0, n);
}

/**
 * Q-TYPE 1 — MECHANISM. "Why does drying preserve food?" → Removes water.
 * This is the single most important question type: it is the exam pattern in §8.
 */
function mechanismQuestion(methodId, rnd) {
  const m = METHODS[methodId];
  const correct = m.mechanism;
  // §5F says salt both removes moisture AND prevents growth, so offering
  // "vinegar, sugar or salt" as a WRONG answer for salting is an unfair item.
  const pool = methodId === 'salting'
    ? MECHANISM_OPTIONS.filter((x) => x !== MECHANISM.CHANGES_ENVIRONMENT)
    : MECHANISM_OPTIONS;
  const distractors = pickDistractors(pool, correct, 2, rnd);
  const options = shuffle([correct, ...distractors], rnd).map((id) => ({
    id, label: mechShort(id), correct: id === correct,
  }));
  return {
    type: 'mechanism',
    methodId,
    prompt: t('quiz.whyMethod', { method: methodName(methodId) }),
    options,
    explanation: t(`methods.${methodId}.exam`),
    teachback: mechLong(correct),
  };
}

/**
 * Q-TYPE 2 — METHOD RECOGNITION. "Which method did we just use?"
 * Used right after a station animation, so the visual is fresh.
 */
function methodQuestion(methodId, rnd) {
  // Freezing and cooling share one mechanism and one exam sentence; offering
  // both in the same question would have two defensible answers.
  const twin = { freezing: 'cooling', cooling: 'freezing' }[methodId];
  const ids = playable().map((m) => m.id).filter((id) => id !== twin);
  const distractors = pickDistractors(ids, methodId, 2, rnd);
  const options = shuffle([methodId, ...distractors], rnd).map((id) => ({
    id, label: methodName(id), correct: id === methodId,
  }));
  return {
    type: 'method',
    methodId,
    prompt: t('quiz.whichMethod'),
    options,
    explanation: t(`methods.${methodId}.explain`),
    teachback: t(`methods.${methodId}.exam`),
  };
}

/**
 * Q-TYPE 3 — FOOD→METHOD ASSOCIATION. "Which method preserves milk?"
 * Distractors must be methods that are NOT valid for that food per the notes,
 * otherwise we would mark a correct answer wrong.
 */
function foodQuestion(foodId, methodId, rnd) {
  const valid = FOOD_METHODS[foodId] || [];
  const invalid = playable().map((m) => m.id).filter((id) => !valid.includes(id));
  // Never offer the twin of a valid answer as a distractor.
  const twins = valid.flatMap((v) => (v === 'freezing' ? ['cooling'] : v === 'cooling' ? ['freezing'] : []));
  const distractors = shuffle(invalid.filter((id) => !twins.includes(id)), rnd).slice(0, 2);
  const options = shuffle([methodId, ...distractors], rnd).map((id) => ({
    id, label: methodName(id), correct: id === methodId,
  }));
  return {
    type: 'food',
    methodId, foodId,
    prompt: t('quiz.whichMethodForFood', { food: foodName(foodId) }),
    options,
    explanation: t(`methods.${methodId}.explain`),
    teachback: t(`methods.${methodId}.exam`),
  };
}

/**
 * Q-TYPE 4 — MICROBE OUTCOME. "What happens to the microorganisms?"
 * Ties the mechanism directly to microorganism behaviour, which is the part of
 * §3 and §4 that children most often lose.
 */
function microbeQuestion(methodId, rnd) {
  const m = METHODS[methodId];
  const correct = m.mechanism;
  const pool = methodId === 'salting'
    ? MECHANISM_OPTIONS.filter((x) => x !== MECHANISM.CHANGES_ENVIRONMENT)
    : MECHANISM_OPTIONS;
  const distractors = pickDistractors(pool, correct, 2, rnd);
  const options = shuffle([correct, ...distractors], rnd).map((id) => ({
    id, label: t(`quiz.microbeA.${id}`), correct: id === correct,
  }));
  return {
    type: 'microbe',
    methodId,
    prompt: t('quiz.microbeQ'),
    options,
    explanation: mechLong(correct),
    teachback: t(`methods.${methodId}.exam`),
  };
}

/**
 * Weighted question choice per stage. Early stages ask "which method"
 * (recognition); later stages ask "why" and "what happens to the microbes"
 * (mechanism recall) — recognition → recall, as the brief requires.
 */
const STAGE_MIX = {
  1: { method: 0.7, mechanism: 0.3, food: 0, microbe: 0 },
  2: { method: 0.5, mechanism: 0.4, food: 0.1, microbe: 0 },
  3: { method: 0.3, mechanism: 0.45, food: 0.15, microbe: 0.1 },
  4: { method: 0.2, mechanism: 0.45, food: 0.2, microbe: 0.15 },
  5: { method: 0.0, mechanism: 0.55, food: 0.15, microbe: 0.3 },
  // Mastery drops recognition entirely: by here the child should be recalling
  // mechanisms and food associations, not picking a name they can see.
  6: { method: 0.0, mechanism: 0.35, food: 0.35, microbe: 0.30 },
};

export function makeQuestion({ methodId, foodId, stageId = 3, rnd = Math.random }) {
  const mix = STAGE_MIX[stageId] || STAGE_MIX[3];
  let roll = rnd();
  for (const [type, weight] of Object.entries(mix)) {
    roll -= weight;
    if (roll <= 0) {
      if (type === 'mechanism') return mechanismQuestion(methodId, rnd);
      if (type === 'method') return methodQuestion(methodId, rnd);
      if (type === 'food' && foodId) return foodQuestion(foodId, methodId, rnd);
      if (type === 'microbe') return microbeQuestion(methodId, rnd);
    }
  }
  return mechanismQuestion(methodId, rnd);
}

/** Full bank — used by the Fact Book's self-test and by automated content tests. */
export function buildFullBank() {
  const out = [];
  for (const m of playable()) {
    out.push(mechanismQuestion(m.id, () => 0.5));
    out.push(methodQuestion(m.id, () => 0.5));
    out.push(microbeQuestion(m.id, () => 0.5));
    for (const f of m.foods) out.push(foodQuestion(f, m.id, () => 0.5));
  }
  return out;
}
