/**
 * The 3D things the Fact Book puts in its viewers.
 *
 * METHOD MODELS
 * A playable method shows the machine the player actually operates, resolved
 * through `METHODS[id].station` — never a lookup table in this file. That is
 * what makes the Fact Book reinforce recognition rather than teach a second,
 * prettier version of the kitchen.
 *
 * A method the curriculum defines but does not make playable (§5A boiling,
 * §5G waxing) has no station, so it gets a small educational diorama instead.
 * It must never be given a machine it does not have.
 *
 * FOOD MODELS
 * Straight from FOODS[].model via the game's own food builder, so the fish in
 * the book is the fish on the counter.
 */
import * as THREE from 'three';
import { PALETTE } from '../../world/Palette.js';
import { matte, plastic, metal, glass, roundedBox, cyl, sphere, mesh } from '../../world/Materials.js';
import { buildFoodModel } from '../../world/FoodFactory.js';
import { DryingRack } from '../../world/stations/DryingRack.js';
import { Freezer } from '../../world/stations/Freezer.js';
import { VacuumSealer } from '../../world/stations/VacuumSealer.js';
import { PicklingJar } from '../../world/stations/PicklingJar.js';
import { SaltTable } from '../../world/stations/SaltTable.js';
import { Pasteuriser } from '../../world/stations/Pasteuriser.js';
import { Smokehouse } from '../../world/stations/Smokehouse.js';
import { Cannery } from '../../world/stations/Cannery.js';

const STATION_CLASSES = {
  DryingRack, Freezer, VacuumSealer, PicklingJar, SaltTable, Pasteuriser,
  Smokehouse, Cannery,
};

function disposeTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m?.dispose?.();
  });
}

// -------------------------------------------------------------- non-playable
/** §5A — boiling. High temperature, nothing sealed, nothing chilled. */
function boilingDiorama() {
  const g = new THREE.Group();
  const steel = metal(PALETTE.steel);
  g.add(mesh(cyl(0.62, 0.56, 0.7, 24), steel, { y: 0.85 }));
  g.add(mesh(cyl(0.66, 0.66, 0.06, 24), metal(PALETTE.steelDark), { y: 1.22 }));
  const broth = matte(0xc8791f, 0.4);
  g.add(mesh(cyl(0.56, 0.56, 0.06, 24), broth, { y: 1.14 }));
  for (const s of [-1, 1]) {
    g.add(mesh(cyl(0.05, 0.05, 0.34, 8), metal(PALETTE.steelDark), { x: s * 0.66, y: 0.98, rz: Math.PI / 2 }));
  }
  // stove
  g.add(mesh(roundedBox(1.7, 0.4, 1.3, 0.08), matte(PALETTE.steelDeep, 0.7), { y: 0.2 }));
  const bubbles = [];
  const bubbleMat = matte(0xffe4b5, 0.3);
  for (let i = 0; i < 9; i++) {
    const b = mesh(sphere(0.05 + (i % 3) * 0.02, 10, 8), bubbleMat, {
      x: (Math.random() - 0.5) * 0.8, y: 1.16, z: (Math.random() - 0.5) * 0.8,
    });
    b.userData.phase = Math.random() * Math.PI * 2;
    g.add(b);
    bubbles.push(b);
  }
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const f = mesh(new THREE.ConeGeometry(0.07, 0.24, 6), plastic(0xff8a3d, { emissive: 0xff5722, emissiveIntensity: 1.4 }), {
      x: Math.cos(a) * 0.42, y: 0.5, z: Math.sin(a) * 0.42,
    });
    g.add(f);
    flames.push(f);
  }
  return {
    object: g,
    update(dt, elapsed) {
      for (const b of bubbles) {
        const t = (elapsed * 1.4 + b.userData.phase) % 2;
        b.position.y = 1.14 + t * 0.14;
        b.scale.setScalar(Math.max(0.01, 1 - t * 0.5));
      }
      for (const [i, f] of flames.entries()) {
        f.scale.y = 0.8 + Math.sin(elapsed * 9 + i) * 0.22;
      }
    },
  };
}

/** §5G — waxing. A coat on the surface; nothing is heated and nothing dried. */
function waxingDiorama() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.8, 0.22, 1.3, 0.06), matte(PALETTE.wood, 0.8), { y: 0.11 }));
  const apple = new THREE.Group();
  apple.position.y = 0.82;
  const body = mesh(sphere(0.52, 22, 16), matte(0xd6483c, 0.34));
  body.scale.set(1, 0.92, 1);
  apple.add(body);
  apple.add(mesh(cyl(0.035, 0.045, 0.24, 8), matte(0x7a5230, 0.8), { y: 0.54 }));
  const leaf = mesh(sphere(0.16, 12, 8), matte(0x6fae4a, 0.7), { x: 0.2, y: 0.6, rz: -0.5 });
  leaf.scale.set(1, 0.28, 0.55);
  apple.add(leaf);
  // The wax coat itself — a thin glossy shell just proud of the fruit.
  const coat = mesh(sphere(0.57, 22, 16), glass(0xeef3b0, { opacity: 0.34, rough: 0.05 }));
  coat.scale.set(1, 0.92, 1);
  apple.add(coat);
  g.add(apple);
  const drops = [];
  for (let i = 0; i < 5; i++) {
    const d = mesh(sphere(0.07, 10, 8), matte(0xd4e157, 0.2), { x: -0.9 + i * 0.06, y: 1.5 - i * 0.1, z: 0.1 });
    d.userData.phase = i * 0.4;
    g.add(d);
    drops.push(d);
  }
  return {
    object: g,
    update(dt, elapsed) {
      apple.rotation.y += dt * 0.35;
      for (const d of drops) {
        const t = (elapsed * 0.7 + d.userData.phase) % 1.6;
        d.position.y = 1.6 - t * 0.75;
        d.position.x = -0.72 + t * 0.42;
        d.visible = t < 1.3;
      }
    },
  };
}

const DIORAMAS = { boiling: boilingDiorama, waxing: waxingDiorama };

/** Last-resort visual so a new non-playable method is never a blank box. */
function mechanismDiorama(mv) {
  const g = new THREE.Group();
  const colour = mv.colour;
  g.add(mesh(roundedBox(1.6, 0.2, 1.2, 0.06), matte(PALETTE.wood, 0.8), { y: 0.1 }));
  g.add(mesh(roundedBox(0.9, 0.9, 0.9, 0.14), plastic(colour), { y: 0.7 }));
  return { object: g, update() {} };
}

/**
 * The interactive model for a method.
 * @returns {{object:THREE.Object3D, update:(dt:number,e:number)=>void, dispose:()=>void, playable:boolean}}
 */
export function buildMethodModel(mv) {
  if (mv.playable && mv.station && STATION_CLASSES[mv.station]) {
    const station = new STATION_CLASSES[mv.station](mv.id);
    // A station shared by two methods (Freezer = freezing + cooling) reads
    // getSteps() off this, not off the constructor's methodId (§ Station.js);
    // the book must set it itself since nothing ever drops food here to do it.
    station.activeMethodId = mv.id;
    // The book is not the kitchen: the name plate and the drop ring belong to
    // gameplay, and the panel already says which method this is.
    station.setLabelsVisible(false);
    if (station.ring) station.ring.visible = false;
    const object = station.root;
    return {
      object,
      playable: true,
      station,
      update: (dt, elapsed) => station.update(dt, elapsed),
      dispose: () => disposeTree(object),
    };
  }
  const make = DIORAMAS[mv.id] || (() => mechanismDiorama(mv));
  const d = make();
  return {
    object: d.object,
    playable: false,
    update: d.update,
    dispose: () => disposeTree(d.object),
  };
}

/**
 * A food model for a card or for close inspection. Returns null for a food the
 * notes name but the game has no model for — the card falls back to a drawn
 * illustration, and the curriculum content is still shown either way (§26).
 */
export function buildFoodObject(fv) {
  if (!fv || !fv.model) return null;
  const g = buildFoodModel(fv.model);
  g.scale.setScalar(fv.scale || 1);
  return {
    object: g,
    dispose: () => disposeTree(g),
  };
}
