/**
 * The microorganism swarm.
 *
 * This is the load-bearing teaching object in the whole game. §3 of the notes
 * says spoilage IS the action of microorganisms, so the player must always be
 * able to see them, see them multiply on neglected food, and see the specific
 * way each preservation method stops them.
 *
 * Activity 0..1 drives, simultaneously:
 *   - how many are visible   (population)
 *   - how fast they orbit    (activity)
 *   - their colour           (red → orange → yellow → green, per Palette)
 *   - their facial expression
 * Four redundant channels means the state is readable at a glance, in a hurry,
 * and by a colour-blind player (size and speed still carry the signal).
 */
import * as THREE from 'three';
import { PALETTE, microbeColour } from './Palette.js';

const MAX_PER_FOOD = 7;

// ---- shared geometry: three spiky-blob variants, merged into one mesh each
const _geo = [];
function microbeGeometry(variant) {
  if (_geo[variant]) return _geo[variant];
  const parts = [];
  const body = new THREE.SphereGeometry(0.5, 12, 9);
  parts.push(body);
  const spikes = 6 + variant * 2;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const tilt = (i % 3 - 1) * 0.6;
    const s = new THREE.ConeGeometry(0.11, 0.3, 5);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.cos(a), Math.sin(tilt), Math.sin(a)).normalize()
    );
    m.compose(
      new THREE.Vector3(Math.cos(a) * 0.55, Math.sin(tilt) * 0.5, Math.sin(a) * 0.55),
      q, new THREE.Vector3(1, 1, 1)
    );
    s.applyMatrix4(m);
    parts.push(s);
  }
  // Manual merge (avoids pulling in BufferGeometryUtils for three shapes).
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const idx = [];
  let vo = 0;
  for (const p of parts) {
    const pp = p.attributes.position.array, pn = p.attributes.normal.array;
    pos.set(pp, vo * 3); nor.set(pn, vo * 3);
    const pi = p.index.array;
    for (let i = 0; i < pi.length; i++) idx.push(pi[i] + vo);
    vo += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  _geo[variant] = g;
  return g;
}

// ---- shared materials, one per activity band (4 total for the whole game)
const _mats = new Map();
function microbeMaterial(colour) {
  if (!_mats.has(colour)) {
    _mats.set(colour, new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.55, metalness: 0.0,
      emissive: colour, emissiveIntensity: 0.22,
    }));
  }
  return _mats.get(colour);
}

// ---- shared face sprites
const _faceTex = new Map();
function microbeFace(mood) {
  if (_faceTex.has(mood)) return _faceTex.get(mood);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#1b1226';
  const eye = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1226'; ctx.lineWidth = 7;
  if (mood === 'mean') {                       // thriving, smug
    eye(46, 54, 10); eye(82, 54, 10);
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(56, 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(96, 36); ctx.lineTo(72, 46); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 76, 20, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
  } else if (mood === 'worried') {             // being suppressed
    eye(46, 56, 11); eye(82, 56, 11);
    ctx.beginPath(); ctx.arc(64, 100, 17, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  } else {                                     // defeated
    ctx.lineWidth = 8;
    for (const x of [46, 82]) {
      ctx.beginPath(); ctx.moveTo(x - 11, 45); ctx.lineTo(x + 11, 67); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 11, 45); ctx.lineTo(x - 11, 67); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(64, 98, 14, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _faceTex.set(mood, t);
  return t;
}

export class MicrobeSwarm {
  /** @param {THREE.Object3D} host the food group the swarm orbits */
  constructor(host, { radius = 0.9, max = MAX_PER_FOOD } = {}) {
    this.host = host;
    this.radius = radius;
    this.max = max;
    this.activity = 0.26;      // starts low: fresh food, few microorganisms
    this.group = new THREE.Group();
    this.group.name = 'MicrobeSwarm';
    host.add(this.group);
    this.units = [];
    this._defeat = null;
    this._t = 0;

    for (let i = 0; i < max; i++) {
      const scale = 0.42 + (i % 3) * 0.06;
      const m = new THREE.Mesh(microbeGeometry(i % 3), microbeMaterial(PALETTE.microbeStrong));
      m.scale.setScalar(scale);
      m.castShadow = false;
      m.receiveShadow = false;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshBasicMaterial({ map: microbeFace('mean'), transparent: true, depthWrite: false, toneMapped: false })
      );
      face.position.z = 0.52;
      face.renderOrder = 5;
      face.userData.mood = 'mean';
      m.add(face);
      m.userData = {
        face,
        baseScale: scale,
        phase: (i / max) * Math.PI * 2 + Math.random(),
        speed: 0.7 + Math.random() * 0.7,
        tilt: (Math.random() - 0.5) * 0.9,
        rad: radius * (0.72 + Math.random() * 0.5),
        bobAmp: 0.1 + Math.random() * 0.12,
        spin: (Math.random() - 0.5) * 3,
      };
      m.visible = false;
      this.group.add(m);
      this.units.push(m);
    }
  }

  /** @param {number} v 0..1 */
  setActivity(v) { this.activity = THREE.MathUtils.clamp(v, 0, 1); }

  /**
   * Play the method-specific defeat animation. The SHAPE of the animation is
   * the mnemonic — drying shrivels them, vacuum crushes them flat, freezing
   * locks them rigid, heat pops them. A child who has seen "crush" twenty times
   * has a physical memory attached to "vacuum packing removes air".
   */
  defeat(effect = 'shrivel', duration = 1500) {
    this._defeat = { effect, t: 0, duration: duration / 1000 };
  }

  reset() { this._defeat = null; this.setActivity(0.18); }

  update(dt, camera) {
    this._t += dt;
    const a = this.activity;

    // Population scales with activity — visibly multiplying is the whole point.
    const wanted = this._defeat ? this.units.length : Math.round(1 + a * (this.max - 1));
    const colour = microbeColour(a);
    const mat = microbeMaterial(colour);
    const mood = a > 0.6 ? 'mean' : a > 0.2 ? 'worried' : 'dead';

    let d = this._defeat;
    if (d) {
      d.t += dt;
      if (d.t >= d.duration) { this._defeat = null; d = null; this.setActivity(0.0); }
    }
    const dp = d ? Math.min(1, d.t / d.duration) : 0;   // 0..1 defeat progress
    const ease = dp * dp * (3 - 2 * dp);

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const ud = u.userData;
      const alive = i < wanted;
      u.visible = alive;
      if (!alive) continue;

      if (u.material !== mat && !d) u.material = mat;
      if (ud.face.userData.mood !== mood && !d) {
        ud.face.userData.mood = mood;
        ud.face.material.map = microbeFace(mood);
        ud.face.material.needsUpdate = true;
      }

      // Orbit speed IS the activity readout — frozen microbes visibly crawl.
      const spd = 0.25 + a * 1.35;
      const ang = ud.phase + this._t * ud.speed * spd;
      let px = Math.cos(ang) * ud.rad;
      let pz = Math.sin(ang) * ud.rad * 0.75;
      let py = ud.tilt * 0.4 + Math.sin(this._t * 2.1 * spd + ud.phase) * ud.bobAmp;
      let s = ud.baseScale * (1 + Math.sin(this._t * 5 * spd + ud.phase) * 0.08 * a);

      if (d) {
        switch (d.effect) {
          case 'shrivel':    // drying — they curl up small and drop
            s *= (1 - ease * 0.92);
            py -= ease * 0.35;
            break;
          case 'freeze':     // freezing — motion stops, they hang rigid, icy blue
            px = Math.cos(ud.phase + this._t * ud.speed * spd * (1 - ease)) * ud.rad;
            pz = Math.sin(ud.phase + this._t * ud.speed * spd * (1 - ease)) * ud.rad * 0.75;
            s *= (1 - ease * 0.35);
            u.material = microbeMaterial(0x7fc7ff);
            break;
          case 'crush':      // vacuum — squashed flat toward the food
            u.scale.set(s * (1 + ease * 0.7), s * (1 - ease * 0.88), s * (1 + ease * 0.7));
            px *= (1 - ease * 0.75); pz *= (1 - ease * 0.75);
            break;
          case 'dissolve':   // pickling — they fizz away in the solution
            s *= (1 - ease);
            py += ease * 0.25;
            px += Math.sin(this._t * 22 + i) * 0.05 * ease;
            u.material = microbeMaterial(0x8bc34a);
            break;
          case 'dehydrate':  // salting — water pulled out, they shrink and sink
            s *= (1 - ease * 0.9);
            u.scale.set(s * (1 - ease * 0.3), s, s * (1 - ease * 0.3));
            py -= ease * 0.28;
            break;
          case 'zap':        // pasteurising — heat pops them
            s *= (1 + ease * 0.5) * (1 - Math.max(0, ease - 0.6) / 0.4);
            u.material = microbeMaterial(ease > 0.5 ? 0xffd54f : 0xff7043);
            break;
          default:
            s *= (1 - ease);
        }
        if (ud.face.userData.mood !== 'dead' && ease > 0.25) {
          ud.face.userData.mood = 'dead';
          ud.face.material.map = microbeFace('dead');
          ud.face.material.needsUpdate = true;
        }
      }

      u.position.set(px, py, pz);
      if (d?.effect !== 'crush' && d?.effect !== 'dehydrate') u.scale.setScalar(Math.max(0.0001, s));
      u.rotation.y += dt * ud.spin * (d ? (1 - ease) : 1) * (0.3 + a);
      if (camera) ud.face.quaternion.copy(camera.quaternion);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const u of this.units) { u.geometry = null; u.material = null; }
    this.units.length = 0;
  }
}
