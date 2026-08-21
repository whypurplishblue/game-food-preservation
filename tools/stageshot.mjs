/**
 * Photograph a stage: the whole counter, then any stations named in PP_STATIONS.
 *   PP_STAGE=8 PP_STATIONS=Smokehouse,Cannery node tools/stageshot.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('shots', { recursive: true });
const STAGE = +(process.env.PP_STAGE || 8);
const WANT = (process.env.PP_STATIONS || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 780 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 250)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR', m.text().slice(0, 200)); } });

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__pp, null, { timeout: 45000 });
await p.click('[data-act="play"]');
await sleep(300);
await p.click('[data-mode="arcade"]');
await sleep(300);
await p.evaluate((s) => { window.__pp.game.screens.close(); window.__pp.game.startStage(s); }, STAGE);
await sleep(400);
await p.click('.pp-brief [data-act="go"]');
await sleep(500);
await p.evaluate(() => { const g = window.__pp.game; g.stage = { ...g.stage, spoilRateMul: 0, quizChance: 0 }; });
await p.evaluate(() => window.__pp.pump(2.2));
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
await sleep(300);
await p.screenshot({ path: `shots/stage${STAGE}-wide.png` });
console.log('shot wide');

for (const id of WANT) {
  await p.evaluate((sid) => {
    const g = window.__pp.game, st = g.stations.get(sid);
    if (!st) return;
    // Drop a food in so the machine is photographed working, not idle.
    g.foods.slice().forEach((f) => f.dispose()); g.foods.length = 0; st.release();
    let food = null;
    for (let i = 0; i < 80 && !food; i++) { g._spawn(); food = g.foods.find((f) => f.state === 'idle' && g._methodFor(st, f)); }
    if (food) g._handleDrop(food, st);
  }, id);
  await sleep(900);
  await p.evaluate(() => window.__pp.pump(1.4));
  await p.evaluate((sid) => {
    const g = window.__pp.game, st = g.stations.get(sid);
    const c = st.root.position, ry = st.root.rotation.y;
    g.stage3d.camera.position.set(c.x + Math.sin(ry) * 8.6, 5.0, c.z + Math.cos(ry) * 8.6);
    g.stage3d.camera.lookAt(c.x, 2.0, c.z);
    g.stage3d.renderer.render(g.stage3d.scene, g.stage3d.camera);
  }, id);
  await p.screenshot({ path: `shots/${id}.png`, clip: { x: 240, y: 40, width: 800, height: 620 } });
  console.log('shot', id);
  await p.evaluate(() => { window.__pp.game.panel.stop(); });
}
console.log(errors.length ? `ERRORS ${errors.length}` : 'no console errors');
await b.close();
