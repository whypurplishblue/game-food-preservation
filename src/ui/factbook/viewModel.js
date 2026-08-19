/**
 * FACT BOOK VIEW MODEL — the single place where curriculum structure and
 * localised prose are joined together for the 3D Fact Book.
 *
 * IT OWNS NOTHING EDUCATIONAL.
 *   METHODS / FOODS / REFERENCE_ONLY_FOODS answer "what is this, and what
 *   belongs to it"; t() / tList() answer "what should the student read". This
 *   module only puts the two side by side and orders them into spreads.
 *
 * Adding a method to curriculum.js therefore adds a spread here, a tab in the
 * navigation and a page in the book, with no edit to this file. That is the
 * point: the Fact Book must never become a second curriculum database.
 */
import { METHODS, FOODS, REFERENCE_ONLY_FOODS } from '../../content/curriculum.js';
import { t, tList, methodName, methodMechShort, foodName } from '../../content/i18n.js';

/** t() returns the key itself when a string is missing; treat that as absent. */
function opt(key) {
  const v = t(key);
  return v === key ? null : v;
}

/**
 * One food, resolved for display. A food the notes name but the game has no
 * model for (rendang, jam, apples…) is still returned — it just carries
 * `referenceOnly` so the card falls back to a drawn illustration. §26: a
 * missing asset must never remove curriculum content.
 */
export function foodView(id) {
  const data = FOODS[id] || null;
  return {
    id,
    name: foodName(id),
    model: data ? data.model : null,
    scale: data ? data.scale : 1,
    category: data ? data.category : null,
    referenceOnly: !data,
    known: !!data || REFERENCE_ONLY_FOODS.includes(id),
  };
}

/** One method, resolved for display. Structure from METHODS, prose from t(). */
export function methodView(m) {
  return {
    id: m.id,
    playable: !!m.playable,
    station: m.station || null,
    sourceRef: m.sourceRef,
    interaction: m.interaction || null,

    colour: m.colour,
    accent: m.accent != null ? m.accent : m.colour,
    icon: m.icon || null,

    mechanism: m.mechanism,
    // Prefers the method's own wording (§5F "removes moisture"), falls back to
    // the shared mechanism label. Same helper the HUD and station plaques use.
    mechLabel: methodMechShort(m.id, m.mechanism),
    mechLong: t(`mechanisms.${m.mechanism}.long`),

    name: methodName(m.id),
    explain: opt(`methods.${m.id}.explain`),
    exam: opt(`methods.${m.id}.exam`),
    detail: opt(`methods.${m.id}.detail`),
    range: opt(`methods.${m.id}.range`),

    // Method-specific curriculum data the diagrams read (§30). Never invented:
    // absent on a method that does not define it, and the art skips that part.
    targetC: m.targetC,
    acceptC: m.acceptC,
    programmes: (m.programmes || []).map((p) => ({
      id: p.id,
      holdC: p.holdC,
      label: opt(`methods.${m.id}.programmes.${p.id}`),
    })),
    chill: m.chill || null,
    solutions: (m.solutions || []).map((s) => ({
      id: s,
      label: opt(`methods.${m.id}.solutions.${s}`) || t(`foods.${s}`),
    })),

    foods: (m.foods || []).map(foodView),
    alsoWorks: (m.alsoWorks || []).map(foodView),
  };
}

/**
 * Build the whole book.
 *
 * Spread order mirrors the flat Fact Book it replaces (§5):
 *   contents → spoilage → playable methods → extra methods → importance.
 */
export function buildFactBook() {
  const all = Object.values(METHODS);
  const playable = all.filter((m) => m.playable).map(methodView);
  const extra = all.filter((m) => !m.playable).map(methodView);
  const methods = [...playable, ...extra];

  const spreads = [];
  const push = (s) => { s.index = spreads.length; spreads.push(s); return s; };

  push({
    kind: 'contents',
    label: t('ui.factBook'),
    title: t('ui.title'),
    subtitle: t('ui.subtitle'),
    sections: [
      { label: t('spoilage.title'), n: 1 },
      { label: t('ui.methodBadges'), n: playable.length },
      { label: t('importance.title'), n: 1 },
    ],
    methods,
  });

  push({
    kind: 'spoilage-a',
    label: t('spoilage.title'),
    title: t('spoilage.title'),
    what: t('spoilage.what'),
    why: t('spoilage.why'),
    grow: t('spoilage.grow'),
    signs: tList('spoilage.signs'),
    unsafe: t('spoilage.unsafe'),
  });

  push({
    kind: 'spoilage-b',
    label: t('spoilage.title'),
    title: t('spoilage.title'),
    senses: ['sight', 'smell', 'taste', 'touch'].map((k) => ({
      key: k,
      // The sense names themselves are UI furniture, not curriculum prose; the
      // description is the localised curriculum line.
      name: opt(`spoilage.senseNames.${k}`) || k[0].toUpperCase() + k.slice(1),
      text: t(`spoilage.senses.${k}`),
    })),
    signs: tList('spoilage.signs'),
    unsafe: t('spoilage.unsafe'),
    grow: t('spoilage.grow'),
  });

  push({
    kind: 'divider',
    group: 'playable',
    label: t('ui.methodBadges'),
    title: t('ui.methodBadges'),
    note: opt('ui.factBookPlayableNote'),
    methods: playable,
  });
  for (const mv of playable) {
    push({ kind: 'method', label: t('ui.methodBadges'), title: mv.name, method: mv });
  }

  if (extra.length) {
    push({
      kind: 'divider',
      group: 'extra',
      label: t('ui.factBookMore'),
      title: t('ui.factBookMore'),
      note: opt('ui.factBookExtraNote'),
      methods: extra,
    });
    for (const mv of extra) {
      push({ kind: 'method', label: t('ui.factBookMore'), title: mv.name, method: mv });
    }
  }

  push({
    kind: 'importance',
    label: t('importance.title'),
    title: t('importance.title'),
    items: tList('importance.items'),
  });

  // METHOD X OF Y is derived, never written down (§44).
  const methodSpreads = spreads.filter((s) => s.kind === 'method');
  methodSpreads.forEach((s, i) => {
    s.methodOrdinal = i + 1;
    s.methodTotal = methodSpreads.length;
  });

  const spreadOfMethod = new Map();
  for (const s of methodSpreads) spreadOfMethod.set(s.method.id, s.index);

  return { spreads, methods, playable, extra, methodSpreads, spreadOfMethod };
}
