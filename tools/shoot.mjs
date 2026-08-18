/**
 * Visual + smoke harness.
 *
 * Boots the built game, drives it through real gameplay at a chosen stage, and
 * captures a screenshot of every station's interaction plus the quiz, results
 * and fact book. Screenshots are the artefact the visual gauntlet judges —
 * reading the source tells you nothing about whether it looks finished.
 *
 *   PP_STAGE=3 PP_W=1600 PP_H=900 node tools/shoot.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.PP_URL || 'http://localhost:4173/';
const OUT = process.env.PP_OUT || 'shots';
const W = +(process.env.PP_W || 1600), H = +(process.env.PP_H || 900);
const STAGE = +(process.env.PP_STAGE || 3);
const DEADLINE = Date.now() + (+(process.env.PP_BUDGET_S || 400)) * 1000;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const timeLeft = () => DEADLINE - Date.now();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => { errors.push(String(e)); console.log('  PAGEERROR', String(e).slice(0, 260)); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('  ERR', m.text().slice(0, 220)); } });

const pump = (s) => page.evaluate((x) => window.__pp?.pump?.(x), s);
const shot = async (n, settle = 0.8) => {
  if (settle) await pump(settle);
  await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 25000 });
  console.log('  shot', n);
};

/** Complete whichever widget the panel is currently showing. */
async function completeStep() {
  const kind = await page.evaluate(() => {
    const p = document.querySelector('.pp-panel');
    if (!p || p.hidden) return null;
    if (p.querySelector('.pp-choice')) return 'choice';
    if (p.querySelector('.pp-dial')) return 'dial';
    if (p.querySelector('.pp-pad--sweep')) return 'sweep';
    if (p.querySelector('.pp-pad--scrub')) return 'scrub';
    if (p.querySelector('.pp-btn--hold')) return 'hold';
    if (p.querySelector('.pp-btn--tap')) return 'tap';
    return 'unknown';
  });
  if (!kind) return null;

  if (kind === 'tap') await page.click('.pp-panel .pp-btn--tap', { timeout: 5000 }).catch(() => {});
  else if (kind === 'choice') await page.click('.pp-panel .pp-choice', { timeout: 5000 }).catch(() => {});
  else if (kind === 'hold') {
    const el = await page.$('.pp-panel .pp-btn--hold');
    const bb = el && await el.boundingBox();
    if (bb) {
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down(); await sleep(2600); await page.mouse.up();
    }
  } else if (kind === 'dial') {
    const marks = await page.$$('.pp-panel .pp-mark');
    if (marks.length) {
      for (const m of marks) {
        await m.click().catch(() => {});
        await sleep(90);
        if (await page.evaluate(() => !document.querySelector('.pp-panel .pp-btn--confirm')?.hidden)) break;
      }
      await page.click('.pp-panel .pp-btn--confirm', { timeout: 3000 }).catch(() => {});
    } else {
      await page.focus('.pp-panel .pp-dial').catch(() => {});
      for (let i = 0; i < 45; i++) {
        const gone = await page.evaluate(() => !document.querySelector('.pp-panel .pp-dial'));
        if (gone) break;
        await page.keyboard.press('ArrowUp');
      }
    }
  } else if (kind === 'sweep') {
    const el = await page.$('.pp-panel .pp-pad__track');
    const bb = el && await el.boundingBox();
    if (bb) {
      const y = bb.y + bb.height / 2;
      await page.mouse.move(bb.x + 5, y); await page.mouse.down();
      for (let pass = 0; pass < 3; pass++) {
        const [a, b] = pass % 2 === 0 ? [bb.x + 5, bb.x + bb.width - 5] : [bb.x + bb.width - 5, bb.x + 5];
        for (let i = 0; i <= 16; i++) { await page.mouse.move(a + (b - a) * (i / 16), y); await sleep(6); }
      }
      await page.mouse.up();
    }
  } else if (kind === 'scrub') {
    const el = await page.$('.pp-panel .pp-scrub__surface');
    const bb = el && await el.boundingBox();
    if (bb) {
      const y = bb.y + bb.height / 2;
      await page.mouse.move(bb.x + 12, y); await page.mouse.down();
      for (let pass = 0; pass < 10; pass++) {
        const [a, b] = pass % 2 === 0 ? [bb.x + 12, bb.x + bb.width - 12] : [bb.x + bb.width - 12, bb.x + 12];
        for (let i = 0; i <= 8; i++) { await page.mouse.move(a + (b - a) * (i / 8), y); await sleep(6); }
      }
      await page.mouse.up();
    }
  }
  return kind;
}

/** Real pointer drag from a food to a station it is valid for. */
async function dragToValidStation(preferMethod) {
  const box = await page.evaluate((prefer) => {
    const { game, stage3d } = window.__pp;
    const foods = game.foods.filter((f) => f.state === 'idle');
    if (!foods.length) return null;
    const stations = [...game.stations.values()].filter((s) => s.enabled && !s.busy);
    let food = null, st = null;
    if (prefer) {
      const cand = stations.find((s) => s.methodId === prefer);
      const f = cand && foods.find((x) => x.isValidMethod(prefer));
      if (cand && f) { st = cand; food = f; }
    }
    if (!st) {
      for (const f of foods) {
        const s = stations.find((x) => f.isValidMethod(x.methodId));
        if (s) { food = f; st = s; break; }
      }
    }
    if (!food || !st) return null;
    const c = document.getElementById('scene').getBoundingClientRect();
    const proj = (v) => { const q = v.clone().project(stage3d.camera);
      return { x: c.left + (q.x * 0.5 + 0.5) * c.width, y: c.top + (-q.y * 0.5 + 0.5) * c.height }; };
    return {
      from: proj(food.group.position),
      to: proj(st.root.position.clone().setY(st.root.position.y + 1.0)),
      method: st.methodId, food: food.foodId,
    };
  }, preferMethod || null);
  if (!box) return null;
  await page.mouse.move(box.from.x, box.from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.from.x + (box.to.x - box.from.x) * i / 12, box.from.y + (box.to.y - box.from.y) * i / 12);
    await sleep(14);
  }
  await page.mouse.up();
  await sleep(120);
  const ok = await page.evaluate(() => { const p = document.querySelector('.pp-panel'); return !!p && !p.hidden; });
  return ok ? box : { ...box, failed: true };
}

console.log(`\n> ${URL} @ ${W}x${H}, stage ${STAGE}`);
await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(1800);
await shot('01-title', 0.4);

await page.click('[data-act="play"]').catch(() => {});
await sleep(400);
await page.evaluate((st) => { window.__pp.game.screens.close(); window.__pp.game.startStage(st); }, STAGE);
await sleep(500);
await shot('02-brief', 0.4);
await page.click('.pp-brief [data-act="go"]').catch(() => {});
await sleep(300);
await pump(3.0);
await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__pp.game._spawn(); });
await shot('03-play', 1.2);

// Hold spoilage during the capture run so the stage cannot fail out from under
// the harness while it is working through the station list.
await page.evaluate(() => {
  const g = window.__pp.game;
  g.stage = { ...g.stage, spoilRateMul: 0 };
  g.foods.forEach((f) => { f.spoilRate = 0; });
});

const METHODS = ['drying', 'freezing', 'vacuum', 'pickling', 'salting', 'pasteurising'];
const done = new Set();
const failed = [];
let quizShot = false;

for (const want of METHODS) {
  if (timeLeft() < 60000) { console.log('  (budget reached)'); break; }
  // Make sure a food valid for THIS method is on the table before dragging.
  await page.evaluate((mid) => {
    const g = window.__pp.game;
    for (let i = 0; i < 24; i++) {
      if (g.foods.some((f) => f.state === 'idle' && f.isValidMethod(mid))) return;
      g._spawn();
      g.foods.forEach((f) => { f.spoilRate = 0; });
    }
  }, want);
  await pump(0.5);

  let box = null;
  for (let tries = 0; tries < 3 && !box; tries++) {
    const r = await dragToValidStation(want);
    if (r && !r.failed && r.method === want) { box = r; break; }
    if (r?.failed) failed.push(r.method);
    await pump(0.4);
  }
  if (!box) { console.log(`  skip ${want}`); continue; }

  await pump(0.6);
  await shot(`04-${want}`, 0.3);
  for (let s = 0; s < 5; s++) {
    const k = await completeStep();
    if (!k) break;
    await pump(0.4);
    await sleep(140);
    if (s === 0) await shot(`04-${want}-b`, 0.2).catch(() => {});
  }
  done.add(want);
  await pump(1.8);
  await sleep(400);

  if (await page.evaluate(() => !document.querySelector('.pp-quiz')?.hidden)) {
    if (!quizShot) await shot('05-quiz', 0.2);
    await page.click('.pp-quiz__opt').catch(() => {});
    await sleep(500);
    if (!quizShot) { await shot('06-quiz-answered', 0.2); quizShot = true; }
    await page.click('.pp-quiz__next').catch(() => {});
    await sleep(400);
  }
}

await shot('07-play-later', 1.0);

const stats = await page.evaluate(() => {
  const g = window.__pp.game, r = window.__pp.stage3d.renderer;
  return {
    score: g.score, preserved: g.preserved, spoilt: g.spoiltCount, mode: g.mode,
    draws: r.info.render.calls, tris: r.info.render.triangles,
    geometries: r.info.memory.geometries, textures: r.info.memory.textures,
  };
});

await page.evaluate(() => window.__pp.game.openFactBook());
await sleep(700);
await shot('08-factbook', 0.2);

console.log('\n completed:', [...done].join(', ') || 'none');
if (failed.length) console.log(' drop failures:', failed.join(', '));
console.log(' stats', JSON.stringify(stats));
console.log(errors.length ? ` ERRORS: ${errors.length}` : ' no console errors');
errors.slice(0, 8).forEach((e) => console.log('   -', e.slice(0, 200)));
await browser.close();
process.exit(0);
