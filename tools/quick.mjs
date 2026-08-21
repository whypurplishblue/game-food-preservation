/** Fast visual check: title, brief, play, and one station interaction. */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = process.env.PP_OUT || 'shots';
const W = +(process.env.PP_W || 1600), H = +(process.env.PP_H || 900);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const b = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR', m.text().slice(0, 250)); } });

const pump = (s) => p.evaluate((x) => window.__pp?.pump?.(x), s);
const shot = async (n, settle = 1) => { if (settle) await pump(settle); await p.screenshot({ path: `${OUT}/${n}.png`, timeout: 25000 }); console.log('shot', n); };

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await sleep(2000);
await shot('01-title', 0.5);

await p.click('[data-act="play"]');
await p.click('[data-mode="arcade"]');
await sleep(400);
await shot('02-brief', 0.5);

await p.click('.pp-brief [data-act="go"]');
await sleep(300);
await pump(2.0);
await shot('03-play', 1.5);

// force-spawn a few foods so the counter isn't empty for the composition check
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__pp.game._spawn(); });
await pump(1.2);
await shot('04-play-food', 0.6);

// drag one onto its correct station
const box = await p.evaluate(() => {
  const { game, stage3d } = window.__pp;
  const food = game.foods.find((f) => f.state === 'idle');
  const st = [...game.stations.values()].find((s) => s.enabled && !s.busy && food?.isValidMethod(s.methodId));
  if (!food || !st) return null;
  const proj = (v) => { const q = v.clone().project(stage3d.camera); const c = document.getElementById('scene').getBoundingClientRect();
    return { x: c.left + (q.x * .5 + .5) * c.width, y: c.top + (-q.y * .5 + .5) * c.height }; };
  return { from: proj(food.group.position), to: proj(st.root.position.clone().setY(2.2)), method: st.methodId };
});
if (box) {
  await p.mouse.move(box.from.x, box.from.y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(box.from.x + (box.to.x - box.from.x) * i / 10, box.from.y + (box.to.y - box.from.y) * i / 10); await sleep(12); }
  await p.mouse.up();
  await sleep(200); await pump(0.8);
  await shot(`05-station-${box.method}`, 0.5);
  console.log('station:', box.method);
}

const info = await p.evaluate(() => ({
  draws: window.__pp.stage3d.renderer.info.render.calls,
  tris: window.__pp.stage3d.renderer.info.render.triangles,
  foods: window.__pp.game.foods.length,
  mode: window.__pp.game.mode,
}));
console.log(JSON.stringify(info));
console.log(errors.length ? `ERRORS ${errors.length}` : 'no console errors');
await b.close();
