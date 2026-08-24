import * as THREE from 'three';
import { MicrobeSwarm } from './Microbes.js';

/**
 * Fixed screen-space hiding places for the title-screen scanner. Keeping the
 * coordinates here makes the 3D microbes and the DOM hit targets share one
 * source of truth at every aspect ratio.
 */
export const MENU_MICROBE_TARGETS = Object.freeze([
  Object.freeze({ x: 0.17, y: 0.36, scale: 0.82 }),
  Object.freeze({ x: 0.82, y: 0.38, scale: 0.76 }),
  Object.freeze({ x: 0.78, y: 0.78, scale: 0.88 }),
]);

/** Camera-attached microbes that are only visible on the title screen. */
export class MenuMicrobes {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'MenuMicrobes';
    this.root.visible = false;
    camera.add(this.root);

    this.entries = MENU_MICROBE_TARGETS.map((target, index) => {
      const host = new THREE.Group();
      host.name = `MenuMicrobe${index + 1}`;
      this.root.add(host);
      const swarm = new MicrobeSwarm(host, { radius: 0.08, max: 1 });
      swarm.setActivity(0.94);
      return { target, host, swarm, foundAt: null };
    });
    this._visible = false;
    this._scanned = -1;
    this._elapsed = 0;
    this._layout();
  }

  get foundIndices() {
    return this.entries.flatMap((entry, index) => entry.foundAt == null ? [] : [index]);
  }

  reset() {
    this._elapsed = 0;
    this._scanned = -1;
    for (const entry of this.entries) {
      entry.foundAt = null;
      entry.host.visible = false;
      entry.swarm.reset();
      entry.swarm.setActivity(0.94);
    }
  }

  setVisible(visible) {
    this._visible = !!visible;
    this.root.visible = this._visible;
  }

  markFound(index) {
    const entry = this.entries[index];
    if (!entry || entry.foundAt != null) return false;
    entry.foundAt = this._elapsed;
    entry.swarm.defeat('zap', 560);
    return true;
  }

  setScanned(index) {
    this._scanned = Number.isInteger(index) ? index : -1;
  }

  update(dt) {
    if (!this._visible) return;
    this._elapsed += dt;
    this._layout();

    for (let index = 0; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (entry.foundAt != null && this._elapsed - entry.foundAt > 0.62) {
        entry.host.visible = false;
        continue;
      }
      entry.host.visible = entry.foundAt != null || index === this._scanned;
      if (!entry.host.visible) continue;
      entry.swarm.update(dt, null);
    }
  }

  _layout() {
    const depth = 7;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * depth;
    const halfWidth = halfHeight * this.camera.aspect;
    for (const entry of this.entries) {
      const { x, y, scale } = entry.target;
      entry.host.position.set((x * 2 - 1) * halfWidth, (1 - y * 2) * halfHeight, -depth);
      entry.host.scale.setScalar(scale);
    }
  }
}
