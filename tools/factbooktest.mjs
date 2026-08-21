/**
 * Behaviour harness for the 3D Fact Book.
 *
 * Screenshots prove it looks right; this proves it BEHAVES right — the page
 * drag commits and reverses, the model viewer never reaches the book, the
 * keyboard and Escape work, and the narrow layout stacks instead of shrinking.
 *
 *   node tools/factbooktest.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.PP_URL || 'http://localhost:4173/';
const OUT = process.env.PP_OUT || 'shots/factbook';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errors = [];

async function session(viewport, fn, opts = {}) {
  const page = await browser.newPage({ viewport, ...opts });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__pp, null, { timeout: 30000 });
  await fn(page);
  await page.close();
}

const openBook = async (page) => {
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // The book is held shut for a beat and then opens itself; nothing to click.
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 20000 });
};
const state = (page) => page.evaluate(() => {
  const fb = window.__pp.game.factBook;
  return { index: fb.index, state: fb.state, turn: fb.tTurn.value, open: fb.book.openness };
});
const settle = (page) => page.waitForFunction(
  () => ['reading', 'food'].includes(window.__pp.game.factBook.state), null, { timeout: 20000 });

// ---------------------------------------------------------------- desktop
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[desktop 1600x900]');
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // Pin the shut pose so the beat before the automatic open can be inspected
  // without racing it; the in-game session below proves the timer really fires.
  await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
  const shut = await state(page);
  check('the book arrives shut', shut.state === 'closed' && shut.open < 0.15,
    `state=${shut.state} openness=${shut.open.toFixed(2)}`);
  check('the shut book announces itself as the control',
    await page.evaluate(() => {
      const z = document.querySelector('.pp-fb__bookzone');
      return z.getAttribute('role') === 'button' && !!z.getAttribute('aria-label') && z.tabIndex >= 0;
    }));
  // Opened from the keyboard, to prove the reader can still open it early.
  await page.focus('.pp-fb__bookzone');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 20000 });
  check('opens on the methods divider',
    await page.evaluate(() => {
      const fb = window.__pp.game.factBook;
      return fb.index === 0 && fb.model.spreads[0].kind === 'divider' && fb.model.spreads[0].group === 'playable';
    }));
  check('the book carries no title or spoilage spread',
    await page.evaluate(() => window.__pp.game.factBook.model.spreads
      .every((s) => !['contents', 'spoilage-a', 'spoilage-b'].includes(s.kind))));
  check('pagination starts with the first navigation page',
    await page.evaluate(() => {
      const count = document.querySelector('.pp-fb__count')?.textContent;
      const total = window.__pp.game.factBook.model.spreads.length;
      return count === `Page 1 of ${total}`;
    }));
  check('book is fully open', Math.abs((await state(page)).open - 1) < 0.001);

  // --- a committed drag turns the page and never springs back
  const zone = await (await page.$('.pp-fb__bookzone')).boundingBox();
  const y = zone.y + zone.height * 0.5;
  await page.mouse.move(zone.x + zone.width * 0.78, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(zone.x + zone.width * (0.78 - 0.05 * i), y);
    await sleep(16);
  }
  const mid = await state(page);
  check('dragging drives the turn directly', mid.turn > 0.3 && mid.state === 'drag', `turn=${mid.turn.toFixed(2)}`);
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  check('a committed page does not spring back', after.index === 1 && after.turn === 1, `index=${after.index}`);

  // --- an abandoned drag returns to the page it came from
  await page.mouse.move(zone.x + zone.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(zone.x + zone.width * 0.72, y, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  check('a short drag is abandoned', (await state(page)).index === 1);

  // --- keyboard
  await page.keyboard.press('ArrowRight');
  await settle(page);
  check('ArrowRight turns forward', (await state(page)).index === 2);
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  check('ArrowLeft turns back', (await state(page)).index === 1);

  // --- the tab strip is generated from the curriculum
  const tabs = await page.$$eval('.pp-fb__tab', (n) => n.map((b) => b.textContent.trim()));
  const methods = await page.evaluate(() => window.__pp.content.METHODS && Object.keys(window.__pp.content.METHODS));
  check('one tab per curriculum method', tabs.length === methods.length, `${tabs.length} tabs / ${methods.length} methods`);

  await page.evaluate(() => window.__pp.game.factBook.goToMethod('drying'));
  await settle(page);
  await page.waitForFunction(() =>
    document.querySelector('.pp-fb__lead')?.classList.contains('is-exam'),
    null, { timeout: 5000 });
  const desktopMethodLayout = await page.evaluate(() => {
    const inner = document.querySelector('.pp-fb__panelinner');
    const lead = document.querySelector('.pp-fb__lead');
    return {
      examAtTop: lead?.classList.contains('is-exam') && !!lead.textContent.trim(),
      noDuplicateExamSection: !document.querySelector('.pp-fb__examsec'),
      noVerticalScroll: inner && inner.scrollHeight <= inner.clientHeight + 1,
    };
  });
  check('exam note replaces the method information at the top', desktopMethodLayout.examAtTop);
  check('desktop method panel fits without vertical scrolling', desktopMethodLayout.noVerticalScroll,
    `${desktopMethodLayout.noVerticalScroll ? 'fits' : 'overflows'}`);
  check('the lower duplicate exam section is removed', desktopMethodLayout.noDuplicateExamSection);
  const dryIdx = await state(page);

  // --- rotating the model must not reach the book
  const vp = await (await page.$('.pp-fb__viewport')).boundingBox();
  const before = await page.evaluate(() => window.__pp.game.factBook.methodViewer.az);
  await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.x + vp.width * 0.9, vp.y + vp.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await sleep(400);
  const afterRot = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  const s2 = await state(page);
  check('dragging the model rotates it', Math.abs(afterRot - before) > 0.2);
  check('dragging the model does not turn the page', s2.index === dryIdx.index && s2.state === 'reading');

  // --- food inspection round trip
  await page.click('.pp-fb__cards .pp-fb__card:not(:disabled)');
  await sleep(500);
  check('inspecting a food enters the food state', (await state(page)).state === 'food');
  await page.click('.pp-fb__backfood');
  await sleep(400);
  check('back to method leaves the book open',
    (await state(page)).state === 'reading' && (await page.evaluate(() => window.__pp.game.factBook.isOpen)));

  // --- a reference-only food is present but not inspectable
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('boiling'));
  await settle(page);
  const cards = await page.$$eval('.pp-fb__card', (n) => n.map((b) => ({ name: b.textContent.trim(), disabled: b.disabled })));
  check('reference-only foods are still taught', cards.length === 2 && cards.every((c) => c.disabled),
    cards.map((c) => c.name).join(', '));

  await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    fb.jumpTo(fb.model.spreads.length - 1);
  });
  await settle(page);
  check('pagination ends with the final navigation page',
    await page.evaluate(() => {
      const fb = window.__pp.game.factBook;
      const total = fb.model.spreads.length;
      return document.querySelector('.pp-fb__count')?.textContent === `Page ${total} of ${total}`;
    }));

  // --- Escape closes, physically, and hands the game back
  await page.keyboard.press('Escape');
  await sleep(120);
  check('closing animates rather than vanishing',
    await page.evaluate(() => window.__pp.game.factBook.isOpen && window.__pp.game.factBook.state === 'closing'));
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 8000 });
  check('the title screen comes back', await page.evaluate(() => !!document.querySelector('.pp-title')));
});

// -------------------------------------------------------- opened in-game
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[in game]');
  await page.click('[data-act="play"]');
  await page.click('[data-mode="learning"]');
  await page.click('[data-act="go"]');
  await page.waitForFunction(() => window.__pp.game.mode === 'playing', null, { timeout: 15000 });
  await page.click('.pp-hud .pp-icon-btn');           // the Fact Book button
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // Nothing is clicked here: the book must open itself after its held beat.
  const t0 = Date.now();
  await settle(page);
  check('the shut book opens itself, unprompted', Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
  check('the HUD is out of the way', await page.evaluate(() => window.__pp.hud.root.classList.contains('is-hidden')));

  // Closing part-way through a page turn must resolve, not strand the sheet.
  await page.evaluate(() => window.__pp.game.factBook.go(1));
  await sleep(120);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 10000 });
  check('closing mid-turn resolves safely',
    await page.evaluate(() => !window.__pp.game.factBook.book.turning));
  check('play resumes', await page.evaluate(() => window.__pp.game.mode === 'playing'));
  check('the HUD comes back', await page.evaluate(() => !window.__pp.hud.root.classList.contains('is-hidden')));

  // Completing the final learning method schedules a quiz after the teaching
  // banner. The result screen must not win that delay and cover the quiz.
  await page.evaluate(async () => {
    const { game, content } = window.__pp;
    for (const food of game.foods) food.dispose();
    game.foods.length = 0;
    game.stageId = content.LEARNING_STAGES.length;
    game.stage = content.LEARNING_STAGES.at(-1);
    const methodId = game.stage.methods.at(-1);
    const foodId = content.METHODS[methodId].foods.find((id) => content.FOODS[id]);
    game._learningMethodsDone = new Set(game.stage.methods.slice(0, -1));
    game._learningQuizzed = new Set(game.stage.methods.slice(0, -1));
    await game._finishInteraction({
      foodId, state: 'processing', _wrongStationTried: false, _spawnedAt: game.elapsed,
      group: new window.__ppTHREE.Group(), markPreserved() {},
    }, { playSuccess: () => Promise.resolve(), release() {} }, methodId, 1);
  });
  check('final learning quiz is pending before results', await page.evaluate(() =>
    window.__pp.game.mode === 'teaching' && !window.__pp.game.screens.isOpen));
  await page.waitForFunction(() => window.__pp.game.mode === 'quiz' && window.__pp.game.quiz.isOpen,
    null, { timeout: 5000 });
  check('final learning quiz appears before results', await page.evaluate(() =>
    window.__pp.game.mode === 'quiz' && !window.__pp.game.screens.isOpen));
  await page.click('.pp-quiz__opt');
  await page.click('.pp-quiz__next');
  await page.waitForFunction(() => window.__pp.game.mode === 'result');
  check('learning results wait until the final quiz closes', await page.evaluate(() =>
    window.__pp.game.screens.isOpen && !window.__pp.game.quiz.isOpen));
  check('final learning results do not offer another level', await page.evaluate(() =>
    !document.querySelector('.pp-result [data-act="next"]')));
  await page.click('.pp-result [data-act="menu"]');
  await page.waitForFunction(() => !!document.querySelector('.pp-title'));
  await page.click('[data-act="play"]');
  await page.waitForFunction(() => !!document.querySelector('.pp-mode-select'));
  check('completed learning mode is not offered as resumable', await page.evaluate(() =>
    !document.querySelector('[data-act="continue"][data-mode="learning"]') &&
    !!document.querySelector('.pp-mode-card[data-mode="learning"]')));
});

// ------------------------------------------------------------ narrow layout
await session({ width: 820, height: 1180 }, async (page) => {
  console.log('\n[narrow 820x1180]');
  // The presented pose has to fit a tall, narrow screen too.
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
  await sleep(400);
  await page.screenshot({ path: `${OUT}/20a-narrow-shut.png` });
  await page.evaluate(() => window.__pp.game.factBook.openBook());
  await settle(page);
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('pickling'));
  await settle(page);
  await sleep(400);
  const stacked = await page.evaluate(() => {
    const b = document.querySelector('.pp-fb__bookzone').getBoundingClientRect();
    const p = document.querySelector('.pp-fb__panel').getBoundingClientRect();
    return p.top >= b.bottom - 2;
  });
  check('narrow layout stacks book above panel', stacked);
  await page.screenshot({ path: `${OUT}/20-narrow.png` });
});

// --------------------------------------------------------- reduced motion
await session({ width: 1400, height: 800 }, async (page) => {
  console.log('\n[reduced motion]');
  await openBook(page);
  await page.close;
}, { reducedMotion: 'reduce' });

// ------------------------------------------------------- language + in-game
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[localisation]');
  // Build and close the reusable WebGL book in English first. This catches
  // stale localized view models that a first-open-only test cannot see.
  await openBook(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 8000 });
  await page.waitForFunction(() => !!document.querySelector('.pp-title'));
  await page.click('[data-quick="language"]');
  await page.click('.pp-language-menu [data-lang="zh"]');
  await sleep(200);
  const stationLabels = await page.evaluate(() =>
    [...window.__pp.game.stations.values()].map((station) => station.plaqueLabel)
  );
  check('station plaques refresh to the chosen language',
    stationLabels.every((label) => label && !/[A-Za-z]/.test(label)), stationLabels.join(', '));
  check('quick-control mute label refreshes with language', await page.evaluate(() => {
    const mute = document.querySelector('[data-quick="mute"]');
    const expected = window.__pp.content.i18n.t('ui.mute');
    return mute?.getAttribute('aria-label') === expected && mute.title === expected && mute.textContent.includes(expected);
  }));
  await openBook(page);
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('salting'));
  await settle(page);
  await sleep(400);
  const title = await page.$eval('.pp-fb__title', (n) => n.textContent);
  const pageCount = await page.$eval('.pp-fb__count', (n) => n.textContent);
  const localizedFacts = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const salting = fb.model.methods.find((method) => method.id === 'salting');
    return {
      title: document.querySelector('.pp-fb__title')?.textContent || '',
      name: salting?.name || '',
      detail: salting?.detail || '',
      exam: salting?.exam || '',
      foodNames: salting?.foods.map((food) => food.name) || [],
    };
  });
  check('the reused book rebuilds all facts in the chosen language',
    title !== 'Salting' && localizedFacts.name !== 'Salting' &&
      localizedFacts.detail.length > 0 && localizedFacts.exam.length > 0 &&
      !localizedFacts.foodNames.includes('Fish'), JSON.stringify(localizedFacts));
  check('navigation-page numbering follows the chosen language',
    pageCount.includes('页') && !pageCount.includes('Page'), pageCount);
  await page.screenshot({ path: `${OUT}/21-zh.png` });
});

console.log(errors.length ? `\nCONSOLE ERRORS:\n${[...new Set(errors)].join('\n')}` : '\nno page errors');
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
await browser.close();
process.exit(failures ? 1 : 0);
