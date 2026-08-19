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
  STAGES, METHODS, FOODS, SCORING, isTaughtPairing,
  STATION_METHODS, stationsFor, methodAtStation,
} from '../content/curriculum.js';
import { t, methodName, foodName, mechShort, methodMechShort } from '../content/i18n.js';
import { makeQuestion } from '../content/quiz.js';
import { PALETTE } from '../world/Palette.js';
import { slotsFor, PREP_CENTRE, PREP_RADIUS } from '../world/Kitchen.js';
import { Food } from '../world/Food.js';
import { DryingRack } from '../world/stations/DryingRack.js';
import { Freezer } from '../world/stations/Freezer.js';
import { VacuumSealer } from '../world/stations/VacuumSealer.js';
import { PicklingJar } from '../world/stations/PicklingJar.js';
import { SaltTable } from '../world/stations/SaltTable.js';
import { Pasteuriser } from '../world/stations/Pasteuriser.js';
import { Smokehouse } from '../world/stations/Smokehouse.js';
import { Cannery } from '../world/stations/Cannery.js';
import { sfx, audio } from './Audio.js';

/**
 * Keyed by STATION, not by method. The Freezer serves two methods (freezing at
 * 0°C and below, cooling at ~4°C) from one cabinet, exactly as §5E describes.
 */
import { assets } from '../world/AssetRegistry.js';

const STATION_CLASSES = {
  DryingRack, Freezer, VacuumSealer, PicklingJar, SaltTable, Pasteuriser,
  Smokehouse, Cannery,
};

const SAVE_KEY = 'pp.progress.v1';

export class Game {
  constructor({ stage3d, kitchen, hud, panel, quiz, screens, particles, popups, input }) {
    this.stage3d = stage3d;
    this.kitchen = kitchen;
    this.hud = hud;
    this.panel = panel;
    this.quiz = quiz;
    this.screens = screens;
    this.particles = particles;
    this.popups = popups;
    this.input = input;

    this.foods = [];
    this.stations = new Map();
    this.mode = 'menu';           // menu | brief | playing | paused | quiz | result
    this.settings = { sound: true, music: true, reducedMotion: false };

    this._buildAllStations();
    this._wireInput();
    this._loadSettings();

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
      s.methods = methods;          // e.g. Freezer -> ['freezing','cooling']
      // Optional Blender shell; a no-op when the asset is absent. Batching and
      // the GLB swap are alternatives: the swap needs the individual procedural
      // parts still present so it can prune them.
      if (assets.has(stationId)) s.useModel(stationId);
      else s.batchStatic();
      s.enabled = false;
      s.root.visible = false;
      this.stage3d.scene.add(s.root);
      this.stations.set(stationId, s);
    }
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
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        Object.assign(this.settings, d.settings || {});
        this.savedStage = d.stage || 1;
        this.bestScores = d.bestScores || {};
        this.misses = d.misses || {};
      }
    } catch { /* private mode — play without a save */ }
    this.bestScores ||= {};
    audio.setEnabled(this.settings.sound);
    audio.musicOn = this.settings.music;
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        settings: this.settings,
        stage: this.stageId,
        bestScores: this.bestScores,
        misses: this.misses || {},
      }));
    } catch { /* ignore */ }
  }

  setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'sound') audio.setEnabled(value);
    if (key === 'music') audio.setMusic(value);
    this._save();
  }

  // ------------------------------------------------------------------ menus
  showMenu() {
    this.mode = 'menu';
    this._teardownStage();
    this.stage3d.setCameraFraming('menu', { instant: false });
    this.hud.setVisible(false);
    this.input.setEnabled(false);
    this.screens.title({
      hasSave: !!this.savedStage && this.savedStage > 1,
      onPlay: () => this.startStage(1),
      onContinue: () => this.startStage(this.savedStage),
      onFactBook: () => this.openFactBook(() => this.showMenu()),
      onCredits: () => this.openCredits(() => this.showMenu()),
    });
  }

  openCredits(back) {
    const wasPlaying = this.mode === 'playing';
    if (wasPlaying) this.mode = 'paused';
    this.input.setEnabled(false);
    this.screens.credits(() => {
      if (back) back();
      else if (wasPlaying) { this.screens.close(); this.mode = 'playing'; this.input.setEnabled(true); }
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
    const wasPlaying = this.mode === 'playing';
    if (wasPlaying) this.mode = 'paused';
    this.input.setEnabled(false);
    this.screens.factBook(() => {
      if (back) back();
      else if (wasPlaying) { this.screens.close(); this.mode = 'playing'; this.input.setEnabled(true); }
      else this.showMenu();
    });
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.setEnabled(false);
    // Put the station interaction down rather than destroying it: pausing
    // mid-interaction used to leave the food inside a busy machine with no
    // controls at all, which ends the run.
    this._pausedPanel = this.panel.snapshot();
    this.panel.stop();
    this.screens.pause({
      settings: this.settings,
      onSetting: (k, v) => this.setSetting(k, v),
      onResume: () => {
        this.screens.close();
        this.mode = 'playing';
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
      onFactBook: () => this.openFactBook(() => this.pause()),
      onCredits: () => this.openCredits(() => this.pause()),
    });
  }

  // ------------------------------------------------------------------ stages
  startStage(id) {
    this.stageId = THREE.MathUtils.clamp(id, 1, STAGES.length);
    this.stage = STAGES[this.stageId - 1];
    this._teardownStage();
    this._setupStations();

    this.score = 0;
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

    this.hud.setVisible(true);
    this.hud.applyStage(this.stage, this.stage.methods);
    this.hud.setScore(0);
    this.hud.setGoal(0, this.stage.targetPreserved);
    this.hud.setStars(0);
    this._syncCombo();

    this.mode = 'brief';
    this.input.setEnabled(false);
    this.stage3d.setCameraFraming('hero', { instant: false });
    this.screens.stageBrief(this.stage, this.stage.methods, () => {
      this.screens.close();
      this.mode = 'playing';
      this.input.setEnabled(true);
      this.stage3d.setCameraFraming('play', { instant: false });
      audio.startMusic();
      this._save();
    });
  }

  _setupStations() {
    // Methods map onto STATIONS, and two methods can share one (Freezer).
    const stationIds = stationsFor(this.stage.methods);
    const slots = slotsFor(stationIds.length);
    this._activeSlots = slots;
    this.kitchen.setActiveSlots(stationIds.length);
    // Frame only as wide as the stations actually in play.
    const widest = Math.max(...slots.map((sl) => Math.abs(sl.position.x)));
    this.stage3d.frameHalfWidth = widest + 2.3;

    // Re-deal positions for every label-free stage. Without this, a child could
    // read the labels in Stage 3, memorise the six positions, and clear the
    // label-free stages without ever looking at a machine.
    const order = this.stage.shufflePositions ? this._shuffled(stationIds) : stationIds;

    for (const [id, s] of this.stations) {
      const idx = order.indexOf(id);
      const on = idx >= 0;
      s.enabled = on;
      s.root.visible = on;
      if (on) {
        s.placeAt(slots[idx]);
        s.setLabelsVisible(this.stage.showStationLabels);
        // Stage 4 only. In Stage 5 every preservation is followed by a "why"
        // question, and a clue that states the mechanism would be the answer
        // printed on the machine.
        s.showClue(!this.stage.showStationLabels && this.stageId === 4);
        s.release();
      }
    }
    this.hud.setFactBookAvailable(this.stage.allowFactBook !== false);
  }

  _reshuffleStations() {
    const stationIds = stationsFor(this.stage.methods);
    const slots = this._activeSlots || slotsFor(stationIds.length);
    this._shuffled(stationIds).forEach((id, i) => {
      const s = this.stations.get(id);
      if (s && !s.busy && slots[i]) s.placeAt(slots[i]);
    });
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
    for (const f of this.foods) f.dispose();
    this.foods.length = 0;
    for (const s of this.stations.values()) { s.enabled = false; s.root.visible = false; s.release(); }
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
      this._breakCombo();
      // Teach on the spot: name what this machine actually does. Where the
      // station serves two methods, name both.
      const taught = (station.methods || [station.methodId])
        .filter((id) => this.stage.methods.includes(id))
        .map((id) => `${methodName(id)} → ${methodMechShort(id, METHODS[id].mechanism)}`)
        .join('   ·   ');
      this._addScore(SCORING.wrongStationPenalty, food.group.position, `${SCORING.wrongStationPenalty}`, PALETTE.danger);
      sfx('wrong');
      this.stage3d.shake(0.22, 200);
      this.hud.flash(`${t('ui.wrongStation')}  ${taught}`, { kind: 'bad', ms: 1800 });
      this.hud.say(`${t('ui.wrongStation')} ${taught}`);
      this._noteMiss(station.methods?.[0] || station.methodId);
      this._returnFood(food);
      // A mistake is the highest-value moment to ask a question — the child is
      // already attending to the thing they got wrong.
      if (Math.random() < 0.35 && this.stage.quizChance > 0) {
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
    const pos = food.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.particles.burst(pos, {
      count: 34, colours: [m.colour, m.accent ?? 0xffffff, PALETTE.gold, 0xffffff],
      speed: 4.5, size: 0.19, life: 1.25,
    });

    // Real-life-correct but not the notes' example: accepted, scored at half,
    // and named. Marking a true pairing wrong teaches a child to distrust what
    // they know; saying nothing lets the exam answer slip.
    const taught = isTaughtPairing(methodId, food.foodId);
    this._bumpCombo();
    const base = (SCORING.base + (quality > 0.95 ? SCORING.perfectInteractionBonus : 0))
      * (taught ? 1 : SCORING.alsoWorksFactor);
    const gained = Math.round(base * this.combo);
    this._addScore(gained, pos, `+${gained}`, m.colour);
    if (quality > 0.95) {
      this.popups.show(pos.clone().add(new THREE.Vector3(0, 0.7, 0)), t('ui.perfect'), { colour: '#ffd54f', size: 62, scale: 0.8 });
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
    this.hud.setGoal(this.preserved, this.stage.targetPreserved);

    // Preserved food leaves the counter after a beat.
    setTimeout(() => this._retireFood(food), 1400);

    // Mastery reshuffles mid-stage, so position memory never stabilises.
    if (this.stage.reshuffleMidStage && ++this._shuffleCounter % 3 === 0) {
      setTimeout(() => this._reshuffleStations(), 900);
    }

    station.release();
    this.stage3d.setCameraFraming('play', { instant: false });

    if (Math.random() < this.stage.quizChance) {
      // Bias toward whatever this child keeps getting wrong, not always the
      // method they have just demonstrated they can do. Held off until the
      // banner above has cleared, so the quiz backdrop doesn't bury it.
      setTimeout(() => {
        this._askQuiz(Math.random() < 0.45 ? this._weakestMethod(methodId) : methodId, food.foodId);
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
    this._addScore(SCORING.wrongStationPenalty, food.group.position, `${SCORING.wrongStationPenalty}`, PALETTE.danger);

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
    this.quizAsked++;
    const q = makeQuestion({ methodId, foodId, stageId: this.stageId, afterMistake });
    this.quiz.ask(q, (correct) => {
      if (correct) {
        this.quizRight++;
        this._noteHit(q.methodId);
        this._bumpCombo();
        const gained = Math.round(SCORING.quizCorrect * this.combo);
        const p = new THREE.Vector3(0, 4.2, 2);
        this._addScore(gained, p, `+${gained}`, PALETTE.gold);
        this.particles.burst(p, { count: 26, colours: [PALETTE.gold, 0xffffff, PALETTE.success], speed: 4, life: 1.1 });
      } else {
        this._breakCombo();
        this._noteMiss(q.methodId);
      }
      this.mode = 'playing';
      this.input.setEnabled(true);
      this._checkStageEnd();
    });
  }

  // ----------------------------------------------------------------- scoring
  _addScore(delta, worldPos, label, colour) {
    // Not clamped at zero: a floor at 0 made wrong drops free for anyone who
    // had already bottomed out, which is exactly when guessing starts.
    this.score += delta;
    this.hud.setScore(Math.max(0, this.score));
    if (worldPos && label) {
      this.popups.show(worldPos.clone().add(new THREE.Vector3(0, 0.4, 0)), label, {
        colour: `#${(colour ?? PALETTE.gold).toString(16).padStart(6, '0')}`,
        size: delta > 0 ? 92 : 74,
      });
    }
    this._updateStars();
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
    this._addScore(SCORING.spoiledPenalty, food.group.position, `${SCORING.spoiledPenalty}`, PALETTE.danger);
    sfx('food.spoil');
    this.stage3d.shake(0.35, 320);
    this.particles.burst(food.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), {
      count: 22, colours: [PALETTE.mould, PALETTE.mouldDark, 0x8a9a5b], speed: 2.6, life: 1.2, grav: -3,
    });
    // Say WHY it spoiled — this is §3 of the notes, delivered at the moment of failure.
    this.hud.flash(`${t('ui.spoilt')} ${t('spoilage.why')}`, { kind: 'bad', ms: 1800 });
    this.hud.say(`${foodName(food.foodId)} ${t('ui.spoilt')} ${t('spoilage.why')}`);
    setTimeout(() => this._retireFood(food), 1100);
  }

  _checkStageEnd() {
    if (this.preserved >= this.stage.targetPreserved) this._endStage(true);
    else if (this.spoiltCount >= 5) this._endStage(false);
  }

  _endStage(passed) {
    if (this.mode === 'result') return;
    this.mode = 'result';
    this.input.setEnabled(false);
    this.panel.stop();
    audio.stopMusic();
    const stars = this._updateStars();
    const key = `s${this.stageId}`;
    this.bestScores[key] = Math.max(this.bestScores[key] || 0, this.score);
    if (passed) this.savedStage = Math.min(STAGES.length, this.stageId + 1);
    this._save();

    this.stage3d.setCameraFraming('hero', { instant: false });
    this.screens.results({
      stage: this.stage, score: this.score, stars, passed,
      preserved: this.preserved, target: this.stage.targetPreserved,
      spoilt: this.spoiltCount,
      accuracy: this.attempts ? this.correctAttempts / this.attempts : 1,
      bestCombo: this.bestCombo,
      learned: [...this.methodsUsed],
      onNext: () => { this.screens.close(); this.startStage(this.stageId + 1); },
      onRetry: () => { this.screens.close(); this.startStage(this.stageId); },
      onMenu: () => { this.screens.close(); this.showMenu(); },
    });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const cam = this.stage3d.camera;
    const playing = this.mode === 'playing';
    this.elapsed = (this.elapsed || 0) + dt;

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
      f.update(playing || this.mode === 'quiz' ? dt : 0, cam, playing ? 1 : 0);
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
    this.input.update();
    this.particles.update(dt, cam);
    this.popups.update(dt, cam);

    if (playing) this._checkStageEnd();
  }
}
