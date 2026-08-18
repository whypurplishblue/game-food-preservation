/**
 * Asset gauntlet: photograph every station close up, once with the Blender GLB
 * shells and once with them forced off, so the two can be judged side by side.
 *
 * Usage: node tools/models.mjs        -> shots/models/<Station>-glb.png
 *        PP_NO_GLB=1 node tools/models.mjs -> shots/models/<Station>-proc.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/models';
mkdirSync(OUT, { recursive: true });
const NO_GLB = !!process.env.PP_NO_GLB;   // procedural is the default; ?models=1 opts in
const suffix = NO_GLB ? 'proc' : 'glb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)); });
p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('ERR', m.text().slice(0, 220)); } });

await p.goto(`http://localhost:4173/${NO_GLB ? '' : '?models=1'}`, { waitUntil: 'networkidle' });
await sleep(6000);
console.log('assets:', await p.evaluate(() => window.__pp?.assetReport?.join(', ') || 'n/a'));

await p.click('[data-act="play"]').catch(() => {});
await sleep(300);
await p.evaluate(() => { window.__pp.game.screens.close(); window.__pp.game.startStage(3); });
await sleep(300);
await p.click('.pp-brief [data-act="go"]').catch(() => {});
await sleep(400);
await p.evaluate(() => { const g = window.__pp.game; g.stage = { ...g.stage, spoilRateMul: 0, quizChance: 0 }; });

// The wide shot is the one that matters: it is what the player actually sees.
await p.evaluate(() => window.__pp.pump(1.2));
await p.screenshot({ path: `${OUT}/00-wide-${suffix}.png`, timeout: 25000 });
console.log('shot wide');

// Freeze the game's own render loop. It keeps scheduling frames even in a
// throttled headless browser, and one of them lands between the harness's
// render and the screenshot — which is how a hand-placed camera ends up
// photographing the room from the play framing instead.
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
await new Promise((r) => setTimeout(r, 400));

const ids = ['DryingRack', 'Freezer', 'VacuumSealer', 'PicklingJar', 'SaltTable', 'Pasteuriser'];
for (const id of ids) {
  await p.evaluate((sid) => {
    const g = window.__pp.game;
    const st = g.stations.get(sid);
    const c = st.root.position;
    // Eye-level three-quarter so the silhouette and the front face both read.
    g.stage3d.setCameraFraming('station', { instant: true, focus: { x: c.x, z: c.z } });
    g.stage3d.camera.position.set(c.x * 0.35 + 1.6, 4.2, c.z + 6.4);
    g.stage3d.camera.lookAt(c.x, 1.9, c.z);
    g.stage3d.camera.updateProjectionMatrix();
  }, id);
  // Pump first, then plant the camera and render once: pump() runs
  // updateCamera, which would otherwise ease straight back to the game framing.
  await p.evaluate(() => window.__pp.pump(0.4));
  await p.evaluate((sid) => {
    const g = window.__pp.game;
    const st = g.stations.get(sid);
    const c = st.root.position, ry = st.root.rotation.y;
    // Stand in front of the machine along its own facing direction: on the
    // horseshoe every station points somewhere different, so a fixed offset
    // photographs its neighbour.
    const fx = Math.sin(ry), fz = Math.cos(ry);
    g.stage3d.camera.position.set(c.x + fx * 8.2, 4.4, c.z + fz * 8.2);
    g.stage3d.camera.lookAt(c.x, 1.6, c.z);
    // Bypass stage3d.render(): it re-runs updateCamera and would ease the
    // camera back to the play framing before the frame is drawn.
    g.stage3d.renderer.render(g.stage3d.scene, g.stage3d.camera);
  }, id);
  await p.screenshot({ path: `${OUT}/${id}-${suffix}.png`, timeout: 25000 });
  console.log('shot', id);
}
console.log(errors.length ? `ERRORS ${errors.length}` : 'no console errors');
await b.close();
