/**

* Visual harness for the 3D Fact Book.
 *
 * Captures the opening animation frame by frame, every kind of spread, a page
 * turn at quarter points, food inspection and the closing animation — the
 * seventeen shots §61 asks the visual gauntlet to judge.
 *
 *   node tools/factbookshot.mjs
 *   PP_W=1600 PP_H=900 PP_OUT=shots/factbook node tools/factbookshot.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.PP_URL || 'http://localhost:4173/';
const OUT = process.env.PP_OUT || 'shots/factbook';
const W = +(process.env.PP_W || 1600), H = +(process.env.PP_H || 900);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => { problems.push(`PAGEERROR ${e}`); console.log('  PAGEERROR', String(e).slice(0, 240)); });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    problems.push(`${m.type().toUpperCase()} ${m.text()}`);
    console.log(` ${m.type()}`, m.text().slice(0, 200));
  }
});

const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 25000 });
  console.log('  shot', n);
};

/** Drive the book's own animation clock to an exact pose and hold it there. */
const poseOpen = (v) => page.evaluate((x) => {
  const fb = window.__pp.game.factBook;
  fb.tOpen.cancel(); fb.tOpen.value = x;
  fb.book.setOpenness(x); fb.book.apply();
}, v);
const poseTurn = (v) => page.evaluate((x) => {
  const fb = window.__pp.game.factBook;
  fb.tTurn.cancel(); fb.tTurn.value = x; fb._applyTurn(); fb.book.apply();
}, v);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__pp, null, { timeout: 30000 });
await sleep(600);

console.log('validateCurriculum:', await page.evaluate(() => window.__pp.validation));

// --- open from the title screen
await page.click('[data-act="fact"]');
await sleep(120);
await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 10000 });

// The book opens itself after a beat; on software GL a screenshot can outlast
// that beat, so the shut pose is pinned rather than raced for. factbooktest.mjs
// is what proves the timer actually fires.
await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
await sleep(300);
await shot('00-shut');

// 1-5 the opening, as one continuous physical animation
await page.evaluate(() => window.__pp.game.factBook.openBook());
for (const [i, v] of [0, 0.25, 0.5, 0.75, 1].entries()) {
  await poseOpen(v);
  await sleep(120);
  await shot(`0${i + 1}-open-${Math.round(v * 100)}`);
}
await page.evaluate(() => {
  const fb = window.__pp.game.factBook;
  fb.state = 'reading';
  fb.wrap.classList.add('is-open');
});
await sleep(200);
await shot('06-methods-divider');

const settle = () => page.waitForFunction(
  () => ['reading', 'food'].includes(window.__pp.game.factBook.state), null, { timeout: 20000 });
const jump = async (i) => {
  await page.evaluate((n) => window.__pp.game.factBook.jumpTo(n), i);
  await settle();
  await sleep(500);
};
const methodIndex = (id) => page.evaluate((m) => window.__pp.game.factBook.model.spreadOfMethod.get(m), id);

await jump(await methodIndex('drying'));
await sleep(500);
await shot('10-drying');

// Desktop expansion reuses the mobile Explore surface: same full-stage model,
// food cards and placement activity, opened from the inline viewer's icon.
await page.click('.pp-fb__expand');
await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
await sleep(500);
await shot('10b-drying-expanded');
await page.click('.pp-fb__mobilefood:nth-child(1)');
await sleep(300);
await shot('10c-drying-expanded-food-flight');
await page.click('.pp-fb__mobileback');
await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
await sleep(500);

// rotate the rack: the model must move and the page must not
const vp = await page.$('.pp-fb__viewport');
const bb = await vp.boundingBox();
await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.85, bb.y + bb.height * 0.42, { steps: 12 });
await page.mouse.up();
await sleep(700);
await shot('11-drying-rotated');

// inspect a food
await page.click('.pp-fb__cards .pp-fb__card:nth-child(2)');
await sleep(900);
await shot('12-food-inspect');
await page.click('.pp-fb__backfood');
await sleep(600);

// page turn at the quarter points
await page.evaluate(() => window.__pp.game.factBook._beginTurn(1));
for (const v of [0.25, 0.5, 0.75]) {
  await poseTurn(v);
  await sleep(140);
  await shot(`13-turn-${Math.round(v * 100)}`);
}
await page.evaluate(() => window.__pp.game.factBook._endTurn(true));
await settle();
await sleep(500);
await shot('14-next-method');

await jump(await methodIndex('freezing')); await shot('15a-freezing');
await jump(await methodIndex('cooling')); await shot('15b-cooling');
await jump(await methodIndex('vacuum')); await shot('15c-vacuum');
await jump(await methodIndex('canning')); await shot('15d-canning');
await jump(await methodIndex('pasteurising')); await shot('15-pasteurising');
await jump(await page.evaluate(
  () => window.__pp.game.factBook.model.spreads.findIndex((s) => s.kind === 'divider' && s.group === 'extra')));
await shot('16a-extra-divider');
await jump(await methodIndex('boiling')); await shot('16-nonplayable');
await jump(await page.evaluate(() => window.__pp.game.factBook.model.spreads.length - 1));
await shot('17-importance');

// closing
await page.click('.pp-fb__close');
await sleep(260);
await shot('18-closing');
await sleep(1200);
await shot('19-closed');

console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n${[...new Set(problems)].join('\n')}` : '\nno console errors or warnings');
await browser.close();
