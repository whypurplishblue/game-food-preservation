/**
 * StationPanel — the physical control widgets docked under the active machine.
 *
 * WHY DOM AND NOT 3D GESTURES
 * Raycast gestures onto 3D machine parts look clever and play badly: hit targets
 * shift with the camera, they are invisible to screen readers, and on a phone
 * they are smaller than a fingertip. Keeping the CONTROL in DOM and the MACHINE
 * in 3D gives large guaranteed touch targets, crisp readable text at any DPI,
 * and a keyboard path — while the 3D machine still does all the animating, so
 * it never feels like a form bolted onto a scene.
 *
 * Each widget kind has a distinct motor action, which is the point: the hand
 * remembers what the head is still learning.
 */
import { t } from '../content/i18n.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class StationPanel {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'pp-panel';
    this.el.setAttribute('role', 'group');
    this.el.hidden = true;
    root.appendChild(this.el);
    this.active = null;
    this._raf = null;
  }

  /**
   * @param {object} opts
   *  steps          step specs from the station
   *  methodColour   css colour for the accent
   *  onProgress(i, progress, value)
   *  onStepDone(i, value)
   *  onComplete(quality 0..1)
   *  onFail(reason)
   */
  start(opts) {
    this.stop();
    this.active = { ...opts, index: opts.index || 0, quality: opts.quality ?? 1, startedAt: performance.now() };
    this.el.hidden = false;
    this.el.style.setProperty('--accent', opts.methodColour || '#66bb6a');
    this._renderStep();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._detach();
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.active = null;
  }

  _detach() {
    if (this._cleanup) { this._cleanup(); this._cleanup = null; }
  }

  /**
   * Everything needed to rebuild this interaction later.
   *
   * Pause used to call stop(), which left the food sitting in a busy station
   * with no controls to finish it — the run was unrecoverable. The widgets are
   * live DOM with their own timers, so rather than trying to freeze them, the
   * panel hands back its state and is rebuilt from the step it was on.
   */
  snapshot() {
    if (!this.active) return null;
    const { steps, methodColour, onProgress, onStepDone, onComplete, onFail, index, quality } = this.active;
    return { steps, methodColour, onProgress, onStepDone, onComplete, onFail, index, quality };
  }

  _nextStep(value) {
    const a = this.active;
    if (!a) return;
    a.onStepDone?.(a.index, value);
    a.index++;
    if (a.index >= a.steps.length) {
      const quality = a.quality;
      const cb = a.onComplete;
      this.stop();
      cb?.(quality);
    } else {
      this._renderStep();
    }
  }

  _renderStep() {
    this._detach();
    const a = this.active;
    const step = a.steps[a.index];
    this.el.innerHTML = '';

    // Step pips — the child can see how many actions this machine takes.
    const pips = document.createElement('div');
    pips.className = 'pp-panel__pips';
    a.steps.forEach((_, i) => {
      const p = document.createElement('span');
      p.className = 'pp-pip' + (i < a.index ? ' is-done' : i === a.index ? ' is-active' : '');
      pips.appendChild(p);
    });
    this.el.appendChild(pips);

    const label = document.createElement('div');
    label.className = 'pp-panel__label';
    label.textContent = t(step.textKey);
    this.el.appendChild(label);

    const stage = document.createElement('div');
    stage.className = 'pp-panel__stage';
    this.el.appendChild(stage);

    const builder = {
      tap: this._tap, hold: this._hold, sweep: this._sweep,
      scrub: this._scrub, dial: this._dial, choice: this._choice,
      twist: this._twist, rhythm: this._rhythm,
    }[step.kind] || this._tap;
    builder.call(this, stage, step);
  }

  // ------------------------------------------------------------------- TAP
  _tap(stage, step) {
    const a = this.active;
    const btn = document.createElement('button');
    btn.className = 'pp-btn pp-btn--tap' + (step.urgent ? ' is-urgent' : '');
    btn.type = 'button';
    btn.innerHTML = `<span class="pp-btn__icon" data-icon="${step.icon || 'ok'}"></span><span>${t(step.textKey)}</span>`;
    stage.appendChild(btn);
    btn.focus({ preventScroll: true });

    let timer = null;
    // Urgent taps (pasteurising's COOL) run against a visible countdown —
    // this is how "cool it immediately" becomes a felt rule.
    if (step.windowMs) {
      const bar = document.createElement('div');
      bar.className = 'pp-window';
      bar.innerHTML = '<i></i>';
      stage.appendChild(bar);
      const fill = bar.querySelector('i');
      const t0 = performance.now();
      const tick = () => {
        const p = clamp((performance.now() - t0) / step.windowMs, 0, 1);
        fill.style.transform = `scaleX(${1 - p})`;
        a.onProgress?.(a.index, p);
        if (p >= 1) {
          clearInterval(timer);
          this._detach();
          const cb = a.onFail;
          const idx = a.index;
          this.stop();
          cb?.('window', idx);
        }
      };
      timer = setInterval(tick, 16);
    }

    const go = () => {
      if (timer) clearInterval(timer);
      // Reward promptness on urgent taps.
      if (step.windowMs) {
        const used = (performance.now() - a.startedAt) / step.windowMs;
        a.quality = Math.min(a.quality, clamp(1.15 - used * 0.5, 0.5, 1));
      }
      this._nextStep(true);
    };
    btn.addEventListener('click', go);
    this._cleanup = () => { if (timer) clearInterval(timer); btn.removeEventListener('click', go); };
  }

  // ------------------------------------------------------------------ HOLD
  _hold(stage, step) {
    const a = this.active;
    const btn = document.createElement('button');
    btn.className = 'pp-btn pp-btn--hold' + (step.hot ? ' is-hot' : '');
    btn.type = 'button';
    btn.innerHTML = `<span class="pp-btn__icon" data-icon="${step.icon || 'hold'}"></span>
      <span class="pp-btn__text">${t(step.textKey)}</span>
      <span class="pp-btn__fill"></span>`;
    stage.appendChild(btn);
    btn.focus({ preventScroll: true });
    const fill = btn.querySelector('.pp-btn__fill');

    // A station may decide the duration from an earlier step (the pasteuriser's
    // 63°C/30min vs 72°C/15s programmes).
    const holdMs = a.stepDurationMs?.(step) ?? step.ms;
    let held = false, progress = 0, last = performance.now(), released = 0;
    const down = (e) => { e.preventDefault(); held = true; btn.classList.add('is-held'); };
    const up = () => { held = false; btn.classList.remove('is-held'); released++; };

    btn.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // Keyboard equivalent: hold Space/Enter.
    const kd = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); held = true; btn.classList.add('is-held'); } };
    const ku = (e) => { if (e.key === ' ' || e.key === 'Enter') up(); };
    btn.addEventListener('keydown', kd);
    btn.addEventListener('keyup', ku);

    // Driven by a wall-clock interval, not requestAnimationFrame. rAF stops
    // firing when the compositor is throttled (background tab, some embedded
    // webviews), which left the child holding a button that did nothing.
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (held) progress += dt * 1000 / holdMs;
      else if (step.decayOnRelease) progress = Math.max(0, progress - dt * 0.55); // air leaks back in
      progress = clamp(progress, 0, 1);
      fill.style.transform = `scaleX(${progress})`;
      a.onProgress?.(a.index, progress);
      if (progress >= 1) {
        clearInterval(this._timer); this._timer = null;
        // Letting go repeatedly costs polish points but never blocks progress.
        a.quality = Math.min(a.quality, released <= 1 ? 1 : clamp(1 - (released - 1) * 0.12, 0.5, 1));
        this._nextStep(true);
      }
    };
    clearInterval(this._timer);
    this._timer = setInterval(tick, 16);

    this._cleanup = () => {
      clearInterval(this._timer); this._timer = null;
      btn.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      btn.removeEventListener('keydown', kd);
      btn.removeEventListener('keyup', ku);
    };
  }

  // ----------------------------------------------------------------- SWEEP
  /** One long horizontal drag, repeated `sweeps` times. Used for the sun. */
  _sweep(stage, step) {
    const a = this.active;
    const pad = document.createElement('div');
    pad.className = 'pp-pad pp-pad--sweep';
    pad.setAttribute('tabindex', '0');
    // No hint text here: the panel label above already states the instruction,
    // and repeating it twice reads as a layout bug.
    pad.innerHTML = `<div class="pp-pad__track"><div class="pp-pad__knob" data-icon="${step.icon || 'sun'}"></div></div>
      <div class="pp-pad__hint">← →</div>`;
    stage.appendChild(pad);
    const knob = pad.querySelector('.pp-pad__knob');
    const track = pad.querySelector('.pp-pad__track');

    const need = step.sweeps || 2;
    let done = 0, dir = 1, x = 0, dragging = false;

    const setX = (v) => {
      x = clamp(v, 0, 1);
      knob.style.left = `${x * 100}%`;
      const overall = clamp((done + (dir > 0 ? x : 1 - x)) / need, 0, 1);
      a.onProgress?.(a.index, overall);
      if (overall >= 1) { this._nextStep(true); return true; }
      // Reaching the far end flips the direction — a genuine back-and-forth sweep.
      // The end zone is deliberately generous: needing the last 1.5% of the
      // track meant a sweep that stopped a finger's width short registered
      // nothing, which reads as a broken control rather than a near miss.
      if (dir > 0 && x > 0.94) { done++; dir = -1; }
      else if (dir < 0 && x < 0.06) { done++; dir = 1; }
      return false;
    };

    const toFrac = (e) => {
      const r = track.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    const down = (e) => { dragging = true; pad.setPointerCapture?.(e.pointerId); setX(toFrac(e)); };
    const move = (e) => { if (dragging) setX(toFrac(e)); };
    const up = () => { dragging = false; };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // Keyboard: arrow keys walk the sun across.
    const kd = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); setX(x + 0.08); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setX(x - 0.08); }
    };
    pad.addEventListener('keydown', kd);
    pad.focus({ preventScroll: true });

    this._cleanup = () => {
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      pad.removeEventListener('keydown', kd);
    };
  }

  // ----------------------------------------------------------------- TWIST
  /**
   * Turn a lid round and round until it is sealed. `turns` full rotations.
   *
   * Deliberately NOT the dial: the dial is a value you choose and confirm, this
   * is effort you keep applying, and it stops when the thing is shut. §5J's
   * airtight seal is half of what canning does, so it gets its own gesture
   * rather than another button that says "seal".
   */
  _twist(stage, step) {
    const a = this.active;
    const pad = document.createElement('div');
    pad.className = 'pp-pad pp-pad--twist';
    pad.setAttribute('tabindex', '0');
    pad.innerHTML = `<div class="pp-twist"><div class="pp-twist__knob"><i></i></div></div>
      <div class="pp-meter"><i></i><b>0%</b></div>
      <div class="pp-pad__hint">${t(step.hintKey || 'station.canning.twistHint')}</div>`;
    stage.appendChild(pad);
    const disc = pad.querySelector('.pp-twist');
    const knob = pad.querySelector('.pp-twist__knob');
    const meterFill = pad.querySelector('.pp-meter i');
    const meterTxt = pad.querySelector('.pp-meter b');

    const need = (step.turns || 2) * Math.PI * 2;
    let turned = 0, lastA = null, dragging = false;

    const update = () => {
      const p = clamp(turned / need, 0, 1);
      knob.style.transform = `rotate(${turned * 57.2958}deg)`;
      meterFill.style.transform = `scaleX(${p})`;
      meterTxt.textContent = `${Math.round(p * 100)}%`;
      a.onProgress?.(a.index, p);
      if (p >= 1) this._nextStep(true);
    };
    const angleAt = (e) => {
      const r = disc.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    const move = (e) => {
      if (!dragging) return;
      const ang = angleAt(e);
      if (lastA !== null) {
        // Shortest signed step, so crossing the ±PI seam does not jump a turn.
        let d = ang - lastA;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        turned += Math.abs(d);
        update();
      }
      lastA = ang;
    };
    const down = (e) => { dragging = true; pad.setPointerCapture?.(e.pointerId); lastA = angleAt(e); };
    const up = () => { dragging = false; lastA = null; };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const kd = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault(); turned += Math.PI / 3; update();
      }
    };
    pad.addEventListener('keydown', kd);
    pad.focus({ preventScroll: true });
    update();

    this._cleanup = () => {
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      pad.removeEventListener('keydown', kd);
    };
  }

  // ---------------------------------------------------------------- RHYTHM
  /**
   * Work the bellows: press in time with the sweeping marker, `beats` times.
   *
   * §5H says smoking "takes a long time", and a hold bar would say that in the
   * dullest possible way. Keeping a fire alive is a repeated act of attention,
   * so the child has to come back to it beat after beat. Missing costs nothing
   * but time — the point is duration and rhythm, not precision under threat.
   */
  _rhythm(stage, step) {
    const a = this.active;
    const need = step.beats || 5;
    const period = step.periodMs || 950;

    const pad = document.createElement('div');
    pad.className = 'pp-pad pp-pad--rhythm';
    pad.innerHTML = `<div class="pp-rhythm">
        <div class="pp-rhythm__zone"></div>
        <div class="pp-rhythm__marker"></div>
      </div>
      <button class="pp-btn pp-btn--beat" type="button">
        <span class="pp-btn__icon" data-icon="${step.icon || 'bellows'}"></span>
        <span>${t(step.textKey)}</span></button>
      <div class="pp-beats"></div>`;
    stage.appendChild(pad);
    const marker = pad.querySelector('.pp-rhythm__marker');
    const btn = pad.querySelector('.pp-btn--beat');
    const beatsRow = pad.querySelector('.pp-beats');
    for (let i = 0; i < need; i++) beatsRow.appendChild(document.createElement('span'));
    const pips = [...beatsRow.children];
    btn.focus({ preventScroll: true });

    let hits = 0, t0 = performance.now(), lastHit = -1;
    const phase = () => ((performance.now() - t0) % period) / period;

    const tick = () => {
      // Marker sweeps left-right and back; the zone sits in the middle.
      const ph = phase();
      const x = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
      marker.style.left = `${x * 100}%`;
      pad.classList.toggle('is-open', Math.abs(x - 0.5) < 0.16);
      a.onProgress?.(a.index, hits / need);
    };
    clearInterval(this._timer);
    this._timer = setInterval(tick, 16);

    const beat = () => {
      const ph = phase();
      const x = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
      const good = Math.abs(x - 0.5) < 0.16;
      const now = performance.now();
      if (now - lastHit < 200) return;            // ignore a mashed double-press
      lastHit = now;
      if (!good) {
        a.quality = Math.max(0.5, a.quality - 0.06);
        pad.classList.add('is-miss');
        setTimeout(() => pad.classList.remove('is-miss'), 180);
        return;
      }
      pips[hits]?.classList.add('is-on');
      hits++;
      pad.classList.add('is-hit');
      setTimeout(() => pad.classList.remove('is-hit'), 140);
      if (hits >= need) {
        clearInterval(this._timer); this._timer = null;
        this._nextStep(true);
      }
    };
    btn.addEventListener('click', beat);
    const kd = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); beat(); } };
    btn.addEventListener('keydown', kd);
    this._cleanup = () => {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      btn.removeEventListener('click', beat);
      btn.removeEventListener('keydown', kd);
    };
  }

  // ----------------------------------------------------------------- SCRUB
  /** Rub back and forth across a surface. `reps` direction changes required. */
  _scrub(stage, step) {
    const a = this.active;
    const pad = document.createElement('div');
    pad.className = 'pp-pad pp-pad--scrub';
    pad.setAttribute('tabindex', '0');
    pad.innerHTML = `<div class="pp-scrub__surface"><span class="pp-scrub__hand">✋</span></div>
      <div class="pp-meter"><i></i><b>0%</b></div>
      <div class="pp-pad__hint">${t(step.meterKey || 'methods.salting.coverage')}</div>`;
    stage.appendChild(pad);
    const surface = pad.querySelector('.pp-scrub__surface');
    const hand = pad.querySelector('.pp-scrub__hand');
    const meterFill = pad.querySelector('.pp-meter i');
    const meterTxt = pad.querySelector('.pp-meter b');

    const need = step.reps || 6;
    let reps = 0, lastX = null, dirSign = 0, dragging = false, travel = 0;

    const update = () => {
      const p = clamp(reps / need, 0, 1);
      meterFill.style.transform = `scaleX(${p})`;
      meterTxt.textContent = `${Math.round(p * 100)}%`;
      a.onProgress?.(a.index, p);
      if (p >= 1) this._nextStep(true);
    };

    const at = (e) => {
      const r = surface.getBoundingClientRect();
      return clamp((e.clientX - r.left) / r.width, 0, 1);
    };
    const move = (e) => {
      if (!dragging) return;
      const x = at(e);
      hand.style.left = `${x * 100}%`;
      if (lastX !== null) {
        const d = x - lastX;
        travel += Math.abs(d);
        const s = Math.sign(d);
        // A rep is a direction reversal after meaningful travel — this forces a
        // real rubbing motion instead of a jiggle.
        if (s !== 0 && dirSign !== 0 && s !== dirSign && travel > 0.28) {
          reps++; travel = 0; update();
        }
        if (s !== 0) dirSign = s;
      }
      lastX = x;
    };
    const down = (e) => { dragging = true; pad.setPointerCapture?.(e.pointerId); lastX = at(e); };
    const up = () => { dragging = false; lastX = null; };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const kd = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); reps++; update(); }
    };
    pad.addEventListener('keydown', kd);
    pad.focus({ preventScroll: true });
    update();

    this._cleanup = () => {
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      pad.removeEventListener('keydown', kd);
    };
  }

  // ------------------------------------------------------------------ DIAL
  /** Rotary control. Used for the freezer temperature and the jar lid. */
  _dial(stage, step) {
    const a = this.active;
    const wrap = document.createElement('div');
    wrap.className = 'pp-dial';
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('aria-valuemin', String(step.min));
    wrap.setAttribute('aria-valuemax', String(step.max));
    wrap.innerHTML = `
      <div class="pp-dial__face">
        <div class="pp-dial__knob"><i></i></div>
        <div class="pp-dial__value"></div>
      </div>
      <div class="pp-dial__marks"></div>
      <button class="pp-btn pp-btn--confirm" type="button" hidden>${t('ui.next')}</button>`;
    stage.appendChild(wrap);

    const knob = wrap.querySelector('.pp-dial__knob');
    const valueEl = wrap.querySelector('.pp-dial__value');
    const marksEl = wrap.querySelector('.pp-dial__marks');
    const confirm = wrap.querySelector('.pp-btn--confirm');

    // Named ticks (−18 / 0 / 4 / 12) give the child something to aim at and
    // put the exact syllabus numbers in front of them every single time.
    if (step.marks) {
      for (const m of step.marks) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pp-mark';
        b.textContent = `${m.label}${step.unit || ''}`;
        b.addEventListener('click', () => setVal(m.v));
        marksEl.appendChild(b);
      }
    }

    let val = step.start ?? step.min;
    const range = step.max - step.min;

    const inTarget = (v) => !step.target || (v >= step.target[0] && v <= step.target[1]);

    const setVal = (v) => {
      val = clamp(Math.round(v / (step.step || 1)) * (step.step || 1), step.min, step.max);
      const frac = (val - step.min) / range;
      knob.style.transform = step.twist
        ? `rotate(${(val / 360) * 720}deg)`
        : `rotate(${-140 + frac * 280}deg)`;
      valueEl.textContent = step.twist ? '' : `${val}${step.unit || ''}`;
      wrap.setAttribute('aria-valuenow', String(val));
      // Only highlight the target band where the dial is a mechanism (the jar
      // lid). On the freezer it would announce the answer the child is meant
      // to recall.
      if (step.showTargetHighlight !== false) wrap.classList.toggle('is-on-target', inTarget(val));
      a.onProgress?.(a.index, frac, val);
      if (step.twist) {
        // The lid twist completes itself once fully turned.
        if (inTarget(val)) this._nextStep(val);
      } else {
        // Always confirmable. Hiding the button until the value was already
        // correct meant there was no wrong answer to give — and therefore
        // nothing to recall.
        confirm.hidden = false;
      }
    };

    // Drag anywhere on the face; vertical drag also works (easier on phones).
    let dragging = false, originY = 0, originVal = 0;
    const face = wrap.querySelector('.pp-dial__face');
    const down = (e) => { dragging = true; originY = e.clientY; originVal = val; face.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      const r = face.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist > r.width * 0.18) {
        // Outside the hub: true rotary control.
        let ang = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
        if (ang < -180) ang += 360;
        if (step.twist) {
          setVal(clamp(((ang + 180) / 360) * step.max, step.min, step.max));
        } else {
          const frac = clamp((ang + 140) / 280, 0, 1);
          setVal(step.min + frac * range);
        }
      } else {
        // Near the hub: vertical scrub, which is more precise with a thumb.
        setVal(originVal + (originY - e.clientY) * (range / 240));
      }
    };
    const up = () => { dragging = false; };
    face.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const kd = (e) => {
      const s = (step.step || 1) * (e.shiftKey ? 5 : 1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setVal(val + s); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setVal(val - s); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); submit(); }
    };
    const submit = () => {
      if (step.failOnWrong && !inTarget(val)) {
        const cb = a.onFail;
        const idx = a.index;
        this.stop();
        cb?.(step.failReason || 'value', { value: val, step: idx });
        return;
      }
      this._nextStep(val);
    };
    wrap.addEventListener('keydown', kd);
    const onConfirm = () => submit();
    confirm.addEventListener('click', onConfirm);

    wrap.focus({ preventScroll: true });
    setVal(val);

    this._cleanup = () => {
      face.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      wrap.removeEventListener('keydown', kd);
      confirm.removeEventListener('click', onConfirm);
    };
  }

  // ---------------------------------------------------------------- CHOICE
  _choice(stage, step) {
    const row = document.createElement('div');
    row.className = 'pp-choices';
    stage.appendChild(row);
    const handlers = [];
    const buttons = [];
    for (const opt of step.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pp-choice';
      b.style.setProperty('--chip', `#${(opt.colour ?? 0x66bb6a).toString(16).padStart(6, '0')}`);
      b.innerHTML = `<span class="pp-choice__swatch"></span><span>${t(opt.labelKey)}</span>`;
      const go = () => {
        // Where every option is correct (§5C's three solutions, §5I's two
        // programmes), say so. Otherwise a child who always taps the first chip
        // learns "pickling = vinegar" and never meets the other two.
        if (step.allCorrect && step.allCorrectKey && !this._ackShown) {
          this._ackShown = true;
          buttons.forEach((x) => x.classList.add('is-valid'));
          b.classList.add('is-chosen');
          const note = document.createElement('p');
          note.className = 'pp-choices__note';
          note.textContent = t(step.allCorrectKey);
          stage.appendChild(note);
          // Lock the chips while the note is up. Otherwise a second tap during
          // the pause advances the step immediately AND the timer advances it
          // again, skipping the next one entirely.
          buttons.forEach((x) => { x.disabled = true; });
          // Long enough to READ. This note is the one place the game says
          // "all three solutions are correct", and at 1.3s it flashed past.
          setTimeout(() => { this._ackShown = false; this._nextStep(opt.id); }, 2800);
          return;
        }
        this._nextStep(opt.id);
      };
      b.addEventListener('click', go);
      handlers.push([b, go]);
      buttons.push(b);
      row.appendChild(b);
    }
    row.firstChild?.focus?.({ preventScroll: true });
    this._cleanup = () => handlers.forEach(([b, go]) => b.removeEventListener('click', go));
  }
}
