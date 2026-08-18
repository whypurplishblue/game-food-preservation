/**
 * Food contact sheet: every food model, alone, lit, labelled.
 *
 * Photographs each one against a clean backdrop at the angle the player sees it
 * from, so the models can be judged as recognisable objects rather than as
 * blobs glimpsed on a moving counter.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/foods';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 620, height: 620 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 6000));

// Freeze the game's own render loop. It keeps scheduling frames even in a
// throttled headless browser, and one of them lands between the harness's
// render and the screenshot — which is how a hand-placed camera ends up
// photographing the room from the play framing instead.
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
await new Promise((r) => setTimeout(r, 400));

const foods = await p.evaluate(() => {
  const { game, stage3d, kitchen } = window.__pp;
  game.screens.close();
  document.querySelector('.pp-hud')?.setAttribute('hidden', '');
  kitchen.root.visible = false;
  stage3d.scene.background = new window.__ppTHREE.Color(0xf3ece1);
  return Object.values(window.__pp.content.FOODS).map((f) => ({
    id: f.id, model: f.model, scale: f.scale,
    name: window.__pp.content.i18n.t(`foods.${f.id}`),
    method: f.primary,
  }));
});

for (const f of foods) {
  await p.evaluate((food) => {
    const T = window.__ppTHREE, { stage3d } = window.__pp;
    window.__sheet?.removeFromParent();
    const g = new T.Group();
    g.add(window.__pp.foodFactory.buildFoodModel(food.model));
    g.scale.setScalar(food.scale);
    g.rotation.y = -0.55;                 // three-quarter, like the play camera
    g.position.set(0, 3, 6);
    stage3d.scene.add(g);
    window.__sheet = g;

    // Frame from the model's own bounds: the foods differ in size by 3x, so a
    // fixed camera photographs a fish and a speck of egg at the same distance.
    const box = new T.Box3().setFromObject(g);
    const centre = box.getCenter(new T.Vector3());
    const radius = box.getSize(new T.Vector3()).length() * 0.5;
    const cam = stage3d.camera;
    const dist = (radius / Math.tan((cam.fov * Math.PI) / 360)) * 1.5;
    cam.position.set(centre.x + dist * 0.34, centre.y + dist * 0.42, centre.z + dist * 0.86);
    cam.lookAt(centre);
    cam.updateProjectionMatrix();
    // NOT stage3d.render(): that calls updateCamera(), which eases the camera
    // straight back to the game's framing and photographs the room instead.
    stage3d.renderer.render(stage3d.scene, stage3d.camera);
  }, f);
  await p.screenshot({ path: `${OUT}/${f.id}.png`, clip: { x: 60, y: 60, width: 500, height: 500 } });
  console.log('shot', f.id, '(model:', f.model + ')');
}

console.log(JSON.stringify(foods));
await b.close();
