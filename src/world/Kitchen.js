/**
 * The room. Everything here is set dressing — no gameplay logic.
 *
 * LAYOUT — two columns of three, not one row of six.
 * A single row of six stations across a 16:9 screen forces the camera so far
 * back that every machine becomes a thumbnail. Two columns flanking a central
 * prep table (the arrangement in the concept art) uses the screen shape: the
 * machines stay large and readable, the drag gesture is a clear "push it left"
 * or "push it right", and the eye lands on the food first because it sits in
 * the middle of the composition.
 *
 * Depth is built in three planes: back wall + windows (far), station counters
 * (mid), prep table + foreground crates (near).
 */
import * as THREE from 'three';
import { PALETTE } from './Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh, blob, mergeStatic } from './Materials.js';

/**
 * SLOT GEOMETRY — a horseshoe behind the prep table.
 *
 * Two earlier attempts failed for opposite reasons: straight columns hid the
 * back machines directly behind the front ones, and fanning the columns outward
 * pushed the outer pair off the edges of a 16:9 frame. An arc solves both —
 * every station sits at a similar distance from the camera, so nothing occludes
 * anything, and because the camera looks down, the centre-back stations project
 * ABOVE the table rather than behind it. All six stay on screen at full size.
 */
const ARC = { radiusX: 8.8, radiusZ: 5.6, centreZ: -1.8, spreadDeg: 78 };

const SLOT_ANGLES = (() => {
  const n = 6, out = [];
  for (let i = 0; i < n; i++) {
    // -spread .. +spread, evenly spaced
    out.push((-1 + (2 * i) / (n - 1)) * ARC.spreadDeg * Math.PI / 180);
  }
  return out;
})();

/**
 * Presentation order. A partial set (2 or 4 stations in the early stages) takes
 * the first N, so the pairs chosen are symmetric and well spread rather than
 * clumped at one end of the arc.
 */
const SLOT_ORDER = [1, 4, 2, 3, 0, 5];

export const STATION_SLOTS = SLOT_ORDER.map((arcIndex, i) => {
  const t = SLOT_ANGLES[arcIndex];
  return {
    index: i,
    arcIndex,
    side: Math.sign(t) || 1,
    position: new THREE.Vector3(
      Math.sin(t) * ARC.radiusX,
      1.66,
      ARC.centreZ - Math.cos(t) * ARC.radiusZ
    ),
    // Turn toward the centre of the arc, but only partly: a machine turned fully
    // inward hides the front face where all the readable detail lives.
    rotationY: -t * 0.45,
  };
});

export const PREP_CENTRE = new THREE.Vector3(0, 1.5, 1.1);
export const PREP_RADIUS = 3.05;

export class Kitchen {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'Kitchen';
    scene.add(this.root);

    this._floor();
    this._backWall();
    this._counters();
    this._prepTable();
    this._props();
    if (quality !== 'low') this._foreground();

    // The room is authored as ~200 small meshes for readability; none of them
    // move, so batching them by material at startup turns most of the frame's
    // draw calls into a handful. Purely a render-time change — nothing shifts.
    const stats = mergeStatic(this.root);
    if (import.meta.env?.DEV) console.info('[kitchen] batched', stats);
  }

  // ------------------------------------------------------------------ floor
  _floor() {
    const floor = mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({
      map: this._tileTexture(), roughness: 0.78, metalness: 0.02, color: 0xffffff,
    }), { rx: -Math.PI / 2, y: 0, cast: false });
    this.root.add(floor);
  }

  _tileTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    // Deep terracotta, not cream — the floor is the darkest large surface and
    // it is what stops the whole frame washing out.
    ctx.fillStyle = '#8a5a3c'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#9c6a45';
    ctx.fillRect(0, 0, S / 2, S / 2); ctx.fillRect(S / 2, S / 2, S / 2, S / 2);
    ctx.strokeStyle = 'rgba(50,30,18,0.55)'; ctx.lineWidth = 6;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * S / 2, 0); ctx.lineTo(i * S / 2, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * S / 2); ctx.lineTo(S, i * S / 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(6, 6, S / 2 - 12, 10); ctx.fillRect(S / 2 + 6, S / 2 + 6, S / 2 - 12, 10);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(20, 20);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  // -------------------------------------------------------------- back wall
  _backWall() {
    this.root.add(mesh(roundedBox(60, 20, 0.7, 0.1), matte(0xe4cba6, 0.92), { y: 10, z: -12.5, cast: false }));
    // Teal wainscot: a strong horizontal dark band that gives the wall a
    // horizon and keeps the upper third from reading as empty paper.
    this.root.add(mesh(roundedBox(56, 3.4, 0.95, 0.12), matte(0x4d7f8c, 0.86), { y: 1.7, z: -12.3, cast: false }));
    this.root.add(mesh(roundedBox(56, 0.28, 1.05, 0.08), matte(0xf2e6d0, 0.8), { y: 3.5, z: -12.28, cast: false }));

    const exterior = new THREE.MeshBasicMaterial({ color: 0xfff2d2, toneMapped: false });
    for (const x of [-16, 16]) {
      this.root.add(mesh(roundedBox(9.6, 7.2, 0.5, 0.16), plastic(0xfdfefe, { rough: 0.5 }), { x, y: 7.2, z: -12.05 }));
      for (const [px, py] of [[-2.35, 1.75], [2.35, 1.75], [-2.35, -1.75], [2.35, -1.75]]) {
        this.root.add(mesh(new THREE.PlaneGeometry(4.0, 3.05), exterior,
          { x: x + px, y: 7.2 + py, z: -11.76, cast: false, receive: false }));
      }
      this.root.add(mesh(roundedBox(10.2, 0.42, 1.2, 0.1), matte(PALETTE.woodDark), { x, y: 3.4, z: -11.6 }));
      const jarCols = [0xc7622f, 0x7fa84a, 0xc94b3f];
      for (let i = -1; i <= 1; i++) {
        this.root.add(mesh(cyl(0.34, 0.34, 0.95, 16), glass(jarCols[i + 1], { opacity: 0.62 }), { x: x + i * 1.8, y: 4.08, z: -11.6 }));
        this.root.add(mesh(cyl(0.36, 0.36, 0.15, 16), plastic(PALETTE.brass), { x: x + i * 1.8, y: 4.63, z: -11.6 }));
      }
    }

    const board = new THREE.Group();
    board.position.set(0, 7.1, -12.0);
    board.add(mesh(roundedBox(16, 6.6, 0.4, 0.14), matte(0x5e3b22, 0.85)));
    board.add(mesh(roundedBox(15.1, 5.8, 0.22, 0.08), new THREE.MeshStandardMaterial({
      map: this._chalkTexture(), roughness: 0.96, metalness: 0,
    }), { z: 0.18 }));
    board.add(mesh(roundedBox(15.4, 0.3, 0.5, 0.08), matte(0x7a4f2c, 0.85), { y: -3.2, z: 0.22 }));
    this.root.add(board);
  }

  _chalkTexture() {
    const W = 1024, H = 420;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e4033'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.045; ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * 200, Math.random() * 14);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.font = '700 64px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText('Keep food safe!', W / 2, 88);
    ctx.font = '400 36px system-ui, sans-serif';
    ctx.fillText('microorganisms need  water · air · warmth', W / 2, 150);
    ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      const x = 170 + i * 172, y = 285;
      ctx.beginPath(); ctx.arc(x, y, 38, 0, Math.PI * 2); ctx.stroke();
      for (let s = 0; s < 9; s++) {
        const a = (s / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 38, y + Math.sin(a) * 38);
        ctx.lineTo(x + Math.cos(a) * 52, y + Math.sin(a) * 52);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x - 12, y - 7, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 12, y - 7, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + 13, 18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // --------------------------------------------------------------- counters
  /**
   * One counter island per slot rather than two long runs.
   *
   * The long runs left big blank stretches whenever a stage used fewer than six
   * stations, and they could not follow the fan. Per-slot islands sit exactly
   * under each machine, angle with it, and give every station a visible base —
   * which also makes the six read as six distinct workstations.
   */
  _counters() {
    this.islands = [];
    const bodyMat = matte(0x7a4527, 0.78);
    const topMat = plastic(0xb5813f, { rough: 0.5, clearcoat: 0.42 });
    const toeMat = matte(0x5c3620, 0.8);
    const doorMat = matte(0x94592d, 0.76);

    for (const slot of STATION_SLOTS) {
      const g = new THREE.Group();
      g.position.set(slot.position.x, 0, slot.position.z);
      g.rotation.y = slot.rotationY;
      const W = 2.7, D = 2.4;
      g.add(mesh(roundedBox(W, 1.5, D, 0.09), bodyMat, { y: 0.82 }));
      g.add(mesh(roundedBox(W + 0.28, 0.3, D + 0.28, 0.1), topMat, { y: 1.62 }));
      g.add(mesh(roundedBox(W - 0.3, 0.42, D - 0.3, 0.06), toeMat, { y: 0.2 }));
      // Warm strip light under the front lip: grounds the machine and gives the
      // mid plane a second accent line.
      g.add(mesh(roundedBox(W - 0.5, 0.1, 0.12, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffc271, toneMapped: false }),
        { y: 1.42, z: D / 2 + 0.1, cast: false, receive: false }));
      // Cabinet front
      g.add(mesh(roundedBox(W - 0.5, 1.0, 0.1, 0.05), doorMat, { y: 0.85, z: D / 2 + 0.02 }));
      g.add(mesh(cyl(0.05, 0.05, 0.5, 8), metal(PALETTE.steel), { y: 0.85, z: D / 2 + 0.09, rx: Math.PI / 2, rz: Math.PI / 2 }));
      // One prop per island, varied by slot so the six are not clones.
      const k = slot.index % 4;
      const px = slot.side * 1.15;
      if (k === 0) {
        g.add(mesh(roundedBox(0.95, 0.1, 0.7, 0.04), matte(0xd8b184, 0.75), { x: px, y: 1.82, z: -0.7, ry: 0.3 }));
        g.add(mesh(cyl(0.055, 0.055, 0.48, 8), metal(0xb9c2ca), { x: px + 0.18, y: 1.9, z: -0.6, rz: 1.4 }));
      } else if (k === 1) {
        for (let j = 0; j < 2; j++) {
          g.add(mesh(cyl(0.19, 0.19, 0.44, 14), glass(j ? 0x86b556 : 0xd8823a, { opacity: 0.62 }), { x: px + j * 0.46 - 0.2, y: 1.99, z: -0.75 }));
          g.add(mesh(cyl(0.2, 0.2, 0.08, 14), plastic(PALETTE.brass), { x: px + j * 0.46 - 0.2, y: 2.25, z: -0.75 }));
        }
      } else if (k === 2) {
        g.add(mesh(roundedBox(0.66, 0.15, 0.52, 0.06), matte(0xd94f45, 0.9), { x: px, y: 1.85, z: -0.72, ry: -0.35 }));
        g.add(mesh(roundedBox(0.56, 0.11, 0.44, 0.05), matte(0xf0e3cd, 0.9), { x: px, y: 1.95, z: -0.72, ry: 0.2 }));
      } else {
        g.add(mesh(cyl(0.28, 0.32, 0.15, 16), metal(0xc6ced6), { x: px, y: 1.85, z: -0.72 }));
        g.add(mesh(cyl(0.085, 0.1, 0.28, 10), metal(0x9aa4ae), { x: px, y: 2.04, z: -0.72 }));
        g.add(mesh(sphere(0.15, 12, 9), matte(0xe0603c, 0.8), { x: px, y: 2.22, z: -0.72 }));
      }
      g.userData.dynamic = true;   // toggled per stage, so keep it unbatched
      this.root.add(g);
      this.islands.push(g);
    }
  }

  /** Show only the islands whose slots this stage actually uses. */
  setActiveSlots(count) {
    if (!this.islands) return;
    this.islands.forEach((g, i) => { g.visible = i < count; });
  }

  // ------------------------------------------------------------- prep table
  _prepTable() {
    const g = new THREE.Group();
    g.position.copy(PREP_CENTRE).setY(0);

    // Darker rim + lighter board so the drop zone reads as a target without
    // becoming the brightest thing on screen.
    g.add(mesh(cyl(PREP_RADIUS, PREP_RADIUS * 0.96, 0.44, 52), plastic(0xb07a44, { rough: 0.55, clearcoat: 0.3 }), { y: 1.28 }));
    g.add(mesh(torus(PREP_RADIUS, 0.15, 10, 60), plastic(0x7d5128, { rough: 0.6 }), { y: 1.3, rx: Math.PI / 2 }));
    g.add(mesh(cyl(PREP_RADIUS * 0.8, PREP_RADIUS * 0.8, 0.08, 48), matte(0xdcb381, 0.72), { y: 1.52, cast: false }));
    // Faint concentric guide ring — a subtle "put things here" affordance.
    g.add(mesh(new THREE.RingGeometry(PREP_RADIUS * 0.5, PREP_RADIUS * 0.54, 48),
      new THREE.MeshBasicMaterial({ color: 0xa8763f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false }),
      { y: 1.57, rx: -Math.PI / 2, cast: false, receive: false }));

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(mesh(cyl(0.17, 0.21, 1.1, 12), metal(0x6d7883), {
        x: Math.cos(a) * (PREP_RADIUS - 0.75), z: Math.sin(a) * (PREP_RADIUS - 0.75), y: 0.55,
      }));
    }
    g.add(mesh(torus(PREP_RADIUS - 0.75, 0.07, 8, 34), metal(0x5c666f), { y: 0.35, rx: Math.PI / 2 }));
    this.root.add(g);
    this.prepTable = g;
  }

  // ------------------------------------------------------------------ props
  _props() {
    // Pendant lamps over each counter column.
    for (const x of [-6.6, 6.6]) {
      const lamp = new THREE.Group();
      lamp.position.set(x, 0, -4.2);
      lamp.add(mesh(cyl(0.05, 0.05, 5.0, 8), metal(0x4a545e), { y: 12.4 }));
      lamp.add(mesh(cyl(1.15, 0.32, 1.1, 26, true), plastic(0xe8532f, { rough: 0.4 }), { y: 9.6 }));
      lamp.add(mesh(cyl(1.14, 1.14, 0.06, 24), new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }), { y: 9.15, cast: false }));
      const pt = new THREE.PointLight(0xffd9a0, 9, 20, 2);
      pt.position.set(0, 8.9, 0);
      lamp.add(pt);
      this.root.add(lamp);
    }

    // Wall shelves with preserved goods — visual repetition + subject rhyme.
    for (const side of [-1, 1]) {
      const shelf = new THREE.Group();
      shelf.position.set(side * 6.6, 4.6, -11.6);
      shelf.add(mesh(roundedBox(6.4, 0.26, 1.3, 0.06), matte(0x7a4f2c), {}));
      const cols = [0xd8823a, 0x86b556, 0xcc4f42, 0xe0b93f, 0x6fa9c4];
      for (let i = 0; i < 5; i++) {
        const jx = -2.4 + i * 1.2;
        shelf.add(mesh(cyl(0.36, 0.36, 1.0, 16), glass(cols[i], { opacity: 0.62 }), { x: jx, y: 0.63 }));
        shelf.add(mesh(cyl(0.38, 0.38, 0.16, 16), plastic(PALETTE.brass), { x: jx, y: 1.2 }));
      }
      this.root.add(shelf);
    }

    for (const x of [-13.6, 13.6]) this.root.add(this._plant(x, -9.6, 1.45));
  }

  _plant(x, z, s) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.add(mesh(cyl(0.66, 0.48, 1.05, 18), plastic(0xa8502f, { rough: 0.68 }), { y: 0.52 }));
    g.add(mesh(torus(0.67, 0.09, 8, 22), plastic(0x8d3f24), { y: 1.02, rx: Math.PI / 2 }));
    const a1 = matte(0x2f6b32, 0.78), a2 = matte(0x4c9440, 0.78);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + i * 0.7;
      const lean = 0.42 + (i % 3) * 0.2;
      const h = 1.7 + (i % 4) * 0.45;
      const leaf = mesh(blob(0.22, h * 0.5, 0.07, 10, 8), i % 2 ? a1 : a2, {
        x: Math.cos(a) * 0.34, z: Math.sin(a) * 0.34, y: 1.05 + h * 0.45,
      });
      leaf.rotation.set(Math.sin(a) * lean, -a, -Math.cos(a) * lean);
      g.add(leaf);
    }
    return g;
  }

  /** Dark foreground shapes that frame the bottom corners and add depth. */
  _foreground() {
    const fg = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      fg.add(mesh(roundedBox(2.3, 1.0, 1.9, 0.08), matte(i % 2 ? 0x8a5730 : 0x9c6538, 0.86), {
        x: -13.8 + i * 0.2, y: 0.5 + i * 1.02, z: 7.4, ry: 0.14 - i * 0.1,
      }));
    }
    fg.add(mesh(blob(1.05, 1.25, 0.95, 16, 12), matte(0xe6d8bd, 0.92), { x: 13.6, y: 1.25, z: 7.2 }));
    fg.add(mesh(cyl(0.38, 0.44, 0.55, 12), matte(0xcfc0a2, 0.92), { x: 13.6, y: 2.4, z: 7.2 }));
    fg.add(mesh(roundedBox(1.5, 0.9, 0.05, 0.03), matte(0xf3ead6, 0.9), { x: 13.6, y: 1.3, z: 8.15 }));
    this.root.add(fg);
  }

  update() { /* set dressing is static; kept for API symmetry */ }
}
