/**
 * Pooled particle bursts and floating score popups.
 *
 * Everything is pre-allocated and reused — no allocation during play, which is
 * what keeps the frame time flat when a combo fires five bursts at once.
 */
import * as THREE from 'three';
import { PALETTE } from '../world/Palette.js';

// ---------------------------------------------------------------- particles

const POOL = 220;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide, vertexColors: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.count = POOL;
    const colours = new Float32Array(POOL * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
    scene.add(this.mesh);

    this.parts = [];
    for (let i = 0; i < POOL; i++) {
      this.parts.push({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.2, spin: 0, rot: 0, grav: -6, colour: new THREE.Color(),
        shrink: true,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  _take() {
    for (let i = 0; i < POOL; i++) if (!this.parts[i].alive) return this.parts[i];
    return this.parts[(Math.random() * POOL) | 0];   // steal the oldest-ish
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {object} o { count, colours[], speed, spread, size, life, grav, shrink }
   */
  burst(pos, o = {}) {
    const n = o.count ?? 22;
    const cols = o.colours ?? [PALETTE.gold, PALETTE.success, 0xffffff];
    for (let i = 0; i < n; i++) {
      const p = this._take();
      p.alive = true;
      p.x = pos.x + (Math.random() - 0.5) * (o.jitter ?? 0.2);
      p.y = pos.y + (Math.random() - 0.5) * (o.jitter ?? 0.2);
      p.z = pos.z + (Math.random() - 0.5) * (o.jitter ?? 0.2);
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.35) * Math.PI * (o.spread ?? 1);
      const sp = (o.speed ?? 4) * (0.5 + Math.random());
      p.vx = Math.cos(a) * Math.cos(b) * sp;
      p.vy = Math.sin(b) * sp + (o.lift ?? 2.4);
      p.vz = Math.sin(a) * Math.cos(b) * sp;
      p.maxLife = (o.life ?? 1.1) * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.size = (o.size ?? 0.16) * (0.6 + Math.random() * 0.8);
      p.spin = (Math.random() - 0.5) * 12;
      p.rot = Math.random() * 6;
      p.grav = o.grav ?? -7;
      p.shrink = o.shrink !== false;
      p.colour.setHex(cols[(Math.random() * cols.length) | 0]);
    }
  }

  /** Rising stink wisps for spoiling food. */
  stink(pos, intensity) {
    if (Math.random() > intensity * 0.35) return;
    this.burst(pos, {
      count: 1, colours: [PALETTE.mould, 0xbccf8f], speed: 0.25, spread: 0.4,
      size: 0.24, life: 1.5, grav: 1.6, lift: 0.5, jitter: 0.35, shrink: false,
    });
  }

  update(dt, camera) {
    let any = false;
    for (let i = 0; i < POOL; i++) {
      const p = this.parts[i];
      if (!p.alive) { this._s.set(0, 0, 0); this._m.compose(this._p.set(0, -999, 0), this._q, this._s); this.mesh.setMatrixAt(i, this._m); continue; }
      any = true;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.grav * dt;
      p.vx *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const t = p.life / p.maxLife;
      const s = p.size * (p.shrink ? t : 1) * (1 + (1 - t) * 0.3);
      this._q.copy(camera.quaternion);
      this._q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rot));
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.instanceColor.setXYZ(i, p.colour.r * t, p.colour.g * t, p.colour.b * t);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = any;
  }
}

// ------------------------------------------------------------------- popups

/** Floating "+150" / "SPOILT!" text that rises and fades in world space. */
export class Popups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.pool = [];
  }

  _make() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.62),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    );
    m.renderOrder = 30;
    m.visible = false;
    this.scene.add(m);
    return { mesh: m, canvas: c, ctx: c.getContext('2d'), tex };
  }

  show(pos, text, { colour = '#ffd54f', size = 92, life = 1.25, rise = 1.6, scale = 1 } = {}) {
    const it = this.pool.pop() || this._make();
    const ctx = it.ctx;
    ctx.clearRect(0, 0, 512, 160);
    ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(30,18,40,0.92)';
    ctx.lineWidth = 14;
    ctx.strokeText(text, 256, 84);
    const grad = ctx.createLinearGradient(0, 30, 0, 130);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, colour);
    grad.addColorStop(1, colour);
    ctx.fillStyle = grad;
    ctx.fillText(text, 256, 84);
    it.tex.needsUpdate = true;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.mesh.scale.setScalar(scale);
    this.items.push({ ...it, t: 0, life, rise, base: pos.clone(), scale });
  }

  update(dt, camera) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = it.t / it.life;
      if (p >= 1) {
        it.mesh.visible = false;
        this.pool.push({ mesh: it.mesh, canvas: it.canvas, ctx: it.ctx, tex: it.tex });
        this.items.splice(i, 1);
        continue;
      }
      // pop in, drift up, fade out
      const pop = p < 0.16 ? 1 + Math.sin((p / 0.16) * Math.PI) * 0.35 : 1;
      it.mesh.position.set(it.base.x, it.base.y + p * it.rise, it.base.z);
      it.mesh.scale.setScalar(it.scale * pop * (1 - p * 0.15));
      it.mesh.material.opacity = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      it.mesh.quaternion.copy(camera.quaternion);
    }
  }
}
