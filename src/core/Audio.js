/**
 * Sound hooks, synthesised with WebAudio.
 *
 * No audio files: the whole soundtrack is generated, so the game ships with
 * zero audio payload, works offline, and never blocks loading. Every hook is a
 * named event (`sfx('preserve.freezing')`) so real recorded assets can be
 * swapped in later behind the same call sites.
 *
 * Each station has its OWN success sound. That is deliberate — an audio cue
 * tied to a method is another recall channel, and children pick these up fast.
 */

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.master = null;
    this._musicNodes = null;
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    // Gentle limiter so stacked combo sounds never clip.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  setEnabled(v) { this.enabled = v; if (this.master) this.master.gain.value = v ? 0.55 : 0; }

  _env(node, { attack = 0.005, decay = 0.18, peak = 0.4, sustain = 0, release = 0.05 } = {}) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, sustain || 0.0002), t + attack + decay);
    if (release) g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay + release);
    node.connect(g).connect(this.master);
    return g;
  }

  _tone(freq, { type = 'sine', dur = 0.2, peak = 0.3, detune = 0, slideTo = null, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (isFiniteNum(slideTo)) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.3, peak = 0.2, filter = 'lowpass', freq = 1200, q = 1, sweepTo = null, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (isFiniteNum(sweepTo)) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** @param {string} name dot-namespaced event */
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const S = {
      // --- interface
      'ui.tap':      () => this._tone(620, { type: 'triangle', dur: 0.07, peak: 0.18 }),
      'ui.back':     () => this._tone(360, { type: 'triangle', dur: 0.09, peak: 0.16, slideTo: 260 }),
      'ui.open':     () => { this._tone(520, { type: 'sine', dur: 0.12, peak: 0.18 }); this._tone(780, { type: 'sine', dur: 0.16, peak: 0.14, delay: 0.05 }); },

      // --- gameplay
      'food.spawn':  () => this._tone(700, { type: 'sine', dur: 0.14, peak: 0.13, slideTo: 980 }),
      'food.pick':   () => this._tone(480, { type: 'triangle', dur: 0.08, peak: 0.2, slideTo: 660 }),
      'food.drop':   () => this._tone(300, { type: 'sine', dur: 0.12, peak: 0.22, slideTo: 200 }),
      'food.spoil':  () => { this._noise({ dur: 0.5, peak: 0.22, freq: 700, sweepTo: 120 }); this._tone(180, { type: 'sawtooth', dur: 0.4, peak: 0.14, slideTo: 70 }); },
      'wrong':       () => { this._tone(220, { type: 'square', dur: 0.13, peak: 0.16 }); this._tone(165, { type: 'square', dur: 0.2, peak: 0.14, delay: 0.1 }); },

      // --- per-station success: each method gets its own signature
      'preserve.drying':       () => { this._noise({ dur: 0.5, peak: 0.13, filter: 'highpass', freq: 900, sweepTo: 3800 }); this._chord([523, 659, 784], 0.4); },
      'preserve.freezing':     () => { this._tone(1400, { type: 'sine', dur: 0.5, peak: 0.16, slideTo: 700 }); this._noise({ dur: 0.35, peak: 0.1, filter: 'highpass', freq: 4000 }); this._chord([587, 740, 880], 0.45); },
      'preserve.vacuum':       () => { this._noise({ dur: 0.55, peak: 0.2, freq: 2400, sweepTo: 180 }); this._tone(90, { type: 'sine', dur: 0.2, peak: 0.22, delay: 0.45 }); this._chord([494, 622, 740], 0.4, 0.5); },
      'preserve.pickling':     () => { this._noise({ dur: 0.6, peak: 0.12, filter: 'bandpass', freq: 2600, q: 4 }); this._tone(440, { type: 'sine', dur: 0.3, peak: 0.16, slideTo: 620 }); this._chord([440, 554, 659], 0.4, 0.25); },
      'preserve.salting':      () => { for (let i = 0; i < 5; i++) this._noise({ dur: 0.12, peak: 0.1, filter: 'highpass', freq: 5200, delay: i * 0.06 }); this._chord([466, 587, 698], 0.4, 0.3); },
      'preserve.pasteurising': () => { this._noise({ dur: 0.45, peak: 0.14, freq: 500, sweepTo: 2200 }); this._tone(1200, { type: 'sine', dur: 0.4, peak: 0.14, slideTo: 500, delay: 0.4 }); this._chord([523, 698, 880], 0.45, 0.5); },

      // --- rewards
      'quiz.right':  () => this._chord([659, 831, 988, 1319], 0.5),
      'quiz.wrong':  () => { this._tone(300, { type: 'triangle', dur: 0.16, peak: 0.16 }); this._tone(240, { type: 'triangle', dur: 0.24, peak: 0.14, delay: 0.13 }); },
      'combo':       () => {
        const n = Math.min(8, opts.level || 1);
        this._tone(440 * Math.pow(2, n / 12), { type: 'triangle', dur: 0.18, peak: 0.2 });
      },
      'star':        () => this._chord([784, 988, 1175], 0.55),
      'stage.win':   () => { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, { type: 'triangle', dur: 0.4, peak: 0.2, delay: i * 0.11 })); },
      'stage.lose':  () => { [392, 349, 294, 233].forEach((f, i) => this._tone(f, { type: 'triangle', dur: 0.35, peak: 0.18, delay: i * 0.13 })); },

      // --- machine loops (one-shots triggered per interaction)
      'machine.door':  () => { this._noise({ dur: 0.22, peak: 0.16, freq: 400, sweepTo: 120 }); this._tone(120, { type: 'sine', dur: 0.14, peak: 0.18, delay: 0.16 }); },
      'machine.pump':  () => this._noise({ dur: 0.3, peak: 0.12, filter: 'bandpass', freq: 800, q: 2 }),
      'machine.pour':  () => this._noise({ dur: 0.4, peak: 0.1, filter: 'bandpass', freq: 1600, q: 3 }),
      'machine.twist': () => { for (let i = 0; i < 3; i++) this._tone(300 + i * 60, { type: 'square', dur: 0.05, peak: 0.1, delay: i * 0.07 }); },
      'machine.heat':  () => this._noise({ dur: 0.5, peak: 0.09, filter: 'lowpass', freq: 380 }),
    };
    S[name]?.();
  }

  _chord(freqs, dur = 0.4, delay = 0) {
    freqs.forEach((f, i) => this._tone(f, { type: 'triangle', dur, peak: 0.13, delay: delay + i * 0.035 }));
  }

  /** Light ambient bed — a slow two-note pulse, low enough to ignore. */
  startMusic() {
    if (!this.ctx || this._musicNodes || !this.musicOn) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    const notes = [130.81, 164.81, 196.0, 164.81];
    let i = 0;
    const step = () => {
      if (!this._musicNodes) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = notes[i++ % notes.length];
      const eg = this.ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t);
      eg.gain.exponentialRampToValueAtTime(0.5, t + 0.6);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(eg).connect(g);
      o.start(t); o.stop(t + 2.5);
      this._musicNodes.timer = setTimeout(step, 2400);
    };
    this._musicNodes = { g, timer: null };
    step();
  }

  stopMusic() {
    if (!this._musicNodes) return;
    clearTimeout(this._musicNodes.timer);
    this._musicNodes.g.disconnect();
    this._musicNodes = null;
  }

  setMusic(on) { this.musicOn = on; if (on) this.startMusic(); else this.stopMusic(); }
}

export const audio = new AudioEngine();
export const sfx = (name, opts) => audio.play(name, opts);
