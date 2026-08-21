/**
 * Logic probe — no screenshots, just correctness.
 *
 * Runs every station's full step sequence, checks the method actually reported
 * (freezing vs cooling from the same cabinet), and exercises the freezer's
 * wrong-temperature failure path.
 */
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const p = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR:', String(e).slice(0, 400)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR:', m.text().slice(0, 250)); } });

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await sleep(1500);

await p.click('[data-act="play"]').catch(() => {});
await sleep(300);
await p.click('[data-mode="arcade"]').catch(() => {});
await sleep(300);
// Stage 8 puts every machine on the counter, including the two new ones.
await p.evaluate(() => { window.__pp.game.screens.close(); window.__pp.game.startStage(8); });
await sleep(300);
await p.click('.pp-brief [data-act="go"]').catch(() => {});
await sleep(200);
await p.evaluate(() => { const g = window.__pp.game; g.stage = { ...g.stage, spoilRateMul: 0, quizChance: 0 }; });

async function panelKind() {
  return p.evaluate(() => {
    const el = document.querySelector('.pp-panel');
    if (!el || el.hidden) return null;
    if (el.querySelector('.pp-choice')) return 'choice';
    if (el.querySelector('.pp-pad--rhythm')) return 'rhythm';
    if (el.querySelector('.pp-pad--twist')) return 'twist';
    if (el.querySelector('.pp-dial')) return 'dial';
    if (el.querySelector('.pp-pad--sweep')) return 'sweep';
    if (el.querySelector('.pp-pad--scrub')) return 'scrub';
    if (el.querySelector('.pp-btn--hold')) return 'hold';
    if (el.querySelector('.pp-btn--tap')) return 'tap';
    return '?';
  });
}

async function runStation(stationId, foodFilter, dial = 'right') {
  const start = await p.evaluate(({ sid, ff }) => {
    const g = window.__pp.game;
    const st = g.stations.get(sid);
    if (!st) return { ok: false, why: `no station ${sid}` };
    g.foods.slice().forEach((f) => f.dispose());
    g.foods.length = 0;
    st.release();
    let food = null;
    for (let i = 0; i < 60 && !food; i++) {
      g._spawn();
      food = g.foods.find((f) => f.state === 'idle' && g._methodFor(st, f) && (!ff || f.foodId === ff));
    }
    if (!food) return { ok: false, why: `no food${ff ? ' ' + ff : ''}` };
    const mid = g._methodFor(st, food);
    try { g._handleDrop(food, st); } catch (e) { return { ok: false, why: e.message }; }
    return { ok: true, food: food.foodId, method: mid, steps: g.panel.active?.steps?.map((s) => s.kind) };
  }, { sid: stationId, ff: foodFilter || null });
  if (!start.ok) return start;

  const ran = [];
  for (let i = 0; i < 6; i++) {
    const kind = await panelKind();
    if (!kind) break;
    ran.push(kind);
    if (kind === 'tap') {
      // Urgent taps run against a countdown; click inside the page so the
      // harness's own round-trip latency is not what fails the window.
      const urgent = await p.evaluate(() => {
        const b = document.querySelector('.pp-panel .pp-btn--tap.is-urgent');
        if (!b) return false;
        b.click();
        return true;
      });
      if (!urgent) await p.click('.pp-panel .pp-btn--tap').catch(() => {});
    }
    else if (kind === 'choice') { await p.click('.pp-panel .pp-choice').catch(() => {}); await sleep(3200); }
    else if (kind === 'hold') {
      const bb = await (await p.$('.pp-panel .pp-btn--hold'))?.boundingBox();
      if (bb) {
        await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await p.mouse.down();
        for (let k = 0; k < 60; k++) {
          await sleep(80);
          const done = await p.evaluate(() => !document.querySelector('.pp-panel .pp-btn--hold'));
          if (done) break;
        }
        await p.mouse.up();
      }
    } else if (kind === 'rhythm') {
      // Press only while the marker is in the zone, driven from inside the page:
      // a beat window is far shorter than a harness round-trip.
      await p.evaluate(() => new Promise((done) => {
        const pad = document.querySelector('.pp-pad--rhythm');
        if (!pad) return done();
        const iv = setInterval(() => {
          if (!document.querySelector('.pp-pad--rhythm')) { clearInterval(iv); return done(); }
          if (pad.classList.contains('is-open')) document.querySelector('.pp-btn--beat')?.click();
        }, 40);
        setTimeout(() => { clearInterval(iv); done(); }, 15000);
      }));
    } else if (kind === 'twist') {
      // Keyboard turn — the same path a keyboard-only child takes.
      await p.focus('.pp-pad--twist').catch(() => {});
      for (let k = 0; k < 16; k++) {
        if (await p.evaluate(() => !document.querySelector('.pp-pad--twist'))) break;
        await p.keyboard.press('ArrowRight');
        await sleep(30);
      }
    } else if (kind === 'dial') {
      await p.focus('.pp-panel .pp-dial').catch(() => {});
      const target = dial === 'wrong' ? 12 : (start.method === 'cooling' ? 4 : -18);
      const delta = 12 - target;                    // dial starts at 12
      for (let k = 0; k < Math.abs(delta); k++) await p.keyboard.press(delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await p.click('.pp-panel .pp-btn--confirm').catch(() => {});
    } else if (kind === 'sweep') {
      const bb = await (await p.$('.pp-panel .pp-pad__track'))?.boundingBox();
      if (bb) {
        const y = bb.y + bb.height / 2;
        await p.mouse.move(bb.x + 4, y); await p.mouse.down();
        for (let pass = 0; pass < 4; pass++) {
          const [a, c] = pass % 2 === 0 ? [bb.x + 4, bb.x + bb.width - 4] : [bb.x + bb.width - 4, bb.x + 4];
          for (let k = 0; k <= 20; k++) { await p.mouse.move(a + (c - a) * (k / 20), y); await sleep(4); }
        }
        await p.mouse.up();
      }
    } else if (kind === 'scrub') {
      const bb = await (await p.$('.pp-panel .pp-scrub__surface'))?.boundingBox();
      if (bb) {
        const y = bb.y + bb.height / 2;
        await p.mouse.move(bb.x + 10, y); await p.mouse.down();
        for (let pass = 0; pass < 12; pass++) {
          const [a, c] = pass % 2 === 0 ? [bb.x + 10, bb.x + bb.width - 10] : [bb.x + bb.width - 10, bb.x + 10];
          for (let k = 0; k <= 8; k++) { await p.mouse.move(a + (c - a) * (k / 8), y); await sleep(4); }
        }
        await p.mouse.up();
      }
    }
    await sleep(280);
  }
  await sleep(1700);
  const res = await p.evaluate(() => ({
    preserved: window.__pp.game.preserved,
    banner: document.querySelector('.pp-banner')?.textContent || '',
  }));
  await p.evaluate(() => { window.__pp.game.preserved = 0; window.__pp.game.panel.stop(); });
  return { ...start, ran, ...res };
}

const CASES = [
  ['DryingRack', null], ['Freezer', 'chicken'], ['Freezer', 'milk'],
  ['VacuumSealer', null], ['PicklingJar', null], ['SaltTable', null], ['Pasteuriser', null],
  ['Smokehouse', 'fish'], ['Cannery', 'vegetables'],
];
for (const [sid, food] of CASES) {
  const r = await runStation(sid, food);
  const label = (sid + (food ? '/' + food : '')).padEnd(20);
  console.log(label, r.ok === false
    ? 'FAIL ' + r.why
    : `${String(r.method).padEnd(12)} ${(r.ran || []).join('>').padEnd(26)} preserved=${r.preserved}  "${(r.banner || '').slice(0, 60)}"`);
}

const wrong = await runStation('Freezer', 'milk', 'wrong');
console.log('Freezer/milk WRONG  '.padEnd(20),
  `preserved=${wrong.preserved} (expect 0)  banner="${(wrong.banner || '').slice(0, 90)}"`);

console.log(errors.length ? `\nERRORS: ${errors.length}` : '\nno console errors');
await browser.close();
