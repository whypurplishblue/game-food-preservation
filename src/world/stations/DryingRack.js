/**
 * DRYING — "removes water" (§5B).
 *
 * Interaction: hang the food on a hook, then SWEEP the sun across the sky.
 * The sweep is deliberately a wide horizontal drag, so the child's hand
 * physically performs "sun passes over the food" — and water droplets stream
 * off the food in time with the drag. The water leaving is driven by the
 * player's own motion, which is the point: they cause the water loss.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, roundedBox, cyl, sphere, torus, blob, mesh, clearcoatFor } from '../Materials.js';

export class DryingRack extends Station {
  build() {
    const wood = matte(PALETTE.woodDark, 0.8);
    const woodL = matte(PALETTE.wood, 0.78);

    // A-frame uprights — a strong, instantly readable silhouette.
    for (const s of [-1, 1]) {
      for (const z of [-0.55, 0.55]) {
        const leg = mesh(cyl(0.075, 0.09, 2.15, 10), wood, { x: s * 0.86, y: 1.14, z, rz: -s * 0.075 });
        this.body.add(leg);
      }
      this.body.add(mesh(roundedBox(0.13, 0.13, 1.35, 0.05), woodL, { x: s * 0.9, y: 0.62 }));
    }
    // Crossbars
    for (const z of [-0.55, 0.55]) {
      this.body.add(mesh(cyl(0.07, 0.07, 1.95, 10), woodL, { y: 2.16, z, rz: Math.PI / 2 }));
    }
    this.body.add(mesh(cyl(0.06, 0.06, 1.2, 8), woodL, { y: 2.16, rx: Math.PI / 2 }));

    // Hooks — the visible affordance for "hang it here".
    this.hooks = [];
    for (let i = -1; i <= 1; i++) {
      const h = new THREE.Group();
      h.position.set(i * 0.52, 2.1, 0);
      h.add(mesh(cyl(0.018, 0.018, 0.3, 6), metal(PALETTE.steel), { y: -0.15 }));
      h.add(mesh(torus(0.08, 0.02, 6, 14), metal(PALETTE.steel), { y: -0.32, rx: 0.2 }));
      this.body.add(h);
      this.hooks.push(h);
    }

    // Fish already hanging on the outer hooks. Without these the rack reads as
    // an empty swing frame; with them a child can name the machine on sight,
    // which is exactly what Stage 4 asks them to do once the labels come off.
    const dried = matte(0xa9722f, 0.86);
    const driedDark = matte(0x704819, 0.86);
    for (const i of [-1, 1]) {
      const f = new THREE.Group();
      // Hung horizontally: a vertical ellipsoid reads as a bottle, a horizontal
      // one with a fork tail reads as a fish even at thumbnail size.
      f.position.set(i * 0.5, 1.58, 0);
      f.rotation.z = i * 0.05;
      f.add(mesh(cyl(0.008, 0.008, 0.36, 5), metal(PALETTE.steel), { y: 0.34 }));
      f.add(mesh(blob(0.42, 0.19, 0.12, 16, 12), dried, {}));
      f.add(mesh(blob(0.34, 0.07, 0.1, 12, 8), driedDark, { y: 0.13 }));
      for (const s2 of [1, -1]) {
        const lobe = mesh(new THREE.ConeGeometry(0.13, 0.26, 3), driedDark,
          { x: -0.46, y: s2 * 0.09, rz: Math.PI / 2 + s2 * 0.45 });
        lobe.scale.set(1, 1, 0.3);
        f.add(lobe);
      }
      f.add(mesh(sphere(0.035, 8, 6), matte(0xfdfdfd), { x: 0.3, y: 0.05, z: 0.08, cast: false }));
      f.add(mesh(sphere(0.018, 6, 5), matte(0x2b1d33), { x: 0.32, y: 0.05, z: 0.11, cast: false }));
      this.body.add(f);
    }

    // Slatted drying tray beneath, catching what drips.
    for (let i = 0; i < 7; i++) {
      this.body.add(mesh(roundedBox(1.7, 0.045, 0.09, 0.02), woodL, { y: 0.52, z: -0.42 + i * 0.14 }));
    }
    // Two more drying on the tray, so the process is legible even at rest.
    for (const i of [-1, 1]) {
      this.body.add(mesh(blob(0.28, 0.055, 0.12, 14, 10), dried, { x: i * 0.42, y: 0.6, z: -0.05, ry: i * 0.3 }));
      this.body.add(mesh(new THREE.ConeGeometry(0.09, 0.14, 3), driedDark,
        { x: i * 0.42 - i * 0.34, y: 0.6, z: -0.05 - i * 0.1, rz: Math.PI / 2 }));
    }

    // The sun — the hero prop, and the thing the player drags.
    const sun = new THREE.Group();
    sun.position.set(-1.15, 2.1, 0.62);
    const core = mesh(sphere(0.3, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd54f, toneMapped: false }), { cast: false });
    sun.add(core);
    const halo = mesh(sphere(0.44, 18, 12), new THREE.MeshBasicMaterial({
      color: 0xffb300, transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false,
    }), { cast: false });
    sun.add(halo);
    this.rays = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const ray = mesh(new THREE.ConeGeometry(0.055, 0.24, 4),
        new THREE.MeshBasicMaterial({ color: 0xffca28, toneMapped: false }),
        { x: Math.cos(a) * 0.44, y: Math.sin(a) * 0.44, rz: a - Math.PI / 2, cast: false });
      sun.add(ray); this.rays.push(ray);
    }
    const sunLight = new THREE.PointLight(0xffcc66, 0, 5, 2);
    sun.add(sunLight);
    this.sunLight = sunLight;
    this.sun = sun;
    this.body.add(sun);

    // Water droplets that leave the food during the sweep.
    this.drops = [];
    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fdcff, roughness: 0.05, transparent: true, opacity: 0.9,
      clearcoat: clearcoatFor(1), transmission: 0, metalness: 0,
    });
    for (let i = 0; i < 18; i++) {
      const d = mesh(sphere(0.055, 8, 6), dropMat, { cast: false, receive: false });
      d.scale.set(1, 1.35, 1);
      d.visible = false;
      this.body.add(d);
      this.drops.push({ mesh: d, t: 1, x: 0, z: 0 });
    }

    // Heat shimmer plane, faded in as the sun does its work.
    this.shimmer = mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
    }), { y: 1.5, z: 0.3, cast: false, receive: false });
    this.body.add(this.shimmer);

    this._hangY = 1.62;
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'hang', textKey: 'station.drying.hang', icon: 'hook' },
      { kind: 'sweep', id: 'sun', textKey: 'station.drying.sweep', icon: 'sun', sweeps: 2 },
    ];
  }

  onStepProgress(index, progress) {
    if (index === 0) return;
    // Sun tracks the sweep. The player moves the sun; the sun removes the water.
    const x = THREE.MathUtils.lerp(-1.15, 1.15, progress);
    this.sun.position.x = x;
    this.sun.position.y = 2.1 + Math.sin(progress * Math.PI) * 0.35;
    this.sunLight.intensity = 6 + Math.sin(progress * Math.PI) * 8;
    this.shimmer.material.opacity = 0.06 + Math.sin(progress * Math.PI) * 0.2;

    // Emit droplets in proportion to how far the sweep has advanced.
    const want = Math.floor(progress * this.drops.length);
    for (let i = 0; i < want; i++) {
      const d = this.drops[i];
      if (d.t >= 1) {
        d.t = 0;
        d.x = (Math.random() - 0.5) * 0.7;
        d.z = (Math.random() - 0.5) * 0.5;
      }
    }
    if (this.food) {
      // Food visibly shrinks as water leaves — this IS the mechanism.
      const s = this.food.baseScale * (1 - progress * 0.17);
      this.food.model.scale.setScalar(s);
    }
  }

  onStepDone(index) {
    if (index === 0 && this.food) {
      // Hang animation: food rises to the hook and swings.
      this._hanging = true;
      this._hangT = 0;
    }
  }

  async playSuccess() {
    this._success = 0;
    await new Promise((r) => setTimeout(r, 650));
  }

  resetVisuals() {
    this.sun.position.set(-1.15, 2.1, 0.62);
    this.sunLight.intensity = 0;
    this.shimmer.material.opacity = 0;
    this._hanging = false;
    for (const d of this.drops) { d.t = 1; d.mesh.visible = false; }
  }

  tick(dt, elapsed) {
    // Idle sun shimmer so the machine is never a dead prop.
    for (let i = 0; i < this.rays.length; i++) {
      this.rays[i].scale.setScalar(1 + Math.sin(elapsed * 3 + i * 0.6) * 0.16);
    }
    this.sun.rotation.z += dt * 0.25;

    // Falling / evaporating droplets.
    for (const d of this.drops) {
      if (d.t >= 1) { d.mesh.visible = false; continue; }
      d.t += dt * 1.5;
      d.mesh.visible = true;
      const p = d.t;
      d.mesh.position.set(
        d.x + Math.sin(p * 6 + d.z * 10) * 0.06,
        this._hangY + 0.25 - p * 0.95,
        d.z
      );
      // Shrink as they "evaporate" rather than just falling out of view.
      const s = 1 - p * 0.85;
      d.mesh.scale.set(s, s * 1.35, s);
      d.mesh.material.opacity = 0.9 * (1 - p);
    }

    // Hanging food sway.
    if (this._hanging && this.food) {
      this._hangT += dt;
      const swing = Math.sin(this._hangT * 3.2) * Math.exp(-this._hangT * 1.2) * 0.28;
      this.food.model.rotation.z = swing;
      const world = this.root.localToWorld(new THREE.Vector3(0, this._hangY, 0));
      this.food.group.position.lerp(world, 1 - Math.pow(0.005, dt));
    }
  }
}
