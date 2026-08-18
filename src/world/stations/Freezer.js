/**
 * FREEZING & COOLING — "low temperature slows growth" (§5E).
 *
 * Interaction: open → load → close → SET THE DIAL.
 *
 * The dial is the whole lesson. §5E gives two different settings with two
 * different food lists (0°C and below for chicken/meat/prawns/squid; around
 * 4°C for fruits/vegetables/milk) and the target band changes per food, so the
 * child cannot pass by muscle memory — they must recall which food needs which
 * temperature. Getting it wrong is corrected on the spot with the right number.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh } from '../Materials.js';
import { METHODS } from '../../content/curriculum.js';

export class Freezer extends Station {
  build() {
    const shell = plastic(0xcfe0ee, { rough: 0.35, clearcoat: 0.7 });
    const shellBlue = plastic(PALETTE.freezing, { rough: 0.4, clearcoat: 0.6 });

    // Cabinet
    this.body.add(mesh(roundedBox(2.1, 2.25, 1.6, 0.14), shell, { y: 1.32 }));
    this.body.add(mesh(roundedBox(2.16, 0.34, 1.66, 0.1), shellBlue, { y: 2.36 }));
    this.body.add(mesh(roundedBox(2.2, 0.14, 1.7, 0.06), plastic(PALETTE.freezingDeep), { y: 0.28 }));  // header band

    // Interior — dark and cold, so the open door reads instantly.
    this.body.add(mesh(roundedBox(1.78, 1.78, 1.2, 0.06), matte(0x1d3a52, 0.7), { y: 1.28, z: 0.06 }));
    const innerGlow = mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({
      color: 0x8fd4ff, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false,
    }), { y: 1.28, z: 0.62, cast: false, receive: false });
    this.body.add(innerGlow);
    this.innerGlow = innerGlow;
    const coldLight = new THREE.PointLight(0x9fd8ff, 0, 3.5, 2);
    coldLight.position.set(0, 1.3, 0.3);
    this.body.add(coldLight);
    this.coldLight = coldLight;

    // Wire shelves
    for (const y of [0.78, 1.5]) {
      for (let i = 0; i < 6; i++) {
        this.body.add(mesh(cyl(0.018, 0.018, 1.6, 6), metal(PALETTE.steel), { y, z: -0.36 + i * 0.16, rz: Math.PI / 2 }));
      }
    }

    // Door — hinged on the left, with a frosted glass window.
    const door = new THREE.Group();
    door.position.set(-0.98, 1.32, 0.8);
    const panel = new THREE.Group();
    panel.position.x = 0.98;
    // White appliance door with a recessed frosted window. Kept deliberately
    // light: an all-over blue slab hid every detail and read as a flat panel.
    panel.add(mesh(roundedBox(2.02, 2.15, 0.18, 0.1), plastic(0xf4f9fc, { rough: 0.3, clearcoat: 0.85 })));
    panel.add(mesh(roundedBox(1.62, 1.66, 0.1, 0.08), plastic(PALETTE.freezingDeep, { rough: 0.45 }), { y: 0.12, z: 0.05 }));
    panel.add(mesh(roundedBox(1.46, 1.5, 0.07, 0.07), glass(0xd8efff, { opacity: 0.5 }), { y: 0.12, z: 0.11 }));
    // Frosted corner smears inside the window — reads as a cold surface.
    for (const [fx, fy] of [[-0.5, 0.5], [0.5, -0.4], [0.42, 0.52]]) {
      panel.add(mesh(sphere(0.24, 12, 9), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false,
      }), { x: fx, y: 0.12 + fy, z: 0.12, cast: false }));
    }
    // Handle
    panel.add(mesh(cyl(0.06, 0.06, 1.5, 10), metal(PALETTE.steel), { x: 0.85, z: 0.22 }));
    for (const y of [-0.62, 0.62]) {
      panel.add(mesh(cyl(0.045, 0.045, 0.26, 8), metal(PALETTE.steelDark), { x: 0.85, y, z: 0.12, rx: Math.PI / 2 }));
    }

    // Snowflake badge on the lower panel — a real six-spoke flake with branches.
    // Three crossed bars read as an asterisk, which is not a recognition cue.
    const flakeMat = new THREE.MeshBasicMaterial({ color: 0x2f7fc4, toneMapped: false });
    const flake = new THREE.Group();
    flake.position.set(0, -0.82, 0.1);
    flake.scale.setScalar(0.85);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = mesh(roundedBox(0.34, 0.055, 0.03, 0.025), flakeMat,
        { x: Math.cos(a) * 0.17, y: Math.sin(a) * 0.17, rz: a, cast: false });
      flake.add(arm);
      for (const b of [-1, 1]) {
        flake.add(mesh(roundedBox(0.14, 0.042, 0.03, 0.02), flakeMat, {
          x: Math.cos(a) * 0.26 + Math.cos(a + b * 1.05) * 0.06,
          y: Math.sin(a) * 0.26 + Math.sin(a + b * 1.05) * 0.06,
          rz: a + b * 1.05, cast: false,
        }));
      }
    }
    flake.add(mesh(cyl(0.055, 0.055, 0.03, 10), flakeMat, { rx: Math.PI / 2, cast: false }));
    panel.add(flake);
    door.add(panel);
    this.door = door;
    this.body.add(door);

    // Control fascia with dial + digital readout.
    const fascia = new THREE.Group();
    fascia.position.set(0, 2.36, 0.86);
    fascia.add(mesh(roundedBox(1.5, 0.3, 0.1, 0.05), matte(0x18293a, 0.6)));
    const readCanvas = document.createElement('canvas');
    readCanvas.width = 512; readCanvas.height = 128;
    this._readCtx = readCanvas.getContext('2d');
    this._readTex = new THREE.CanvasTexture(readCanvas);
    this._readTex.colorSpace = THREE.SRGBColorSpace;
    fascia.add(mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({
      map: this._readTex, transparent: true, toneMapped: false, depthWrite: false,
    }), { z: 0.06, cast: false, receive: false }));
    this.body.add(fascia);
    this._drawReadout(null);

    // Physical dial on the front-right of the cabinet.
    const dial = new THREE.Group();
    dial.position.set(0.78, 1.05, 0.86);
    dial.add(mesh(cyl(0.26, 0.26, 0.1, 20), metal(PALETTE.steelDark), { rx: Math.PI / 2 }));
    const knob = mesh(cyl(0.2, 0.22, 0.14, 20), plastic(PALETTE.freezingDeep), { rx: Math.PI / 2, z: 0.05 });
    dial.add(knob);
    knob.add(mesh(roundedBox(0.05, 0.16, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      { z: 0.08, y: 0.0, x: 0, cast: false }));
    // pointer offset along local Y so rotation is visible
    const pointer = mesh(roundedBox(0.045, 0.15, 0.06, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), { y: 0.11, z: 0.09, cast: false });
    dial.add(pointer);
    this.dialKnob = dial;
    this._pointer = pointer;
    this.body.add(dial);

    // Frost crystals around the cabinet edge, intensified when cold.
    this.frost = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const f = mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({
        color: 0xeafaff, toneMapped: false, transparent: true, opacity: 0,
      }), { x: Math.cos(a) * 0.95, y: 1.3 + Math.sin(a) * 0.9, z: 0.75, cast: false });
      f.visible = false;
      this.body.add(f);
      this.frost.push(f);
    }

    // Cold vapour puffs that roll out when the door opens.
    this.vapour = [];
    const vapMat = new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const v = mesh(sphere(0.2 + Math.random() * 0.14, 10, 8), vapMat.clone(), { cast: false, receive: false });
      v.visible = false;
      this.body.add(v);
      this.vapour.push({ mesh: v, t: 1 });
    }

    this._doorOpen = 0;
    this._targetDoor = 0;
    this._tempC = 12;
  }

  _drawReadout(tempC, ok = null) {
    const ctx = this._readCtx;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = '#0b1620';
    ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 22); ctx.fill();
    ctx.font = '800 76px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (tempC === null) {
      ctx.fillStyle = '#4a6b80';
      ctx.fillText('-- °C', 256, 66);
    } else {
      ctx.fillStyle = ok === null ? '#7fd8ff' : ok ? '#76d275' : '#ff7676';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 22;
      ctx.fillText(`${tempC > 0 ? '' : ''}${Math.round(tempC)} °C`, 256, 66);
      ctx.shadowBlur = 0;
    }
    this._readTex.needsUpdate = true;
  }

  /**
   * The dial IS the lesson. `activeMethodId` is set by Game from the food:
   * chicken -> freezing (0°C and below), milk -> cooling (around 4°C). The
   * accepted band therefore changes per food, so the child cannot pass by
   * muscle memory — and confirming the wrong band is a real, correctable
   * failure rather than a button that refuses to appear.
   */
  getSteps(food) {
    const m = METHODS[this.activeMethodId] || METHODS.cooling;
    this._mode = m;
    return [
      { kind: 'tap', id: 'open', textKey: 'station.freezing.open', icon: 'door' },
      { kind: 'tap', id: 'close', textKey: 'station.freezing.close', icon: 'door' },
      {
        kind: 'dial', id: 'temp', textKey: 'station.freezing.dial', icon: 'thermometer',
        min: -30, max: 12, step: 1, start: 12, unit: '°C',
        target: m.acceptC, targetLabel: `${m.targetC}°C`, methodId: m.id,
        // Failing here teaches: the correct band is stated on the spot.
        failOnWrong: true, failReason: 'dial',
        // An unlabelled scale, not four tappable answers. Named ticks turned
        // the one recall interaction into a four-option guess.
        showTargetHighlight: false,
      },
    ];
  }

  onStepProgress(index, progress, value) {
    if (index === 2 && typeof value === 'number') {
      this._tempC = value;
      // Neutral readout: showing "in band" live would hand over the answer the
      // child is supposed to retrieve.
      this._drawReadout(value, null);
      const [lo, hi] = this._mode.acceptC;
      const inBand = value >= lo && value <= hi;
      // Knob rotation mirrors the value, so the physical control and the number agree.
      const t = (value - (-30)) / (12 - (-30));
      this.dialKnob.rotation.z = THREE.MathUtils.lerp(Math.PI * 0.8, -Math.PI * 0.8, t);
      const cold = THREE.MathUtils.clamp((4 - value) / 26, 0, 1);
      this.coldLight.intensity = 2 + cold * 8;
      this.innerGlow.material.opacity = 0.18 + cold * 0.3;
      for (const f of this.frost) { f.material.opacity = cold * 0.9; f.visible = cold > 0.02; }
      if (this.food) this.food.swarm.setActivity(0.9 - cold * 0.55);
    }
  }

  onStepDone(index) {
    if (index === 0) {
      this._targetDoor = 1;
      this._puff();
      // Food glides onto the shelf.
      this._loading = true; this._loadT = 0;
    } else if (index === 1) {
      this._targetDoor = 0;
      this._puff();
    }
  }

  _puff() {
    for (const v of this.vapour) {
      if (v.t >= 1) {
        v.t = 0;
        v.x = (Math.random() - 0.5) * 1.4;
        v.y = 0.6 + Math.random() * 0.5;
        v.vz = 0.6 + Math.random() * 0.8;
      }
    }
  }

  async playSuccess() {
    this._drawReadout(this._tempC, true);
    for (const f of this.frost) { f.material.opacity = 1; f.visible = true; }
    this._puff();
    await new Promise((r) => setTimeout(r, 700));
  }

  resetVisuals() {
    this._targetDoor = 0;
    this._loading = false;
    this._tempC = 12;
    this._drawReadout(null);
    this.coldLight.intensity = 0;
    this.innerGlow.material.opacity = 0.22;
    for (const f of this.frost) { f.material.opacity = 0; f.visible = false; }
    this.dialKnob.rotation.z = Math.PI * 0.8;
  }

  tick(dt, elapsed) {
    this._doorOpen += (this._targetDoor - this._doorOpen) * (1 - Math.pow(0.0005, dt));
    this.door.rotation.y = -this._doorOpen * 2.0;

    for (const v of this.vapour) {
      if (v.t >= 1) { v.mesh.visible = false; continue; }
      v.t += dt * 0.8;
      v.mesh.visible = true;
      v.mesh.position.set(v.x * (0.4 + v.t), v.y - v.t * 0.5, 0.7 + v.t * v.vz);
      v.mesh.scale.setScalar(0.6 + v.t * 1.5);
      v.mesh.material.opacity = 0.55 * (1 - v.t);
    }

    if (this._loading && this.food) {
      this._loadT += dt;
      const target = this.root.localToWorld(new THREE.Vector3(0, 1.62, 0.0));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
      this.food.model.rotation.y += dt * 1.2;
    }
    for (let i = 0; i < this.frost.length; i++) {
      if (!this.frost[i].visible) continue;
      this.frost[i].rotation.y += dt * 0.8;
      this.frost[i].rotation.x = Math.sin(elapsed * 2 + i) * 0.4;
    }
  }
}
