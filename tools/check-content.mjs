/**
 * Curriculum content test.
 *
 * Runs inside the built app so it exercises the real modules (which import the
 * locale JSON), then asserts the properties a teacher actually cares about:
 *   - no food-method pairing the notes do not support (validateCurriculum)
 *   - every quiz item has exactly one correct answer and no duplicate options
 *   - no untranslated ids leak into anything a child can read
 *   - every locale covers every id the game can display
 *
 *   node tools/check-content.mjs      # needs a server on :4173
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
// Poll rather than sleep: boot now waits on the food GLBs, and under software
// rendering that is slow enough that a fixed delay is a coin toss.
await page.waitForFunction(() => !!window.__pp, null, { timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

const results = await page.evaluate(() => {
  const { content, game } = window.__pp;
  const { METHODS, FOODS, STAGES, LEARNING_STAGES, STATION_METHODS, buildFullBank, i18n } = content;
  const out = {};

  out.validation = window.__ppValidation || [];

  // --- station wiring
  out.wiring = [];
  for (const [sid, st] of game.stations) {
    if (!st.methods?.length) out.wiring.push(`station ${sid} has no methods`);
    for (const m of st.methods) {
      if (METHODS[m].station !== sid) out.wiring.push(`${m}.station !== ${sid}`);
    }
  }

  // --- every food reachable in the final stage
  out.reach = [];
  const finalMethods = STAGES[STAGES.length - 1].methods;
  for (const fid of Object.keys(FOODS)) {
    if (!finalMethods.some((m) => METHODS[m].foods.includes(fid))) {
      out.reach.push(`${fid} is unreachable in the final stage`);
    }
  }

  // --- quiz bank integrity
  out.quiz = [];
  const bank = buildFullBank();
  out.quizCount = bank.length;
  for (const q of bank) {
    const correct = q.options.filter((o) => o.correct);
    if (correct.length !== 1) out.quiz.push(`${q.type}/${q.methodId}: ${correct.length} correct answers`);
    if (new Set(q.options.map((o) => o.label)).size !== q.options.length) {
      out.quiz.push(`${q.type}/${q.methodId}: duplicate option labels`);
    }
    // An untranslated lookup returns the key itself, which always has a dot.
    if (/^(quiz|methods|mechanisms|foods)\./.test(q.prompt)) out.quiz.push(`untranslated prompt: ${q.prompt}`);
    for (const o of q.options) {
      if (/^(quiz|methods|mechanisms|foods)\./.test(o.label)) out.quiz.push(`untranslated option: ${o.label}`);
    }
    if (!q.teachback) out.quiz.push(`${q.type}/${q.methodId}: no teachback`);
  }

  // --- locale coverage: every displayable id in every language
  out.locale = [];
  const need = [];
  for (const m of Object.values(METHODS)) {
    need.push(`methods.${m.id}.name`, `methods.${m.id}.explain`, `methods.${m.id}.exam`);
    need.push(`mechanisms.${m.mechanism}.short`, `mechanisms.${m.mechanism}.long`);
  }
  for (const f of Object.keys(FOODS)) need.push(`foods.${f}`);
  for (const st of STAGES) need.push(`stages.${st.key}.name`, `stages.${st.key}.brief`);
  for (const st of LEARNING_STAGES) need.push(`stages.${st.key}.name`, `stages.${st.key}.brief`, `stages.${st.key}.tagline`);
  const before = i18n.getLang();
  for (const lang of i18n.AVAILABLE_LANGS) {
    i18n.setLang(lang);
    for (const key of need) {
      if (i18n.t(key) === key) out.locale.push(`${lang}: missing ${key}`);
    }
  }
  i18n.setLang(before);

  return out;
});

const line = (name, arr) =>
  console.log(name.padEnd(24) + (arr.length === 0 ? 'PASS' : `FAIL (${arr.length})\n    ` + arr.slice(0, 8).join('\n    ')));

line('curriculum validation', results.validation);
line('station wiring', results.wiring);
line('food reachability', results.reach);
line(`quiz bank (${results.quizCount} items)`, results.quiz);
line('locale coverage', results.locale);
line('console errors', consoleErrors);

const failed = [results.validation, results.wiring, results.reach, results.quiz, results.locale, consoleErrors]
  .reduce((n, a) => n + a.length, 0);
console.log('\n' + (failed ? `${failed} problem(s)` : 'all content checks passed'));
await browser.close();
process.exit(failed ? 1 : 0);
