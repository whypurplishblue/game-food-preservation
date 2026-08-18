/**
 * Regression: pausing mid-interaction used to destroy the station panel, which
 * left the food inside a busy machine with nothing to click — an unrecoverable
 * run. This drops a food, pauses part-way through, resumes, and asserts the
 * controls come back and the interaction still completes.
 */
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 960, height: 620 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 250)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR', m.text().slice(0, 200)); } });

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__pp, null, { timeout: 45000 });
await p.click('[data-act="play"]');
await sleep(300);
await p.evaluate(() => { window.__pp.game.screens.close(); window.__pp.game.startStage(3); });
await sleep(300);
await p.click('.pp-brief [data-act="go"]');
await sleep(400);
await p.evaluate(() => { const g = window.__pp.game; g.stage = { ...g.stage, spoilRateMul: 0, quizChance: 0 }; });

// Put a chicken into the freezer.
console.log('drop:', await p.evaluate(() => {
  const g = window.__pp.game, st = g.stations.get('Freezer');
  g.foods.slice().forEach((f) => f.dispose()); g.foods.length = 0; st.release();
  let food = null;
  for (let i = 0; i < 80 && !food; i++) { g._spawn(); food = g.foods.find((f) => f.foodId === 'chicken' && f.state === 'idle'); }
  if (!food) return 'no chicken';
  g._handleDrop(food, st);
  return `${food.foodId} -> ${g._methodFor(st, food)}`;
}));
await sleep(600);

const panelState = () => p.evaluate(() => {
  const el = document.querySelector('.pp-panel');
  return {
    visible: !!el && !el.hidden,
    widgets: el ? [...el.querySelectorAll('button, .pp-dial, .pp-pad')].length : 0,
    step: window.__pp.game.panel.active?.index ?? null,
    doorOpen: +(window.__pp.game.stations.get('Freezer')._doorOpen ?? 0).toFixed(2),
  };
});
console.log('after drop      ', JSON.stringify(await panelState()), '(door should be opening on its own)');

await p.evaluate(() => window.__pp.game.pause());
await sleep(400);
console.log('while paused    ', JSON.stringify(await panelState()));
await p.click('.pp-pause [data-act="resume"]');
await sleep(600);
const resumed = await panelState();
console.log('after resume    ', JSON.stringify(resumed));

// And it must still be finishable: close the door, then dial.
await p.evaluate(() => document.querySelector('.pp-panel .pp-btn--tap')?.click());
await sleep(500);
await p.focus('.pp-panel .pp-dial').catch(() => {});
for (let i = 0; i < 30; i++) await p.keyboard.press('ArrowDown');
await p.click('.pp-panel .pp-btn--confirm').catch(() => {});
await sleep(2200);
const done = await p.evaluate(() => ({ preserved: window.__pp.game.preserved, banner: document.querySelector('.pp-banner')?.textContent || '' }));

console.log('\nRESUMED CONTROLS:', resumed.visible && resumed.widgets > 0 ? 'PASS' : 'FAIL');
console.log('COMPLETED AFTER RESUME:', done.preserved === 1 ? 'PASS' : `FAIL (preserved=${done.preserved})`, `"${done.banner.slice(0, 60)}"`);
console.log(errors.length ? `ERRORS ${errors.length}` : 'no console errors');
await b.close();
