/**
 * Entry point: boot the renderer, wire the systems, run a fixed-ish loop.
 */
import * as THREE from 'three';
import { initLang, t, methodName } from './content/i18n.js';
import * as CURRICULUM from './content/curriculum.js';
import * as QUIZ from './content/quiz.js';
import * as I18N from './content/i18n.js';
import { injectCssVariables } from './world/Palette.js';
import { setMaterialQuality } from './world/Materials.js';
import { Stage3D } from './world/Stage3D.js';
import * as FOODFACTORY from './world/FoodFactory.js';
import { Kitchen } from './world/Kitchen.js';
import { Particles, Popups } from './fx/Effects.js';
import { Input } from './core/Input.js';
import { Game } from './core/Game.js';
import { assets, foodAssets, MOVER_BINDINGS } from './world/AssetRegistry.js';
import { HUD } from './ui/HUD.js';
import { StationPanel } from './ui/StationPanel.js';
import { QuizCard } from './ui/QuizCard.js';
import { Screens } from './ui/Screens.js';
import { audio } from './core/Audio.js';
import './ui/styles.css';

// Food's hint badge needs a localised method name before the module graph is
// fully wired; exposing it avoids a circular import between Food and i18n.
globalThis.__ppMethodName = methodName;
// The harness needs Box3/Vector3 to measure the scene it is judging.
globalThis.__ppTHREE = THREE;

function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  if (mem <= 2 || cores <= 2) return 'low';
  if (mem <= 4 || cores <= 4 || small) return 'medium';
  return 'high';
}

async function staggeredPreload(loader, ids, base, delayMs = 100) {
  const results = new Map();
  const batches = [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10)].filter(b => b.length);
  for (const batch of batches) {
    await Promise.all(batch.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${base}${id}.glb`);
        results.set(id, gltf.scene);
      } catch (e) {
        console.warn(`[assets] ${id} failed to load`, e);
      }
    }));
    if (batch !== batches[batches.length - 1]) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

async function boot() {
  initLang();
  injectCssVariables();

  // Exposed so tools/check-content.mjs can assert on it without duplicating
  // the rules here.
  const problems = CURRICULUM.validateCurriculum();
  globalThis.__ppValidation = problems;
  if (problems.length) {
    console.error('[curriculum] validation failed:\n' + problems.join('\n'));
  }

  const app = document.getElementById('app');
  const canvas = document.getElementById('scene');
  const quality = detectQuality();
  document.documentElement.dataset.quality = quality;
  setMaterialQuality(quality);

  const stage3d = new Stage3D(canvas, { quality });
  const kitchen = new Kitchen(stage3d.scene, { quality });
  const particles = new Particles(stage3d.scene);
  const popups = new Popups(stage3d.scene);

  const hud = new HUD(app);
  const panel = new StationPanel(app);
  const quiz = new QuizCard(app);
  const screens = new Screens(app);

  // Optional Blender-authored station shells. Absent by default: the game ships
  // with procedural machines, and a slow or missing asset host must never hold
  // up the boot, so the probe is bounded. Measure load time; if slow network,
  // downgrade quality to reduce visual expectations.
  let finalQuality = quality;
  const assetStart = performance.now();
  await Promise.race([
    Promise.all([
      assets.preload(Object.keys(MOVER_BINDINGS)),
      foodAssets.preload(FOODFACTORY.FOOD_MODEL_LIST),
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  const assetTime = performance.now() - assetStart;
  if (assetTime > 2000 && quality === 'high') {
    finalQuality = 'medium';
    stage3d.quality = 'medium';
    stage3d.renderer.setPixelRatio(stage3d._pixelRatio());
    if (import.meta.env?.DEV) console.info('[assets] slow network detected, downgrading to medium quality');
  }
  if (import.meta.env?.DEV && assets.report.length) console.info('[assets]', assets.report.join(', '));

  const input = new Input(canvas, stage3d, {});
  const game = new Game({ stage3d, kitchen, hud, panel, quiz, screens, particles, popups, input });

  // Audio must be created inside a user gesture.
  const unlock = () => {
    audio.init();
    audio.setEnabled(game.settings.sound);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  document.getElementById('boot')?.remove();
  game.showMenu();

  // ---- optional on-screen stats: ?stats=1
  // Software rendering in CI makes frame times meaningless, so the only honest
  // way to know what a real machine is doing is to show it there.
  let statsEl = null;
  if (new URLSearchParams(location.search).get('stats') === '1') {
    statsEl = document.createElement('div');
    statsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;padding:6px 9px;'
      + 'font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#d7ffe6;background:rgba(12,16,24,.82);'
      + 'border-radius:8px;white-space:pre;pointer-events:none';
    app.appendChild(statsEl);
  }

  // ---- loop
  const clock = new THREE.Clock();
  let acc = 0;
  let frames = 0, fpsT = 0, fps = 60;
  const frameTimes = [];
  const MAX_FRAME_HISTORY = 5;

  function frame() {
    requestAnimationFrame(frame);
    // Clamp dt so a background tab or a long GC pause cannot teleport the game.
    const dt = Math.min(0.05, clock.getDelta());

    game.update(dt);
    stage3d.render(dt);

    // Adaptive quality: if last 5 frames average <45fps, drop pixel ratio
    // immediately rather than waiting 1 second. Feels snappier under load.
    frameTimes.push(dt);
    if (frameTimes.length > MAX_FRAME_HISTORY) frameTimes.shift();
    const avgDt = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const frameFps = avgDt > 0 ? 1 / avgDt : 60;
    if (frameFps < 45 && frameTimes.length === MAX_FRAME_HISTORY && stage3d.renderer.getPixelRatio() > 1) {
      stage3d.renderer.setPixelRatio(Math.max(1, stage3d.renderer.getPixelRatio() - 0.25));
    }

    // Second-level FPS tracking for stats display
    frames++; fpsT += dt;
    if (fpsT >= 1) {
      fps = frames / fpsT;
      frames = 0; fpsT = 0;
      if (import.meta.env?.DEV) window.__ppFps = Math.round(fps);
      if (statsEl) {
        const i = stage3d.renderer.info;
        statsEl.textContent =
          `fps    ${Math.round(fps)}\n`
          + `calls  ${i.render.calls}\n`
          + `tris   ${(i.render.triangles / 1000).toFixed(0)}k\n`
          + `geo    ${i.memory.geometries}  tex ${i.memory.textures}\n`
          + `dpr    ${stage3d.renderer.getPixelRatio().toFixed(2)}  foods ${game.foods.length}`;
      }
    }
  }
  frame();

  // Pause when the tab is hidden so nothing spoils while the child is away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') game.pause();
  });

  // Expose for the automated visual/perf harness.
  window.__pp = {
    game, stage3d, kitchen, input, hud, validation: problems,
    foodFactory: FOODFACTORY,
    assetReport: assets.report,
    foodAssetReport: foodAssets.report,
    // Content surface for tools/check-content.mjs.
    content: { ...CURRICULUM, ...QUIZ, i18n: I18N },
    get fps() { return fps; },
    /**
     * Deterministically advance the game by `seconds` at a fixed step and
     * render once at the end. Headless browsers throttle requestAnimationFrame
     * hard, which otherwise leaves every screenshot caught mid-transition; this
     * makes the visual gauntlet repeatable instead of timing-dependent.
     */
    pump(seconds = 1, step = 1 / 60) {
      const n = Math.max(1, Math.round(seconds / step));
      for (let i = 0; i < n; i++) { game.update(step); stage3d.updateCamera(step); }
      stage3d.render(step);
      return n;
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
