/**
 * Entry point: boot the renderer, wire the systems, run a fixed-ish loop.
 */
import * as THREE from 'three';
import { initLang, t, methodName } from './content/i18n.js';
import * as CURRICULUM from './content/curriculum.js';
import * as QUIZ from './content/quiz.js';
import * as I18N from './content/i18n.js';
import { injectCssVariables } from './world/Palette.js';
import { Stage3D } from './world/Stage3D.js';
import { Kitchen } from './world/Kitchen.js';
import { Particles, Popups } from './fx/Effects.js';
import { Input } from './core/Input.js';
import { Game } from './core/Game.js';
import { assets, MOVER_BINDINGS } from './world/AssetRegistry.js';
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
  // up the boot, so the probe is bounded.
  await Promise.race([
    assets.preload(Object.keys(MOVER_BINDINGS)),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
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

  // ---- loop
  const clock = new THREE.Clock();
  let acc = 0;
  let frames = 0, fpsT = 0, fps = 60;

  function frame() {
    requestAnimationFrame(frame);
    // Clamp dt so a background tab or a long GC pause cannot teleport the game.
    const dt = Math.min(0.05, clock.getDelta());

    game.update(dt);
    stage3d.render(dt);

    // Adaptive quality: if we sit under 45fps for a second, drop the pixel
    // ratio one notch rather than letting the whole game feel sluggish.
    frames++; fpsT += dt;
    if (fpsT >= 1) {
      fps = frames / fpsT;
      frames = 0; fpsT = 0;
      if (fps < 45 && stage3d.renderer.getPixelRatio() > 1) {
        stage3d.renderer.setPixelRatio(Math.max(1, stage3d.renderer.getPixelRatio() - 0.25));
      }
      if (import.meta.env?.DEV) window.__ppFps = Math.round(fps);
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
    assetReport: assets.report,
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
