/**
 * Game orchestration: stage lifecycle, spawning, scoring, and the flow from
 * drag → station interaction → preservation → quiz.
 *
 * The learning curve lives in STAGES (content/curriculum.js), not here. This
 * file only reads the stage flags — showStationLabels, showMethodHintOnFood,
 * shuffleStations, quizChance — so the difficulty ramp can be retuned by a
 * teacher editing data, without touching gameplay code.
 */
import * as THREE from 'three';
import {
  STAGES, METHODS, FOODS, FOOD_METHODS, SCORING, isTaughtPairing,
  STATION_METHODS, stationsFor, methodAtStation,
  LEARNING_STAGES, LEARNING_SCORING,
} from '../content/curriculum.js';
import { t, methodName, foodName, mechShort, methodMechShort, onLangChange, setLang } from '../content/i18n.js';
import { makeLearningQuestion, makeQuestion } from '../content/quiz.js';
import { PALETTE } from '../world/Palette.js';
import { layoutFor, PREP_CENTRE, PREP_RADIUS } from '../world/Kitchen.js';
import { Food } from '../world/Food.js';
import { MenuMicrobes, MENU_MICROBE_TARGETS } from '../world/MenuMicrobes.js';
import { DryingRack } from '../world/stations/DryingRack.js';
import { Freezer } from '../world/stations/Freezer.js';
import { VacuumSealer } from '../world/stations/VacuumSealer.js';
import { PicklingJar } from '../world/stations/PicklingJar.js';
import { SaltTable } from '../world/stations/SaltTable.js';
import { Pasteuriser } from '../world/stations/Pasteuriser.js';
import { Smokehouse } from '../world/stations/Smokehouse.js';
import { Cannery } from '../world/stations/Cannery.js';
import { sfx, audio } from './Audio.js';
import { FactBook3D } from '../ui/factbook/FactBook3D.js';

/**
 * Keyed by STATION, not by method. The Freezer serves two methods (freezing at
 * 0°C and below, cooling at ~4°C) from one cabinet, exactly as §5E describes.
 */
import { assets } from '../world/AssetRegistry.js';

const STATION_CLASSES = {
  DryingRack, Freezer, VacuumSealer, PicklingJar, SaltTable, Pasteuriser,
  Smokehouse, Cannery,
};

const SAVE_KEY = 'pp.progress.v2';
const LEGACY_SAVE_KEY = 'pp.progress.v1';
const MODE_IDS = ['learning', 'arcade'];

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export class Game {
  constructor({ stage3d, kitchen, hud, panel, quiz, screens, particles, popups, input, quickControls = null }) {
    this.stage3d = stage3d;
    this.kitchen = kitchen;
    this.hud = hud;
    this.panel = panel;
    this.quiz = quiz;
    this.screens = screens;
    this.particles = particles;
    this.popups = popups;
    this.input = input;
    this.quickControls = quickControls;

    this.foods = [];
    this.stations = new Map();
    this.mode = 'menu';           // menu | mode-select | brief | playing | teaching | paused | quiz | result
    this.gameMode = 'arcade';     // arcade | learning — which content/scoring track
    this.settings = { sound: true, music: true, sfxVolume: 1, musicVolume: 0.6, reducedMotion: false, muted: false };
    this.savedStage = { arcade: 1, learning: 1 };
    this.bestScores = { arcade: {}, learning: {} };
    this.misses = {};
    this.history = {};
    this.modeRecency = { arcade: 0, learning: 0 };
    this._recencyCounter = 0;
    this._saveExtras = {};

    this._tmpVec = new THREE.Vector3();
    this._activeStationOrder = [];
    this._activeSlots = [];
    this._layoutMode = null;
    this._layoutAspect = null;
    this._builtStations = new Set();
    this._buildAllStations();
    this.menuMicrobes = new MenuMicrobes(this.stage3d.camera);
    this._unsubLang = onLangChange(() => {
      for (const station of this.stations.values()) station.refreshLabels();
      for (const food of this.foods) food.refreshLabel();
    });
    this._wireInput();
    this._loadSettings();

    this.quickControls?.setCallbacks({
      onMute: (value) => this.setSetting('muted', value),
      onLanguage: (code) => this.setLanguage(code),
    });
    this.quickControls?.setMuted(this.settings.muted);

    this.hud.factBtn.addEventListener('click', () => this.openFactBook());
    this.hud.pauseBtn.addEventListener('click', () => this.pause());
    this.hud.onPeek = () => {
      // Looking it up is allowed, but it breaks the combo — recall is cheaper.
      if (this.combo > 1) {
        this.combo = 1;
        this._syncCombo();
        this.hud.flash(t('ui.preservationMemory'), { kind: 'info', ms: 700 });
      }
    };
  }

  // ------------------------------------------------------------------ setup
  _buildAllStations() {
    for (const [stationId, Cls] of Object.entries(STATION_CLASSES)) {
      const methods = STATION_METHODS[stationId] || [];
      const s = new Cls(methods[0], stationId);
      s.stationId = stationId;
      s.methods = methods;
      s.enabled = false;
      s.root.visible = false;
      this.stage3d.scene.add(s.root);
      this.stations.set(stationId, s);
    }
  }

  _ensureStationBuilt(stationId) {
    if (this._builtStations.has(stationId)) return;
    const s = this.stations.get(stationId);
    if (!s) return;
    if (assets.has(stationId)) s.useModel(stationId);
    else s.batchStatic();
    this._builtStations.add(stationId);
  }

  /**
   * Perform the one-time model swap/static merge while the loading cover is
   * still visible, rather than making the first visit to each stage pay for it.
   * Returns the roots so Stage3D can compile their material variants as well.
   */
  prepareStations() {
    for (const id of this.stations.keys()) this._ensureStationBuilt(id);
    return [...this.stations.values()].map((station) => station.root);
  }

  /** The method this station would apply to this food, or null if it cannot. */
  _methodFor(station, food) {
    return methodAtStation(station.stationId, food.foodId, this.stage?.methods || null);
  }

  _wireInput() {
    this.input.opts.getFoods = () => this.foods;
    this.input.opts.getStations = () => [...this.stations.values()].filter((s) => s.enabled);
    this.input.opts.onPick = (f) => { sfx('food.pick'); this.hud.say(t('a11y.foodItem', { food: foodName(f.foodId), percent: Math.round(f.spoil * 100) })); };
    this.input.opts.onDrop = (f, s) => this._handleDrop(f, s);
    this.input.opts.onReturn = (f) => this._returnFood(f);
    this.input.opts.onKeyboardSelect = (f) => {
      this.hud.say(t('a11y.foodItem', { food: foodName(f.foodId), percent: Math.round(f.spoil * 100) }));
    };
  }

  // -------------------------------------------------------------- persistence
  _loadSettings() {
    let data = null;
    let sourceKey = null;
    try {
      const current = localStorage.getItem(SAVE_KEY);
      const legacy = current ? null : localStorage.getItem(LEGACY_SAVE_KEY);
      const raw = current || legacy;
      if (raw) { data = JSON.parse(raw); sourceKey = current ? SAVE_KEY : LEGACY_SAVE_KEY; }
    } catch { /* private mode — play without a save */ }

    if (isRecord(data)) {
      // Keep fields owned by other save features (for example history) when
      // the save is upgraded. Known fields below are rewritten in normalized
      // form, while unknown fields survive a later settings/checkpoint save.
      const known = new Set([
        'settings', 'stage', 'savedStage', 'bestScores', 'misses',
        'modeRecency', 'lastPlayed', 'lastPlayedMode', 'recencyCounter',
      ]);
      this._saveExtras = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)));
      Object.assign(this.settings, isRecord(data.settings) ? data.settings : {});

      // v1 stored one arcade checkpoint as `stage`; v2 stores separate mode
      // checkpoints. A legacy arcade checkpoint must not be thrown away and
      // learning starts cleanly because it did not exist in v1.
      const saved = isRecord(data.savedStage)
        ? data.savedStage
        : { arcade: data.stage, learning: 1 };
      this.savedStage = {
        arcade: Math.max(1, Math.floor(safeNumber(saved.arcade, 1))),
        learning: Math.max(1, Math.floor(safeNumber(saved.learning, 1))),
      };

      const scores = isRecord(data.bestScores) ? data.bestScores : {};
      const namespacedScores = Object.prototype.hasOwnProperty.call(scores, 'arcade')
        || Object.prototype.hasOwnProperty.call(scores, 'learning');
      this.bestScores = {
        // v1's flat score map belongs to Arcade. Empty maps are harmless in
        // either shape and are kept as objects so score writes stay safe.
        arcade: isRecord(namespacedScores ? scores.arcade : scores) ? (namespacedScores ? scores.arcade : scores) : {},
        learning: isRecord(namespacedScores ? scores.learning : null) ? scores.learning : {},
      };
      this.misses = isRecord(data.misses) ? data.misses : {};
      this.history = data.history ?? this._saveExtras.history ?? {};

      const rawRecency = data.modeRecency ?? data.lastPlayed;
      const recency = isRecord(rawRecency) ? rawRecency : {};
      this.modeRecency = {
        arcade: Math.max(0, safeNumber(recency.arcade, 0)),
        learning: Math.max(0, safeNumber(recency.learning, 0)),
      };
      this._recencyCounter = Math.max(
        this.modeRecency.arcade,
        this.modeRecency.learning,
        safeNumber(data.recencyCounter, 0),
      );
      // A simple mode marker is accepted from intermediate builds and is a
      // useful deterministic hint when the numeric recency map is absent.
      const lastMode = MODE_IDS.includes(data.lastPlayedMode) ? data.lastPlayedMode : null;
      this.lastPlayedMode = lastMode;
      if (lastMode && !this.modeRecency.arcade && !this.modeRecency.learning) {
        this._recencyCounter = 1;
        this.modeRecency[lastMode] = 1;
      }
    }

    // Existing saves predate the master mute setting. Keep their sound,
    // music, and volume preferences untouched while defaulting this new
    // independent gate to unmuted.
    if (typeof this.settings.muted !== 'boolean') this.settings.muted = false;
    audio.setEnabled(this.settings.sound);
    audio.setMuted(this.settings.muted);
    audio.setSfxVolume(this.settings.sfxVolume);
    audio.setMusicVolume(this.settings.musicVolume);
    audio.setMusic(this.settings.music);

    // Upgrade v1 and old v2 records in place so recency metadata is available
    // on the next reload. The fallback is computed later from checkpoints;
    // writing it here does not alter any player-owned progress or scores.
    if (sourceKey && (!data?.modeRecency || sourceKey === LEGACY_SAVE_KEY)) this._save();
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        ...this._saveExtras,
        settings: this.settings,
        savedStage: this.savedStage,
        bestScores: this.bestScores,
        misses: this.misses || {},
        history: this.history || {},
        modeRecency: this.modeRecency || { arcade: 0, learning: 0 },
        recencyCounter: this._recencyCounter || 0,
        lastPlayedMode: this.lastPlayedMode || null,
      }));
    } catch { /* ignore */ }
  }

  setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'sound') audio.setEnabled(value);
    if (key === 'muted') {
      this.settings.muted = Boolean(value);
      audio.setMuted(this.settings.muted);
      this.quickControls?.setMuted(this.settings.muted);
    }
    if (key === 'music') audio.setMusic(value);
    if (key === 'sfxVolume') audio.setSfxVolume(value);
    if (key === 'musicVolume') audio.setMusicVolume(value);
    this._save();
  }

  setLanguage(code) {
    if (!setLang(code)) return false;
    this.quickControls?.setLanguage(code);
    this.screens.refreshCurrent?.();
    // Screen refreshes schedule their own first-control focus. Restore the
    // language trigger on the next frame so choosing a language never strands
    // keyboard users at the top of the newly-rendered screen.
    globalThis.requestAnimationFrame?.(() => this.quickControls?.focusLanguageTrigger?.());
    return true;
  }

  _setQuickContext(placement, languageVisible) {
    this.quickControls?.setContext({ placement, languageVisible });
    this.quickControls?.setVisible(true);
  }

  _modeState(mode) {
    const stages = mode === 'learning' ? LEARNING_STAGES : STAGES;
    const finalStage = stages.length;
    const checkpoint = Number(this.savedStage?.[mode]) || 1;
    const safeCheckpoint = Math.max(1, Math.min(finalStage + 1, checkpoint));
    const state = safeCheckpoint <= 1 ? 'new' : safeCheckpoint > finalStage ? 'completed' : 'progress';
    return {
      mode,
      state,
      // `status` is an alias kept intentionally clear for screen renderers.
      status: state,
      checkpoint: safeCheckpoint,
      finalStage,
      stage: safeCheckpoint,
    };
  }

  /** Return the one unfinished mode that the chooser should offer to resume. */
  _continueMode() {
    const unfinished = MODE_IDS.filter((mode) => this._modeState(mode).state === 'progress');
    if (!unfinished.length) return null;

    const hasRecency = unfinished.some((mode) => safeNumber(this.modeRecency?.[mode], 0) > 0);
    if (hasRecency) {
      return unfinished.reduce((best, mode) => {
        const bestRecency = safeNumber(this.modeRecency?.[best], 0);
        const recency = safeNumber(this.modeRecency?.[mode], 0);
        return recency > bestRecency ? mode : best;
      }, unfinished[0]);
    }

    // Saves from before recency tracking cannot reveal the last mode. Prefer
    // the furthest checkpoint, then the stable mode order above as a tie-break
    // so migration never changes from one reload to the next.
    return unfinished.reduce((best, mode) => {
      const bestStage = this._modeState(best).checkpoint;
      const stage = this._modeState(mode).checkpoint;
      return stage > bestStage ? mode : best;
    }, unfinished[0]);
  }

  _markModePlayed(mode) {
    if (!MODE_IDS.includes(mode)) return;
    const next = Math.max(
      safeNumber(this._recencyCounter, 0),
      safeNumber(this.modeRecency?.arcade, 0),
      safeNumber(this.modeRecency?.learning, 0),
    ) + 1;
    this._recencyCounter = next;
    this.modeRecency[mode] = next;
    this.lastPlayedMode = mode;
    this._save();
  }

  _startMode(mode, stageId = 1) {
    if (mode === 'learning') this.startLearning(stageId);
    else this.startArcade(stageId);
  }

  _resetMode(mode) {
    // Reset only the selected checkpoint. Best scores, leaderboard history,
    // and adaptive-learning misses are intentionally left untouched.
    this.savedStage[mode] = 1;
    this._save();
    this._startMode(mode, 1);
  }

  // ------------------------------------------------------------------ menus
  showMenu() {
    this.mode = 'menu';
    this._resultScreen = null;
    this._teardownStage();
    this.stage3d.setCameraFraming('menu', { instant: false });
    this.hud.setVisible(false);
    this.input.setEnabled(false);
    this._setQuickContext('overlay', true);
    this.menuMicrobes.reset();
    this.screens.title({
      onPlay: () => this.showModeSelect(),
      onFactBook: () => this.openFactBook(() => this.showMenu()),
      onCredits: () => this.openCredits(() => this.showMenu()),
      onLeaderboard: () => this.openLeaderboard('learning', () => this.showMenu()),
      scannerTargets: MENU_MICROBE_TARGETS,
      scannerFound: () => this.menuMicrobes.foundIndices,
      onScannerTarget: (index) => this.menuMicrobes.setScanned(index),
      onScannerFound: (index) => {
        if (this.menuMicrobes.markFound(index)) sfx('ui.open');
      },
    });
  }

  showModeSelect() {
    this.mode = 'mode-select';
    this._teardownStage();
    this.stage3d.setCameraFraming('menu', { instant: false });
    this.hud.setVisible(false);
    this.input.setEnabled(false);
    this._setQuickContext('overlay', true);
    this.screens.modeSelect({
      onSelect: (mode) => {
        const state = this._modeState(mode);
        // Learning is a guided lesson, so every tap starts a fresh run. Arcade
        // keeps its saved checkpoint so an unfinished arcade run can resume.
        const stageId = mode === 'learning'
          ? 1
          : state.state === 'progress' ? state.checkpoint : 1;
        this._startMode(mode, stageId);
      },
      onBack: () => this.showMenu(),
    });
  }

  // Starting fresh from level 1 begins a new "run" for the leaderboard — its
  // cumulative score resets here, then accumulates across stages in
  // _endStage as the player advances via onNext, so a submission always
  // reflects a full playthrough, not a single stage/level.
  startArcade(id) { this.gameMode = 'arcade'; if (id === 1) this.runScore = 0; this.startStage(id); }
  startLearning(id) { this.gameMode = 'learning'; if (id === 1) this.runScore = 0; this.startStage(id); }

  openCredits(back) {
    const wasPlaying = this.mode === 'playing';
    if (wasPlaying) this.mode = 'paused';
    this.input.setEnabled(false);
    this._setQuickContext('overlay', true);
    this.screens.credits(() => {
      if (back) back();
      else if (wasPlaying) {
        this.screens.close();
        this.mode = 'playing';
        this._setQuickContext('hud', false);
        this.input.setEnabled(true);
      }
      else this.showMenu();
    });
  }

  openFactBook(back) {
    // From Stage 4 the fact book is closed during play: it lists every
    // method -> mechanism pair AND every food list, and opening it also froze
    // spoilage. One tap bypassed the whole hint-removal curve.
    if (!back && this.mode === 'playing' && this.stage?.allowFactBook === false) {
      this.hud.flash(t('ui.factBookLocked'), { kind: 'info', ms: 1600 });
      return;
    }
    // FactBook3D owns its own dialog and focus loop, so keep the invoking
    // control here and hand focus back after its close animation completes.
    const focus = this.screens._focusContext?.();
    const wasPlaying = this.mode === 'playing';
    if (wasPlaying) this.mode = 'paused';
    this.input.setEnabled(false);
    this._setQuickContext('factbook', false);
    const done = () => {
      if (back) back();
      else if (wasPlaying) {
        this.screens.close();
        this.mode = 'playing';
        this._setQuickContext('hud', false);
        this.input.setEnabled(true);
      }
      else this.showMenu();
      this.screens._restoreFocus?.(focus);
    };
    // The Fact Book is a physical 3D book (src/ui/factbook). It needs its own
    // WebGL context; if that cannot be had — a second context refused, an old
    // driver — the flat Fact Book screen is still there and carries exactly the
    // same curriculum, so the reference layer never disappears.
    try {
      this.factBook ||= new FactBook3D(this.hud.root.parentElement || document.body, {
        reducedMotion: () => this.settings.reducedMotion,
        quality: this.stage3d.quality,
      });
      this.hud.setVisible(false);
      this.factBook.open(() => { this.hud.setVisible(true); done(); });
    } catch (e) {
      console.warn('[factbook] 3D book unavailable, using the flat Fact Book', e);
      this.factBook = null;
      this.hud.setVisible(true);
      this.screens.factBook(done);
    }
  }

  pause({ reopen = false } = {}) {
    if (this.mode !== 'playing' && !(reopen && this.mode === 'paused')) return;
    this.mode = 'paused';
    this.input.setEnabled(false);
    this._setQuickContext('overlay', false);
    // Put the station interaction down rather than destroying it: pausing
    // mid-interaction used to leave the food inside a busy machine with no
    // controls at all, which ends the run.
    if (!reopen) this._pausedPanel = this.panel.snapshot();
    this.panel.stop();
    this.screens.pause({
      settings: this.settings,
      onSetting: (k, v) => this.setSetting(k, v),
      onResume: () => {
        this.screens.close();
        this.mode = 'playing';
        this._setQuickContext('hud', false);
        if (this._pausedPanel) {
          // Back to the step it was on, with the machine still mid-animation.
          this.panel.start(this._pausedPanel);
          this._pausedPanel = null;
        } else {
          this.input.setEnabled(true);
        }
      },
      onRestart: () => { this._pausedPanel = null; this.screens.close(); this.startStage(this.stageId); },
      onMenu: () => { this._pausedPanel = null; this.screens.close(); this.showMenu(); },
      onFactBook: () => this.openFactBook(() => this.pause({ reopen: true })),
      onCredits: () => this.openCredits(() => this.pause({ reopen: true })),
    });
  }

  // ------------------------------------------------------------------ stages
  startStage(id) {
    const stages = this.gameMode === 'learning' ? LEARNING_STAGES : STAGES;
    this._markModePlayed(this.gameMode);
    this.stageId = THREE.MathUtils.clamp(id, 1, stages.length);
    this.stage = stages[this.stageId - 1];
    this._teardownStage();
    this._setupStations();

    this.score = 0;
    this.learningScore = 0;
    this.learningTimeBonus = 0;
    this._learningBreakdown = [];
    this._learningMethodsDone = new Set();
    this._learningQuizzed = new Set();
    this.combo = 1;
    this.comboStreak = 0;
    this.bestCombo = 1;
    this.preserved = 0;
    this.spoiltCount = 0;
    this.attempts = 0;
    this.correctAttempts = 0;
    this.quizAsked = 0;
    this.quizRight = 0;
    this.methodsUsed = new Set();
    this.wrongDrops = 0;
    this.spawnTimer = 1.2;
    this.elapsed = 0;
    this._shuffleCounter = 0;

    const isLearning = this.gameMode === 'learning';
    this.hud.setVisible(true);
    this.hud.applyStage(this.stage, this.stage.methods, this.gameMode);
    this.hud.setScore(0);
    this.hud.setGoal(0, isLearning ? this.stage.methods.length : this.stage.targetPreserved);
    this.hud.setStars(0);
    this.hud.setArcadeUIVisible(!isLearning);
    this._syncCombo();

    this.mode = 'brief';
    this.input.setEnabled(false);
    this._setQuickContext('overlay', false);
    this.stage3d.setCameraFraming('hero', { instant: false });
    this.screens.stageBrief(this.stage, this.stage.methods, () => {
      this.screens.close();
      this.mode = 'playing';
      this._setQuickContext('hud', false);
      this.input.setEnabled(true);
      this.stage3d.setCameraFraming('play', { instant: false });
      this._save();
    });
  }

  _applyStationLayout(layout) {
    this._activeSlots = layout.slots;
    this._layoutMode = layout.frame.mode;
    this._layoutAspect = this.stage3d.camera.aspect;
    this.stage3d.layoutMode = layout.frame.mode;
    this.kitchen.setActiveSlots(layout.slots);
    this.stage3d.frameHalfWidth = layout.frame.halfWidth;
    this.stage3d.frameHalfHeight = layout.frame.halfHeight;

    for (const [id, s] of this.stations) {
      const idx = this._activeStationOrder.indexOf(id);
      if (idx < 0 || !s.enabled) continue;
      s.placeAt(layout.slots[idx]);
    }
  }

  /** Reflow when a resize changes the layout mode or camera aspect. */
  _refreshStationLayout() {
    if (!this.stage?.methods?.length || !this._activeStationOrder.length) return;
    const aspect = this.stage3d.camera.aspect;
    const layout = layoutFor(this._activeStationOrder.length, aspect);
    if (layout.frame.mode === this._layoutMode && Math.abs(aspect - this._layoutAspect) < 0.02) return;
    this._applyStationLayout(layout);
  }

  _setupStations() {
    // Methods map onto STATIONS, and two methods can share one (Freezer).
    const stationIds = stationsFor(this.stage.methods);

    // Re-deal positions for every label-free stage. Without this, a child could
    // read the labels in Stage 3, memorise the six positions, and clear the
    // label-free stages without ever looking at a machine.
    const order = this.stage.shufflePositions ? this._shuffled(stationIds) : stationIds;
    const layout = layoutFor(stationIds.length, this.stage3d.camera.aspect);
    this._activeStationOrder = order;
    this._layoutMode = null;

    for (const [id, s] of this.stations) {
      const idx = order.indexOf(id);
      const on = idx >= 0;
      s.enabled = on;
      s.root.visible = on;
      if (on) {
        this._ensureStationBuilt(id);
        s.setLabelsVisible(this.stage.showStationLabels);
        // Stage 4 only. In Stage 5 every preservation is followed by a "why"
        // question, and a clue that states the mechanism would be the answer
        // printed on the machine.
        s.showClue(!this.stage.showStationLabels && this.stageId === 4);
        s.release();
      }
    }
    this._applyStationLayout(layout);
    this.hud.setFactBookAvailable(this.stage.allowFactBook !== false);
  }

  _reshuffleStations() {
    const stationIds = stationsFor(this.stage.methods);
    const order = this._shuffled(stationIds);
    const layout = layoutFor(stationIds.length, this.stage3d.camera.aspect);
    this._activeStationOrder = order;
    this._layoutMode = null;
    this._applyStationLayout(layout);
    this.hud.flash('↔', { kind: 'info', ms: 700 });
    sfx('ui.open');
  }

  _shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _teardownStage() {
    clearTimeout(this._quizTimer);
    this._quizTimer = null;
    for (const f of this.foods) f.dispose();
    this.foods.length = 0;
    for (const s of this.stations.values()) { s.enabled = false; s.root.visible = false; s.release(); }
    this._activeStationOrder = [];
    this._activeSlots = [];
    this._layoutMode = null;
    this._layoutAspect = null;
    this.panel.stop();
  }

  // ------------------------------------------------------------------ spawn
  /** Only spawn food that at least one UNLOCKED station can actually handle. */
  _spawnableFoods() {
    const unlocked = new Set(this.stage.methods);
    return Object.keys(FOODS).filter((fid) =>
      this.stage.methods.some((mid) => METHODS[mid].foods.includes(fid))
    ).filter((fid) => {
      // In guided stages the hint badge shows the food's PRIMARY method, so only
      // spawn foods whose primary is unlocked — otherwise the badge would point
      // at a station that is not on the counter yet.
      if (!this.stage.showMethodHintOnFood) return true;
      return unlocked.has(FOODS[fid].primary);
    });
  }

  _spawn() {
    if (this.gameMode === 'learning') { this._spawnLearning(); return; }
    const pool = this._spawnableFoods();
    if (!pool.length) return;
    // Avoid immediate repeats so the child meets the whole food set.
    const recent = this._recent ||= [];
    let fid = pool[(Math.random() * pool.length) | 0];
    let guard = 0;
    while (recent.includes(fid) && guard++ < 8) fid = pool[(Math.random() * pool.length) | 0];
    recent.push(fid);
    if (recent.length > Math.min(4, pool.length - 1)) recent.shift();

    const food = new Food(fid, {
      spoilRate: 0.05 * this.stage.spoilRateMul,
      showHint: this.stage.showMethodHintOnFood,
    });
    food._spawnedAt = this.elapsed;
    this._placeSpawnedFood(food);
  }

  /**
   * Learning mode spawns deliberately, one food per not-yet-completed method,
   * rather than drawing randomly from every unlocked method's food list. This
   * sidesteps a real gap in the curriculum data: cooling, smoking and canning
   * have no food for which they are the PRIMARY method (see FOODS in
   * curriculum.js), so the ordinary primary-gated hint filter in
   * `_spawnableFoods()` would never select a food for them and those methods
   * could never be completed. Passing an explicit `hintMethodId` to Food
   * keeps the hint badge honest for the method actually being taught here,
   * independent of that food's usual primary.
   */
  _spawnLearning() {
    const remaining = this.stage.methods.filter((id) => !this._learningMethodsDone.has(id));
    if (!remaining.length) return;
    const activeMethods = new Set(
      this.foods.filter((f) => f.state === 'idle' || f.state === 'held').map((f) => f._learningMethodId)
    );
    const next = remaining.find((id) => !activeMethods.has(id));
    if (!next) return;
    // A method's taught .foods list can include reference-only foods (e.g.
    // smoking teaches bananas per the notes) that have no FOODS entry and
    // never spawn on the counter — filter down to what can actually spawn.
    const candidates = METHODS[next].foods.filter((fid) => FOODS[fid]);
    if (!candidates.length) return;
    const fid = candidates[(Math.random() * candidates.length) | 0];
    const food = new Food(fid, {
      spoilRate: 0.05 * this.stage.spoilRateMul,
      showHint: true,
      hintMethodId: next,
    });
    food._learningMethodId = next;
    food._spawnedAt = this.elapsed;
    this._placeSpawnedFood(food);
  }

  /** Shared placement/animation for a freshly-spawned food, regardless of mode. */
  _placeSpawnedFood(food) {
    // Even angular placement around the table. Random angles clustered items
    // on top of each other and stacked their labels into an unreadable pile.
    this._slotAngle = ((this._slotAngle ?? 0) + Math.PI * 2 * 0.41) % (Math.PI * 2);
    const taken = this.foods.filter((f) => f.state === 'idle' || f.state === 'held');
    let a = this._slotAngle, best = a, bestGap = -1;
    for (let k = 0; k < 8; k++) {
      const cand = a + k * (Math.PI * 2 / 8);
      const px = PREP_CENTRE.x + Math.cos(cand) * PREP_RADIUS * 0.56;
      const pz = PREP_CENTRE.z + Math.sin(cand) * PREP_RADIUS * 0.44;
      let gap = Infinity;
      for (const o of taken) gap = Math.min(gap, Math.hypot(o.group.position.x - px, o.group.position.z - pz));
      if (gap > bestGap) { bestGap = gap; best = cand; }
    }
    food.group.position.set(
      PREP_CENTRE.x + Math.cos(best) * PREP_RADIUS * 0.56,
      PREP_CENTRE.y + 0.5,
      PREP_CENTRE.z + Math.sin(best) * PREP_RADIUS * 0.44
    );
    food.group.scale.setScalar(0.01);
    this.stage3d.scene.add(food.group);
    this.foods.push(food);
    sfx('food.spawn');
    this.particles.burst(food.group.position, {
      count: 10, colours: [0xffffff, PALETTE.gold], speed: 1.6, size: 0.1, life: 0.5,
    });
  }

  // ------------------------------------------------------------------- drop
  _handleDrop(food, station) {
    if (this.mode !== 'playing' || station.busy) { this._returnFood(food); return; }
    this.attempts++;

    // Which method this station applies to THIS food. Null means the machine
    // cannot preserve it at all — a genuinely wrong choice.
    const methodId = this._methodFor(station, food);

    if (!methodId) {
      this.wrongDrops = (this.wrongDrops || 0) + 1;
      // Learning mode: this food no longer qualifies for the first-attempt
      // bonus once it gets to a right station, even though no flat penalty
      // applies here (see below).
      food._wrongStationTried = true;
      this._breakCombo();
      // Teach on the spot: name what this machine actually does. Where the
      // station serves two methods, name both.
      const taught = (station.methods || [station.methodId])
        .filter((id) => this.stage.methods.includes(id))
        .map((id) => `${methodName(id)} → ${methodMechShort(id, METHODS[id].mechanism)}`)
        .join('   ·   ');
      // Learning mode has no flat wrong-station penalty — the half-credit
      // rule on the eventual correct pairing already prices the mistake in.
      if (this.gameMode !== 'learning') {
        this._addScore(SCORING.wrongStationPenalty, food.group.position, `${SCORING.wrongStationPenalty}`, PALETTE.danger);
      }
      sfx('wrong');
      this.stage3d.shake(0.22, 200);
      this.hud.flash(`${t('ui.wrongStation')}  ${taught}`, { kind: 'bad', ms: 1800 });
      this.hud.say(`${t('ui.wrongStation')} ${taught}`);
      this._noteMiss(station.methods?.[0] || station.methodId);
      this._returnFood(food);
      // A mistake is the highest-value moment to ask a question — the child is
      // already attending to the thing they got wrong. Arcade only: learning
      // mode's quizzing is deterministic (one per method, on first success).
      if (this.gameMode !== 'learning' && Math.random() < 0.35 && this.stage.quizChance > 0) {
        setTimeout(() => {
          if (this.mode !== 'playing') return;
          // Ask about THIS food, not about a method that was never used.
          this._askQuiz(FOODS[food.foodId]?.primary || this._weakestMethod(), food.foodId, true);
        }, 900);
      }
      return;
    }

    this.correctAttempts++;
    sfx('food.drop');
    station.activeMethodId = methodId;
    const steps = station.accept(food);
    this.input.setEnabled(false);
    this.stage3d.setCameraFraming('station', { instant: false, focus: station.root.position });

    this.panel.start({
      steps,
      methodColour: `#${METHODS[methodId].colour.toString(16).padStart(6, '0')}`,
      onProgress: (i, p, v) => {
        station.onStepProgress(i, p, v);
        const kind = steps[i]?.kind;
        if (kind === 'hold' && Math.random() < 0.06) sfx(methodId === 'pasteurising' ? 'machine.heat' : 'machine.pump');
      },
      onStepDone: (i, v) => {
        station.onStepDone(i, v);
        const s = steps[i];
        if (s?.id === 'open' || s?.id === 'close') sfx('machine.door');
        else if (s?.id === 'twist') sfx('machine.twist');
        else if (s?.id === 'pour') sfx('machine.pour');
        else sfx('ui.tap');
      },
      stepDurationMs: (step) => station.stepDurationMs?.(step) ?? step.ms,
      onComplete: (quality) => this._finishInteraction(food, station, methodId, quality),
      onFail: (reason, detail) => this._failInteraction(food, station, methodId, reason, detail),
    });
  }

  async _finishInteraction(food, station, methodId, quality) {
    // Never let a station's success animation wedge the run.
    await Promise.race([
      Promise.resolve(station.playSuccess()),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    food.markPreserved(methodId);
    this.methodsUsed.add(methodId);
    this.preserved++;

    sfx(`preserve.${METHODS[methodId].station === 'Freezer' ? 'freezing' : methodId}`);
    const m = METHODS[methodId];
    this._tmpVec.copy(food.group.position);
    this._tmpVec.y += 1.1;
    const pos = this._tmpVec;
    this.particles.burst(pos, {
      count: 34, colours: [m.colour, m.accent ?? 0xffffff, PALETTE.gold, 0xffffff],
      speed: 4.5, size: 0.19, life: 1.25,
    });

    // Real-life-correct but not the notes' example: accepted, scored at half,
    // and named. Marking a true pairing wrong teaches a child to distrust what
    // they know; saying nothing lets the exam answer slip.
    const taught = isTaughtPairing(methodId, food.foodId);

    if (this.gameMode === 'learning') {
      const firstAttempt = !food._wrongStationTried;
      const timeMs = (this.elapsed - (food._spawnedAt ?? this.elapsed)) * 1000;
      this._addLearningPoints(methodId, { firstAttempt, timeMs, pos, colour: m.colour });
      this._learningMethodsDone.add(methodId);
      this.hud.setGoal(this._learningMethodsDone.size, this.stage.methods.length);
    } else {
      this._bumpCombo();
      const base = (SCORING.base + (quality > 0.95 ? SCORING.perfectInteractionBonus : 0))
        * (taught ? 1 : SCORING.alsoWorksFactor);
      const gained = Math.round(base * this.combo);
      this._addScore(gained, pos, `+${gained}`, m.colour);
      if (quality > 0.95) {
        const perfectPos = new THREE.Vector3().copy(pos);
        perfectPos.y += 0.7;
        this.popups.show(perfectPos, t('ui.perfect'), { colour: '#ffd54f', size: 62, scale: 0.8 });
      }
      this.hud.setGoal(this.preserved, this.stage.targetPreserved);
    }

    // The teaching beat: name the method and its mechanism, every time. For the
    // shared freezer this is where "Cooling → Low temperature" gets said out
    // loud after the child dials 4°C for milk.
    this.hud.flash(`${methodName(methodId)} → ${methodMechShort(methodId, m.mechanism)}`, { kind: 'good', ms: 1500 });
    this.hud.say(`${methodName(methodId)}. ${t(`methods.${methodId}.exam`)}`);
    // The quiz modal (if one follows) opens with a blurred full-screen backdrop
    // that buries this banner if it fires underneath it — so the quiz is held
    // off until the note has had its moment on screen. See below.
    let bannerClearMs = 1500;
    if (!taught) {
      const primary = FOODS[food.foodId]?.primary;
      const note = t('ui.alsoWorksNote', { food: foodName(food.foodId), method: methodName(primary) });
      setTimeout(() => this.hud.flash(note, { kind: 'info', ms: 2600 }), 1600);
      this.hud.say(note);
      bannerClearMs = 1600 + 2600;
    }

    // Preserved food leaves the counter after a beat.
    setTimeout(() => this._retireFood(food), 1400);

    // Mastery reshuffles mid-stage, so position memory never stabilises.
    if (this.stage.reshuffleMidStage && ++this._shuffleCounter % 3 === 0) {
      setTimeout(() => this._reshuffleStations(), 900);
    }

    station.release();
    this.stage3d.setCameraFraming('play', { instant: false });

    if (this.gameMode === 'learning') {
      // Exactly one quiz per method, the first time it is correctly used —
      // deterministic, not the arcade's probabilistic quizChance roll.
      if (!this._learningQuizzed.has(methodId)) {
        this._learningQuizzed.add(methodId);
        // The method is already counted as complete, but its quiz deliberately
        // waits for the teaching banner. Leave `playing` during that gap and
        // the frame-end completion check shows results before the quiz.
        this.mode = 'teaching';
        clearTimeout(this._quizTimer);
        this._quizTimer = setTimeout(() => {
          this._quizTimer = null;
          if (this.mode !== 'teaching') return;
          this._askQuiz(methodId, food.foodId);
        }, bannerClearMs);
      } else {
        this.input.setEnabled(true);
        this._checkStageEnd();
      }
      return;
    }

    if (Math.random() < this.stage.quizChance) {
      // Bias toward whatever this child keeps getting wrong, not always the
      // method they have just demonstrated they can do. Held off until the
      // banner above has cleared, so the quiz backdrop doesn't bury it.
      setTimeout(() => {
        // Only bias toward the weakest method when it is actually valid for
        // this food — otherwise a food-association question would mark a
        // method the notes never pair with this food as the "correct" one.
        const weakest = this._weakestMethod(methodId);
        const biased = (FOOD_METHODS[food.foodId] || []).includes(weakest);
        this._askQuiz(Math.random() < 0.45 && biased ? weakest : methodId, food.foodId);
      }, bannerClearMs);
    } else {
      this.input.setEnabled(true);
      this._checkStageEnd();
    }
  }

  /**
   * A station step can fail: the pasteuriser's cooling window can lapse, and the
   * freezer dial can be confirmed at the wrong temperature. Both failures are
   * themselves the lesson, so each states the correct answer immediately.
   */
  _failInteraction(food, station, methodId, reason, detail) {
    sfx('wrong');
    this._breakCombo();
    this._noteMiss(methodId);
    if (this.gameMode === 'learning') {
      // No flat penalty, but the botched attempt still costs the
      // first-attempt bonus on the eventual correct execution.
      food._wrongStationTried = true;
    } else {
      this._addScore(SCORING.wrongStationPenalty, food.group.position, `${SCORING.wrongStationPenalty}`, PALETTE.danger);
    }

    let msg;
    if (reason === 'dial') {
      msg = `${t(`methods.${methodId}.dialWrong`)} ${t(`methods.${methodId}.dialCorrection`, {
        food: foodName(food.foodId), range: t(`methods.${methodId}.range`),
      })}`;
    } else {
      msg = t('methods.pasteurising.coolTooLate');
    }
    this.hud.flash(msg, { kind: 'bad', ms: 2400 });
    this.hud.say(msg);

    station.release();
    this._returnFood(food);
    this.stage3d.setCameraFraming('play', { instant: false });
    this.input.setEnabled(true);
  }

  // ------------------------------------------------------ spaced repetition
  /** Track which methods this child gets wrong, so questions can come back. */
  _noteMiss(methodId) {
    if (!methodId) return;
    this.misses ||= {};
    this.misses[methodId] = (this.misses[methodId] || 0) + 1;
    this._save();
  }

  _noteHit(methodId) {
    if (!methodId || !this.misses?.[methodId]) return;
    this.misses[methodId] = Math.max(0, this.misses[methodId] - 1);
  }

  /** The unlocked method with the most outstanding misses, else a fallback. */
  _weakestMethod(fallback) {
    const pool = this.stage.methods;
    let best = fallback || pool[0], bestN = 0;
    for (const id of pool) {
      const n = this.misses?.[id] || 0;
      if (n > bestN) { bestN = n; best = id; }
    }
    return bestN > 0 ? best : (fallback || pool[(Math.random() * pool.length) | 0]);
  }

  _askQuiz(methodId, foodId, afterMistake = false) {
    this.mode = 'quiz';
    this.input.setEnabled(false);
    // The quiz is a focused modal. Pause and Fact Book already sit beneath
    // its backdrop; hide the higher-stacking quick control as well so mute
    // does not float over the question.
    this.quickControls?.setVisible(false);
    this.quizAsked++;
    // Learning mode always checks causal understanding (why the method works);
    // arcade mode keeps its adaptive, varied question mix.
    const q = this.gameMode === 'learning'
      ? makeLearningQuestion({ methodId, foodId })
      : makeQuestion({ methodId, foodId, stageId: this.stageId, afterMistake });
    this.quiz.ask(q, (correct) => {
      if (correct) {
        this.quizRight++;
        this._noteHit(q.methodId);
        const p = new THREE.Vector3(0, 4.2, 2);
        if (this.gameMode === 'learning') {
          const gained = LEARNING_SCORING.quizCorrect;
          this.learningScore = (this.learningScore || 0) + gained;
          this._learningBreakdown.push({ methodId: q.methodId, quiz: true, base: gained, timeBonus: 0 });
          this.hud.setScore(this.learningScore);
          const popupPos = new THREE.Vector3(p.x, p.y + 0.4, p.z);
          this.popups.show(popupPos, `+${gained}`, { colour: `#${PALETTE.gold.toString(16).padStart(6, '0')}`, size: 92 });
        } else {
          this._bumpCombo();
          const gained = Math.round(SCORING.quizCorrect * this.combo);
          this._addScore(gained, p, `+${gained}`, PALETTE.gold);
        }
        this.particles.burst(p, { count: 26, colours: [PALETTE.gold, 0xffffff, PALETTE.success], speed: 4, life: 1.1 });
      } else {
        this._breakCombo();
        this._noteMiss(q.methodId);
      }
      this.mode = 'playing';
      this._setQuickContext('hud', false);
      this.input.setEnabled(true);
      this._checkStageEnd();
    }, {
      onAnswer: (correct) => {
        if (correct || this.gameMode !== 'learning') return '';
        return this._applyLearningQuizPenalty(q.methodId);
      },
    });
  }

  _applyLearningQuizPenalty(methodId) {
    const penalty = Math.abs(LEARNING_SCORING.quizWrong || 0);
    if (!penalty) return '';

    const before = Math.max(0, this.learningScore || 0);
    const lost = Math.min(before, penalty);
    this.learningScore = Math.max(0, before - penalty);
    this._learningBreakdown.push({ methodId, quiz: true, correct: false, base: -lost, timeBonus: 0 });
    this.hud.setScore(this.learningScore);

    const p = new THREE.Vector3(0, 4.2, 2);
    this.popups.show(new THREE.Vector3(p.x, p.y + 0.4, p.z), `-${lost}`, {
      colour: `#${PALETTE.danger.toString(16).padStart(6, '0')}`,
      size: 92,
      life: 2,
    });
    this.stage3d.shake(0.38, 320);
    this.quiz.shock?.();
    const message = t('ui.pointsLost', { points: lost });
    this.hud.flash(message, { kind: 'bad', ms: 1500 });
    this.hud.say(message);
    return message;
  }

  // ----------------------------------------------------------------- scoring
  _addScore(delta, worldPos, label, colour) {
    // Not clamped at zero: a floor at 0 made wrong drops free for anyone who
    // had already bottomed out, which is exactly when guessing starts.
    this.score += delta;
    this.hud.setScore(Math.max(0, this.score));
    if (worldPos && label) {
      const popupPos = new THREE.Vector3().copy(worldPos);
      popupPos.y += 0.4;
      this.popups.show(popupPos, label, {
        colour: `#${(colour ?? PALETTE.gold).toString(16).padStart(6, '0')}`,
        size: delta > 0 ? 92 : 74,
      });
    }
    this._updateStars();
  }

  /**
   * Learning mode's scoring: correctness-weighted (first-attempt vs.
   * late-correct), plus a small capped time bonus that exists only to break
   * leaderboard ties — it can never outweigh the 50-point first/late gap.
   */
  _addLearningPoints(methodId, { firstAttempt, timeMs, pos, colour }) {
    const base = firstAttempt ? LEARNING_SCORING.firstAttemptBonus : LEARNING_SCORING.lateCorrectBonus;
    const timeBonus = Math.max(0, LEARNING_SCORING.timeBonusMax - Math.floor(Math.max(0, timeMs) / 1000 / 4));
    const gained = base + timeBonus;
    this.learningScore = (this.learningScore || 0) + gained;
    this.learningTimeBonus = (this.learningTimeBonus || 0) + timeBonus;
    this._learningBreakdown.push({ methodId, firstAttempt, base, timeBonus, quiz: false });
    this.hud.setScore(this.learningScore);
    if (pos) {
      const popupPos = new THREE.Vector3().copy(pos);
      popupPos.y += 0.4;
      this.popups.show(popupPos, `+${gained}`, {
        colour: `#${(colour ?? PALETTE.gold).toString(16).padStart(6, '0')}`,
        size: 92,
      });
    }
  }

  _bumpCombo() {
    this.comboStreak++;
    this.combo = Math.min(SCORING.comboMax, 1 + this.comboStreak * SCORING.comboStep);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.comboStreak > 1) sfx('combo', { level: this.comboStreak });
    this._syncCombo();
  }

  _breakCombo() {
    this.comboStreak = 0;
    this.combo = 1;
    this._syncCombo();
  }

  _syncCombo() {
    const fill = (this.combo - 1) / (SCORING.comboMax - 1);
    this.hud.setCombo(this.combo, THREE.MathUtils.clamp(fill, 0, 1));
  }

  _maxAchievable() {
    const perItem = (SCORING.base + SCORING.perfectInteractionBonus) * 2.2;
    return Math.max(1, this.stage.targetPreserved * perItem);
  }

  _updateStars() {
    const frac = this.score / this._maxAchievable();
    let stars = 0;
    for (const th of SCORING.starThresholds) if (frac >= th) stars++;
    if (stars !== this._lastStars) {
      if (stars > (this._lastStars ?? 0)) sfx('star');
      this._lastStars = stars;
      this.hud.setStars(stars);
    }
    return stars;
  }

  // -------------------------------------------------------------- food flow
  _returnFood(food) {
    if (food.state === 'spoilt' || food.state === 'preserved') return;
    food.state = 'idle';
    this._slotAngle = ((this._slotAngle ?? 0) + Math.PI * 2 * 0.41) % (Math.PI * 2);
    food._returnTo = new THREE.Vector3(
      PREP_CENTRE.x + Math.cos(this._slotAngle) * PREP_RADIUS * 0.56,
      PREP_CENTRE.y + 0.5,
      PREP_CENTRE.z + Math.sin(this._slotAngle) * PREP_RADIUS * 0.44
    );
  }

  _retireFood(food) {
    food._retiring = 0;
  }

  _onSpoilt(food) {
    this.spoiltCount++;
    this._breakCombo();
    // Learning mode has no flat spoil penalty (only the 5-spoil fail-out,
    // handled in _checkStageEnd) — and _addScore writes to the arcade
    // `score` field, which would otherwise clobber the learning HUD display.
    if (this.gameMode !== 'learning') {
      this._addScore(SCORING.spoiledPenalty, food.group.position, `${SCORING.spoiledPenalty}`, PALETTE.danger);
    }
    sfx('food.spoil');
    this.stage3d.shake(0.35, 320);
    this._tmpVec.copy(food.group.position);
    this._tmpVec.y += 0.5;
    this.particles.burst(this._tmpVec, {
      count: 22, colours: [PALETTE.mould, PALETTE.mouldDark, 0x8a9a5b], speed: 2.6, life: 1.2, grav: -3,
    });
    // Say WHY it spoiled — this is §3 of the notes, delivered at the moment of failure.
    this.hud.flash(`${t('ui.spoilt')} ${t('spoilage.why')}`, { kind: 'bad', ms: 1800 });
    this.hud.say(`${foodName(food.foodId)} ${t('ui.spoilt')} ${t('spoilage.why')}`);
    setTimeout(() => this._retireFood(food), 1100);
  }

  _checkStageEnd() {
    if (this.gameMode === 'learning') {
      // A final method is not finished until its deterministic quiz has been
      // answered. This also prevents a fail screen from covering an open quiz.
      if (this.mode === 'teaching' || this.mode === 'quiz') return;
      if (this._learningMethodsDone.size >= this.stage.methods.length) this._endStage(true);
      else if (this.spoiltCount >= 5) this._endStage(false);
      return;
    }
    if (this.preserved >= this.stage.targetPreserved) this._endStage(true);
    else if (this.spoiltCount >= 5) this._endStage(false);
  }

  _endStage(passed) {
    if (this.mode === 'result') return;
    this.mode = 'result';
    this.input.setEnabled(false);
    this.panel.stop();
    this.stage3d.setCameraFraming('hero', { instant: false });

    if (this.gameMode === 'learning') {
      const key = `l${this.stageId}`;
      this.bestScores.learning[key] = Math.max(this.bestScores.learning[key] || 0, this.learningScore || 0);
      // One past the final level is the completed-run sentinel. Clamping this
      // to the final level made the title screen offer Continue forever and
      // sent completed players back into that level.
      if (passed) this.savedStage.learning = this.stageId + 1;
      // Only a completed level's score counts toward the run total — a
      // failed attempt is about to be retried from zero, so it shouldn't
      // double-count if the retry then passes.
      if (passed) this.runScore = (this.runScore || 0) + (this.learningScore || 0);
      const isFinalLevel = this.stageId === LEARNING_STAGES.length;
      const endOfMode = passed && isFinalLevel;
      this._save();
      const result = {
        stage: this.stage, score: this.learningScore || 0, maxScore: LEARNING_SCORING.maxPossible,
        timeBonus: this.learningTimeBonus || 0, passed, spoilt: this.spoiltCount,
        breakdown: this._learningBreakdown,
        runScore: this.runScore || 0, isFinalLevel,
        leaderboardRank: null, leaderboardRankStatus: endOfMode ? 'loading' : null,
        onNext: () => { this.screens.close(); this.startStage(this.stageId + 1); },
        onRetry: () => { this.screens.close(); this.startStage(this.stageId); },
        onMenu: () => { this.screens.close(); this.showMenu(); },
        onViewLeaderboard: null,
        onOpenSubmit: null,
      };
      const renderResults = () => {
        this._setQuickContext('overlay', true);
        this.screens.learningResults(result);
      };
      if (endOfMode) {
        result.onOpenSubmit = () => this.openLeaderboard('learning', renderResults, {
          mode: 'learning',
          score: result.runScore || 0,
          onSubmit: async (name) => {
            const submitted = await this._submitLeaderboardScore('learning', name, result.runScore || 0);
            if (submitted?.ok) {
              result.leaderboardRank = Number(submitted.rank);
              result.leaderboardRankStatus = Number.isFinite(result.leaderboardRank) ? 'ready' : 'error';
            }
            return submitted;
          },
        });
      }
      result.onViewLeaderboard = () => this.openLeaderboard('learning', renderResults);
      this._resultScreen = renderResults;
      renderResults();
      if (endOfMode) {
        this._loadLeaderboardRank('learning', result.runScore || 0).then((rank) => {
          result.leaderboardRank = rank;
          result.leaderboardRankStatus = Number.isFinite(rank) ? 'ready' : 'error';
          if (this.screens._current?.kind === 'learning-results') renderResults();
        });
      }
      return;
    }

    const stars = this._updateStars();
    const key = `s${this.stageId}`;
    this.bestScores.arcade[key] = Math.max(this.bestScores.arcade[key] || 0, this.score);
    if (passed) this.savedStage.arcade = this.stageId + 1;
    if (passed) this.runScore = (this.runScore || 0) + (this.score || 0);
    const isFinalStage = this.stageId === STAGES.length;
    const endOfMode = passed && isFinalStage;
    this._save();
    this._setQuickContext('overlay', true);

    const result = {
      stage: this.stage, score: this.score, stars, passed,
      preserved: this.preserved, target: this.stage.targetPreserved,
      spoilt: this.spoiltCount,
      accuracy: this.attempts ? this.correctAttempts / this.attempts : 1,
      bestCombo: this.bestCombo,
      learned: [...this.methodsUsed],
      runScore: this.runScore || 0, isFinalLevel: isFinalStage,
      leaderboardRank: null, leaderboardRankStatus: endOfMode ? 'loading' : null,
      onNext: () => { this.screens.close(); this.startStage(this.stageId + 1); },
      onRetry: () => { this.screens.close(); this.startStage(this.stageId); },
      onMenu: () => { this.screens.close(); this.showMenu(); },
      onViewLeaderboard: null,
      onOpenSubmit: null,
    };
    const renderResults = () => {
      this._setQuickContext('overlay', true);
      this.screens.results(result);
    };
    if (endOfMode) {
      result.onOpenSubmit = () => this.openLeaderboard('arcade', renderResults, {
        mode: 'arcade',
        score: result.runScore || 0,
        onSubmit: async (name) => {
          const submitted = await this._submitLeaderboardScore('arcade', name, result.runScore || 0);
          if (submitted?.ok) {
            result.leaderboardRank = Number(submitted.rank);
            result.leaderboardRankStatus = Number.isFinite(result.leaderboardRank) ? 'ready' : 'error';
          }
          return submitted;
        },
      });
    }
    result.onViewLeaderboard = () => this.openLeaderboard('arcade', renderResults);
    this._resultScreen = renderResults;
    renderResults();
    if (endOfMode) {
      this._loadLeaderboardRank('arcade', result.runScore || 0).then((rank) => {
        result.leaderboardRank = rank;
        result.leaderboardRankStatus = Number.isFinite(rank) ? 'ready' : 'error';
        if (this.screens._current?.kind === 'results') renderResults();
      });
    }
  }

  // ------------------------------------------------------------- leaderboard
  async _loadLeaderboardRank(mode, score) {
    try {
      const params = new URLSearchParams({ mode, score: String(score) });
      const res = await fetch(`/api/leaderboard/top?${params.toString()}`);
      if (!res.ok) throw new Error(`Leaderboard rank request failed: ${res.status}`);
      const data = await res.json();
      const rank = Number(data.rank);
      return Number.isFinite(rank) && rank > 0 ? rank : null;
    } catch {
      return null;
    }
  }

  openLeaderboard(initialMode = 'learning', back, submission = null) {
    const wasPlaying = this.mode === 'playing';
    if (wasPlaying) this.mode = 'paused';
    this.input.setEnabled(false);
    this._setQuickContext('overlay', true);
    const done = () => {
      if (back) back();
      else if (wasPlaying) {
        this.screens.close();
        this.mode = 'playing';
        this._setQuickContext('hud', false);
        this.input.setEnabled(true);
      }
      else if (this.mode === 'result' && this._resultScreen) this._resultScreen();
      else this.showMenu();
    };
    const loadMode = async (mode) => {
      const res = await fetch(`/api/leaderboard/top?mode=${mode}&limit=10`);
      if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
      const data = await res.json();
      return data.entries || [];
    };
    this.screens.leaderboard({ initialMode, loadMode, onClose: done, submission });
  }

  async _submitLeaderboardScore(mode, name, score) {
    try {
      const res = await fetch('/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, name, score }),
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const cam = this.stage3d.camera;
    const playing = this.mode === 'playing';
    this.elapsed = (this.elapsed || 0) + dt;

    // A device rotation can cross the wide/narrow layout breakpoint while a
    // stage is open. Reflow the room without re-dealing station identities.
    this._refreshStationLayout();

    if (playing) {
      const active = this.foods.filter((f) => f.state === 'idle' || f.state === 'held').length;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && active < this.stage.maxActiveFoods) {
        this._spawn();
        this.spawnTimer = this.stage.spawnIntervalMs / 1000;
      }
    }

    // --- foods
    let microbeSum = 0, microbeN = 0;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      const wasSpoilt = f.state === 'spoilt';
      const updateDt = (playing || this.mode === 'quiz') && this.stage3d.isPointInViewFrustum(f.group.position) ? dt : 0;
      f.update(updateDt, cam, playing ? 1 : 0);
      if (!wasSpoilt && f.state === 'spoilt') this._onSpoilt(f);

      if (f.state === 'idle' || f.state === 'held') { microbeSum += f.swarm.activity; microbeN++; }

      // spawn-in pop
      if (f.group.scale.x < 1) {
        f.group.scale.setScalar(Math.min(1, f.group.scale.x + dt * 4.5));
      }
      // drift back to the table after a bad drop
      if (f._returnTo && f.state === 'idle') {
        f.group.position.lerp(f._returnTo, 1 - Math.pow(0.004, dt));
        if (f.group.position.distanceTo(f._returnTo) < 0.05) f._returnTo = null;
      }
      // stink wisps when it is going bad
      if (f.spoil > 0.5 && f.state !== 'preserved' && !this.settings.reducedMotion) {
        this.particles.stink(f.group.position.clone().add(new THREE.Vector3(0, f.radius, 0)), f.spoil);
      }
      // retire
      if (f._retiring !== undefined) {
        f._retiring += dt;
        f.group.scale.setScalar(Math.max(0, 1 - f._retiring * 1.8));
        f.group.position.y += dt * 1.6;
        if (f._retiring > 0.6) { f.dispose(); this.foods.splice(i, 1); }
      }
    }
    this.hud.setMicrobe(microbeN ? microbeSum / microbeN : 0);

    // --- stations
    for (const s of this.stations.values()) if (s.root.visible) s.update(dt, this.elapsed);

    // --- world + fx
    this.kitchen.update(dt, this.elapsed);
    this.menuMicrobes.setVisible(this.screens._current?.kind === 'title');
    this.menuMicrobes.update(dt);
    this.input.update();
    this.particles.update(dt, cam);
    this.popups.update(dt, cam);

    if (playing) this._checkStageEnd();
  }
}
