/**
 * Source-of-truth audit: the game's content vs docs/y6-sci-u8.md.
 *
 * Every educational claim in this game is supposed to come from the notes. That
 * is easy to say and easy to drift from, so this parses the handout itself and
 * compares it against the curriculum data and the English strings:
 *
 *   - each method's example foods            §5A..§5J  vs  METHODS[id].foods
 *   - each exam sentence, VERBATIM           §5A..§5J  vs  methods.<id>.exam
 *   - the spoilage signs and the senses      §1, §2    vs  spoilage.*
 *   - the importance list                    §6        vs  importance.items
 *
 * Run it after any content edit. If it fails, the notes win.
 */
import { readFileSync } from 'fs';
import { METHODS } from '../src/content/curriculum.js';

const md = readFileSync('docs/y6-sci-u8.md', 'utf8');
const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, '_');
const flat = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

// Notes heading -> method id. "Freezing and Cooling" is one section, two methods.
const SECTION_METHODS = {
  'Boiling': ['boiling'], 'Drying': ['drying'], 'Pickling': ['pickling'],
  'Vacuum Packing': ['vacuum'], 'Freezing and Cooling': ['freezing', 'cooling'],
  'Salting': ['salting'], 'Waxing': ['waxing'], 'Smoking': ['smoking'],
  'Pasteurising': ['pasteurising'], 'Canning and Bottling': ['canning'],
};

const en = JSON.parse(readFileSync('src/content/locales/en.json', 'utf8'));
const fails = [];
const ok = (label) => console.log('  ok    ', label);
const bad = (label, detail) => { fails.push(`${label}: ${detail}`); console.log('  FAIL  ', label, '\n           ', detail); };

// ---- split §5 into its lettered sections
const body = md.slice(md.indexOf('# 5. Methods of Food Preservation'));
const sections = body.split(/\n## [A-J]\. /).slice(1);

console.log('\nmethod sections');
for (const sec of sections) {
  const title = sec.split('\n')[0].trim();
  const ids = SECTION_METHODS[title];
  if (!ids) { bad(title, 'no method mapped to this section'); continue; }

  // Exam sentence: the bold line after "Exam sentence:"
  const exam = flat((sec.split(/Exam sentence:\s*/)[1] || '').split('\n').find((l) => l.trim()) || '');
  for (const id of ids) {
    const mine = flat(en.methods?.[id]?.exam || '');
    if (!exam) bad(`${title} exam`, 'not found in the notes');
    else if (mine !== exam) bad(`${id}.exam`, `notes: "${exam}"\n            game: "${mine}"`);
    else ok(`${id}.exam verbatim`);
  }

  // Examples: bullet list(s) under "Examples:". Freezing/Cooling has one per
  // sub-heading, in the same order as SECTION_METHODS.
  const blocks = sec.split(/Examples:\s*/).slice(1).map((b) =>
    b.split(/\n\s*\n/)[0].split('\n').filter((l) => l.trim().startsWith('*'))
      .map((l) => norm(l.replace(/^\s*\*\s*/, ''))));
  ids.forEach((id, i) => {
    const notes = blocks[ids.length > 1 ? i : 0] || [];
    const game = (METHODS[id]?.foods || []).map(norm);
    if (!notes.length) return bad(`${id}.foods`, 'no example list found in the notes');
    const missing = notes.filter((f) => !game.includes(f));
    const extra = game.filter((f) => !notes.includes(f));
    if (missing.length || extra.length) {
      bad(`${id}.foods`, `notes: [${notes}]  game: [${game}]`
        + (missing.length ? `  MISSING: ${missing}` : '') + (extra.length ? `  EXTRA: ${extra}` : ''));
    } else ok(`${id}.foods matches (${notes.join(', ')})`);
  });
}

// ---- §2 signs, §1 senses, §6 importance
console.log('\nsupporting content');
const listAfter = (heading, count) => md.slice(md.indexOf(heading))
  .split('\n').filter((l) => /^\d+\.\s|\|\s/.test(l)).slice(0, count);

const signs = listAfter('## 2. Characteristics of Spoilt Food', 5)
  .map((l) => flat(l.replace(/^\d+\.\s*/, '')));
const mySigns = (en.spoilage?.signs || []).map(flat);
signs.every((s, i) => mySigns[i]?.toLowerCase() === s.toLowerCase())
  ? ok(`spoilage signs (${signs.length})`)
  : bad('spoilage.signs', `notes: [${signs}]  game: [${mySigns}]`);

for (const [sense, want] of [['Sight', 'mouldy'], ['Smell', 'bad'], ['Taste', 'unpleasant'], ['Touch', 'texture']]) {
  const mine = (en.spoilage?.senses?.[sense.toLowerCase()] || '').toLowerCase();
  mine.includes(want) ? ok(`sense: ${sense}`) : bad(`spoilage.senses.${sense}`, `expected to mention "${want}", got "${mine}"`);
}

const imp = md.slice(md.indexOf('# 6. Importance')).split('\n')
  .filter((l) => /^\d+\.\s+\*\*/.test(l)).map((l) => flat(l.replace(/^\d+\.\s*/, '')));
const myImp = (en.importance?.items || []).map(flat);
imp.length === myImp.length && imp.every((s, i) => myImp[i].toLowerCase() === s.toLowerCase())
  ? ok(`importance list (${imp.length})`)
  : bad('importance.items', `notes: [${imp}]  game: [${myImp}]`);

// ---- the numbers, which are the easiest thing to get quietly wrong
console.log('\nnumbers and terminology');
const fz = METHODS.freezing, cl = METHODS.cooling;
md.includes('**0°C and below**') && fz.acceptC[1] === 0 && fz.targetC <= 0
  ? ok(`freezing band ${fz.acceptC[0]}..${fz.acceptC[1]}°C (notes: 0°C and below)`)
  : bad('freezing.acceptC', `notes say "0°C and below", game accepts ${fz.acceptC}`);
md.includes('around **4°C**') && cl.targetC === 4 && cl.acceptC[0] > 0
  ? ok(`cooling band ${cl.acceptC[0]}..${cl.acceptC[1]}°C, target ${cl.targetC}°C (notes: around 4°C)`)
  : bad('cooling.acceptC', `notes say "around 4°C", game targets ${cl.targetC} and accepts ${cl.acceptC}`);
const past = en.methods?.pasteurising?.detail || '';
['63', '30', '72', '15', '4'].every((n) => past.includes(n))
  ? ok('pasteurising temperatures (63°C/30min, 72°C/15s, cool to 4°C)')
  : bad('pasteurising.detail', `notes give 63/30 and 72/15 then 4°C; game says "${past}"`);

// §10 is the handout's own Chinese glossary — the zh locale must use its words.
const zh = JSON.parse(readFileSync('src/content/locales/zh.json', 'utf8'));
const GLOSSARY = {
  boiling: '煮沸', drying: '烘干', pickling: '腌制', vacuum: '真空包装',
  freezing: '冷冻', cooling: '冷藏', salting: '盐腌', waxing: '涂蜡',
  smoking: '烟熏', pasteurising: '巴氏消毒', canning: '罐装',
};
for (const [id, term] of Object.entries(GLOSSARY)) {
  if (!md.includes(term)) { bad(`§10 ${id}`, `"${term}" not found in the notes glossary`); continue; }
  const mine = zh.methods?.[id]?.name || '';
  mine.includes(term) ? ok(`zh ${id} = ${mine}`) : bad(`zh.methods.${id}.name`, `§10 says "${term}", locale says "${mine}"`);
}

console.log(fails.length ? `\n${fails.length} MISMATCH(ES) — the notes win\n` : '\nthe game matches the notes\n');
process.exit(fails.length ? 1 : 0);
