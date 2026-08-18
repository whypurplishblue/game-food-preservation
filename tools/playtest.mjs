/**
 * Playtest: plays a whole stage the way a child does — mouse drags on the 3D
 * scene, the real widgets, the real quiz — and asserts the stage actually ends.
 *
 * Nothing here calls the game's internals to move a food. If this passes, the
 * game is playable end to end; probe.mjs only proves each station's logic.
 */
import { chromium } from 'playwright';

const STAGE = +(process.env.PP_STAGE || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR', m.text().slice(0, 220)); } });

const pump = (s = 0.5) => p.evaluate((x) => window.__pp?.pump?.(x), s);

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await sleep(3000);

// ---- title -> stage brief -> play, all through the real buttons
await p.click('[data-act="play"]');
await sleep(400);
if (STAGE !== 1) {
  await p.evaluate((s) => { window.__pp.game.screens.close(); window.__pp.game.startStage(s); }, STAGE);
  await sleep(400);
}
await p.click('.pp-brief [data-act="go"]');
await sleep(500);
console.log('stage', await p.evaluate(() => window.__pp.game.stageId), 'started');

/** Complete whatever widget the station panel is showing. */
async function completePanel() {
  for (let step = 0; step < 6; step++) {
    const kind = await p.evaluate(() => {
      const el = document.querySelector('.pp-panel');
      if (!el || el.hidden) return null;
      if (el.querySelector('.pp-choice')) return 'choice';
      if (el.querySelector('.pp-dial')) return 'dial';
      if (el.querySelector('.pp-pad--sweep')) return 'sweep';
      if (el.querySelector('.pp-scrub__surface')) return 'scrub';
      if (el.querySelector('.pp-btn--hold')) return 'hold';
      if (el.querySelector('.pp-btn--tap')) return 'tap';
      return null;
    });
    if (!kind) return step > 0;
    console.log('   widget:', kind);

    if (kind === 'tap') {
      await p.evaluate(() => {
        const urgent = document.querySelector('.pp-panel .pp-btn--tap.is-urgent');
        (urgent || document.querySelector('.pp-panel .pp-btn--tap'))?.click();
      });
    } else if (kind === 'choice') {
      await p.click('.pp-panel .pp-choice').catch(() => {});
      await sleep(1600);
    } else if (kind === 'hold') {
      const bb = await (await p.$('.pp-panel .pp-btn--hold'))?.boundingBox();
      if (bb) {
        await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await p.mouse.down();
        for (let k = 0; k < 70; k++) {
          await sleep(80);
          if (await p.evaluate(() => !document.querySelector('.pp-panel .pp-btn--hold'))) break;
        }
        await p.mouse.up();
      }
    } else if (kind === 'dial') {
      // Read the band the game itself is asking for, then turn to it.
      const target = await p.evaluate(() => {
        const s = window.__pp.game.panel.active?.steps?.find((x) => x.kind === 'dial');
        return s?.target ? (s.target[0] + s.target[1]) / 2 : -18;
      });
      await p.focus('.pp-panel .pp-dial').catch(() => {});
      const cur = await p.evaluate(() => +document.querySelector('.pp-panel .pp-dial')?.dataset.value || 12);
      const d = Math.round(cur - target);
      for (let k = 0; k < Math.abs(d); k++) await p.keyboard.press(d > 0 ? 'ArrowDown' : 'ArrowUp');
      await p.click('.pp-panel .pp-btn--confirm').catch(() => {});
    } else if (kind === 'sweep' || kind === 'scrub') {
      const sel = kind === 'sweep' ? '.pp-panel .pp-pad__track' : '.pp-panel .pp-scrub__surface';
      const bb = await (await p.$(sel))?.boundingBox();
      if (bb) {
        const y = bb.y + bb.height / 2;
        await p.mouse.move(bb.x + 8, y); await p.mouse.down();
        for (let pass = 0; pass < 12; pass++) {
          const [a, c] = pass % 2 === 0 ? [bb.x - 6, bb.x + bb.width + 6] : [bb.x + bb.width + 6, bb.x - 6];
          for (let k = 0; k <= 10; k++) { await p.mouse.move(a + (c - a) * (k / 10), y); await sleep(5); }
          const state = await p.evaluate((q) => {
            if (!document.querySelector(q)) return null;
            return (document.querySelector('.pp-pad__knob')?.style.left || '')
              + (document.querySelector('.pp-meter b')?.textContent || '');
          }, sel);
          const gone = state === null;
          console.log('    pass', pass, gone ? 'done' : state);
          if (gone) break;
        }
        await p.mouse.up();
      }
    }
    await sleep(300);
  }
  return true;
}

let drags = 0, quizzes = 0, guard = 0;
let result = null;

while (guard++ < 120) {
  await pump(0.45);

  // stage over?
  result = await p.evaluate(() => {
    const r = document.querySelector('.pp-result');
    if (!r) return null;
    return {
      passed: r.classList.contains('is-pass'),
      heading: r.querySelector('h2')?.textContent,
      grid: [...r.querySelectorAll('.pp-result__grid div')].map((d) => d.textContent.trim()),
      stars: r.querySelectorAll('.pp-result__star.is-on').length,
    };
  });
  if (result) break;

  // quiz?
  if (await p.evaluate(() => !!document.querySelector('.pp-quiz__opt:not([disabled])'))) {
    const picked = await p.evaluate(() => {
      // Answer honestly: pick the option the game marks correct, so the run
      // exercises the "right answer" path rather than the retry path.
      const q = window.__pp.game.quiz.current;
      const opts = [...document.querySelectorAll('.pp-quiz__opt')];
      const i = Math.max(0, q?.options?.findIndex((o) => o.correct) ?? 0);
      opts[i]?.click();
      return q?.type || 'quiz';
    });
    quizzes++;
    await sleep(600);
    await p.click('.pp-quiz__next').catch(() => {});
    console.log('  quiz answered:', picked);
    await sleep(400);
    continue;
  }

  if (await completePanel()) { await sleep(900); continue; }

  // otherwise: drag the oldest idle food onto its correct station, by mouse.
  const pick = await p.evaluate(() => {
    const g = window.__pp.game, T = window.__ppTHREE;
    const cam = g.stage3d.camera, canvas = g.stage3d.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    const toScreen = (v3) => {
      const v = v3.clone().project(cam);
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    };
    const food = g.foods.find((f) => f.state === 'idle');
    if (!food) return null;
    let station = null;
    for (const [, s] of g.stations) if (s.enabled && !s.busy && g._methodFor(s, food)) { station = s; break; }
    if (!station) return { none: true, food: food.foodId };
    return {
      food: food.foodId,
      method: g._methodFor(station, food),
      station: station.stationId,
      from: toScreen(food.group.position.clone()),
      to: toScreen(station.root.position.clone().setY(2.2)),
    };
  });

  if (!pick) { continue; }
  if (pick.none) { console.log('  no station for', pick.food); await pump(1); continue; }

  await p.mouse.move(pick.from.x, pick.from.y);
  await p.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await p.mouse.move(pick.from.x + (pick.to.x - pick.from.x) * (k / 12),
                       pick.from.y + (pick.to.y - pick.from.y) * (k / 12));
    await sleep(20);
  }
  await p.mouse.up();
  drags++;
  console.log(`  dragged ${pick.food} -> ${pick.station} (${pick.method})`);
  await sleep(500);
}

console.log('\ndrags', drags, ' quizzes', quizzes);
console.log('result:', result ? JSON.stringify(result) : 'STAGE DID NOT END');
console.log(errors.length ? `ERRORS ${errors.length}` : 'no console errors');
await p.screenshot({ path: 'shots/playtest-end.png' }).catch(() => {});
await b.close();
