/** Photograph the freezer with a food loaded, door open — is the food visible? */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 250)));
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__pp, null, { timeout: 45000 });
await p.click('[data-act="play"]');
await sleep(300);
await p.click('[data-mode="arcade"]');
await sleep(300);
await p.evaluate(() => { window.__pp.game.screens.close(); window.__pp.game.startStage(3); });
await sleep(300);
await p.click('.pp-brief [data-act="go"]');
await sleep(400);
await p.evaluate(() => {
  const g = window.__pp.game, st = g.stations.get('Freezer');
  g.stage = { ...g.stage, spoilRateMul: 0, quizChance: 0 };
  g.foods.slice().forEach((f) => f.dispose()); g.foods.length = 0; st.release();
  let food = null;
  for (let i = 0; i < 80 && !food; i++) { g._spawn(); food = g.foods.find((f) => f.foodId === 'chicken' && f.state === 'idle'); }
  g._handleDrop(food, st);
});
await sleep(1200);
await p.evaluate(() => window.__pp.pump(1.6));
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
await sleep(300);
await p.evaluate(() => {
  const g = window.__pp.game, st = g.stations.get('Freezer');
  const c = st.root.position, ry = st.root.rotation.y;
  g.stage3d.camera.position.set(c.x + Math.sin(ry) * 9.4, 5.4, c.z + Math.cos(ry) * 9.4);
  g.stage3d.camera.lookAt(c.x, 2.0, c.z);
  g.stage3d.renderer.render(g.stage3d.scene, g.stage3d.camera);
});
await p.screenshot({ path: 'shots/freezer-open.png', clip: { x: 120, y: 30, width: 760, height: 600 } });
console.log('shot');
await b.close();
