/**
 * A food item on the counter.
 *
 * Three visual states, all required by the brief and all sourced from §2 of the
 * notes ("changes colour, changes texture, becomes mouldy"):
 *   FRESH      saturated colour, happy face, few slow microorganisms
 *   SPOILING   desaturating, mould patches growing, stink wisps, sick face,
 *              microorganisms multiplying and speeding up
 *   PRESERVED  a method-specific finish (frost / vacuum bag / salt crust / …)
 *              so the child can later look at a preserved item and name the
 *              method that produced it.
 */
import * as THREE from 'three';
import { PALETTE } from './Palette.js';
import { applySpoil, matte, plastic, glass, sphere, cyl, blob, roundedBox, torus, mesh, blobShadow, clearcoatFor } from './Materials.js';
import { buildFoodModel, setFaceForSpoil } from './FoodFactory.js';
import { MicrobeSwarm } from './Microbes.js';
import { FOODS, FOOD_METHODS, METHODS } from '../content/curriculum.js';

let _uid = 0;

export class Food {
  constructor(foodId, { spoilRate = 0.055, showHint = false } = {}) {
    this.uid = ++_uid;
    this.foodId = foodId;
    this.def = FOODS[foodId];
    this.validMethods = FOOD_METHODS[foodId] || [];
    this.spoil = 0;
    this.spoilRate = spoilRate;
    this.state = 'idle';
    this.preservedBy = null;
    this.showHint = showHint;
    this._t = Math.random() * 10;

    this.group = new THREE.Group();
    this.group.name = `Food:${foodId}`;
    this.group.userData.food = this;

    this.model = buildFoodModel(this.def.model);
    // Global size multiplier: the wide two-column framing needs bigger food.
    this.baseScale = this.def.scale * 1.7;
    this.model.scale.setScalar(this.baseScale);
    this.group.add(this.model);

    this.radius = (this.model.userData.radius || 0.6) * this.baseScale;

    this.shadow = blobShadow(this.radius * 1.35, 0.7);
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    this.swarm = new MicrobeSwarm(this.group, { radius: this.radius * 1.28 });

    this._mould = [];
    this._buildMould();
    this._buildMeter();
  }

  // ------------------------------------------------------------------ build
  _buildMould() {
    // Fuzzy green patches that scale in with spoilage — the literal "becomes
    // mouldy" sign, and the most recognisable spoilage cue for a child.
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.mould, roughness: 0.98, metalness: 0,
      transparent: true, opacity: 0.95,
    });
    this._mouldMat = mat;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.7;
      const r = this.radius * 0.62;
      const patch = new THREE.Group();
      patch.position.set(Math.cos(a) * r, (i % 2 ? 0.22 : -0.05) * this.radius, Math.sin(a) * r * 0.8);
      for (let j = 0; j < 3; j++) {
        const s = 0.055 + j * 0.022;
        patch.add(mesh(sphere(s, 8, 6), mat, {
          x: (j - 1) * 0.06, y: (j % 2) * 0.04, z: (j - 1) * 0.03, cast: false, receive: false,
        }));
      }
      patch.scale.setScalar(0.001);
      this.model.add(patch);
      this._mould.push(patch);
    }
  }

  /**
   * ONE label per food, not two.
   *
   * The spoilage bar and the method hint were separate billboards; with four
   * items on the table that produced eight floating elements that overlapped
   * each other and the food. They are now a single compact plaque: method chip
   * on top (guided stages only), spoilage bar underneath, always aligned.
   */
  _buildMeter() {
    const W = 288, H = this.showHint ? 128 : 62;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    this._meterW = W; this._meterH = H;
    this._meterCtx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this._meterTex = tex;

    const wUnits = 1.05;
    const spr = new THREE.Mesh(
      new THREE.PlaneGeometry(wUnits, wUnits * (H / W)),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    );
    spr.position.y = this.radius + (this.showHint ? 0.46 : 0.34);
    spr.renderOrder = 10;
    this.meter = spr;
    this.group.add(spr);
    this._lastMeter = -1;
    this._drawMeter(0);
  }

  _drawMeter(v) {
    const ctx = this._meterCtx;
    const W = this._meterW, H = this._meterH;
    ctx.clearRect(0, 0, W, H);

    let by = 12;
    if (this.showHint) {
      const m = METHODS[this.def.primary];
      const hex = `#${m.colour.toString(16).padStart(6, '0')}`;
      ctx.fillStyle = hex;
      ctx.beginPath(); ctx.roundRect(8, 6, W - 16, 60, 28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.96)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.roundRect(8, 6, W - 16, 60, 28); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = (globalThis.__ppMethodName?.(m.id)) || m.id;
      let size = 38;
      ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      while (ctx.measureText(label).width > W - 52 && size > 15) {
        size -= 2; ctx.font = `800 ${size}px system-ui, sans-serif`;
      }
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillText(label, W / 2, 37);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      by = 78;
    }

    const pad = 22, bw = W - pad * 2, bh = 34;
    ctx.fillStyle = 'rgba(28,18,34,0.55)';
    ctx.beginPath(); ctx.roundRect(pad, by, bw, bh, 17); ctx.fill();
    ctx.fillStyle = 'rgba(255,252,246,0.96)';
    ctx.beginPath(); ctx.roundRect(pad + 3, by + 3, bw - 6, bh - 6, 14); ctx.fill();
    // green -> amber -> red: urgency readable without reading a number
    const col = v < 0.4 ? '#5cbf5f' : v < 0.72 ? '#f5a623' : '#ef3b3b';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(pad + 6, by + 6, Math.max(12, (bw - 12) * v), bh - 12, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.roundRect(pad + 6, by + 7, Math.max(12, (bw - 12) * v), (bh - 12) * 0.45, 9); ctx.fill();
    this._meterTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- gameplay
  isValidMethod(methodId) { return this.validMethods.includes(methodId); }

  /** Called when a station finishes its interaction successfully. */
  markPreserved(methodId) {
    this.state = 'preserved';
    this.preservedBy = methodId;
    this.spoilRate = 0;
    this.swarm.defeat(METHODS[methodId]?.microbeEffect || 'shrivel', 1400);
    this._applyPreservedLook(methodId);
  }

  markSpoilt() {
    this.state = 'spoilt';
    this.spoil = 1;
  }

  /**
   * The preserved finish. This is what makes Stage 4 recall possible: the child
   * has repeatedly seen "frosted = freezing", "shrink-wrapped = vacuum".
   */
  _applyPreservedLook(methodId) {
    const g = new THREE.Group();
    const r = this.radius;
    switch (methodId) {
      case 'drying': {
        // Shrunken and darker, with heat shimmer gone. Water has left.
        this.model.scale.multiplyScalar(0.82);
        for (const m of this.model.userData.skin || []) {
          m.color.multiplyScalar(0.82); m.roughness = 0.92; m.sheen = 0;
        }
        break;
      }
      case 'freezing': {
        // Frost shell + ice crystals.
        const frost = new THREE.MeshPhysicalMaterial({
          color: 0xdff3ff, roughness: 0.35, transparent: true, opacity: 0.42,
          clearcoat: clearcoatFor(1), clearcoatRoughness: 0.1,
        });
        g.add(mesh(sphere(r * 1.06, 18, 14), frost, { cast: false }));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          g.add(mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xeafaff, toneMapped: false }),
            { x: Math.cos(a) * r * 0.95, z: Math.sin(a) * r * 0.7, y: (i % 3 - 1) * r * 0.4, cast: false }));
        }
        break;
      }
      case 'vacuum': {
        // Shrink-wrapped film hugging the food, plus a sealed seam.
        const film = new THREE.MeshPhysicalMaterial({
          color: 0xdfe9f2, roughness: 0.12, transparent: true, opacity: 0.36,
          clearcoat: clearcoatFor(1), clearcoatRoughness: 0.04, side: THREE.DoubleSide,
        });
        const wrap = mesh(sphere(r * 1.02, 20, 14), film, { cast: false });
        wrap.scale.set(1.05, 0.92, 1.05);
        g.add(wrap);
        g.add(mesh(roundedBox(r * 2.3, 0.07, 0.1, 0.03), plastic(0xc7d4e0), { y: r * 0.95, cast: false }));
        break;
      }
      case 'pickling': {
        // Sitting in a sealed jar of solution.
        g.add(mesh(cyl(r * 1.15, r * 1.15, r * 2.3, 22), glass(0xc9e8b8, { opacity: 0.3 }), { y: r * 0.55, cast: false }));
        g.add(mesh(cyl(r * 1.18, r * 1.18, 0.16, 22), plastic(PALETTE.picklingDeep), { y: r * 1.78, cast: false }));
        g.add(mesh(cyl(r * 1.02, r * 1.02, r * 1.9, 20), new THREE.MeshPhysicalMaterial({
          color: 0xbfe08a, transparent: true, opacity: 0.34, roughness: 0.15,
        }), { y: r * 0.45, cast: false }));
        break;
      }
      case 'salting': {
        // A crust of salt grains clinging to the surface.
        const salt = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.85, metalness: 0 });
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const b = Math.acos(2 * Math.random() - 1);
          const rr = r * 0.98;
          g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), salt, {
            x: Math.sin(b) * Math.cos(a) * rr,
            y: Math.cos(b) * rr * 0.85,
            z: Math.sin(b) * Math.sin(a) * rr * 0.8,
            rx: Math.random() * 3, ry: Math.random() * 3, cast: false,
          }));
        }
        break;
      }
      case 'pasteurising': {
        // Clean, sealed, faintly glowing — heat treated, taste unchanged.
        g.add(mesh(sphere(r * 1.08, 18, 14), new THREE.MeshBasicMaterial({
          color: 0x9fe3ff, transparent: true, opacity: 0.16, toneMapped: false,
        }), { cast: false }));
        g.add(mesh(torus(r * 1.1, 0.045, 8, 26), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, toneMapped: false }),
          { rx: Math.PI / 2, y: r * 0.2, cast: false }));
        break;
      }
    }
    if (g.children.length) { this.preservedFinish = g; this.group.add(g); }
    // Mould disappears — preserved food is safe.
    for (const p of this._mould) p.scale.setScalar(0.001);
  }

  // ------------------------------------------------------------------ update
  update(dt, camera, spoilMultiplier = 1) {
    this._t += dt;

    if (this.state === 'idle' || this.state === 'held') {
      this.spoil = Math.min(1, this.spoil + dt * this.spoilRate * spoilMultiplier);
      // Microorganism activity IS the spoilage driver, not a parallel bar.
      this.swarm.setActivity(0.12 + this.spoil * 0.88);
      if (this.spoil >= 1) this.markSpoilt();
    }

    // --- material response
    for (const m of this.model.userData.skin || []) applySpoil(m, this.spoil);
    setFaceForSpoil(this.model.userData.face, this.spoil, this.state === 'preserved');

    // --- mould growth: starts at 35% spoilage, so early spoilage is subtle
    if (this.state !== 'preserved') {
      const mg = THREE.MathUtils.clamp((this.spoil - 0.35) / 0.55, 0, 1);
      for (let i = 0; i < this._mould.length; i++) {
        const target = mg > i / this._mould.length ? mg : 0.001;
        const p = this._mould[i];
        p.scale.setScalar(THREE.MathUtils.lerp(p.scale.x, Math.max(0.001, target), 1 - Math.pow(0.02, dt)));
      }
      this._mouldMat.opacity = 0.55 + mg * 0.45;
    }

    // --- idle life: fresh food bounces gently, spoilt food sags and shivers
    if (this.state !== 'preserved') {
      const vigour = 1 - this.spoil;
      this.model.position.y = Math.sin(this._t * 2.4) * 0.035 * vigour;
      this.model.rotation.z = Math.sin(this._t * 1.7) * 0.05 * vigour;
      if (this.spoil > 0.75) {
        this.model.position.x = Math.sin(this._t * 26) * 0.012;   // queasy shiver
      }
    } else {
      // Preserved: a slow proud rotation, and it sits still and safe.
      this.model.rotation.y += dt * 0.5;
      this.model.position.y = 0;
      this.model.rotation.z *= 0.9;
    }

    // --- meter
    if (this.meter) {
      const show = this.state === 'idle' || this.state === 'held';
      this.meter.visible = show;
      if (show && Math.abs(this.spoil - this._lastMeter) > 0.012) {
        this._lastMeter = this.spoil;
        this._drawMeter(this.spoil);
      }
      if (show && camera) this.meter.quaternion.copy(camera.quaternion);
    }

    // --- face + microbes always billboard toward the camera
    if (camera && this.model.userData.face) {
      this.model.userData.face.quaternion.copy(camera.quaternion);
    }
    this.swarm.update(dt, camera);

    if (this.shadow) {
      const lift = Math.max(0, this.group.position.y - 1.5);
      this.shadow.material.opacity = 0.7 / (1 + lift * 1.6);
      this.shadow.scale.setScalar(1 + lift * 0.35);
      this.shadow.position.y = -this.group.position.y + 1.55;
    }
  }

  dispose() {
    this.swarm.dispose();
    this.group.removeFromParent();
    this._meterTex?.dispose();
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
  }
}
