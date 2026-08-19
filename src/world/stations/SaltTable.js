/**
 * SALTING — "removes moisture from food" (§5F).
 *
 * Interaction: scoop salt → SCRUB it over the food until fully covered.
 *
 * The scrub is a back-and-forth rub, the only gesture of its kind in the game.
 * §5F stresses "a LARGE QUANTITY of salt", so coverage must be worked up to
 * rather than granted by one tap — the effort is the memory hook. Water beads
 * are drawn out of the food and run off as coverage rises, which is the
 * mechanism (§5F: "salt removes moisture") shown rather than stated.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, roundedBox, cyl, sphere, torus, blob, mesh, clearcoatFor } from '../Materials.js';

export class SaltTable extends Station {
  build() {
    const wood = matte(0xb5794a, 0.82);
    const red = plastic(PALETTE.salting, { rough: 0.42, clearcoat: 0.55 });

    // A rustic prep table — deliberately the least "machine-like" station,
    // because salting is a hand process, not an appliance.
    this.body.add(mesh(roundedBox(2.3, 0.16, 1.5, 0.06), wood, { y: 1.12 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.body.add(mesh(roundedBox(0.16, 1.0, 0.16, 0.05), matte(0x8f5f39, 0.85),
        { x: sx * 0.98, z: sz * 0.6, y: 0.62 }));
    }
    this.body.add(mesh(roundedBox(2.3, 0.1, 0.1, 0.04), red, { y: 1.21, z: 0.72 }));

    // A deep tray of salt — the "large quantity" made visible.
    const tray = new THREE.Group();
    tray.position.set(-0.6, 1.2, 0.0);
    // Open wooden crate: four walls, so the salt inside is visible as a mass.
    const crateMat = matte(0xa9713c, 0.8);
    tray.add(mesh(roundedBox(1.35, 0.1, 1.1, 0.04), crateMat, { y: 0.05 }));
    for (const [dx, dz, w, d] of [[0, -0.55, 1.35, 0.1], [0, 0.55, 1.35, 0.1], [-0.68, 0, 0.1, 1.1], [0.68, 0, 0.1, 1.1]]) {
      tray.add(mesh(roundedBox(w, 0.5, d, 0.04), crateMat, { x: dx, z: dz, y: 0.28 }));
    }
    const saltMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfd, roughness: 0.9, metalness: 0 });
    const heap = mesh(blob(0.66, 0.42, 0.54, 20, 14), saltMat, { y: 0.44 });
    tray.add(heap);
    // visible grains on the heap so it reads as salt, not snow
    for (let i = 0; i < 30; i++) {
      tray.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), saltMat, {
        x: (Math.random() - 0.5) * 1.05, z: (Math.random() - 0.5) * 0.85,
        y: 0.34 + Math.random() * 0.2, rx: Math.random() * 3, ry: Math.random() * 3, cast: false,
      }));
    }
    this.body.add(tray);
    this.saltHeap = heap;

    // Big salt shaker, the recognition silhouette for this station.
    const shaker = new THREE.Group();
    shaker.position.set(0.86, 1.2, -0.3);
    shaker.add(mesh(cyl(0.26, 0.32, 0.72, 16), plastic(0xfbfbfd, { rough: 0.35 }), { y: 0.36 }));
    shaker.add(mesh(cyl(0.27, 0.27, 0.2, 16), metal(PALETTE.steel), { y: 0.8 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      shaker.add(mesh(cyl(0.022, 0.022, 0.05, 6), matte(0x6b737d), { x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1, y: 0.9, cast: false }));
    }
    shaker.add(mesh(roundedBox(0.24, 0.24, 0.02, 0.01), red, { y: 0.36, z: 0.31, cast: false }));
    this.shaker = shaker;
    this.body.add(shaker);

    // The scoop, which flies to the food when the player scoops.
    const scoop = new THREE.Group();
    scoop.position.set(-0.62, 1.55, 0.35);
    const bowl = mesh(sphere(0.17, 14, 10), metal(PALETTE.steel), {});
    bowl.scale.set(1, 0.55, 1);
    scoop.add(bowl);
    scoop.add(mesh(cyl(0.03, 0.03, 0.4, 8), plastic(PALETTE.saltingDeep), { x: 0.24, y: 0.12, rz: -0.7 }));
    this.scoop = scoop;
    this.body.add(scoop);

    // Salt grains that stick to the food as it gets covered.
    this.grains = [];
    const grainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    for (let i = 0; i < 40; i++) {
      const g = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), grainMat, { cast: false, receive: false });
      g.visible = false;
      this.body.add(g);
      this.grains.push(g);
    }

    // Water beads drawn OUT of the food — the mechanism.
    this.beads = [];
    const beadMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fdcff, roughness: 0.05, transparent: true, opacity: 0.9, clearcoat: clearcoatFor(1), metalness: 0,
    });
    for (let i = 0; i < 14; i++) {
      const b = mesh(sphere(0.05, 8, 6), beadMat.clone(), { cast: false, receive: false });
      b.visible = false;
      this.body.add(b);
      this.beads.push({ mesh: b, t: 1 });
    }

    // Coverage ring around the food, filling as the child rubs.
    this.coverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.76, 40, 1, -Math.PI / 2, 0.001),
      new THREE.MeshBasicMaterial({ color: PALETTE.salting, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false })
    );
    this.coverRing.rotation.x = -Math.PI / 2;
    this.coverRing.position.set(0.1, 1.26, 0.2);
    this.coverRing.visible = false;
    this.coverRing.renderOrder = 3;
    this.body.add(this.coverRing);

    this._coverage = 0;
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'scoop', textKey: 'station.salting.scoop', icon: 'salt' },
      { kind: 'scrub', id: 'spread', textKey: 'station.salting.spread', icon: 'hand', reps: 6, meterKey: 'methods.salting.coverage' },
    ];
  }

  onStepProgress(index, progress) {
    if (index !== 1) return;
    this._coverage = progress;

    // Coverage ring sweeps round like a progress dial. Rebuilt only when the
    // arc changes by a visible amount — regenerating a BufferGeometry on every
    // pointermove allocated (and leaked) one per frame.
    this.coverRing.visible = true;
    if (Math.abs(progress - (this._ringAt ?? -1)) > 0.03) {
      this._ringAt = progress;
      this.coverRing.geometry.dispose();
      this.coverRing.geometry = new THREE.RingGeometry(0.62, 0.76, 40, 1, -Math.PI / 2, Math.max(0.001, progress * Math.PI * 2));
    }

    // Grains accumulate on the food surface.
    const want = Math.floor(progress * this.grains.length);
    for (let i = 0; i < this.grains.length; i++) {
      const g = this.grains[i];
      const on = i < want;
      g.visible = on;
      if (on && !g.userData.placed) {
        g.userData.placed = true;
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(2 * Math.random() - 1);
        const r = 0.42;
        g.userData.local = new THREE.Vector3(
          Math.sin(b) * Math.cos(a) * r,
          Math.cos(b) * r * 0.8,
          Math.sin(b) * Math.sin(a) * r * 0.85
        );
        g.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      }
    }

    // Water leaves the food in proportion to salt applied.
    for (let i = 0; i < Math.floor(progress * this.beads.length); i++) {
      const b = this.beads[i];
      if (b.t >= 1) { b.t = 0; b.a = Math.random() * Math.PI * 2; }
    }

    if (this.food) {
      // Food shrinks slightly as moisture is drawn out.
      this.food.model.scale.setScalar(this.food.baseScale * (1 - progress * 0.11));
      this.food.model.rotation.z = Math.sin(progress * Math.PI * 12) * 0.06;  // being rubbed
    }
  }

  onStepDone(index) {
    if (index === 0) { this._scooping = true; this._scoopT = 0; }
  }

  async playSuccess() {
    await new Promise((r) => setTimeout(r, 620));
  }

  resetVisuals() {
    this._coverage = 0;
    this._ringAt = -1;
    this._scooping = false;
    this.coverRing.visible = false;
    this.scoop.position.set(-0.62, 1.55, 0.35);
    this.scoop.rotation.set(0, 0, 0);
    for (const g of this.grains) { g.visible = false; g.userData.placed = false; }
    for (const b of this.beads) { b.t = 1; b.mesh.visible = false; }
  }

  tick(dt, elapsed) {
    this.shaker.rotation.y = Math.sin(elapsed * 0.7) * 0.15;
    this.saltHeap.scale.setScalar(1 - this._coverage * 0.22);

    if (this._scooping) {
      this._scoopT = Math.min(1, this._scoopT + dt * 1.8);
      const p = this._scoopT;
      this.scoop.position.set(
        THREE.MathUtils.lerp(-0.62, 0.1, p),
        1.55 + Math.sin(p * Math.PI) * 0.4,
        THREE.MathUtils.lerp(0.35, 0.2, p)
      );
      this.scoop.rotation.z = -p * 2.2;
    }
    if (this._coverage > 0) {
      // Scoop hovers and dabs in rhythm with the scrub.
      this.scoop.position.x = 0.1 + Math.sin(elapsed * 9) * 0.3 * (this._coverage < 1 ? 1 : 0);
      this.scoop.position.y = 1.75 + Math.abs(Math.sin(elapsed * 9)) * 0.1;
    }

    // Food position while being salted
    if (this.food && (this._scooping || this._coverage > 0)) {
      const target = this.root.localToWorld(new THREE.Vector3(0.1, 1.42, 0.2));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
      const fw = this.food.group.position;
      for (const g of this.grains) {
        if (g.visible && g.userData.local) {
          const l = g.userData.local;
          const w = this.root.worldToLocal(fw.clone());
          g.position.set(w.x + l.x, w.y + l.y, w.z + l.z);
        }
      }
    }

    for (const b of this.beads) {
      if (b.t >= 1) { b.mesh.visible = false; continue; }
      b.t += dt * 1.6;
      b.mesh.visible = true;
      const p = b.t;
      b.mesh.position.set(
        0.1 + Math.cos(b.a) * 0.42,
        1.42 + 0.2 - p * 0.55,
        0.2 + Math.sin(b.a) * 0.36
      );
      const s = 1 - p * 0.7;
      b.mesh.scale.set(s, s * 1.4, s);
      b.mesh.material.opacity = 0.9 * (1 - p * 0.9);
    }
  }
}
