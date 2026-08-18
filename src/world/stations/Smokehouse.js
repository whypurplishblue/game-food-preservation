/**
 * SMOKING — "dries the food and reduces moisture" (§5H).
 *
 * Interaction: hang it in the smokehouse → WORK THE BELLOWS in time, five beats.
 *
 * §5H says smoking dries food using smoke and that "this method takes a long
 * time". A hold bar would state that in the dullest way available; keeping a
 * fire alive is a repeated act of attention, so the child has to come back to
 * it beat after beat. The mechanism is the same as drying (§5B) — remove the
 * water — and that is the point of having both machines on the counter: two
 * different actions, one shared reason, which is what mechanism understanding
 * actually looks like.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, hot, roundedBox, cyl, sphere, mesh } from '../Materials.js';
import { METHODS } from '../../content/curriculum.js';

export class Smokehouse extends Station {
  build() {
    const brick = matte(0x8d6e63, 0.86);
    const brickDark = matte(0x5d4037, 0.9);
    const timber = matte(0xa1734a, 0.82);

    // A squat brick hut with a chimney. The silhouette has to differ from the
    // drying rack at a glance, or the two water-removing methods blur together:
    // open timber frame there, closed smoky box here.
    //
    // Built as a CARCASS with the front open, for the same reason the freezer
    // is: the food hangs INSIDE and has to be visible drying through the door.
    // A solid box would hide the entire mechanism this station exists to show.
    const W = 2.05, H = 1.5, D = 1.45, T = 0.16, CY = 1.25;
    this.body.add(mesh(roundedBox(T, H, D, 0.05), brick, { x: -(W / 2 - T / 2), y: CY }));
    this.body.add(mesh(roundedBox(T, H, D, 0.05), brick, { x: (W / 2 - T / 2), y: CY }));
    this.body.add(mesh(roundedBox(W, T, D, 0.05), brick, { y: CY + H / 2 - T / 2 }));
    this.body.add(mesh(roundedBox(W, T, D, 0.05), brick, { y: CY - H / 2 + T / 2 }));
    this.body.add(mesh(roundedBox(W, H, T, 0.05), brick, { y: CY, z: -(D / 2 - T / 2) }));
    this.body.add(mesh(roundedBox(2.15, 0.16, 1.55, 0.06), brickDark, { y: 2.02 }));
    // Sooty liner, so the inside reads as a smoke chamber and the food pops.
    const soot = matte(0x2f231d, 0.92);
    const IW = W - 2 * T, IH = H - 2 * T, ID = D - T;
    this.body.add(mesh(roundedBox(IW, IH, 0.05, 0.02), soot, { y: CY, z: -(D / 2 - T) }));
    this.body.add(mesh(roundedBox(0.05, IH, ID, 0.02), soot, { x: -(IW / 2), y: CY, z: T / 2 }));
    this.body.add(mesh(roundedBox(0.05, IH, ID, 0.02), soot, { x: (IW / 2), y: CY, z: T / 2 }));
    this.body.add(mesh(roundedBox(IW, 0.05, ID, 0.02), soot, { y: CY + IH / 2, z: T / 2 }));
    this.body.add(mesh(roundedBox(IW, 0.05, ID, 0.02), soot, { y: CY - IH / 2, z: T / 2 }));
    // brick courses on the outer walls only
    for (let i = 0; i < 4; i++) {
      for (const sx of [-1, 1]) {
        this.body.add(mesh(roundedBox(T + 0.02, 0.05, D + 0.02, 0.02), brickDark,
          { x: sx * (W / 2 - T / 2), y: 0.66 + i * 0.34, cast: false }));
      }
    }

    // Chimney — the recognition cue, and where the smoke goes.
    const chimney = new THREE.Group();
    chimney.position.set(0.52, 2.1, -0.2);
    chimney.add(mesh(roundedBox(0.44, 0.72, 0.44, 0.05), brick, { y: 0.36 }));
    chimney.add(mesh(roundedBox(0.56, 0.1, 0.56, 0.04), brickDark, { y: 0.76 }));
    this.body.add(chimney);
    this._chimneyTop = new THREE.Vector3(0.52, 2.96, -0.2);

    // Glass door so the food inside stays visible while it smokes — the whole
    // teaching beat is watching it dry.
    const door = new THREE.Group();
    door.position.set(0, 1.3, 0.73);
    for (const [dx, dy, w, h] of [[0, 0.6, 1.62, 0.14], [0, -0.6, 1.62, 0.14],
                                  [-0.76, 0, 0.12, 1.18], [0.76, 0, 0.12, 1.18]]) {
      door.add(mesh(roundedBox(w, h, 0.08, 0.03), timber, { x: dx, y: dy }));
    }
    // Pane kept light: a smoked-glass door looked right and hid the food, which
    // is the one thing the door is there to show.
    const pane = mesh(roundedBox(1.32, 0.9, 0.05, 0.04), new THREE.MeshPhysicalMaterial({
      color: 0xd8c6b4, roughness: 0.18, transmission: 0.86, transparent: true,
      opacity: 0.34, thickness: 0.12,
    }), { z: 0.03 });
    door.add(pane);
    door.add(mesh(cyl(0.05, 0.05, 0.26, 8), metal(PALETTE.steel), { x: 0.68, z: 0.1, rx: Math.PI / 2 }));
    this.body.add(door);
    this._pane = pane;

    // Hanging hook and rail inside.
    this.body.add(mesh(cyl(0.03, 0.03, 1.7, 8), metal(PALETTE.steelDark), { y: 1.86, rz: Math.PI / 2 }));
    const hook = new THREE.Group();
    hook.position.set(0, 1.80, 0.08);
    hook.add(mesh(cyl(0.022, 0.022, 0.34, 6), metal(PALETTE.steel), { y: -0.17 }));
    hook.add(mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 14, Math.PI * 1.4), metal(PALETTE.steel), { y: -0.4, rx: Math.PI / 2 }));
    this.body.add(hook);
    this.hook = hook;

    // Firebox under the hut, with embers that brighten on every good beat.
    const fire = new THREE.Group();
    fire.position.set(0, 0.42, 0.2);
    fire.add(mesh(roundedBox(1.5, 0.42, 1.0, 0.05), brickDark));
    for (let i = 0; i < 5; i++) {
      fire.add(mesh(cyl(0.06, 0.05, 0.9, 6), matte(0x6d4c41, 0.9),
        { x: -0.5 + i * 0.25, y: 0.06, rz: Math.PI / 2, ry: (i - 2) * 0.12 }));
    }
    const emberMat = hot(0xff7043, 0.6);
    this.embers = [];
    for (let i = 0; i < 7; i++) {
      const e = mesh(sphere(0.09, 8, 6), emberMat.clone(),
        { x: -0.52 + i * 0.18, y: 0.1, z: (i % 2) * 0.18 - 0.09, cast: false });
      fire.add(e);
      this.embers.push(e);
    }
    this.body.add(fire);
    const fireLight = new THREE.PointLight(0xff8a50, 0, 4, 2);
    fireLight.position.set(0, 0.6, 0.4);
    this.body.add(fireLight);
    this.fireLight = fireLight;

    // The bellows on the side: what the rhythm widget is operating.
    const bellows = new THREE.Group();
    bellows.position.set(-1.15, 0.66, 0.35);
    bellows.add(mesh(roundedBox(0.5, 0.3, 0.42, 0.08), timber, { y: 0.0 }));
    const handle = mesh(roundedBox(0.5, 0.12, 0.42, 0.05), matte(0x7a5230, 0.85), { y: 0.24 });
    bellows.add(handle);
    bellows.add(mesh(cyl(0.05, 0.05, 0.38, 8), metal(PALETTE.steelDark), { x: 0.32, y: 0.02, rz: Math.PI / 2 }));
    this.body.add(bellows);
    this.bellowsHandle = handle;

    // Smoke that rolls out of the chimney as the beats land.
    this.smoke = [];
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xd7ccc8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
    });
    for (let i = 0; i < 12; i++) {
      const puff = mesh(sphere(0.16 + Math.random() * 0.12, 10, 8), smokeMat.clone(), { cast: false, receive: false });
      puff.visible = false;
      this.body.add(puff);
      this.smoke.push({ mesh: puff, t: 1, drift: (Math.random() - 0.5) * 0.5 });
    }

    this._heat = 0;
    this._hanging = false;
    this._hangT = 0;
    this._beats = 0;
  }

  getSteps() {
    const m = METHODS.smoking;
    return [
      { kind: 'tap', id: 'hang', textKey: 'station.smoking.hang', icon: 'hook' },
      {
        kind: 'rhythm', id: 'bellows', textKey: 'station.smoking.bellows', icon: 'bellows',
        beats: m.beats || 5, periodMs: 900,
      },
    ];
  }

  onStepProgress(index, progress) {
    if (index !== 1) return;
    // Each landed beat feeds the fire, and the food dries with it.
    if (progress > this._beats + 0.0001) {
      this._puff(3);
      this._heat = Math.min(1, this._heat + 0.28);
    }
    this._beats = progress;
    if (this.food) {
      // Shrinks as the smoke takes the water out — the same visible mechanism
      // the drying rack uses, on purpose. §5H is drying by another route.
      this.food.model.scale.setScalar(this.food.baseScale * (1 - progress * 0.15));
      this.food.swarm.setActivity(1 - progress * 0.85);
    }
  }

  onStepDone(index) {
    if (index === 0) { this._hanging = true; this._hangT = 0; }
  }

  _puff(n = 2) {
    let made = 0;
    for (const s of this.smoke) {
      if (made >= n) break;
      if (s.t < 1) continue;
      s.t = 0;
      s.x = 0.52 + (Math.random() - 0.5) * 0.2;
      s.z = -0.2 + (Math.random() - 0.5) * 0.2;
      made++;
    }
  }

  async playSuccess() {
    this._puff(6);
    this._heat = 1;
    await new Promise((r) => setTimeout(r, 700));
  }

  resetVisuals() {
    this._heat = 0;
    this._hanging = false;
    this._beats = 0;
    this.fireLight.intensity = 0;
    for (const e of this.embers) e.material.emissiveIntensity = 0.15;
  }

  tick(dt, elapsed) {
    // Embers breathe with the fire, and fade between beats: the fire needs you.
    this._heat = Math.max(0, this._heat - dt * 0.14);
    const glow = 0.15 + this._heat * 2.2 + Math.sin(elapsed * 7) * 0.12 * this._heat;
    for (const e of this.embers) e.material.emissiveIntensity = glow;
    this.fireLight.intensity = this._heat * 3.4;
    if (this.bellowsHandle) this.bellowsHandle.position.y = 0.24 - this._heat * 0.06;

    for (const s of this.smoke) {
      if (s.t >= 1) { s.mesh.visible = false; continue; }
      s.t += dt * 0.42;
      s.mesh.visible = true;
      s.mesh.position.set(s.x + s.drift * s.t, 2.96 + s.t * 1.5, s.z + s.drift * 0.4 * s.t);
      s.mesh.scale.setScalar(0.5 + s.t * 1.9);
      s.mesh.material.opacity = 0.5 * (1 - s.t);
    }

    if (this._hanging && this.food) {
      this._hangT += dt;
      const target = this.root.localToWorld(new THREE.Vector3(0, 1.48, 0.10));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
      this.food.group.rotation.z = Math.sin(elapsed * 1.6) * 0.08;
    }
  }
}
