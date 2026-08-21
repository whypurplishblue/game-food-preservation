/**
 * Performance probe. Software rendering here makes absolute FPS meaningless,
 * so this reports the hardware-independent numbers instead: draw calls,
 * triangles, texture and geometry counts, shader programs, and how long a fixed
 * batch of frames takes relative to an empty scene.
 *
 *   PP_STAGE=8 node tools/perf.mjs
 */
import { chromium } from 'playwright';
const STAGE = +(process.env.PP_STAGE || 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 780 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!window.__pp, null, { timeout: 60000 });
console.log('assets:', await p.evaluate(() => (window.__pp.foodAssetReport || []).join(', ')));

await p.click('[data-act="play"]');
await sleep(300);
await p.click('[data-mode="arcade"]');
await sleep(300);
await p.evaluate((s) => { window.__pp.game.screens.close(); window.__pp.game.startStage(s); }, STAGE);
await sleep(400);
await p.click('.pp-brief [data-act="go"]');
await sleep(500);

const snap = async (label, spawn = 0) => {
  await p.evaluate((n) => { for (let i = 0; i < n; i++) window.__pp.game._spawn(); }, spawn);
  await p.evaluate(() => window.__pp.pump(1.0));
  const r = await p.evaluate(() => {
    const { renderer } = window.__pp.stage3d;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) window.__pp.stage3d.render(1 / 60);
    const ms = (performance.now() - t0) / 20;
    const info = renderer.info;
    let meshes = 0, mats = new Set(), tex = new Set();
    window.__pp.stage3d.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      meshes++;
      for (const m of [].concat(o.material || [])) {
        mats.add(m.uuid);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          if (m[k]) tex.add(m[k].uuid);
        }
      }
    });
    return {
      msPerFrame: +ms.toFixed(1),
      calls: info.render.calls, tris: info.render.triangles,
      programs: info.programs.length,
      geometries: info.memory.geometries, textures: info.memory.textures,
      visibleMeshes: meshes, uniqueMaterials: mats.size, uniqueTextures: tex.size,
      foods: window.__pp.game.foods.length,
    };
  });
  console.log(label.padEnd(22), JSON.stringify(r));
  return r;
};

await snap('empty counter');
await snap('+3 foods', 3);
await snap('+3 more', 3);
await snap('+4 more', 4);

// Which materials carry big textures?
console.log('\nbig textures in the scene:');
console.log(await p.evaluate(() => {
  const seen = new Map();
  window.__pp.stage3d.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = m[k];
        if (!t?.image) continue;
        const w = t.image.width || 0, h = t.image.height || 0;
        if (w * h < 256 * 256) continue;
        const key = `${o.parent?.parent?.name || o.name} ${k} ${w}x${h}`;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
    }
  });
  return [...seen.entries()].map(([k, n]) => `${k}  x${n}`).join('\n') || '(none over 256x256)';
}));
await b.close();
