/**
 * Shared material + geometry library.
 *
 * Two rules that keep this looking like one game:
 *  1. Nothing anywhere calls `new THREE.MeshStandardMaterial` directly — it goes
 *     through a factory here, so roughness/clearcoat stay in a consistent band.
 *  2. Every hard edge is bevelled. Sharp boxes are the #1 tell of a developer
 *     placeholder; rounded boxes read as moulded plastic immediately.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from './Palette.js';

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Clearcoat and IBL-driven sheen are the most expensive thing a mobile GPU
// can be asked to shade per-fragment (extra BRDF layer + extra env-map mip
// lookups). Set once at boot from detectQuality() so weak tablets never pay
// for it — high quality keeps the "premium" look untouched.
let _quality = 'high';
export function setMaterialQuality(q) { _quality = q; }
export function clearcoatFor(v) { return _quality === 'high' ? v : 0; }

// ---------------------------------------------------------------- materials

/** Moulded plastic — machine shells, UI-ish props. Slight clearcoat = premium. */
export function plastic(colour, { rough = 0.42, clearcoat = 0.55, emissive = 0, emissiveIntensity = 0 } = {}) {
  clearcoat = clearcoatFor(clearcoat);
  return memo(`plastic:${colour}:${rough}:${clearcoat}:${emissive}:${emissiveIntensity}:${_quality}`, () =>
    _quality === 'high'
      ? new THREE.MeshPhysicalMaterial({
        color: colour, roughness: rough, metalness: 0.0,
        clearcoat, clearcoatRoughness: 0.35,
        emissive, emissiveIntensity,
      })
      : new THREE.MeshStandardMaterial({
        color: colour, roughness: rough, metalness: 0.0,
        emissive, emissiveIntensity,
      }));
}

/** Brushed metal — hinges, pipes, trays. */
export function metal(colour = PALETTE.steel, { rough = 0.32, metalness = 0.85 } = {}) {
  return memo(`metal:${colour}:${rough}:${metalness}:${_quality}`, () =>
    _quality === 'high'
      ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: rough, metalness })
      : new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness }));
}

/** Painted matte — wood, walls, cloth. */
export function matte(colour, rough = 0.85) {
  return memo(`matte:${colour}:${rough}`, () =>
    new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: 0 }));
}

/** Transmissive glass — jars, freezer window, bag film. */
export function glass(colour = PALETTE.glass, {
  opacity = 0.32, rough = 0.06, ior = 1.45, clearcoat: requestedClearcoat = 1,
} = {}) {
  const clearcoat = clearcoatFor(requestedClearcoat);
  return memo(`glass:${colour}:${opacity}:${rough}:${clearcoat}:${_quality}`, () =>
    _quality === 'high'
      ? new THREE.MeshPhysicalMaterial({
        color: colour, roughness: rough, metalness: 0, transmission: 0.0,
        transparent: true, opacity, ior, clearcoat, clearcoatRoughness: 0.05,
        depthWrite: false, side: THREE.DoubleSide,
      })
      : new THREE.MeshStandardMaterial({
        color: colour, roughness: Math.max(0.16, rough), metalness: 0,
        transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      }));
}

/** Self-lit panel — indicator lights, screens, glowing rims. */
export function glow(colour, intensity = 1.6) {
  return memo(`glow:${colour}:${intensity}`, () =>
    new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
}

/** Emissive-standard, for things that glow but still take light (heat coils). */
export function hot(colour, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({
    color: colour, emissive: colour, emissiveIntensity: intensity,
    roughness: 0.5, metalness: 0.1,
  });
}

/**
 * Food material. Cloned per-instance because each food animates its own
 * freshness independently. `spoil` 0..1 desaturates + darkens + roughens,
 * which is the "changes colour / changes texture" signal from §2 of the notes.
 */
export function foodMaterial(baseColour, { rough = 0.55, sheen = 0.25 } = {}) {
  const m = _quality === 'high'
    ? new THREE.MeshPhysicalMaterial({
      color: baseColour, roughness: rough, metalness: 0.02,
      sheen: clearcoatFor(sheen), sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
      clearcoat: clearcoatFor(0.15), clearcoatRoughness: 0.6,
    })
    : new THREE.MeshStandardMaterial({
      color: baseColour, roughness: rough, metalness: 0.02,
    });
  m.userData.baseColour = new THREE.Color(baseColour);
  return m;
}

const _spoilTarget = new THREE.Color(PALETTE.spoilTint);
const _tmpCol = new THREE.Color();
/** Drive a food material toward its spoilt look. Call every frame. */
export function applySpoil(mat, spoil) {
  const base = mat.userData.baseColour;
  if (!base) return;
  _tmpCol.copy(base).lerp(_spoilTarget, spoil * 0.72);
  // Desaturate as it goes — spoilt food loses its appetising chroma.
  const hsl = { h: 0, s: 0, l: 0 };
  _tmpCol.getHSL(hsl);
  _tmpCol.setHSL(hsl.h, hsl.s * (1 - spoil * 0.55), hsl.l * (1 - spoil * 0.3));
  mat.color.copy(_tmpCol);
  mat.roughness = THREE.MathUtils.lerp(0.45, 0.95, spoil); // dull + slimy
  // Keep these pinned at 0 off the high tier — writing a nonzero value here
  // every frame would force three.js to (re)compile the clearcoat/sheen shader
  // variant, undoing the saving from creating the material with clearcoat: 0.
  if (_quality === 'high') {
    mat.clearcoat = THREE.MathUtils.lerp(0.2, 0.02, spoil);
    mat.sheen = THREE.MathUtils.lerp(0.3, 0.0, spoil);
  }
}

// ---------------------------------------------------------------- geometry

/** Bevelled box. Segments kept low — the bevel does the work, not the poly count. */
export function roundedBox(w, h, d, radius = 0.06, segments = 3) {
  const r = Math.min(radius, w / 2.05, h / 2.05, d / 2.05);
  return memo(`rbox:${w}:${h}:${d}:${r}:${segments}`, () =>
    new RoundedBoxGeometry(w, h, d, segments, r));
}

export function cyl(rt, rb, h, seg = 24, open = false) {
  return memo(`cyl:${rt}:${rb}:${h}:${seg}:${open}`, () =>
    new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function sphere(r, w = 20, h = 14) {
  return memo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
}

export function capsule(r, len, cap = 6, radial = 16) {
  return memo(`cap:${r}:${len}:${cap}:${radial}`, () =>
    new THREE.CapsuleGeometry(r, len, cap, radial));
}

export function torus(r, tube, radial = 12, tubular = 32) {
  return memo(`tor:${r}:${tube}:${radial}:${tubular}`, () =>
    new THREE.TorusGeometry(r, tube, radial, tubular));
}

/** A squashed sphere — the workhorse for organic food shapes. */
export function blob(rx, ry, rz, w = 20, h = 14) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

// ---------------------------------------------------------------- helpers

export function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  // Transparent shadows require another alpha-shaded shadow-map draw and are
  // barely visible in this stylised scene. Keep them only on the high tier.
  m.castShadow = cast && (_quality === 'high' || !material?.transparent);
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}

/**
 * Soft blob shadow. Far cheaper than a shadow map and reads better for a
 * stylised look — it grounds objects without the harsh contact line.
 */
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _blobTex = new THREE.CanvasTexture(c);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  return _blobTex;
}

export function blobShadow(radius = 0.5, opacity = 0.75) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity,
      depthWrite: false, toneMapped: false, color: PALETTE.shadowTint,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

/** Canvas-drawn label texture — crisp, no font files, respects device pixel ratio. */
export function labelTexture(text, {
  width = 512, height = 128, bg = '#ffffff', fg = '#2b1d33',
  font = '700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  radius = 28, padding = 16, border = null, maxLines = 1,
} = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = width * dpr; c.height = height * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(padding / 2, padding / 2, width - padding, height - padding, radius);
    ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.stroke(); }
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Split long translated labels at the most balanced word boundary before
  // shrinking them. This keeps mobile signage readable in verbose locales.
  let size = parseInt(font.match(/(\d+)px/)?.[1] || '64', 10);
  let lines = [text];
  if (maxLines > 1 && ctx.measureText(text).width > width - padding * 3) {
    const words = text.trim().split(/\s+/);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const candidate = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const widest = Math.max(...candidate.map((line) => ctx.measureText(line).width));
      if (!best || widest < best.widest) best = { lines: candidate, widest };
    }
    if (best) lines = best.lines;
  }
  const fits = () => Math.max(...lines.map((line) => ctx.measureText(line).width)) <= width - padding * 3
    && size * 1.04 * lines.length <= height - padding * 1.4;
  while (!fits() && size > 18) {
    size -= 2;
    ctx.font = font.replace(/\d+px/, `${size}px`);
  }
  const lineHeight = size * 1.04;
  const firstY = height / 2 + 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, firstY + i * lineHeight));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Merge every static mesh under `root` into one mesh per material.
 *
 * The kitchen is built from ~200 small meshes (jars, slats, leaves, cabinet
 * doors) which is lovely to author and terrible to render — it was most of a
 * 700+ draw-call frame. They never move, so they can be baked into a handful of
 * batched meshes at startup with no visual change at all.
 *
 * Anything that animates must opt out with `userData.dynamic = true`.
 */
const _tmpMat = new THREE.Matrix4();

export function mergeStatic(root) {
  const buckets = new Map();

  root.updateWorldMatrix(true, true);
  // Bake each mesh's transform RELATIVE TO ROOT, not its world matrix. The
  // merged mesh is parented to root, so baking world would apply root's own
  // transform twice — invisible for the kitchen, which sits at the origin at
  // identity scale, but the station bodies are scaled 1.22 and would have come
  // out half again too big.
  const toLocal = root.matrixWorld.clone().invert();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.dynamic || o.userData.merged) return;
    if (Array.isArray(o.material)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) {
      if (p.userData.dynamic) return;             // inherit the opt-out
    }
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) {
      buckets.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [], meshes: [] });
    }
    const g = o.geometry.clone();
    g.applyMatrix4(_tmpMat.multiplyMatrices(toLocal, o.matrixWorld));
    // mergeGeometries requires identical attribute sets across inputs.
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const b = buckets.get(key);
    b.geos.push(g);
    b.meshes.push(o);
  });

  let batches = 0, removed = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) { b.geos.forEach((g) => g.dispose()); continue; }
    // mergeGeometries needs every input to agree on having an index or not,
    // and station geometry mixes the two (a PlaneGeometry is indexed, a merged
    // one may not be). Normalise the bucket rather than dropping the batch.
    const anyUnindexed = b.geos.some((g) => !g.index);
    const geos = anyUnindexed ? b.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : b.geos;
    let batch = null;
    try { batch = mergeGeometries(geos, false); } catch { batch = null; }
    for (const g of geos) if (!b.geos.includes(g)) g.dispose();
    b.geos.forEach((g) => g.dispose());
    if (!batch) continue;
    const m = new THREE.Mesh(batch, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.matrixAutoUpdate = false;
    m.userData.merged = true;
    root.add(m);
    batches++;
    for (const o of b.meshes) { o.removeFromParent(); removed++; }
  }
  return { batches, removed };
}

export function disposeCache() {
  for (const v of cache.values()) v.dispose?.();
  cache.clear();
}
