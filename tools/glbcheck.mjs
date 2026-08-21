/** Measure each GLB shell against the procedural machine it replaces. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?models=0', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 16000));
const proc = await p.evaluate(() => {
  const T = window.__ppTHREE;
  const out = {};
  for (const [id, s] of window.__pp.game.stations) {
    const box = new T.Box3();
    for (const part of s._procParts) box.expandByObject(part);
    const mn = box.min, mx = box.max;
    out[id] = [mn.x, mn.y, mn.z, mx.x, mx.y, mx.z].map((v) => +v.toFixed(2));
  }
  return out;
});
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 16000));
const glb = await p.evaluate(() => {
  const T = window.__ppTHREE;
  const out = {};
  for (const [id, s] of window.__pp.game.stations) {
    if (!s.model) { out[id] = null; continue; }
    const box = new T.Box3().setFromObject(s.model);
    const mn = box.min, mx = box.max;
    out[id] = [mn.x, mn.y, mn.z, mx.x, mx.y, mx.z].map((v) => +v.toFixed(2));
  }
  return out;
});
const f = (a) => a ? `x[${a[0]},${a[3]}] y[${a[1]},${a[4]}] z[${a[2]},${a[5]}]` : 'none';
for (const id of Object.keys(proc)) {
  console.log(id.padEnd(14), 'proc', f(proc[id]));
  console.log(''.padEnd(14), 'glb ', f(glb[id]));
}
await b.close();
