/**
 * Replays a station's own interaction sequence without a player.
 *
 * StationPanel drives `onStepProgress(i, progress, value)` /
 * `onStepDone(i, value)` from real pointer input during gameplay; this
 * drives the exact same calls from a clock instead, so the Fact Book's
 * "Watch it work" button shows the real mechanism — door swinging, dial
 * turning, sun sweeping — rather than a second, prettier animation authored
 * just for the book. There is no `food` docked at the station, so every
 * `if (this.food)` branch inside a station simply no-ops: the demo is the
 * machine, not the ingredient.
 *
 * Not gameplay: no scoring, no `onFail` path, no player choice. A `choice`
 * step always resolves to its first option, so the demo is deterministic.
 */
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

const DEFAULT_MS = { tap: 450, hold: 1800, dial: 1500, choice: 550 };

function stepDurationMs(station, step) {
  const explicit = station.stepDurationMs?.(step) ?? step.ms;
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  switch (step.kind) {
    case 'sweep': return (step.sweeps || 2) * 700;
    case 'scrub': return (step.reps || 6) * 250;
    case 'twist': return (step.turns || 2) * 500;
    case 'rhythm': return (step.beats || 5) * (step.periodMs || 950);
    default: return DEFAULT_MS[step.kind] || 800;
  }
}

/** The value onStepDone would receive for this step kind, from real input. */
function stepEndValue(step) {
  switch (step.kind) {
    case 'dial': return dialTarget(step);
    case 'choice': return step.options?.[0]?.id;
    default: return true;
  }
}

function dialTarget(step) {
  if (step.target) return (step.target[0] + step.target[1]) / 2;
  return step.start ?? step.min ?? 0;
}

export class StationAutoplay {
  /** @param {import('./Station.js').Station} station */
  constructor(station) {
    this.station = station;
    this.steps = station.getSteps() || [];
    this.index = 0;
    this._t = 0;
    this.done = this.steps.length === 0;
    if (!this.done) this._emit(0);
  }

  _emit(frac) {
    const step = this.steps[this.index];
    const eased = easeInOutCubic(frac);
    if (step.kind === 'dial') {
      const start = step.start ?? step.min ?? 0;
      const value = lerp(start, dialTarget(step), eased);
      this.station.onStepProgress(this.index, eased, value);
    } else {
      this.station.onStepProgress(this.index, eased);
    }
  }

  /** @returns {boolean} true once every step has finished. */
  advance(dt) {
    if (this.done) return true;
    const step = this.steps[this.index];
    this._t += dt * 1000;
    const dur = stepDurationMs(this.station, step);
    const frac = dur > 0 ? Math.min(1, this._t / dur) : 1;
    this._emit(frac);
    if (frac >= 1) {
      this.station.onStepDone(this.index, stepEndValue(step));
      this.index++;
      this._t = 0;
      if (this.index >= this.steps.length) this.done = true;
    }
    return this.done;
  }
}
