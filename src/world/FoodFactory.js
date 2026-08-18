/**
 * Procedural food models.
 *
 * Every builder returns a Group with:
 *   userData.skin[]   materials that respond to spoilage (see applySpoil)
 *   userData.face     the billboarded expression plane
 *   userData.radius   approximate pick radius, for hit-testing and blob shadows
 *
 * Silhouette is the priority: a child must recognise the food at thumbnail size
 * and from a 30° top-down camera. That means one dominant shape per food plus a
 * single strong secondary read (fish = tail, prawns = curl, milk = carton gable).
 *
 * GLB OVERRIDE: if `public/assets/models/food/<id>.glb` is present it replaces
 * the procedural build (see AssetRegistry). The procedural version stays as a
 * guaranteed fallback so the game is never blocked on the asset pipeline.
 */
import * as THREE from 'three';
import { foodAssets } from './AssetRegistry.js';
import { foodMaterial, matte, plastic, metal, glass, roundedBox, cyl, sphere, capsule, torus, blob, mesh } from './Materials.js';

// ------------------------------------------------------------------- faces

const FACE_STATES = ['happy', 'ok', 'worried', 'sick'];
const _faceTex = new Map();

function faceTexture(state) {
  if (_faceTex.has(state)) return _faceTex.get(state);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const eyeY = 100;
  const eyeDx = 46;
  const drawEye = (x, open = 1, angry = 0) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x, eyeY, 26, 30 * open, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241a2e';
    ctx.beginPath(); ctx.ellipse(x, eyeY + 4, 14, 16 * open, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + 6, eyeY - 6, 5.5, 0, Math.PI * 2); ctx.fill();
    if (angry) {
      ctx.strokeStyle = '#241a2e'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath();
      const dir = x < S / 2 ? 1 : -1;
      ctx.moveTo(x - 24 * dir, eyeY - 44); ctx.lineTo(x + 20 * dir, eyeY - 30);
      ctx.stroke();
    }
  };

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#241a2e';
  ctx.lineWidth = 11;

  if (state === 'happy') {
    drawEye(S / 2 - eyeDx); drawEye(S / 2 + eyeDx);
    ctx.beginPath(); ctx.arc(S / 2, 150, 34, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.38)';
    ctx.beginPath(); ctx.arc(S / 2 - 82, 140, 20, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(S / 2 + 82, 140, 20, 0, 7); ctx.fill();
  } else if (state === 'ok') {
    drawEye(S / 2 - eyeDx); drawEye(S / 2 + eyeDx);
    ctx.beginPath(); ctx.moveTo(S / 2 - 26, 168); ctx.lineTo(S / 2 + 26, 168); ctx.stroke();
  } else if (state === 'worried') {
    drawEye(S / 2 - eyeDx, 0.8, 1); drawEye(S / 2 + eyeDx, 0.8, 1);
    ctx.beginPath(); ctx.arc(S / 2, 200, 32, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    // sweat drop
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.ellipse(S / 2 + 92, 96, 11, 16, 0, 0, 7); ctx.fill();
  } else { // sick
    ctx.strokeStyle = '#241a2e'; ctx.lineWidth = 10;
    for (const x of [S / 2 - eyeDx, S / 2 + eyeDx]) {
      ctx.beginPath(); ctx.moveTo(x - 20, eyeY - 20); ctx.lineTo(x + 20, eyeY + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, eyeY - 20); ctx.lineTo(x - 20, eyeY + 20); ctx.stroke();
    }
    // wavy queasy mouth
    ctx.beginPath();
    ctx.moveTo(S / 2 - 40, 178);
    for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(S / 2 - 30 + i * 20, 178 + (i % 2 ? 16 : -16), S / 2 - 20 + i * 20, 178);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,160,80,0.45)';
    ctx.beginPath(); ctx.arc(S / 2 - 84, 146, 22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(S / 2 + 84, 146, 22, 0, 7); ctx.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _faceTex.set(state, t);
  return t;
}

function makeFace(size = 0.62, y = 0.16, z = 0.42) {
  const mat = new THREE.MeshBasicMaterial({
    map: faceTexture('happy'), transparent: true, depthWrite: false, toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.position.set(0, y, z);
  m.renderOrder = 4;
  m.userData.isFace = true;
  m.userData.state = 'happy';
  return m;
}

/** Swap the face for a spoilage level. Cheap — only touches the map on change. */
export function setFaceForSpoil(face, spoil, preserved) {
  if (!face) return;
  const want = preserved ? 'happy' : spoil > 0.72 ? 'sick' : spoil > 0.42 ? 'worried' : spoil > 0.16 ? 'ok' : 'happy';
  if (face.userData.state === want) return;
  face.userData.state = want;
  face.material.map = faceTexture(want);
  face.material.needsUpdate = true;
}

// ------------------------------------------------------------------ builders

function reg(group, ...mats) {
  group.userData.skin = (group.userData.skin || []).concat(mats);
  return group;
}

const BUILDERS = {
  fish() {
    const g = new THREE.Group();
    const body = foodMaterial(0x8fb4cc);
    const back = foodMaterial(0x35688f);
    const belly = foodMaterial(0xe4eef4);
    const fin = foodMaterial(0x5d8fb0);
    // Tall body, not flat: reads as a fish from above as well as head-on.
    const b = mesh(blob(0.66, 0.5, 0.3, 22, 16), body, { y: 0.04 });
    g.add(b);
    g.add(mesh(blob(0.58, 0.2, 0.26, 18, 12), back, { y: 0.3 }));        // dark dorsal band
    g.add(mesh(blob(0.5, 0.16, 0.24, 16, 12), belly, { y: -0.3 }));      // pale belly
    // Big forked tail — the single strongest read at small size.
    const tail = new THREE.Group();
    tail.position.set(-0.72, 0.02, 0);
    for (const s2 of [1, -1]) {
      const lobe = mesh(new THREE.ConeGeometry(0.2, 0.5, 3), fin, { y: s2 * 0.18, rz: Math.PI / 2 + s2 * 0.5 });
      lobe.scale.set(1, 1, 0.35);
      tail.add(lobe);
    }
    g.add(tail);
    g.add(mesh(new THREE.ConeGeometry(0.22, 0.34, 3), fin, { y: 0.52, x: 0.02, rz: -0.25, ry: Math.PI / 2 }));
    const pec = mesh(blob(0.2, 0.12, 0.05, 10, 8), fin, { x: 0.14, y: -0.14, z: 0.24, rz: 0.6 });
    g.add(pec);
    g.add(mesh(sphere(0.05, 8, 6), matte(0x2b1d33), { x: 0.5, y: 0.16, z: 0.19, cast: false }));
    g.add(makeFace(0.52, 0.02, 0.33));
    g.userData.radius = 0.78;
    return reg(g, body, back, belly, fin);
  },

  prawns() {
    const g = new THREE.Group();
    const shell = foodMaterial(0xff7a45);
    const shellDark = foodMaterial(0xc23c1d);
    for (let p = 0; p < 2; p++) {
      const pr = new THREE.Group();
      pr.position.set(p ? 0.3 : -0.28, p ? 0.18 : 0, p ? 0.12 : -0.1);
      pr.rotation.y = p ? 0.9 : -0.4;
      pr.scale.setScalar(p ? 0.85 : 1);
      // curled body: segments on an arc = instantly readable prawn silhouette
      for (let i = 0; i < 6; i++) {
        const a = -0.35 + i * 0.42;
        const r = 0.4;
        pr.add(mesh(blob(0.17 - i * 0.010, 0.19 - i * 0.012, 0.19 - i * 0.012, 12, 10),
          i % 2 ? shell : shellDark,
          { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, rz: a }));
      }
      pr.add(mesh(new THREE.ConeGeometry(0.13, 0.2, 4), shellDark, { x: Math.cos(2.15) * 0.36, y: Math.sin(2.15) * 0.3, rz: 2.6 }));
      pr.add(mesh(cyl(0.012, 0.012, 0.34, 5), shellDark, { x: 0.34, y: 0.1, rz: -0.7 }));
      pr.add(mesh(cyl(0.012, 0.012, 0.34, 5), shellDark, { x: 0.36, y: 0.06, rz: -1.0 }));
      g.add(pr);
    }
    g.add(makeFace(0.4, 0.14, 0.34));
    g.userData.radius = 0.66;
    return reg(g, shell, shellDark);
  },

  squid() {
    const g = new THREE.Group();
    const body = foodMaterial(0xe58cb4);
    const dark = foodMaterial(0x9c4a72);
    const pale = foodMaterial(0xf7c9dd);
    // Rounded mantle, not a cone: a cone plus a skirt reads as a party hat.
    const mantle = mesh(blob(0.3, 0.44, 0.26, 20, 14), body, { y: 0.3 });
    g.add(mantle);
    g.add(mesh(blob(0.22, 0.14, 0.2, 14, 10), pale, { y: 0.12, z: 0.12 }));
    // Big triangular side fins at the TOP of the mantle — the squid signature.
    for (const s2 of [-1, 1]) {
      const f = mesh(new THREE.ConeGeometry(0.2, 0.34, 3), dark, { x: s2 * 0.3, y: 0.6, rz: s2 * 1.25 });
      f.scale.set(1, 1, 0.35);
      g.add(f);
    }
    // Head band + fanned tentacles below.
    g.add(mesh(blob(0.28, 0.16, 0.24, 16, 10), dark, { y: -0.08 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const long = i % 2 === 0;
      const t = mesh(capsule(0.045, long ? 0.46 : 0.3, 4, 8), i % 3 ? body : dark, {
        x: Math.cos(a) * 0.19, z: Math.sin(a) * 0.19, y: -0.36 - (long ? 0.06 : 0),
      });
      t.rotation.set(Math.sin(a) * 0.62, 0, -Math.cos(a) * 0.62);
      g.add(t);
    }
    g.add(makeFace(0.4, -0.02, 0.27));
    g.userData.radius = 0.7;
    return reg(g, body, dark, pale);
  },

  chicken() {
    const g = new THREE.Group();
    const skin = foodMaterial(0xf0c98c);
    const skinDeep = foodMaterial(0xd0985a);
    g.add(mesh(blob(0.46, 0.36, 0.4, 20, 16), skin, { y: 0.06 }));
    g.add(mesh(blob(0.2, 0.14, 0.18, 12, 10), skinDeep, { x: -0.3, y: 0.3, rz: 0.4 }));
    for (const s of [-1, 1]) {                                   // drumsticks
      const leg = mesh(capsule(0.1, 0.2, 5, 10), skinDeep, { x: s * 0.3, y: -0.2, z: 0.12 });
      leg.rotation.z = s * 0.7; g.add(leg);
      g.add(mesh(cyl(0.035, 0.045, 0.16, 8), matte(0xf7efe0), { x: s * 0.46, y: -0.33, z: 0.12, rz: s * 0.7 }));
    }
    g.add(makeFace(0.44, 0.08, 0.4));
    g.userData.radius = 0.6;
    return reg(g, skin, skinDeep);
  },

  meat() {
    const g = new THREE.Group();
    const lean = foodMaterial(0xb02f2f);
    const fat = foodMaterial(0xf2e3cf);
    const steak = mesh(blob(0.52, 0.13, 0.42, 20, 12), lean, { y: 0.02 });
    g.add(steak);
    g.add(mesh(torus(0.5, 0.055, 8, 26), fat, { y: 0.02, rx: Math.PI / 2 }));     // fat rim
    g.add(mesh(blob(0.2, 0.035, 0.06, 10, 8), fat, { y: 0.13, rz: 0.2, ry: 0.5 })); // marbling
    g.add(mesh(blob(0.16, 0.03, 0.05, 10, 8), fat, { y: 0.13, x: -0.16, z: 0.14, ry: -0.4 }));
    g.add(makeFace(0.44, 0.16, 0.2));
    g.userData.radius = 0.6;
    return reg(g, lean, fat);
  },

  sausages() {
    const g = new THREE.Group();
    const skin = foodMaterial(0xa8402a);
    const tie = foodMaterial(0x6d2618);
    for (let i = 0; i < 3; i++) {
      const s = mesh(capsule(0.13, 0.5, 6, 14), skin, {
        x: -0.24 + i * 0.24, y: 0.14 * (i === 1 ? 1 : 0.6), z: (i - 1) * 0.14, rz: Math.PI / 2 + (i - 1) * 0.18,
      });
      g.add(s);
      for (const e of [-1, 1]) {
        g.add(mesh(cyl(0.09, 0.09, 0.05, 10), tie, {
          x: -0.24 + i * 0.24 + e * 0.37, y: 0.14 * (i === 1 ? 1 : 0.6) + e * (i - 1) * 0.07,
          z: (i - 1) * 0.14, rz: Math.PI / 2 + (i - 1) * 0.18,
        }));
      }
    }
    g.add(makeFace(0.4, 0.3, 0.26));
    g.userData.radius = 0.62;
    return reg(g, skin, tie);
  },

  mushrooms() {
    const g = new THREE.Group();
    const cap = foodMaterial(0xc08a55);
    const stem = foodMaterial(0xf3e6d2);
    const gill = foodMaterial(0xc9a17c);
    const one = (x, z, s, r) => {
      const m = new THREE.Group();
      m.position.set(x, 0, z); m.scale.setScalar(s); m.rotation.y = r;
      m.add(mesh(cyl(0.12, 0.15, 0.34, 12), stem, { y: -0.05 }));
      const c = mesh(sphere(0.28, 18, 12), cap, { y: 0.16 });
      c.scale.set(1, 0.62, 1);
      m.add(c);
      m.add(mesh(cyl(0.27, 0.27, 0.03, 16), gill, { y: 0.09 }));
      return m;
    };
    g.add(one(0, 0, 1.05, 0), one(-0.34, 0.2, 0.72, 1), one(0.32, -0.14, 0.62, 2));
    g.add(makeFace(0.34, 0.16, 0.3));
    g.userData.radius = 0.6;
    return reg(g, cap, stem, gill);
  },

  fruits() {
    const g = new THREE.Group();
    const apple = foodMaterial(0xd41f2e);
    const green = foodMaterial(0x7cb342);
    const leaf = foodMaterial(0x4f8f3a);
    const stemM = matte(0x6b4a2a);
    const a = mesh(sphere(0.36, 20, 14), apple, { x: -0.12, y: 0.06 });
    a.scale.set(1, 0.94, 1); g.add(a);
    const b = mesh(sphere(0.28, 18, 12), green, { x: 0.32, y: -0.02, z: 0.16 });
    b.scale.set(1, 0.95, 1); g.add(b);
    g.add(mesh(cyl(0.022, 0.022, 0.16, 6), stemM, { x: -0.12, y: 0.4 }));
    g.add(mesh(blob(0.11, 0.03, 0.06, 10, 8), leaf, { x: -0.01, y: 0.44, rz: -0.5 }));
    g.add(makeFace(0.4, 0.06, 0.34));
    g.userData.radius = 0.6;
    return reg(g, apple, green, leaf);
  },

  vegetables() {
    const g = new THREE.Group();
    const carrot = foodMaterial(0xf07615);
    const top = foodMaterial(0x5aa14a);
    const broc = foodMaterial(0x3f8a2e);
    const brocStem = foodMaterial(0x9dc48a);
    // carrot
    const c = mesh(new THREE.ConeGeometry(0.15, 0.72, 12), carrot, { x: -0.3, y: 0.0, rz: 2.7 });
    g.add(c);
    for (let i = 0; i < 4; i++) {
      g.add(mesh(blob(0.05, 0.13, 0.03, 8, 6), top, { x: 0.02 + i * 0.02, y: 0.28 + (i % 2) * 0.06, z: (i - 1.5) * 0.06, rz: -0.3 + i * 0.2 }));
    }
    // broccoli
    const br = new THREE.Group();
    br.position.set(0.3, 0.02, 0.06);
    br.add(mesh(cyl(0.09, 0.11, 0.3, 10), brocStem, { y: -0.16 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      br.add(mesh(sphere(0.13, 10, 8), broc, { x: Math.cos(a) * 0.13, z: Math.sin(a) * 0.13, y: 0.1 + (i % 2) * 0.05 }));
    }
    br.add(mesh(sphere(0.15, 12, 10), broc, { y: 0.2 }));
    g.add(br);
    g.add(makeFace(0.36, 0.1, 0.34));
    g.userData.radius = 0.62;
    return reg(g, carrot, top, broc, brocStem);
  },

  eggs() {
    const g = new THREE.Group();
    const shell = foodMaterial(0xfaf0dc, { rough: 0.42 });
    const shell2 = foodMaterial(0xecd9b8, { rough: 0.42 });
    const one = (x, z, s, m) => {
      const e = mesh(sphere(0.24, 18, 14), m, { x, z, y: 0.2 * s });
      e.scale.set(s, s * 1.32, s);
      return e;
    };
    g.add(one(-0.24, 0.06, 1, shell), one(0.22, -0.1, 0.92, shell2), one(0.06, 0.3, 0.8, shell));
    g.add(makeFace(0.34, 0.2, 0.24));
    g.userData.radius = 0.56;
    return reg(g, shell, shell2);
  },

  milk() {
    const g = new THREE.Group();
    const carton = foodMaterial(0xf7fafc, { rough: 0.5 });
    const band = foodMaterial(0x1e6fc4, { rough: 0.45 });
    g.add(mesh(roundedBox(0.46, 0.72, 0.46, 0.04), carton, { y: 0.06 }));
    // gable top — the shape cue that says "milk" at a glance
    const gable = mesh(new THREE.CylinderGeometry(0.001, 0.33, 0.26, 4, 1), carton, { y: 0.53, ry: Math.PI / 4 });
    gable.scale.set(1, 1, 1);
    g.add(gable);
    g.add(mesh(roundedBox(0.48, 0.2, 0.48, 0.03), band, { y: -0.12 }));
    g.add(mesh(cyl(0.06, 0.06, 0.09, 10), plastic(0x2f6fae), { x: 0.11, y: 0.63 }));
    g.add(makeFace(0.34, 0.14, 0.25));
    g.userData.radius = 0.52;
    return reg(g, carton, band);
  },

  juice() {
    const g = new THREE.Group();
    const juiceM = foodMaterial(0xffa726, { rough: 0.22 });
    const capM = foodMaterial(0x4caf50, { rough: 0.4 });
    const bottle = mesh(cyl(0.2, 0.24, 0.62, 18), glass(0xffe0b2, { opacity: 0.28 }), { y: 0.08 });
    g.add(bottle);
    g.add(mesh(cyl(0.185, 0.225, 0.46, 18), juiceM, { y: 0.0 }));       // liquid inside
    g.add(mesh(cyl(0.09, 0.16, 0.16, 14), glass(0xffe0b2, { opacity: 0.28 }), { y: 0.46 }));
    g.add(mesh(cyl(0.1, 0.1, 0.1, 14), capM, { y: 0.58 }));
    g.add(mesh(roundedBox(0.34, 0.2, 0.02, 0.02), matte(0xfff3e0), { y: 0.06, z: 0.22 }));
    g.add(makeFace(0.3, 0.08, 0.26));
    g.userData.radius = 0.5;
    return reg(g, juiceM, capM);
  },
};

export function buildFoodModel(modelId) {
  // A Blender-modelled food wins outright where one exists: the whole job of a
  // food model is to be nameable in a second at counter size, and that is
  // silhouette. Modelled foods carry no face decal either — the reference art
  // has an anatomical eye, and a camera-facing smiley plane sits in the middle
  // of the shape it is supposed to be helping you read.
  const g = foodAssets.has(modelId) ? foodAssets.instance(modelId) : (BUILDERS[modelId] || BUILDERS.fruits)();

  // Faces off, on every food. They were a fourth channel for the spoilage
  // timer, but a Year 6 audience is not a preschool one, the microorganisms are
  // the characters in this story and already have faces, and a camera-facing
  // decal parked in the middle of a silhouette actively fights the thing it is
  // sitting on — half of why the squid read as a piglet. Spoilage still shows
  // as desaturation, mould patches, stink wisps, the swarm and the meter.
  for (const child of [...g.children]) if (child.userData.isFace) child.removeFromParent();
  g.userData.face = null;

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (!g.userData.radius) {
    const box = new THREE.Box3().setFromObject(g);
    g.userData.radius = box.getSize(new THREE.Vector3()).length() * 0.42;
  }
  return g;
}

export const FOOD_MODEL_IDS = Object.keys(BUILDERS);

/** Which foods the modelled assets cover — used by the asset preloader. */
export const FOOD_MODEL_LIST = FOOD_MODEL_IDS;
