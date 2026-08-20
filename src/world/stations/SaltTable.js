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
import { plastic, metal, matte, roundedBox, cyl, sphere, blob, mesh } from '../Materials.js';

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
    const scoopSalt = mesh(sphere(0.13, 10, 7), new THREE.MeshBasicMaterial({
      color: 0xfffdf4, toneMapped: false,
    }), { y: 0.075, cast: false, receive: false });
    scoopSalt.scale.set(1, 0.3, 1);
    scoopSalt.visible = false;
    scoop.add(scoopSalt);
    scoop.add(mesh(cyl(0.03, 0.03, 0.4, 8), plastic(PALETTE.saltingDeep), { x: 0.24, y: 0.12, rz: -0.7 }));
    this.scoop = scoop;
    this.scoopSalt = scoopSalt;
    this.body.add(scoop);

    // Fact Book autoplay has no gameplay food, so supply a cheap procedural
    // fillet. Without it the scoop and moisture animated around empty space.
    const demoFood = new THREE.Group();
    demoFood.position.set(0.15, 1.43, 0.48);
    demoFood.add(mesh(blob(0.53, 0.13, 0.31, 14, 8), matte(0xd97845, 0.82), { cast: false }));
    for (const z of [-0.13, 0, 0.13]) {
      demoFood.add(mesh(roundedBox(0.34, 0.018, 0.025, 0.01), matte(0xf3aa72, 0.9),
        { x: 0.02, y: 0.125, z, ry: -0.18, cast: false, receive: false }));
    }
    demoFood.visible = false;
    this.demoFood = demoFood;
    this.body.add(demoFood);

    // Three broad coating patches communicate coverage more clearly (and in
    // three draw calls) than forty independent grains floating around a food.
    const saltPatchMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c2, toneMapped: false, transparent: true, opacity: 0.96,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.saltPatches = [[-0.18, -0.1], [0.12, 0.08], [0.27, -0.12]].map(([x, z], i) => {
      const patch = mesh(new THREE.CircleGeometry(0.22 - i * 0.025, 14), saltPatchMat,
        { x: 0.15 + x, y: 1.57, z: 0.48 + z, rx: -Math.PI / 2, cast: false, receive: false });
      patch.visible = false;
      patch.renderOrder = 3;
      this.body.add(patch);
      return patch;
    });

    // One instanced mesh makes the pour chunky and visible at mobile size while
    // keeping all eight grains in a single draw call.
    const streamGeometry = new THREE.BoxGeometry(0.065, 0.065, 0.065);
    const streamGrains = new THREE.InstancedMesh(streamGeometry, new THREE.MeshBasicMaterial({
      color: 0xfff2c2, toneMapped: false, transparent: true, opacity: 0.98, depthWrite: false,
    }), 8);
    const streamMatrix = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      streamMatrix.makeTranslation(
        ((i % 3) - 1) * 0.045,
        -0.08 - i * 0.07,
        (((i * 2) % 3) - 1) * 0.035
      );
      streamGrains.setMatrixAt(i, streamMatrix);
    }
    streamGrains.instanceMatrix.needsUpdate = true;
    streamGrains.frustumCulled = false;
    const saltStream = new THREE.Group();
    saltStream.add(streamGrains);
    saltStream.add(mesh(cyl(0.045, 0.075, 0.48, 7), new THREE.MeshBasicMaterial({
      color: 0xfff2c2, toneMapped: false, transparent: true, opacity: 0.72, depthWrite: false,
    }), { y: -0.29, cast: false, receive: false }));
    this.saltStream = saltStream;
    this.saltStream.visible = false;
    this.saltStream.renderOrder = 4;
    this.body.add(this.saltStream);

    // Four large water beads are easier to read than fourteen tiny droplets.
    this.beads = [];
    const beadMat = new THREE.MeshBasicMaterial({
      color: 0x55bde9, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const b = mesh(sphere(0.075, 8, 6), beadMat.clone(), { cast: false, receive: false });
      b.visible = false;
      this.body.add(b);
      this.beads.push({ mesh: b, t: 1 });
    }

    this.moisturePuddle = mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshBasicMaterial({
      color: 0x55bde9, toneMapped: false, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false,
    }), { x: 0.75, y: 1.225, z: 0.49, rx: -Math.PI / 2, cast: false, receive: false });
    this.moisturePuddle.visible = false;
    this.moisturePuddle.renderOrder = 2;
    this.body.add(this.moisturePuddle);

    this._coverage = 0;
    this._rawProgress = 0;
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'scoop', textKey: 'station.salting.scoop', icon: 'salt' },
      { kind: 'scrub', id: 'spread', textKey: 'station.salting.spread', icon: 'hand', reps: 6,
        ms: 2200, meterKey: 'methods.salting.coverage' },
    ];
  }

  onStepProgress(index, progress) {
    if (index !== 1) return;
    this._rawProgress = progress;
    this._coverage = THREE.MathUtils.clamp((progress - 0.18) / 0.82, 0, 1);

    // Coverage grows in three overlapping areas while the scoop rubs.
    for (const [i, patch] of this.saltPatches.entries()) {
      const p = THREE.MathUtils.clamp((this._coverage - i * 0.18) / 0.52, 0, 1);
      patch.visible = p > 0;
      patch.scale.setScalar(0.3 + p * 0.85);
    }
    this.saltStream.visible = progress > 0.1 && progress < 0.36;
    this.scoopSalt.visible = progress < 0.36;

    // Water leaves the food in proportion to salt applied.
    const wetCount = Math.min(this.beads.length, Math.floor(this._coverage * (this.beads.length + 1)));
    for (let i = 0; i < wetCount; i++) {
      const b = this.beads[i];
      if (b.t >= 1) { b.t = 0; b.a = Math.random() * Math.PI * 2; }
    }
    this.moisturePuddle.visible = this._coverage > 0.3;
    this.moisturePuddle.scale.setScalar(0.25 + this._coverage * 0.9);

    if (this.food) {
      // Food shrinks slightly as moisture is drawn out.
      this.food.model.scale.setScalar(this.food.baseScale * (1 - progress * 0.11));
      this.food.model.rotation.z = Math.sin(progress * Math.PI * 12) * 0.06;  // being rubbed
    }
  }

  onStepDone(index) {
    if (index === 0) {
      this._scooping = true;
      this._scoopT = 0;
      this.scoopSalt.visible = true;
    }
  }

  /** Give Fact Book autoplay the food that gameplay normally docks here. */
  beginAutoplay() {
    this._demoActive = true;
    this.demoFood.visible = true;
  }

  async playSuccess() {
    // Hold the completed coating and puddle long enough to read the outcome.
    await new Promise((r) => setTimeout(r, 900));
  }

  resetVisuals() {
    this._coverage = 0;
    this._rawProgress = 0;
    this._scooping = false;
    this._demoActive = false;
    this.demoFood.visible = false;
    this.demoFood.scale.setScalar(1);
    this.scoop.position.set(-0.62, 1.55, 0.35);
    this.scoop.rotation.set(0, 0, 0);
    this.saltStream.visible = false;
    this.scoopSalt.visible = false;
    for (const patch of this.saltPatches) { patch.visible = false; patch.scale.setScalar(1); }
    for (const b of this.beads) { b.t = 1; b.mesh.visible = false; }
    this.moisturePuddle.visible = false;
    this.moisturePuddle.scale.setScalar(1);
  }

  tick(dt, elapsed) {
    this.saltHeap.scale.setScalar(1 - this._coverage * 0.22);

    if (this._scooping && this._rawProgress < 0.34) {
      this._scoopT = Math.min(1, this._scoopT + dt * 1.8);
      const p = this._scoopT;
      this.scoop.position.set(
        THREE.MathUtils.lerp(-0.62, 0.15, p),
        1.55 + Math.sin(p * Math.PI) * 0.4,
        THREE.MathUtils.lerp(0.35, 0.48, p)
      );
      this.scoop.rotation.z = -p * 2.2;
    } else if (this._coverage > 0) {
      // Once poured, the scoop makes an unmistakable left-right rubbing pass.
      const rub = Math.sin(elapsed * 11);
      this.scoop.position.set(0.15 + rub * 0.32 * (this._coverage < 1 ? 1 : 0), 1.7, 0.48);
      this.scoop.rotation.set(0, 0, -1.15 + rub * 0.16);
    }
    if (this.saltStream.visible) {
      this.saltStream.position.set(this.scoop.position.x, this.scoop.position.y - 0.03, this.scoop.position.z);
    }

    if (this._demoActive) {
      const shrink = 1 - this._coverage * 0.08;
      this.demoFood.scale.set(shrink, 1 - this._coverage * 0.14, shrink);
    }

    // Food position while being salted
    if (this.food && (this._scooping || this._coverage > 0)) {
      const target = this.root.localToWorld(new THREE.Vector3(0.15, 1.42, 0.48));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
    }

    for (const b of this.beads) {
      if (b.t >= 1) { b.mesh.visible = false; continue; }
      b.t += dt * 1.6;
      b.mesh.visible = true;
      const p = b.t;
      b.mesh.position.set(
        0.38 + p * 0.55,
        1.54 - p * 0.38,
        0.48 + Math.sin(b.a) * 0.25
      );
      const s = 1 - p * 0.7;
      b.mesh.scale.set(s, s * 1.4, s);
      b.mesh.material.opacity = 0.9 * (1 - p * 0.9);
    }
  }
}
