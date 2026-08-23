/**
 * PASTEURISING — "heat kills, then cool immediately" (§5I).
 *
 * Interaction: CHOOSE a programme (63°C/30min or 72°C/15s) → HOLD heat until
 * the programme completes → hit COOL inside a short window.
 *
 * This is the only two-phase, time-pressured station, and that is deliberate:
 * §5I says the food is cooled IMMEDIATELY at 4°C. A countdown window after the
 * heat phase makes "immediately" a thing the child feels rather than reads. Miss
 * the window and the run still counts as a heat-only attempt, corrected on the
 * spot — the failure itself teaches the second half of the method.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh } from '../Materials.js';
import { METHODS } from '../../content/curriculum.js';

export class Pasteuriser extends Station {
  build() {
    const shell = plastic(0xe6edf3, { rough: 0.3, clearcoat: 0.8 });
    const hotSide = plastic(0xff7043, { rough: 0.4, clearcoat: 0.6 });
    const coldSide = plastic(PALETTE.pasteurising, { rough: 0.4, clearcoat: 0.6 });
    const flowMarker = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

    // A split hot/cold machine. The two-tone body IS the recognition cue —
    // half red pipes, half blue pipes, the only station with that read.
    this.body.add(mesh(roundedBox(2.25, 1.5, 1.4, 0.12), shell, { y: 0.98 }));
    // The two-tone split is the recognition cue: a hot half and a cold half.
    // Make it the loudest thing about the machine.
    this.body.add(mesh(roundedBox(1.12, 0.34, 1.45, 0.08), hotSide, { x: -0.56, y: 1.84 }));
    this.body.add(mesh(roundedBox(1.12, 0.34, 1.45, 0.08), coldSide, { x: 0.56, y: 1.84 }));
    this.body.add(mesh(roundedBox(1.1, 1.0, 0.12, 0.05), hotSide, { x: -0.56, y: 0.5, z: 0.72 }));
    this.body.add(mesh(roundedBox(1.1, 1.0, 0.12, 0.05), coldSide, { x: 0.56, y: 0.5, z: 0.72 }));
    for (let i = 0; i < 3; i++) {
      this.body.add(mesh(roundedBox(0.09, 0.5, 0.06, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xffd9b0, toneMapped: false }),
        { x: -0.86 + i * 0.3, y: 0.5, z: 0.79, cast: false }));
      this.body.add(mesh(roundedBox(0.09, 0.5, 0.06, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xcfeeff, toneMapped: false }),
        { x: 0.26 + i * 0.3, y: 0.5, z: 0.79, cast: false }));
    }

    // Three fixed chevrons make the sequence readable even before animation:
    // product travels from the orange hot chamber to the blue cold chamber.
    for (const x of [-0.18, 0, 0.18]) {
      this.body.add(mesh(new THREE.ConeGeometry(0.07, 0.16, 5), flowMarker,
        { x, y: 1.92, z: 0.76, rz: -Math.PI / 2, cast: false, receive: false }));
    }

    // Hot chamber (left) — coils that glow.
    this.coils = [];
    for (let i = 0; i < 4; i++) {
      const c = mesh(torus(0.24, 0.045, 8, 22), new THREE.MeshStandardMaterial({
        color: 0x8a4a3a, emissive: 0x000000, roughness: 0.5, metalness: 0.3,
      }), { x: -0.56, y: 0.7 + i * 0.22, rx: Math.PI / 2 });
      this.body.add(c);
      this.coils.push(c);
    }
    this.body.add(mesh(roundedBox(0.9, 1.1, 0.05, 0.04), glass(0xffd0b0, { opacity: 0.3 }), { x: -0.56, y: 1.05, z: 0.71 }));

    // Cold chamber (right) — fins + frost.
    for (let i = 0; i < 6; i++) {
      this.body.add(mesh(roundedBox(0.85, 0.05, 0.9, 0.02), metal(0xbdd7e6), { x: 0.56, y: 0.55 + i * 0.2 }));
    }
    this.body.add(mesh(roundedBox(0.9, 1.1, 0.05, 0.04), glass(0xcfeaff, { opacity: 0.3 }), { x: 0.56, y: 1.05, z: 0.71 }));

    // Transfer pipe arcing over the top — shows the food's journey hot→cold.
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.56, 1.9, 0.82), new THREE.Vector3(-0.28, 2.08, 0.82),
      new THREE.Vector3(0.28, 2.08, 0.82), new THREE.Vector3(0.56, 1.9, 0.82),
    ]);
    this.body.add(mesh(new THREE.TubeGeometry(pipeCurve, 20, 0.12, 10, false), metal(PALETTE.steel), {}));
    this.pipeCurve = pipeCurve;

    // A high-contrast product packet is part of the machine's explanation,
    // not a second food model. It is deliberately oversized and unlit so the
    // hot-to-cold journey still reads in the Fact Book's small viewer.
    const token = new THREE.Group();
    const tokenOutline = new THREE.MeshBasicMaterial({ color: 0x593f58, toneMapped: false });
    const tokenBody = new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false });
    this.tokenAccentMat = new THREE.MeshBasicMaterial({ color: 0xff8a55, toneMapped: false });
    this._tokenHot = new THREE.Color(0xff7043);
    this._tokenCold = new THREE.Color(PALETTE.pasteurising);
    token.add(mesh(roundedBox(0.35, 0.44, 0.13, 0.055), tokenOutline, { cast: false }));
    token.add(mesh(roundedBox(0.29, 0.38, 0.15, 0.045), tokenBody,
      { z: 0.015, cast: false, receive: false }));
    token.add(mesh(roundedBox(0.24, 0.15, 0.025, 0.025), this.tokenAccentMat,
      { z: 0.105, cast: false, receive: false }));
    token.position.copy(pipeCurve.getPoint(0));
    token.position.y += 0.12;
    token.position.z += 0.25;
    this._tokenBaseScale = 1.65;
    token.scale.setScalar(this._tokenBaseScale);
    token.visible = false;
    this.body.add(token);
    this.processToken = token;

    // Temperature gauge — a vertical bar, so 63/72 and 4 are spatially distinct.
    const gc = document.createElement('canvas');
    gc.width = 128; gc.height = 512;
    this._gCtx = gc.getContext('2d');
    this._gTex = new THREE.CanvasTexture(gc);
    this._gTex.colorSpace = THREE.SRGBColorSpace;
    this.body.add(mesh(new THREE.PlaneGeometry(0.42, 1.65), new THREE.MeshBasicMaterial({
      map: this._gTex, transparent: true, toneMapped: false, depthWrite: false,
    }), { x: 0.0, y: 1.05, z: 0.73, cast: false, receive: false }));
    this._drawGauge(20);

    // Steam (hot phase) and vapour (cool phase).
    this.puffs = [];
    for (let i = 0; i < 14; i++) {
      const p = mesh(sphere(0.16 + Math.random() * 0.1, 10, 8), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
      }), { cast: false, receive: false });
      p.visible = false;
      this.body.add(p);
      this.puffs.push({ mesh: p, t: 1, side: -1 });
    }

    this._temp = 20;
    this._phase = 'idle';
    this._heat = 0;
  }

  _drawGauge(tempC, phase = 'idle', windowFrac = 0) {
    const ctx = this._gCtx;
    const W = 128, H = 512;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(14,20,28,0.88)';
    ctx.beginPath(); ctx.roundRect(6, 6, W - 12, H - 12, 26); ctx.fill();

    const barX = 34, barW = 34, barTop = 60, barH = 380;
    const toY = (t) => barTop + barH * (1 - (t - 0) / 90);   // 0..90 °C scale

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(barX, barTop, barW, barH, 17); ctx.fill();

    // Marks for the two real programmes and the 4°C target — always visible, so
    // the child reads those exact numbers dozens of times per session.
    const marks = [[72, '#ff7043', '72'], [63, '#ffa726', '63'], [4, '#29b6f6', '4']];
    for (const [t, col, label] of marks) {
      const y = toY(t);
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(barX - 8, y); ctx.lineTo(barX + barW + 8, y); ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, barX + barW + 13, y);
    }

    // Mercury
    const y = toY(THREE.MathUtils.clamp(tempC, 0, 90));
    const grad = ctx.createLinearGradient(0, barTop + barH, 0, barTop);
    grad.addColorStop(0, '#29b6f6'); grad.addColorStop(0.5, '#ffca28'); grad.addColorStop(1, '#ff5252');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(barX + 4, y, barW - 8, barTop + barH - y, 14); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(tempC)}°`, W / 2, 34);

    if (phase === 'window') {
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.roundRect(14, H - 76, W - 28, 56, 18); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillText('COOL!', W / 2, H - 60);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.roundRect(20, H - 34, (W - 40) * windowFrac, 10, 5); ctx.fill();
    }
    this._gTex.needsUpdate = true;
  }

  getSteps() {
    const progs = METHODS.pasteurising.programmes;
    return [
      {
        kind: 'choice', id: 'programme', textKey: 'station.pasteurising.choose', icon: 'thermometer',
        options: progs.map((p) => ({
          id: p.id, labelKey: `methods.pasteurising.programmes.${p.id}`, colour: p.holdC >= 72 ? 0xff7043 : 0xffa726,
        })),
        // Both programmes are valid per §5I; say so the first time.
        allCorrect: true, allCorrectKey: 'methods.pasteurising.eitherProgrammeOk',
      },
      {
        kind: 'hold', id: 'heat', textKey: 'station.pasteurising.heat', icon: 'flame',
        // Length comes from the chosen programme (set in onStepDone), so the
        // long-and-low vs short-and-hot trade-off is something the hand feels.
        ms: 2200, dynamicMs: true, decayOnRelease: true, hot: true,
      },
      {
        kind: 'tap', id: 'cool', textKey: 'station.pasteurising.cool', icon: 'snowflake',
        // The window is the "immediately" from §5I, enforced.
        windowMs: METHODS.pasteurising.chill.windowMs, urgent: true,
      },
    ];
  }

  /** Show a product journey when Fact Book autoplay has no gameplay food. */
  beginAutoplay() {
    this._demoActive = true;
    this.processToken.visible = true;
    this.processToken.position.copy(this.pipeCurve.getPoint(0));
    this.processToken.position.y += 0.12;
    this.processToken.position.z += 0.25;
    this.tokenAccentMat.color.setHex(0xff8a55);
  }

  /** Lets StationPanel ask for a hold length decided by an earlier step. */
  stepDurationMs(step) {
    return step.dynamicMs ? (this._progHoldMs || step.ms) : step.ms;
  }

  onStepProgress(index, progress, value) {
    if (index === 1) {
      const target = this._progHoldC || 72;
      this._temp = THREE.MathUtils.lerp(20, target, progress);
      this._heat = progress;
      this._phase = 'heat';
      this._drawGauge(this._temp, 'heat');
      for (const c of this.coils) {
        c.material.emissive.setRGB(progress * 1.0, progress * 0.24, 0.02);
        c.material.emissiveIntensity = 2.2;
      }
      this.tokenAccentMat.color.setHex(0xff7043);
      for (let i = 0; i < Math.floor(progress * 8); i++) {
        const p = this.puffs[i];
        if (p.t >= 1) { p.t = 0; p.side = -1; p.x = -0.56 + (Math.random() - 0.5) * 0.5; }
      }
      if (this.food) this.food.swarm.setActivity(1 - progress * 0.35);
    } else if (index === 2) {
      // Countdown window: gauge shows the urgency bar draining.
      this._phase = 'window';
      this._drawGauge(this._temp, 'window', 1 - progress);
    }
  }

  onStepDone(index, value) {
    if (index === 0) {
      const p = METHODS.pasteurising.programmes.find((x) => x.id === value);
      this._progHoldC = p?.holdC || 72;
      this._progHoldMs = p?.gameHoldMs || 2200;
      this._loading = true;
    }
    if (index === 1) {
      this._phase = 'window';
      this._transfer = 0;      // food starts travelling along the pipe
    }
    if (index === 2) {
      this._phase = 'cool';
      this._cooling = 0;
      this.tokenAccentMat.color.setHex(PALETTE.pasteurising);
    }
  }

  async playSuccess() {
    // Rapid cool: temperature plunges to 4°C in front of the player.
    const start = performance.now();
    await new Promise((resolve) => {
      // Wall-clock, not rAF: a throttled compositor would otherwise leave this
      // promise pending forever and wedge the whole interaction.
      let iv = null;
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / 900);
        this._temp = THREE.MathUtils.lerp(this._progHoldC || 72, 4, p);
        this._drawGauge(this._temp, 'cool');
        for (const c of this.coils) {
          c.material.emissive.setRGB((1 - p) * 1.0, (1 - p) * 0.24, 0.02);
        }
        this.tokenAccentMat.color.lerpColors(this._tokenHot, this._tokenCold, p);
        for (let i = 8; i < this.puffs.length; i++) {
          const pf = this.puffs[i];
          if (pf.t >= 1 && Math.random() < 0.4) { pf.t = 0; pf.side = 1; pf.x = 0.56 + (Math.random() - 0.5) * 0.5; }
        }
        if (p >= 1) { clearInterval(iv); resolve(); }
      };
      iv = setInterval(step, 16);
      step();
    });
  }

  resetVisuals() {
    this._temp = 20; this._phase = 'idle'; this._heat = 0;
    this._loading = false; this._transfer = null; this._progHoldC = null;
    this._demoActive = false;
    this.processToken.visible = false;
    this.processToken.scale.setScalar(this._tokenBaseScale);
    this.tokenAccentMat.color.setHex(0xff8a55);
    this._drawGauge(20);
    for (const c of this.coils) c.material.emissive.setHex(0x000000);
    for (const p of this.puffs) { p.t = 1; p.mesh.visible = false; }
  }

  tick(dt, elapsed) {
    for (const p of this.puffs) {
      if (p.t >= 1) { p.mesh.visible = false; continue; }
      p.t += dt * (p.side < 0 ? 0.9 : 1.3);
      p.mesh.visible = true;
      p.mesh.position.set(p.x + Math.sin(p.t * 4) * 0.12, 1.9 + p.t * 1.1, 0.2);
      p.mesh.scale.setScalar(0.5 + p.t * 1.7);
      p.mesh.material.color.setHex(p.side < 0 ? 0xfff0e0 : 0xdff2ff);
      p.mesh.material.opacity = 0.5 * (1 - p.t);
    }

    // Food rides the pipe from the hot side to the cold side.
    if (this._transfer !== null && this._transfer !== undefined) {
      this._transfer = Math.min(1, this._transfer + dt * 0.9);
      const pt = this.pipeCurve.getPoint(this._transfer);
      if (this._demoActive) {
        this.processToken.position.copy(pt);
        this.processToken.position.y += 0.12;
        this.processToken.position.z += 0.25;
      }
      if (this.food) {
        const target = this.foodTarget(pt.clone());
        this.food.group.position.lerp(target, 1 - Math.pow(0.002, dt));
      }
    } else if (this._loading && this.food) {
      const target = this.foodTarget(new THREE.Vector3(-0.56, 1.15, 0.2));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
    }

    if (this._phase === 'heat') {
      for (const c of this.coils) c.rotation.z += dt * 0.6;
      if (this._demoActive) {
        const pulse = 1 + Math.sin(elapsed * 8) * 0.08 * this._heat;
        this.processToken.scale.setScalar(this._tokenBaseScale * pulse);
      }
    } else if (this._demoActive) {
      this.processToken.scale.setScalar(this._tokenBaseScale);
    }
  }
}
