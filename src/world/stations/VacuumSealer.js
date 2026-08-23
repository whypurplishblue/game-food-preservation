/**
 * VACUUM PACKING — "removes air" (§5D).
 *
 * Interaction: bag it → HOLD the pump until the air gauge reads zero → seal.
 *
 * The hold is the mechanism made physical. Air is a quantity that has to be
 * pulled out over time; the film draws tight around the food as the gauge falls
 * without changing its silhouette. Releasing early stops the gauge, so the
 * child learns that partial air removal is not preservation.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh } from '../Materials.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / Math.max(0.0001, b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// The top/bottom film panels need to be dense enough to read a real food
// silhouette from _captureConform's raycast mask (see _updateFilm) — a food
// footprint that dodges between grid points would just fall back to the box
// shape the mask is there to avoid. The four side walls stay coarse since
// only their sag/bulge/collapse ever animates, never a raycast hit.
const FILM_TOP_COLS = 12;
const FILM_TOP_ROWS = 10;

// The dome's usable interior, in the lid's own local space: y 0 is the deck
// (the dome's rim rests flush there when closed) and y LID_DOME_HEIGHT is
// the underside of the top plate. Closed now means rotation 0 by
// construction — the hinge sits ON the deck (see build()) — so there is no
// forward-kinematics case left to get wrong the way the old flat panel did.
const LID_DOME_WIDTH = 2.1;
const LID_DOME_DEPTH = 1.38;
const LID_DOME_HEIGHT = 0.6;
const LID_DOME_PLATE_T = 0.045;
const LID_DOME_WALL_T = 0.035;
const LID_DOME_HALF_X = LID_DOME_WIDTH / 2;
const LID_DOME_HALF_Z = LID_DOME_DEPTH / 2;

// The intake grille's rest position on the deck — inside the dome's
// footprint, off to one side so it does not sit under the pack itself.
// Shared by build() (placing the grille) and tick() (aiming the air-particle
// arc and the pump vibration at the same point).
const PUMP_PORT = { x: 0.62, y: 1.046, z: -0.32 };

// The external pump housing's rest pose, front-right of the machine — see
// build() for the clearance this patch of the front face has against the
// dome's swept footprint. Shared with tick() (vibration) and resetVisuals()
// (restoring the rest pose) so all three read the one number.
const PUMP_BODY = { x: 0.75, y: 0.68, z: 0.86 };

// How much the contact squeeze (see tick()) widens the food laterally at
// full contact. Shared with _fitFood() so the fitted `k` targets the size
// the food actually reaches once squeezed, not the resting size it starts
// from — otherwise the squeeze eats the whole clearance margin and the pack
// overshoots the film (see sausages in the design notes).
const CONTACT_SQUEEZE_XZ = 0.02;

// The lateral clearance _fitFood() guarantees between the fitted (squeezed)
// food and the open chamber's own walls. Shared with _captureFilmTarget() so
// the film's target rectangle can never clamp narrower than a food _fitFood
// has already promised will fit — a food fitted right up against this
// budget must still find film waiting for it at its own edge, not 1cm short
// of it (see the sausages measurement in the design notes).
const FIT_MARGIN_XZ = 0.06;

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** A small, deformable grid used for one transparent side of the bag. */
function makeFilmSurface(name, material, cols = 3, rows = 2) {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const indices = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, material);
  surface.name = name;
  surface.renderOrder = 4;
  return surface;
}

function updateFilmSurface(surface, cols, rows, pointAt) {
  const position = surface.geometry.attributes.position;
  let index = 0;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const p = pointAt(col / cols, row / rows);
      position.setXYZ(index++, p[0], p[1], p[2]);
    }
  }
  position.needsUpdate = true;
  surface.geometry.computeVertexNormals();
  surface.geometry.computeBoundingSphere();
}

function makeCreaseLine(name, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const line = new THREE.Line(geometry, material);
  line.name = name;
  line.renderOrder = 5;
  return line;
}

function updateCreaseLine(line, points) {
  const position = line.geometry.attributes.position;
  points.forEach((p, i) => position.setXYZ(i, p[0], p[1], p[2]));
  position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

export class VacuumSealer extends Station {
  build() {
    // Broad pale surfaces used to catch the environment like polished ceramic,
    // washing out their seams under the kitchen key light. A satin response
    // keeps the low-poly bevels readable without making the machine look dull.
    const shell = plastic(0xeef1f6, { rough: 0.5, clearcoat: 0.22 });
    const accent = plastic(PALETTE.vacuum, { rough: 0.54, clearcoat: 0.2 });

    // Low, wide machine body — deliberately a different silhouette from the
    // tall freezer so the two never get confused once labels are off.
    this.body.add(mesh(roundedBox(2.25, 0.72, 1.5, 0.14), shell, { y: 0.58 }));
    this.body.add(mesh(roundedBox(2.3, 0.16, 1.55, 0.07), accent, { y: 0.96 }));

    // Hinged, transparent chamber DOME — a five-sided open box (top plate +
    // four short walls), not an opaque box with a postage-stamp window, so
    // watching the air leave means watching the whole chamber. Hinged at the
    // deck's own back edge: closed, the rim rests flush on the deck instead
    // of the old panel's built pose, which overlapped it.
    const domeGlass = glass(0xe4d4f5, { opacity: 0.28, rough: 0.22, clearcoat: 0.15 });
    const lid = new THREE.Group();
    lid.position.set(0, 1.04, -0.72);
    const lidPanel = new THREE.Group();
    // Offset forward by half the dome's own depth — the same trick the old
    // flat panel used — so at rotation 0 (closed) the dome centres over the
    // chamber instead of hanging half off the back of the machine.
    lidPanel.position.z = LID_DOME_HALF_Z;
    lidPanel.add(mesh(roundedBox(LID_DOME_WIDTH, LID_DOME_PLATE_T, LID_DOME_DEPTH, 0.08), domeGlass, {
      y: LID_DOME_HEIGHT + LID_DOME_PLATE_T / 2,
    }));
    lidPanel.add(mesh(roundedBox(LID_DOME_WIDTH, LID_DOME_HEIGHT, LID_DOME_WALL_T, 0.03), domeGlass, {
      y: LID_DOME_HEIGHT / 2, z: LID_DOME_HALF_Z - LID_DOME_WALL_T / 2,
    }));
    lidPanel.add(mesh(roundedBox(LID_DOME_WIDTH, LID_DOME_HEIGHT, LID_DOME_WALL_T, 0.03), domeGlass, {
      y: LID_DOME_HEIGHT / 2, z: -LID_DOME_HALF_Z + LID_DOME_WALL_T / 2,
    }));
    lidPanel.add(mesh(roundedBox(LID_DOME_WALL_T, LID_DOME_HEIGHT, LID_DOME_DEPTH, 0.03), domeGlass, {
      x: -LID_DOME_HALF_X + LID_DOME_WALL_T / 2, y: LID_DOME_HEIGHT / 2,
    }));
    lidPanel.add(mesh(roundedBox(LID_DOME_WALL_T, LID_DOME_HEIGHT, LID_DOME_DEPTH, 0.03), domeGlass, {
      x: LID_DOME_HALF_X - LID_DOME_WALL_T / 2, y: LID_DOME_HEIGHT / 2,
    }));
    // Rim, framing the base of the glass walls rather than a filled slab —
    // four accent bars, not one plate, so the hollow middle leaves the
    // chamber floor (and the intake grille sitting on it) visible straight
    // through, while the perimeter itself reads twice as thick as the old
    // slim strip: the box-to-glass seam a glass dome needs to still draw a
    // clear "lid" line at gameplay range instead of dissolving against it.
    const rimT = 0.08, rimH = 0.1;
    const rimOuterX = LID_DOME_HALF_X + 0.02;
    const rimOuterZ = LID_DOME_HALF_Z + 0.02;
    lidPanel.add(mesh(roundedBox(rimOuterX * 2, rimH, rimT, 0.03), accent, {
      y: rimH / 2, z: rimOuterZ - rimT / 2,
    }));
    lidPanel.add(mesh(roundedBox(rimOuterX * 2, rimH, rimT, 0.03), accent, {
      y: rimH / 2, z: -rimOuterZ + rimT / 2,
    }));
    lidPanel.add(mesh(roundedBox(rimT, rimH, rimOuterZ * 2, 0.03), accent, {
      x: rimOuterX - rimT / 2, y: rimH / 2,
    }));
    lidPanel.add(mesh(roundedBox(rimT, rimH, rimOuterZ * 2, 0.03), accent, {
      x: -rimOuterX + rimT / 2, y: rimH / 2,
    }));
    lidPanel.add(mesh(cyl(0.045, 0.045, 0.9, 10), metal(PALETTE.steel), {
      y: LID_DOME_HEIGHT + LID_DOME_PLATE_T + 0.05, z: LID_DOME_HALF_Z - 0.18, rz: Math.PI / 2,
    }));
    lid.add(lidPanel);
    this.lid = lid;
    this.body.add(lid);

    // Sealing bar — glows red-hot on the final step.
    this.sealBar = mesh(roundedBox(1.6, 0.05, 0.09, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x7a5b8f, emissive: 0x000000, roughness: 0.5 }),
      { y: 0.98, z: 0.42 });
    this.body.add(this.sealBar);

    // The bag is a handful of deformable film surfaces rather than one box.
    // Each surface is updated from the food's bounds during the pump, so the
    // plastic closes around the food instead of merely scaling down in place.
    // Clone because opacity changes while pumping; the factory returns the
    // cheaper Standard shader on mobile and the glossy Physical shader on high.
    const bagMat = glass(0xe8eef5, {
      opacity: 0.24, rough: 0.28, clearcoat: 0.08,
    }).clone();
    bagMat.depthWrite = false;
    this.filmMaterial = bagMat;
    const creaseMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false,
    });
    this.filmCreaseMaterial = creaseMat;

    const film = new THREE.Group();
    film.name = 'VacuumFilm';
    film.visible = false;
    this.bag = film;
    this.film = film;
    this.body.add(film);

    // Top/bottom are dense enough to drape over a real food silhouette
    // (see _captureConform); the four walls only ever sag/bulge, so they
    // stay coarse.
    this.filmTop = makeFilmSurface('VacuumFilmTop', bagMat, FILM_TOP_COLS, FILM_TOP_ROWS);
    this.filmBottom = makeFilmSurface('VacuumFilmBottom', bagMat, FILM_TOP_COLS, FILM_TOP_ROWS);
    this.filmFront = makeFilmSurface('VacuumFilmFront', bagMat, 3, 2);
    this.filmBack = makeFilmSurface('VacuumFilmBack', bagMat, 3, 2);
    this.filmLeft = makeFilmSurface('VacuumFilmLeft', bagMat, 2, 2);
    this.filmRight = makeFilmSurface('VacuumFilmRight', bagMat, 2, 2);
    film.add(
      this.filmTop, this.filmBottom, this.filmFront, this.filmBack,
      this.filmLeft, this.filmRight,
    );

    this.filmMouth = mesh(roundedBox(1.25, 0.045, 0.1, 0.02), bagMat, {
      cast: false, name: 'VacuumFilmMouth',
    });
    film.add(this.filmMouth);
    this.filmCreases = [0, 1, 2, 3].map((i) => makeCreaseLine(`VacuumFilmCrease${i}`, creaseMat));
    film.add(...this.filmCreases);

    // Fact Book autoplay has no docked ingredient. This neutral low-poly core
    // gives the film a visible target without importing a curriculum food or
    // changing the station's food contract.
    const demoCore = new THREE.Group();
    demoCore.name = 'VacuumDemoCore';
    demoCore.add(mesh(roundedBox(0.78, 0.26, 0.52, 0.1), matte(0xb43b36, 0.72), {
      y: 1.26, z: 0.12, cast: false,
    }));
    demoCore.add(mesh(roundedBox(0.56, 0.035, 0.32, 0.025), matte(0xf2e3cf, 0.8), {
      y: 1.405, z: 0.14, cast: false,
    }));
    demoCore.visible = false;
    this.demoCore = demoCore;
    film.add(demoCore);

    // Grown as far as the deck/lid geometry allows: every playable food is
    // wider or deeper than the old 0.66×0.5 envelope, which is what let the
    // meat pierce the film instead of fitting inside it. `cz` moved only a
    // little from the original 0.12 — measurement (see _lidPumpClearance)
    // showed pulling it further forward, toward the hinge, actually loses
    // lid clearance rather than gaining it, so this is a small compromise
    // between the deck's front edge and the lid's hinge, not a full swing
    // to either.
    this._openPose = {
      cx: 0, cz: 0.08, halfX: 0.9, halfZ: 0.5, bottom: 1.03, top: 1.63,
    };
    this._fallbackPose = {
      cx: 0, cz: 0.08, halfX: 0.46, halfZ: 0.34, bottom: 1.08, top: 1.48,
    };
    this._targetPose = { ...this._fallbackPose };
    this._filmProgress = 0;
    this._autoplayDemo = false;
    this._sealProgress = 0;
    this._sealTarget = 0;

    // Per-docked-food fit state (see _fitFood). Defaults describe "nothing
    // has ever been fitted" so tick()/resetVisuals() never read undefined.
    this._fittedFood = null;
    this._fitK = 1;
    this._targetFitK = 1;
    this._fitYaw = 0;
    this._fitOffset = new THREE.Vector3();
    this._fitHalfHeight = 0;
    this._fitCenterY = this._openPose.bottom + 0.3;
    this._dockTarget = new THREE.Vector3();
    this._dockLocal = new THREE.Vector3();
    this._conformTop = null;
    this._conformBottom = null;
    // Last pose the film target was measured against — see _refreshFilmTarget.
    this._filmSig = { k: NaN, yaw: NaN, sy: NaN, pos: new THREE.Vector3(NaN, NaN, NaN) };

    this._updateFilm(0);

    // Analogue air gauge — big, round, unmistakable.
    const gauge = new THREE.Group();
    gauge.position.set(-0.84, 1.12, 0.72);
    gauge.rotation.x = -0.5;
    gauge.add(mesh(cyl(0.32, 0.32, 0.09, 24), metal(PALETTE.steelDark), { rx: Math.PI / 2 }));
    const face = document.createElement('canvas');
    face.width = face.height = 256;
    this._gaugeCtx = face.getContext('2d');
    this._gaugeTex = new THREE.CanvasTexture(face);
    this._gaugeTex.colorSpace = THREE.SRGBColorSpace;
    gauge.add(mesh(new THREE.CircleGeometry(0.28, 28), new THREE.MeshBasicMaterial({
      map: this._gaugeTex, toneMapped: false, transparent: true,
    }), { z: 0.05, cast: false }));
    const needle = mesh(roundedBox(0.025, 0.24, 0.02, 0.01),
      new THREE.MeshBasicMaterial({ color: 0xd32f2f, toneMapped: false }), { z: 0.07, y: 0.1, cast: false });
    const needlePivot = new THREE.Group();
    needlePivot.position.z = 0.0;
    needlePivot.add(needle);
    gauge.add(needlePivot);
    gauge.add(mesh(cyl(0.035, 0.035, 0.04, 10), metal(PALETTE.brass), { z: 0.08, rx: Math.PI / 2 }));
    this.needle = needlePivot;
    this.body.add(gauge);
    this._drawGauge();

    // Pump housing on the front-right face — the one patch of the front the
    // dome's swept footprint never reaches (closed: x ±1.05, z −0.72…+0.66;
    // open: swings up and back to about z −1.28, never forward of +0.66), so
    // a housing sitting at z 0.75+ can never foul it. Rebuilt in the old
    // external pump's own vocabulary — magenta accent body, dark metal cap,
    // ribbed hose collar — at a scale that fits the strip, so the machine's
    // own shape still says "this thing sucks air" once labels are hidden,
    // balancing the gauge on the front-left.
    const pumpBody = new THREE.Group();
    pumpBody.position.set(PUMP_BODY.x, PUMP_BODY.y, PUMP_BODY.z);
    pumpBody.add(mesh(cyl(0.18, 0.18, 0.22, 14), accent, { rx: Math.PI / 2 }));
    pumpBody.add(mesh(cyl(0.19, 0.19, 0.04, 14), metal(PALETTE.steelDark), {
      z: 0.115, rx: Math.PI / 2,
    }));
    // No rx here, unlike the cylinders above — a torus already lies flat in
    // its own local XY plane with the hole on Z, which is exactly "wrapped
    // around the Z-axis housing"; rotating it the way the cylinders need
    // would instead stand each ring up edge-on, ballooning the housing's
    // own silhouette out past the housing itself.
    for (let i = -1; i <= 1; i++) {
      pumpBody.add(mesh(torus(0.185, 0.024, 6, 12), matte(0x4a3f55, 0.7), {
        z: i * 0.065, cast: false,
      }));
    }
    this.pumpBody = pumpBody;
    this.body.add(pumpBody);

    // What actually draws air out of the chamber stays the flush intake
    // grille set into the deck, inside the dome's own footprint — the
    // housing above is a visible prop, not plumbing, so the particle arc in
    // tick() still targets this, never the housing (see PUMP_PORT there).
    const port = new THREE.Group();
    port.position.set(PUMP_PORT.x, PUMP_PORT.y, PUMP_PORT.z);
    port.add(mesh(cyl(0.17, 0.17, 0.026, 16), metal(PALETTE.steelDark), {}));
    port.add(mesh(torus(0.1, 0.012, 6, 16), metal(PALETTE.steel), { y: 0.015, rx: Math.PI / 2 }));
    port.add(mesh(torus(0.055, 0.01, 6, 12), metal(PALETTE.steel), { y: 0.015, rx: Math.PI / 2, cast: false }));
    port.add(mesh(cyl(0.03, 0.03, 0.012, 10), matte(0x2b2630, 0.6), { y: 0.02, cast: false }));
    this.pumpPort = port;
    this.body.add(port);

    // Air particles streaming out of the bag toward the pump.
    this.airBits = Array.from({ length: 12 }, (_, i) => ({ t: 1, phase: i * 1.91 }));
    this.airMesh = new THREE.InstancedMesh(
      sphere(0.05, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xd9c7ee, transparent: true, opacity: 0.72,
        toneMapped: false, depthWrite: false,
      }),
      this.airBits.length);
    this.airMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.airMesh.castShadow = false;
    this.airMesh.receiveShadow = false;
    this.airMesh.visible = false;
    this.body.add(this.airMesh);
    this._airDummy = new THREE.Object3D();

    this._lidOpen = 0.45; this._targetLid = 0.45; this._air = 1;   // ajar at rest
    this._pumpPower = 0;
  }

  // ---------------------------------------------------------------- fitting
  /**
   * Convert an object's current world-space bounds into this station's
   * body-local frame. The corner-by-corner conversion (rather than
   * transforming the box centre/size directly) is what survives BOTH hosts:
   * the kitchen's flat `body.scale` and the Fact Book's extra `1/r` holder
   * scale (ObjectViewer.prepare) stack differently, and this is the one
   * measurement that does not need to know which one it is in.
   */
  _localBoxFor(object) {
    this.body.updateWorldMatrix(true, true);
    object.updateWorldMatrix(true, true);
    const worldBox = new THREE.Box3().setFromObject(object);
    const box = new THREE.Box3();
    if (worldBox.isEmpty()) return box;
    const v = new THREE.Vector3();
    for (const x of [worldBox.min.x, worldBox.max.x]) {
      for (const y of [worldBox.min.y, worldBox.max.y]) {
        for (const z of [worldBox.min.z, worldBox.max.z]) {
          box.expandByPoint(this.body.worldToLocal(v.set(x, y, z)));
        }
      }
    }
    return box;
  }

  /**
   * How much vertical room the chamber leaves once the dome is fully closed
   * (_lidOpen = 0). Unlike the flat panel this replaces, the dome's rim
   * rests flush on the deck by construction — lid.position.y IS deck height,
   * and closed means rotation 0 — so there is no forward kinematics left to
   * reproduce, only the geometry already declared in build(). One film
   * thickness comes off because the pack's own outer skin is the surface
   * that actually has to clear the glass, not the food underneath it.
   */
  _lidPumpClearance() {
    return this.lid.position.y + LID_DOME_HEIGHT - 0.012;
  }

  /**
   * Measure the docked food once and derive everything downstream of that
   * measurement absolutely, never as a delta. A repeat Fact Book selection
   * hands back the SAME food object with whatever scale/rotation the last
   * dock left it in (Station.release() nulls `this.food` before
   * resetVisuals() runs, so this station can never undo that afterwards) —
   * absolute targeting from `food.baseScale` is what makes re-selecting the
   * same food idempotent.
   */
  _fitFood() {
    const food = this.food;
    if (!food || this._fittedFood === food) return;
    this._fittedFood = food;

    const model = food.model;
    const open = this._openPose;
    const margin = FIT_MARGIN_XZ;

    model.scale.setScalar(food.baseScale);
    model.rotation.set(0, 0, 0);
    let size = this._localBoxFor(model).getSize(new THREE.Vector3());

    // Yaw the long axis across the wide chamber — a steak or a string of
    // sausages fits lengthwise across the deck long before it fits by
    // shrinking alone, and the machine visibly squaring the item up is a
    // beat in its own right (ramped in by tick(), not snapped here).
    let yaw = 0;
    if (size.z > size.x) {
      yaw = Math.PI / 2;
      model.rotation.y = yaw;
      size = this._localBoxFor(model).getSize(new THREE.Vector3());
    }

    // The height budget is the lid's real pump clearance, not the machine's
    // full open-lid headroom — the sealed pack has to pass under a lid that
    // comes part-way down, not the lid at rest.
    const heightTop = Math.min(open.top, this._lidPumpClearance());
    // X/Z divide by (1 + squeeze), not multiply — `k` has to fit the size the
    // food reaches AFTER tick()'s contact squeeze widens it, so the lateral
    // budget has to look smaller than it really is by that same factor. Y
    // gets no such treatment: the squeeze only ever shrinks height.
    const squeezed = 1 + CONTACT_SQUEEZE_XZ;
    const k = Math.max(0.12, Math.min(
      1,
      (open.halfX * 2 - margin) / Math.max(1e-4, size.x * squeezed),
      (open.halfZ * 2 - margin) / Math.max(1e-4, size.z * squeezed),
      (heightTop - open.bottom - margin) / Math.max(1e-4, size.y),
    ));
    this._fitYaw = yaw;
    this._fitK = 1;              // visible scale starts full-size...
    this._targetFitK = k;        // ...and tick() ramps it down to this, across the bag-it step

    // Measure again at the scale that will actually ship, so the stored
    // offset/height describe the pack that ends up in the chamber, not the
    // oversized item that just arrived.
    model.scale.setScalar(food.baseScale * k);
    const fitted = this._localBoxFor(model);
    const fittedSize = fitted.getSize(new THREE.Vector3());
    const fittedCenter = fitted.getCenter(new THREE.Vector3());

    this.body.updateWorldMatrix(true, true);
    const groupOriginLocal = this.body.worldToLocal(food.group.getWorldPosition(new THREE.Vector3()));
    // The vector from the food GROUP's own origin (what tick() actually
    // moves) to where its geometry really sits. Ordinarily near zero, but a
    // model with an off-centre origin (see meat.glb, file header) means it
    // is not always zero — and because this is measured, not assumed, it is
    // correct whether or not that origin gets fixed upstream.
    this._fitOffset = fittedCenter.sub(groupOriginLocal);
    this._fitHalfHeight = fittedSize.y * 0.5;
    // A pouch lies on the deck; it does not float mid-bag.
    this._fitCenterY = open.bottom + 0.02 + this._fitHalfHeight;

    // Visual state resumes from the top — full size, unrotated — so tick()
    // ramps scale and yaw toward these targets instead of snapping into place.
    model.scale.setScalar(food.baseScale);
    model.rotation.y = 0;
  }

  /** World point the docked food's box centre should sit at, this frame. */
  _updateDockTarget() {
    if (!this._fittedFood) return;
    const open = this._openPose;
    this._dockLocal.set(open.cx, this._fitCenterY, open.cz).sub(this._fitOffset);
    this.body.updateWorldMatrix(true, true);
    this._dockTarget.copy(this.body.localToWorld(this._dockLocal.clone()));
  }

  /**
   * One raycast pass per docked food, capturing where the top and bottom
   * film panels should rest once they drape over its real surface. Cheap
   * enough at ~40 rays because it runs once (from onStepDone(0)), never
   * per frame.
   */
  _captureConform() {
    this._conformTop = null;
    this._conformBottom = null;
    const food = this.food;
    if (!food || !this._fittedFood) return;
    // The Fact Book falls back to a flat sprite glyph for a food with no 3D
    // model (see FactBook3D buildMobileFood) — it has no triangles to hit,
    // so leave the existing pillow shape as-is.
    let hasMesh = false;
    food.model.traverse((o) => { if (o.isMesh) hasMesh = true; });
    if (!hasMesh) return;

    const model = food.model;
    // Cast against the food's FITTED pose, not whatever tick()'s ramp has
    // reached so far. onStepDone(0) can fire the same frame as accept() (a
    // gameplay tap, or an autoplay 'tap' step), while `_fitK`/`_fitYaw` are
    // still ramping from their full-size start — casting against that would
    // drape the panels around the wrong silhouette (badly, for a food that
    // yaws 90° or shrinks a lot). Restore the ramp's current values after.
    const savedScale = model.scale.clone();
    const savedYaw = model.rotation.y;
    model.scale.setScalar(food.baseScale * this._targetFitK);
    model.rotation.y = this._fitYaw;
    this._captureFilmTarget();   // refresh _targetPose against the fitted pose

    const cols = FILM_TOP_COLS, rows = FILM_TOP_ROWS;
    const target = this._targetPose || this._fallbackPose;
    const open = this._openPose;
    const top = new Float32Array((cols + 1) * (rows + 1)).fill(NaN);
    const bottom = new Float32Array((cols + 1) * (rows + 1)).fill(NaN);
    const ray = this._conformRay || (this._conformRay = new THREE.Raycaster());
    const unit = (v) => v * 2 - 1;
    const origin = new THREE.Vector3();

    this.body.updateWorldMatrix(true, true);
    let idx = 0;
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++, idx++) {
        const u = col / cols, v = row / rows;
        const x = target.cx + unit(u) * target.halfX;
        const z = target.cz + unit(v) * target.halfZ;

        // Cast in WORLD space, straight down/up, starting outside the box
        // on either side. Only Y-rotations and uniform scales ever occur
        // between here and either host (the kitchen's body.scale, the Fact
        // Book's extra 1/r holder scale) — a world -Y/+Y cast stays
        // perpendicular to the food in both. Do not "optimise" this into a
        // body-space cast; that guarantee does not hold there.
        ray.set(this.body.localToWorld(origin.set(x, open.top + 0.25, z)), DOWN);
        const hitTop = ray.intersectObject(food.model, true)[0];
        if (hitTop) top[idx] = this.body.worldToLocal(hitTop.point).y;

        ray.set(this.body.localToWorld(origin.set(x, open.bottom - 0.25, z)), UP);
        const hitBottom = ray.intersectObject(food.model, true)[0];
        if (hitBottom) bottom[idx] = this.body.worldToLocal(hitBottom.point).y;
      }
    }
    this._conformTop = top;
    this._conformBottom = bottom;

    model.scale.copy(savedScale);
    model.rotation.y = savedYaw;
    // _targetPose now describes the fitted pose rather than the current ramp
    // position; the very next tick() frame calls _captureFilmTarget() again
    // (see tick()) and corrects it, so this is a same-frame-only mismatch.
  }

  /**
   * The per-frame entry point to _captureFilmTarget, skipped once the food has
   * stopped moving.
   *
   * _captureFilmTarget walks the whole food hierarchy through setFromObject.
   * That is fine while the food is settling into the bag, but the pump is a
   * 2.2s hold and the seal runs on after it — several hundred frames during
   * which the pack's pose is fixed and the measurement returns the same answer
   * every time. Phones pay for all of them.
   *
   * The thresholds are deliberately coarse. The squeeze only moves scale.y by
   * 6% across the whole pump, and the conform samples already track it
   * analytically (see _updateFilm), so letting the rim pose lag a few
   * thousandths behind is invisible.
   */
  _refreshFilmTarget() {
    const food = this.food;
    if (!food || !this._fittedFood) { this._captureFilmTarget(); return; }
    const model = food.model;
    const sig = this._filmSig;
    const moved = !(Math.abs(sig.k - this._fitK) <= 1e-3)
      || !(Math.abs(sig.yaw - model.rotation.y) <= 1e-3)
      || !(Math.abs(sig.sy - model.scale.y) <= 4e-3)
      || !(sig.pos.distanceToSquared(food.group.position) <= 1e-6);
    if (!moved) return;
    sig.k = this._fitK;
    sig.yaw = model.rotation.y;
    sig.sy = model.scale.y;
    sig.pos.copy(food.group.position);
    this._captureFilmTarget();
  }

  /** Resolve the film's tight pose from the currently docked food. */
  _captureFilmTarget() {
    const object = this.food?.model || (this._autoplayDemo ? this.demoCore : null);
    if (!object) {
      this._targetPose = { ...this._fallbackPose };
      return;
    }

    const localBox = this._localBoxFor(object);
    if (localBox.isEmpty()) {
      this._targetPose = { ...this._fallbackPose };
      return;
    }
    const size = localBox.getSize(new THREE.Vector3());
    const center = localBox.getCenter(new THREE.Vector3());
    const open = this._openPose;
    // The ceiling here MUST NOT be tighter than what _fitFood() already
    // promised the food (half of open.halfX*2 - FIT_MARGIN_XZ): a narrower
    // rectangle would clamp the film's own raycast sampling domain (see
    // _captureConform) inside the food's real edge, leaving a strip of the
    // food's own silhouette with no film sampled over it at all.
    const halfX = THREE.MathUtils.clamp(size.x * 0.5 + 0.08, 0.38, open.halfX - FIT_MARGIN_XZ / 2);
    const halfZ = THREE.MathUtils.clamp(size.z * 0.5 + 0.08, 0.3, open.halfZ - FIT_MARGIN_XZ / 2);
    const bottom = Math.max(open.bottom + 0.01, localBox.min.y - 0.045);
    const top = Math.min(open.top - 0.03, Math.max(bottom + 0.22, localBox.max.y + 0.055));
    // Stay inside the open envelope rather than a fixed literal, so an
    // off-centre model (a corner-origin bug, or simply a food that does not
    // sit dead centre) still keeps the whole bag on the deck.
    const cxRange = Math.max(0, open.halfX - halfX);
    const czRange = Math.max(0, open.halfZ - halfZ);
    this._targetPose = {
      cx: THREE.MathUtils.clamp(center.x, open.cx - cxRange, open.cx + cxRange),
      cz: THREE.MathUtils.clamp(center.z, open.cz - czRange, open.cz + czRange),
      halfX, halfZ, bottom, top,
    };
  }

  /** Update every film surface for the current evacuation progress. */
  _updateFilm(progress) {
    const p = clamp01(progress);
    this._filmProgress = p;
    const open = this._openPose;
    const target = this._targetPose || this._fallbackPose;
    const squeeze = smoothstep(0.04, 0.78, p);
    const contact = smoothstep(0.42, 0.98, p);
    const seal = clamp01(this._sealProgress);
    const cx = lerp(open.cx, target.cx, squeeze);
    const cz = lerp(open.cz, target.cz, squeeze);
    const halfX = lerp(open.halfX, target.halfX, squeeze);
    const halfZ = lerp(open.halfZ, target.halfZ, squeeze);
    const gap = lerp(0.055, 0.025, contact);
    const surfaceHalfX = halfX + gap;
    const surfaceHalfZ = halfZ + gap;
    const top = lerp(open.top, target.top + 0.045, contact);
    const bottom = lerp(open.bottom, target.bottom - 0.025, contact * 0.7);
    const topSag = lerp(0.025, 0.085, contact);
    const sideBulge = lerp(0.085, 0.022, contact);
    const unit = (v) => v * 2 - 1;

    // Keeps the draped panels from floating off the food once tick()'s
    // contact squeeze (see tick()) shrinks it a little — the conform samples
    // were captured at the un-squeezed fit, so they are re-squashed here
    // about the same centre, every frame, at zero extra measurement cost.
    const squeezeY = 1 - 0.06 * contact;
    const filmThickness = 0.012;
    // Real vacuum film is two sheets welded along a flat perimeter, not a
    // box — outside the food's silhouette both sheets collapse onto the deck
    // and end up this far apart, the thin double layer of welded plastic.
    const weldGap = 0.01;
    const conformAt = (arr, u, v) => {
      if (!arr) return NaN;
      const col = Math.round(u * FILM_TOP_COLS);
      const row = Math.round(v * FILM_TOP_ROWS);
      return arr[row * (FILM_TOP_COLS + 1) + col];
    };

    updateFilmSurface(this.filmTop, FILM_TOP_COLS, FILM_TOP_ROWS, (u, v) => {
      const x = cx + unit(u) * surfaceHalfX;
      const z = cz + unit(v) * surfaceHalfZ;
      const sag = topSag * (1 - unit(u) ** 2) * (1 - unit(v) ** 2);
      const looseY = top - sag;
      const hit = conformAt(this._conformTop, u, v);
      let y;
      if (!Number.isNaN(hit)) {
        // _captureConform's raycast mask is a free silhouette: hit means this
        // grid point sits over food, so drape onto it. No boundary-zero
        // weight here (unlike the old box shape) — the walls that weight
        // used to hand off to are collapsing to the weld themselves below,
        // so there is no rim left for it to protect.
        const squashed = this._fitCenterY + (hit - this._fitCenterY) * squeezeY;
        y = lerp(looseY, squashed + filmThickness, contact);
      } else {
        // Miss means empty deck: the sheet has nothing to drape over, so it
        // descends all the way to the welded skirt instead.
        y = lerp(looseY, bottom + weldGap, contact);
      }
      return [x, y, z];
    });
    updateFilmSurface(this.filmBottom, FILM_TOP_COLS, FILM_TOP_ROWS, (u, v) => {
      const x = cx + unit(u) * surfaceHalfX;
      const z = cz + unit(v) * surfaceHalfZ;
      const lift = 0.012 * (1 - contact) * (1 - unit(u) ** 2) * (1 - unit(v) ** 2);
      const looseY = bottom + lift;
      const hit = conformAt(this._conformBottom, u, v);
      let y;
      if (!Number.isNaN(hit)) {
        const squashed = this._fitCenterY + (hit - this._fitCenterY) * squeezeY;
        y = lerp(looseY, squashed - filmThickness, contact);
      } else {
        y = lerp(looseY, bottom, contact);
      }
      return [x, y, z];
    });

    // Corner pinch: as contact rises, gather the outermost columns of each
    // wall inward and lift them a little — the bunched excess film that
    // reads as "one sealed pack" rather than four flat curtains.
    const cornerPinch = contact * 0.05;
    // The walls have no silhouette mask of their own (only sag/bulge ever
    // animates them — see the class-level comment on FILM_TOP_COLS), so they
    // cannot drape onto the food. Instead their whole height collapses
    // toward the SAME weld value the top sheet's miss branch settles on
    // above: geometric collapse, not fading opacity, so there is no pop, and
    // because all three surfaces converge on one shared number the seam
    // stays consistent by construction rather than by a boundary weight.
    const wallTop = lerp(top, bottom + weldGap, contact);
    const verticalSurface = (sign) => (u, v) => {
      const nx = unit(u);
      const pinch = cornerPinch * Math.abs(nx) ** 4;
      const x = cx + nx * (surfaceHalfX - pinch);
      const bulge = sideBulge * (1 - nx ** 2) * (0.35 + 0.65 * (1 - v));
      const y = lerp(bottom, wallTop, v) + pinch * 0.5 * v;
      return [x, y, cz + sign * (surfaceHalfZ + bulge)];
    };
    updateFilmSurface(this.filmFront, 3, 2, verticalSurface(-1));
    updateFilmSurface(this.filmBack, 3, 2, verticalSurface(1));

    const lateralSurface = (sign) => (u, v) => {
      const nx = unit(u);
      const pinch = cornerPinch * Math.abs(nx) ** 4;
      const z = cz + nx * (surfaceHalfZ - pinch);
      const bulge = sideBulge * (1 - nx ** 2) * (0.35 + 0.65 * (1 - v));
      const y = lerp(bottom, wallTop, v) + pinch * 0.5 * v;
      return [cx + sign * (surfaceHalfX + bulge), y, z];
    };
    updateFilmSurface(this.filmLeft, 2, 2, lateralSurface(-1));
    updateFilmSurface(this.filmRight, 2, 2, lateralSurface(1));

    // Slides back onto the seal bar (z 0.42 / y 0.98) as sealing progresses,
    // so the pinch visibly happens where the bar glows, not 0.25 units short.
    const mouthYBase = lerp(1.22, 1.0, contact);
    const mouthY = lerp(mouthYBase, 0.98, seal);
    const mouthZBase = cz + surfaceHalfZ - 0.015;
    const mouthZ = lerp(mouthZBase, 0.42, seal);
    this.filmMouth.position.set(cx, mouthY, mouthZ);
    this.filmMouth.scale.set(
      (surfaceHalfX * 2) / 1.25,
      lerp(1, 0.56, seal),
      lerp(1, 0.38, seal),
    );
    this.filmMouth.rotation.x = lerp(-0.12, 0, contact);

    const creaseOpacity = smoothstep(0.28, 0.82, p) * (0.16 + contact * 0.22);
    this.filmCreaseMaterial.opacity = creaseOpacity;
    // Traces the welded perimeter itself, one line per edge of the
    // surfaceHalfX/surfaceHalfZ rectangle — at full contact `wallTop` is the
    // exact value the top sheet's miss branch and the walls' collapse both
    // settle on, so this reads as the real weld seam rather than a
    // decoration placed independently of it.
    const rimY = wallTop + 0.006;
    updateCreaseLine(this.filmCreases[0], [
      [cx - surfaceHalfX, rimY, cz + surfaceHalfZ],
      [cx, rimY, cz + surfaceHalfZ],
      [cx + surfaceHalfX, rimY, cz + surfaceHalfZ],
    ]);
    updateCreaseLine(this.filmCreases[1], [
      [cx - surfaceHalfX, rimY, cz - surfaceHalfZ],
      [cx, rimY, cz - surfaceHalfZ],
      [cx + surfaceHalfX, rimY, cz - surfaceHalfZ],
    ]);
    updateCreaseLine(this.filmCreases[2], [
      [cx - surfaceHalfX, rimY, cz - surfaceHalfZ],
      [cx - surfaceHalfX, rimY, cz],
      [cx - surfaceHalfX, rimY, cz + surfaceHalfZ],
    ]);
    updateCreaseLine(this.filmCreases[3], [
      [cx + surfaceHalfX, rimY, cz - surfaceHalfZ],
      [cx + surfaceHalfX, rimY, cz],
      [cx + surfaceHalfX, rimY, cz + surfaceHalfZ],
    ]);

    this.filmMaterial.opacity = 0.22 + contact * 0.1;
    // Taut finish as the air leaves: smoother and glossier, not just smaller.
    this.filmMaterial.roughness = lerp(0.28, 0.14, contact);
    if (this.filmMaterial.isMeshPhysicalMaterial) {
      this.filmMaterial.clearcoat = lerp(0.08, 0.3, contact);
    }
    this.filmMouth.material.opacity = 0.2 + contact * 0.16;
    this.demoCore.visible = Boolean(this._autoplayDemo && !this.food && this.bag.visible);
  }

  /** Give no-food Fact Book autoplay the same visible target as gameplay. */
  beginAutoplay() {
    this._autoplayDemo = !this.food;
    // No-op when nothing is docked; guards the case where the Fact Book's
    // mobile activity replays a real dock through autoplay (see autoplay.js)
    // and _fitFood has not already run for it.
    this._fitFood();
    this._captureFilmTarget();
  }

  _drawGauge(v = 1, force = false) {
    // The needle supplies continuous feedback. Updating the canvas texture only
    // when the displayed 5% step changes avoids a 256×256 GPU upload per frame.
    const gaugeStep = Math.round(v * 20);
    if (!force && gaugeStep === this._lastGaugeStep) return;
    this._lastGaugeStep = gaugeStep;
    const ctx = this._gaugeCtx;
    const S = 256, C = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#f6f2fa';
    ctx.beginPath(); ctx.arc(C, C, 120, 0, 7); ctx.fill();
    // green "sealed" zone at the empty end
    ctx.strokeStyle = '#76d275'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(C, C, 96, Math.PI * 0.75, Math.PI * 0.95); ctx.stroke();
    ctx.strokeStyle = '#c9b7dd'; ctx.lineWidth = 6;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const r1 = i % 5 === 0 ? 78 : 90;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
      ctx.lineTo(C + Math.cos(a) * 104, C + Math.sin(a) * 104);
      ctx.stroke();
    }
    ctx.fillStyle = '#4a3f55';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('AIR', C, C + 46);
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillStyle = v < 0.06 ? '#3f9e42' : '#7b2d8e';
    ctx.fillText(v < 0.06 ? 'SEALED' : `${Math.round(v * 100)}%`, C, C - 44);
    this._gaugeTex.needsUpdate = true;
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'bag', textKey: 'station.vacuum.bag', icon: 'bag' },
      { kind: 'hold', id: 'pump', textKey: 'station.vacuum.pump', icon: 'vacuum', ms: 2200, decayOnRelease: true },
      { kind: 'tap', id: 'seal', textKey: 'station.vacuum.seal', icon: 'seal' },
    ];
  }

  onStepProgress(index, progress) {
    if (index !== 1) return;
    this._air = 1 - progress;
    this._drawGauge(this._air);
    // Needle sweeps 270° from full to empty.
    this.needle.rotation.z = THREE.MathUtils.lerp(-Math.PI * 0.75, Math.PI * 0.75, progress);

    // Gated: the pump is a 2.2s hold, and by the time it starts the pack has
    // settled, so re-measuring the food every one of those frames buys nothing.
    this._refreshFilmTarget();
    this._updateFilm(progress);
    // Drive a bounded vibration in tick(). The old cumulative rotation depended
    // on input-event frequency and could leave the pump at an arbitrary angle.
    this._pumpPower = Math.sin(Math.min(progress, 1) * Math.PI);

    for (let i = 0; i < Math.floor(progress * this.airBits.length); i++) {
      const a = this.airBits[i];
      if (a.t >= 1) {
        a.t = 0;
        a.cycle = (a.cycle || 0) + 1;
        a.y = 1.26 + Math.sin(a.phase + a.cycle) * 0.18;
        a.x = Math.cos(a.phase * 0.7 + a.cycle * 1.3) * 0.4;
      }
    }
  }

  onStepDone(index) {
    if (index === 0) {
      // A chamber sealer holds vacuum with the dome fully down — coming down
      // for the pump, not staying ajar, is what makes the transparent dome
      // ("watch the air leave") mean anything. The fit height budget in
      // _fitFood is measured against this exact closed pose (see
      // _lidPumpClearance), so a real 0 here can never close past what the
      // pack was fitted to.
      this._targetLid = 0;
      this.bag.visible = true;
      this._loading = true;
      this._captureFilmTarget();
      this._updateFilm(0);
      // `_fittedFood` guards against the same un-set `_dockTarget` as tick()
      // above: without a fit yet, snapping to it would place the food at the
      // world origin instead of leaving it where accept() docked it.
      if (this.food && this._fittedFood) {
        // Snap into the bag before measuring the drape: a raycast against a
        // food still mid-flight to its dock point would sample the wrong
        // surface entirely.
        this._updateDockTarget();
        this.food.group.position.copy(this._dockTarget);
        this._captureConform();
      }
    }
    if (index === 1) {
      this._pumpPower = 0;
      this._updateFilm(1);
    }
    if (index === 2) {
      this._updateFilm(1);
      this._sealTarget = 1;
      this._sealFlash = 1;
      // Holds the same fully-closed pose the pump step already reached —
      // sealing happens with the dome down, same as the real machine.
      this._targetLid = 0;
    }
  }

  async playSuccess() {
    this._updateFilm(1);
    this._sealFlash = 1;
    await new Promise((r) => setTimeout(r, 700));
  }

  /** Dock via Station.accept() first, then fit — _fitFood() reads `this.food`. */
  accept(food) {
    // super.accept() is what actually assigns `this.food`; _fitFood() reads
    // that field (not the `food` argument) so it can be reused verbatim from
    // beginAutoplay(). Calling it first would measure against a null food,
    // leave `_fittedFood` unset, and let tick()/onStepDone(0) drag the food
    // toward `_dockTarget`'s un-set (0,0,0) default. Keep this return, too:
    // Station.accept() ends with `return this.getSteps(food)`, which
    // StationPanel uses to build the kitchen's controls — dropping this
    // return would pass every Fact Book check (it ignores the result) while
    // silently breaking gameplay.
    const steps = super.accept(food);
    this._fitFood();
    this._loading = true;
    return steps;
  }

  resetVisuals() {
    this._targetLid = 0.45; this._air = 1; this._loading = false;
    this._pumpPower = 0;
    this.bag.visible = false;
    this._autoplayDemo = false;
    this._sealProgress = 0;
    this._sealTarget = 0;
    this._targetPose = { ...this._fallbackPose };

    // Fact Book station instances are cached and reused across spreads and
    // across open/close (FactBook3D._modelCache) — leftover fit state would
    // otherwise be visible on the next food.
    this._fittedFood = null;
    this._fitK = 1;
    this._targetFitK = 1;
    this._fitYaw = 0;
    this._fitOffset.set(0, 0, 0);
    this._fitHalfHeight = 0;
    this._fitCenterY = this._openPose.bottom + 0.3;
    this._conformTop = null;
    this._conformBottom = null;
    // NaN so the next docked food always measures once before being trusted.
    this._filmSig.k = NaN;
    this._filmSig.yaw = NaN;
    this._filmSig.sy = NaN;
    this._filmSig.pos.set(NaN, NaN, NaN);

    // _updateFilm(0) also restores filmMaterial's roughness/clearcoat/opacity,
    // since those are driven purely by `contact` and contact is 0 here.
    this._updateFilm(0);
    this.demoCore.visible = false;
    this.needle.rotation.z = -Math.PI * 0.75;
    this.pumpBody.position.y = PUMP_BODY.y;
    this.pumpBody.rotation.y = 0;
    this._drawGauge(1, true);
    for (const bit of this.airBits) bit.t = 1;
    this.airMesh.visible = false;
    this.sealBar.material.emissive.setHex(0x000000);
  }

  tick(dt, elapsed) {
    this._lidOpen += (this._targetLid - this._lidOpen) * (1 - Math.pow(0.0008, dt));
    this._sealProgress += (this._sealTarget - this._sealProgress) * (1 - Math.pow(0.002, dt));
    this.lid.rotation.x = -this._lidOpen * 1.05;

    if (this._sealFlash > 0) {
      this._sealFlash = Math.max(0, this._sealFlash - dt * 1.6);
      const e = this._sealFlash;
      this.sealBar.material.emissive.setRGB(e * 1.0, e * 0.25, e * 0.05);
      this.sealBar.material.emissiveIntensity = 2.5;
    }

    let airVisible = false;
    for (const [i, a] of this.airBits.entries()) {
      if (a.t >= 1) {
        this._airDummy.position.set(0, -2, 0);
        this._airDummy.scale.setScalar(0.001);
        this._airDummy.updateMatrix();
        this.airMesh.setMatrixAt(i, this._airDummy.matrix);
        continue;
      }
      a.t += dt * 1.8;
      airVisible = true;
      const p = a.t;
      // Arc from the bag toward the intake grille, not the old external
      // pump inlet — PUMP_PORT is the same point build() actually put the
      // grille at, so this can never drift out of sync with the visible prop.
      this._airDummy.position.set(
        THREE.MathUtils.lerp(a.x, PUMP_PORT.x, p),
        THREE.MathUtils.lerp(a.y, PUMP_PORT.y + 0.15, p) + Math.sin(p * Math.PI) * 0.25,
        THREE.MathUtils.lerp(0.12, PUMP_PORT.z, p)
      );
      this._airDummy.scale.setScalar(Math.max(0.001, Math.sin(Math.min(1, p) * Math.PI)) * (1 - p * 0.35));
      this._airDummy.updateMatrix();
      this.airMesh.setMatrixAt(i, this._airDummy.matrix);
    }
    this.airMesh.visible = airVisible;
    if (airVisible) this.airMesh.instanceMatrix.needsUpdate = true;

    // Also require `_fittedFood`: `_dockTarget` only ever gets a real value
    // from _updateDockTarget(), which itself no-ops without a fitted food (see
    // above). Without this guard, a food docked before _fitFood() has run
    // would lerp toward `_dockTarget`'s un-set (0,0,0) default — the world
    // origin — instead of just holding still until fitting catches up.
    if (this._loading && this.food && this._fittedFood) {
      this._updateDockTarget();
      this.food.group.position.lerp(this._dockTarget, 1 - Math.pow(0.004, dt));

      // Ramped absolutely from `food.baseScale`, never as a delta — see
      // _fitFood. The yaw-to-fit turn rides the same ramp as the size
      // settle, so the "squaring up" reads as one continuous motion.
      this._fitK += (this._targetFitK - this._fitK) * (1 - Math.pow(0.02, dt));
      const model = this.food.model;
      model.rotation.y += (this._fitYaw - model.rotation.y) * (1 - Math.pow(0.02, dt));

      // A small, contact-driven squeeze — vacuum packing removes air, not
      // water. Capped tight and kept separate from the docking fit (`_fitK`)
      // so this station reads as "the pack going airtight", not the
      // progressive moisture-loss shrink DryingRack / SaltTable / Smokehouse
      // teach.
      const contact = smoothstep(0.42, 0.98, this._filmProgress);
      const base = this.food.baseScale * this._fitK;
      model.scale.set(
        base * (1 + CONTACT_SQUEEZE_XZ * contact),
        base * (1 - 0.06 * contact),
        base * (1 + CONTACT_SQUEEZE_XZ * contact),
      );
    }
    if (this._loading || Math.abs(this._sealTarget - this._sealProgress) > 0.001) {
      // _updateFilm still runs every frame — the seal and the contact blend
      // animate off the cached pose. Only the measurement is gated.
      this._refreshFilmTarget();
      this._updateFilm(this._filmProgress);
    }
    // The housing is the pump's own moving mass, so it is what visibly
    // shakes on the pump step — the grille it feeds stays flush and still,
    // since nothing about a deck intake would rattle like a motor does.
    this.pumpBody.position.y = PUMP_BODY.y + Math.sin(elapsed * 20) * 0.014 * this._pumpPower;
    this.pumpBody.rotation.y = Math.sin(elapsed * 17) * 0.035 * this._pumpPower;
  }
}
