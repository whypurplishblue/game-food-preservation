/**
 * PICKLING — "vinegar, sugar or salt prevents growth" (§5C).
 *
 * Interaction: drop in the jar → CHOOSE a solution → tilt/pour until full →
 * TWIST the lid shut.
 *
 * The choice step is the lesson. §5C lists three solutions and all three are
 * correct, so every option the child picks is reinforced as valid — this is the
 * one station where the game teaches breadth rather than a single right answer.
 * The liquid takes the colour of whichever solution was chosen, so the three
 * stay distinguishable in memory.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh } from '../Materials.js';

const SOLUTION_LOOK = {
  vinegar:        { colour: 0xf2e18a, bottle: 0xd9c15a, fizz: 0xfff6c4 },
  sugar_solution: { colour: 0xf6d9b0, bottle: 0xe8c091, fizz: 0xfff0dc },
  salt_solution:  { colour: 0xdfeef5, bottle: 0xbcd8e6, fizz: 0xffffff },
};

// The food sits inside the jar body, below both opaque rims. These are jar
// local coordinates (before the jar's 1.18 presentation scale), so measuring
// the food in the same space also works when the Fact Book normalises the
// station and leaves its selected food outside the station holder.
const JAR_FOOD_ENVELOPE = Object.freeze({
  halfX: 0.34,
  halfZ: 0.34,
  bottom: 0.13,
  top: 0.95,
  margin: 0.035,
});

export class PicklingJar extends Station {
  build() {
    const wood = matte(PALETTE.woodDark, 0.8);
    const green = plastic(PALETTE.pickling, { rough: 0.56, clearcoat: 0.18 });
    const deepGreen = plastic(PALETTE.picklingDeep, { rough: 0.58, clearcoat: 0.12 });
    const cream = plastic(0xfff4d6, { rough: 0.64, clearcoat: 0.06 });

    // Low cabinet + open bottle rack. The old solid green splash-back swallowed
    // the transparent jar, leaving a blank counter at gameplay distance.
    this.body.add(mesh(roundedBox(2.3, 0.82, 1.5, 0.1), wood, { y: 0.62 }));
    this.body.add(mesh(roundedBox(2.35, 0.14, 1.55, 0.06), green, { y: 1.16 }));
    this.body.add(mesh(roundedBox(2.04, 0.1, 0.18, 0.035), deepGreen, { y: 1.28, z: -0.66 }));
    for (const x of [-0.98, 0.98]) {
      this.body.add(mesh(roundedBox(0.1, 0.78, 0.16, 0.035), deepGreen, { x, y: 1.64, z: -0.66 }));
    }
    this.body.add(mesh(roundedBox(2.04, 0.12, 0.2, 0.04), green, { y: 2.02, z: -0.66 }));

    // THE JAR — an oversized glass vessel with opaque rings and a label, so its
    // silhouette survives both the busy kitchen and an empty/transparent state.
    const jar = new THREE.Group();
    jar.position.set(0, 1.18, 0.19);
    this._jarScale = 1.18;
    jar.scale.setScalar(this._jarScale);
    const jarGlass = glass(0xdff0e8, {
      opacity: 0.34, rough: 0.3, clearcoat: 0.08,
    });
    jar.add(mesh(cyl(0.48, 0.43, 1.04, 20, true), jarGlass, { y: 0.54, cast: false }));
    jar.add(mesh(cyl(0.43, 0.43, 0.045, 18), jarGlass, { y: 0.035, cast: false }));
    jar.add(mesh(torus(0.45, 0.042, 6, 20), deepGreen, { y: 0.08, rx: Math.PI / 2, cast: false }));
    jar.add(mesh(torus(0.48, 0.05, 6, 20), deepGreen, { y: 1.04, rx: Math.PI / 2, cast: false }));
    jar.add(mesh(roundedBox(0.055, 0.72, 0.025, 0.012), cream,
      { x: -0.31, y: 0.56, z: 0.43, cast: false }));

    // A small cream label and colour-changing solution seal make the otherwise
    // empty jar readable without printing language-dependent text on the prop.
    jar.add(mesh(roundedBox(0.52, 0.31, 0.035, 0.055), cream,
      { y: 0.53, z: 0.45, cast: false }));
    this.badgeMat = new THREE.MeshStandardMaterial({ color: PALETTE.pickling, roughness: 0.45 });
    this.solutionBadge = mesh(cyl(0.115, 0.115, 0.04, 12), this.badgeMat,
      { y: 0.53, z: 0.48, rx: Math.PI / 2, cast: false });
    jar.add(this.solutionBadge);

    // Liquid — a cylinder whose height and colour we animate.
    this.liquidMat = new THREE.MeshStandardMaterial({
      color: 0xdff0e8, roughness: 0.38, transparent: true, opacity: 0.66,
      metalness: 0, depthWrite: false,
    });
    this.liquid = mesh(cyl(0.425, 0.40, 0.96, 18), this.liquidMat, { y: 0.5, cast: false });
    this.liquid.scale.y = 0.001;
    jar.add(this.liquid);

    // Lid, screwed on in the final step. Instanced straight ribs replace twenty
    // separate rounded boxes: one draw call and a fraction of the triangles.
    const lid = new THREE.Group();
    lid.position.y = 1.12;
    lid.add(mesh(cyl(0.51, 0.51, 0.16, 20), deepGreen));
    const ribCount = 12;
    const ribs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.045, 0.14, 0.035), plastic(0x285d30, { rough: 0.46 }), ribCount);
    const ribDummy = new THREE.Object3D();
    for (let i = 0; i < ribCount; i++) {
      const a = (i / ribCount) * Math.PI * 2;
      ribDummy.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      ribDummy.rotation.y = -a;
      ribDummy.updateMatrix();
      ribs.setMatrixAt(i, ribDummy.matrix);
    }
    ribs.castShadow = false;
    lid.add(ribs);
    lid.add(mesh(cyl(0.42, 0.42, 0.035, 18), metal(PALETTE.brass), { y: 0.095 }));
    lid.visible = false;
    jar.add(lid);
    this.lid = lid;
    this.jar = jar;
    this.body.add(jar);

    // Three chunky, opaque solution bottles on the rack. The earlier glass
    // miniatures disappeared at mobile size and were merged before they could
    // animate; bottleList explicitly protects these groups from batching.
    this.bottles = {};
    this.bottleList = [];
    const ids = Object.keys(SOLUTION_LOOK);
    ids.forEach((id, i) => {
      const b = new THREE.Group();
      b.position.set(-0.72 + i * 0.72, 1.33, -0.62);
      b.scale.setScalar(0.96);
      const look = SOLUTION_LOOK[id];
      b.add(mesh(cyl(0.14, 0.17, 0.43, 10), plastic(look.bottle, { rough: 0.38 }), { y: 0.23 }));
      b.add(mesh(cyl(0.145, 0.145, 0.13, 10), cream, { y: 0.22, cast: false }));
      b.add(mesh(cyl(0.065, 0.095, 0.17, 8), plastic(look.bottle, { rough: 0.38 }), { y: 0.52, cast: false }));
      b.add(mesh(cyl(0.075, 0.075, 0.07, 8), deepGreen, { y: 0.64, cast: false }));
      b.userData.home = b.position.clone();
      this.body.add(b);
      this.bottles[id] = b;
      this.bottleList.push(b);
    });

    // Pour stream follows the selected bottle's real spout to the jar mouth.
    this.stream = mesh(cyl(0.055, 0.075, 1.0, 10), new THREE.MeshBasicMaterial({
      color: 0xf2e18a, transparent: true, opacity: 0.86, toneMapped: false,
    }), { cast: false });
    this.stream.visible = false;
    this.body.add(this.stream);

    // Ten bubbles in one instanced draw call.
    this.fizz = Array.from({ length: 10 }, (_, i) => ({ t: 1, cycle: 0, phase: i * 2.17 }));
    this.fizzMesh = new THREE.InstancedMesh(
      sphere(0.035, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.75,
        toneMapped: false, depthWrite: false,
      }),
      this.fizz.length);
    this.fizzMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fizzMesh.castShadow = false;
    this.fizzMesh.receiveShadow = false;
    this.fizzMesh.visible = false;
    jar.add(this.fizzMesh);

    this._fill = 0;
    this._chosen = null;
    this._success = 0;
    this._tmpFizz = new THREE.Object3D();
    this._spout = new THREE.Vector3();
    this._mouth = new THREE.Vector3();
    this._streamDir = new THREE.Vector3();
    this._streamMid = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._foodScale = new THREE.Vector3();
    this._dockTargetParent = new THREE.Vector3();
    this._fitForFood = null;
    this._targetFitK = 1;
    this._fitTargetRoot = new THREE.Vector3();
    this._jarCentreLocal = new THREE.Vector3();
    this._jarCentreWorld = new THREE.Vector3();
    this._groupOriginWorld = new THREE.Vector3();
    this._worldBox = new THREE.Box3();
    this._jarBox = new THREE.Box3();
    this._fitCorner = new THREE.Vector3();
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'drop', textKey: 'station.pickling.drop', icon: 'jar' },
      {
        kind: 'choice', id: 'solution', textKey: 'station.pickling.choose', icon: 'drop',
        // All three options are correct — chosen deliberately, see §5C.
        options: [
          { id: 'vinegar', labelKey: 'methods.pickling.solutions.vinegar', colour: 0xd9c15a },
          { id: 'sugar_solution', labelKey: 'methods.pickling.solutions.sugar_solution', colour: 0xe8c091 },
          { id: 'salt_solution', labelKey: 'methods.pickling.solutions.salt_solution', colour: 0xbcd8e6 },
        ],
        // §5C lists all three as correct, so say so out loud the first time —
        // otherwise a child who always taps the first chip learns
        // "pickling = vinegar" and never meets the other two.
        allCorrect: true, allCorrectKey: 'methods.pickling.anySolutionOk',
      },
      { kind: 'hold', id: 'pour', textKey: 'station.pickling.pour', icon: 'drop', ms: 1700 },
      // The lid twist was cut: 360° of dial rehearsed no knowledge at all, it
      // was pure motor filler between two steps that do teach.
      { kind: 'tap', id: 'twist', textKey: 'station.pickling.twist', icon: 'lid' },
    ];
  }

  /** Fit and place the ingredient before the Fact Book handoff reveals it. */
  accept(food) {
    const steps = super.accept(food);
    this._prepareFoodFit(food);
    this.foodTarget(this._fitTargetRoot, this._dockTargetParent);
    food.group.position.copy(this._dockTargetParent);
    food.model.scale.setScalar(food.baseScale * this._targetFitK);
    return steps;
  }

  onStepProgress(index, progress, value) {
    if (index === 2) {                                  // pouring
      this._fill = progress;
      this.liquid.scale.y = Math.max(0.001, progress);
      this.liquid.position.y = 0.5 * progress + 0.02;
      // Bubbles rise as the solution takes hold.
      for (let i = 0; i < Math.floor(progress * this.fizz.length); i++) {
        const f = this.fizz[i];
        if (f.t >= 1) {
          f.t = 0;
          f.cycle++;
          f.x = Math.sin(f.phase + f.cycle * 1.31) * 0.3;
          f.z = Math.cos(f.phase * 0.73 + f.cycle) * 0.3;
        }
      }
      if (this.food) {
        // Food settles down into the liquid.
        this.food.model.rotation.y += 0.02;
      }
    }
  }

  onStepDone(index, value) {
    if (index === 0) { this._loading = true; }
    if (index === 1) {
      this._chosen = value;
      const look = SOLUTION_LOOK[value] || SOLUTION_LOOK.vinegar;
      this.liquidMat.color.setHex(look.colour);
      this.stream.material.color.setHex(look.colour);
      this.fizzMesh.material.color.setHex(look.fizz);
      this.badgeMat.color.setHex(look.bottle);
      // Lift the chosen bottle so the choice is acknowledged physically.
      this._pouringBottle = this.bottles[value];
    }
    if (index === 2) this.stream.visible = false;
    if (index === 3) {
      this.lid.visible = true;
      this.lid.position.y = 1.28;
      this._sealing = 0;
    }
  }

  async playSuccess() {
    this._success = 1;
    await new Promise((r) => setTimeout(r, 650));
  }

  resetVisuals() {
    // Fact Book completion resets the machine while leaving its selected food
    // docked. Preserve that food's fitted pose; only release/reset should put
    // the model back at its presentation scale for a later selection.
    const previousFood = this.food || this._fitForFood;
    if (!this.food && previousFood?.model && Number.isFinite(previousFood.baseScale)) {
      previousFood.model.scale.setScalar(previousFood.baseScale);
      this._fitForFood = null;
      this._targetFitK = 1;
    }
    this._fill = 0; this._chosen = null; this._loading = false;
    this._success = 0;
    this.liquid.scale.y = 0.001;
    this.liquid.position.y = 0.02;
    this.liquidMat.color.setHex(0xdff0e8);
    this.badgeMat.color.setHex(PALETTE.pickling);
    this.lid.visible = false;
    this.lid.rotation.y = 0;
    this.lid.position.y = 1.12;
    this._sealing = null;
    this.stream.visible = false;
    this.fizzMesh.visible = false;
    for (const [i, f] of this.fizz.entries()) {
      f.t = 1;
      this._tmpFizz.position.set(0, -2, 0);
      this._tmpFizz.scale.setScalar(0.001);
      this._tmpFizz.updateMatrix();
      this.fizzMesh.setMatrixAt(i, this._tmpFizz.matrix);
    }
    this.fizzMesh.instanceMatrix.needsUpdate = true;
    for (const bottle of this.bottleList) {
      bottle.position.copy(bottle.userData.home);
      bottle.rotation.z = 0;
    }
    this._pouringBottle = null;
    this.jar.scale.setScalar(this._jarScale);
  }

  /**
   * Measure a food's visible model in jar-local space and derive an absolute
   * scale from its real bounds. The model is intentionally measured rather
   * than the Food radius: the latter is a hit-test approximation and does not
   * include the different silhouettes of the fruit and vegetable models.
   */
  _prepareFoodFit(food) {
    if (!food?.model || this._fitForFood === food) return;

    const model = food.model;
    const baseScale = Number.isFinite(food.baseScale) ? food.baseScale : model.scale.x || 1;
    model.scale.setScalar(baseScale);

    this.root.updateWorldMatrix(true, true);
    this.jar.updateWorldMatrix(true, true);
    food.group.updateWorldMatrix(true, true);

    const box = this._foodBoxInJarSpace(model);
    const size = box.getSize(new THREE.Vector3());
    const env = JAR_FOOD_ENVELOPE;
    const usableX = Math.max(0.001, env.halfX * 2 - env.margin * 2);
    const usableZ = Math.max(0.001, env.halfZ * 2 - env.margin * 2);
    const usableY = Math.max(0.001, env.top - env.bottom - env.margin * 2);
    const k = Math.min(
      1,
      usableX / Math.max(1e-5, size.x),
      usableZ / Math.max(1e-5, size.z),
      usableY / Math.max(1e-5, size.y),
    );
    // Never let a degenerate imported model produce a zero scale. For a real
    // model k is bounded by the three dimensions above and remains <= 1.
    this._targetFitK = Math.max(0.01, Number.isFinite(k) ? k : 1);

    // Re-measure after fitting. FoodFactory centres procedural and downloaded
    // models, but keeping this offset measured makes an off-centre asset safe.
    model.scale.setScalar(baseScale * this._targetFitK);
    const fitted = this._foodBoxInJarSpace(model);
    fitted.getCenter(this._fitCorner);
    this._jarCentreLocal.set(0, (env.bottom + env.top) * 0.5, 0);
    this._jarCentreWorld.copy(this._jarCentreLocal);
    this.jar.localToWorld(this._jarCentreWorld);
    const fittedCentreWorld = this._fitCorner.clone();
    this.jar.localToWorld(fittedCentreWorld);
    this._groupOriginWorld.copy(food.group.getWorldPosition(new THREE.Vector3()));
    // Store the target in station-root space. The shared foodTarget() helper
    // then performs the final root-world -> food-parent-local conversion on
    // every frame, so the result survives Fact Book holder-scale transitions.
    this.root.worldToLocal(this._jarCentreWorld);
    this.root.worldToLocal(fittedCentreWorld);
    this.root.worldToLocal(this._groupOriginWorld);
    this._fitTargetRoot.copy(this._jarCentreWorld)
      .sub(fittedCentreWorld)
      .add(this._groupOriginWorld);

    // The model ramps down from its normal presentation size in tick().
    // Keep the absolute baseScale contract so re-selection never compounds a
    // previous station's scale change.
    model.scale.setScalar(baseScale);
    this._fitForFood = food;
  }

  /** Return an axis-aligned model box expressed in the jar's local space. */
  _foodBoxInJarSpace(model) {
    model.updateWorldMatrix(true, true);
    this._worldBox.setFromObject(model);
    this._jarBox.makeEmpty();
    for (const x of [this._worldBox.min.x, this._worldBox.max.x]) {
      for (const y of [this._worldBox.min.y, this._worldBox.max.y]) {
        for (const z of [this._worldBox.min.z, this._worldBox.max.z]) {
          this._fitCorner.set(x, y, z);
          this.jar.worldToLocal(this._fitCorner);
          this._jarBox.expandByPoint(this._fitCorner);
        }
      }
    }
    return this._jarBox;
  }

  _updatePourStream() {
    const bottle = this._pouringBottle;
    const visible = bottle && this._fill > 0.015 && this._fill < 0.985;
    this.stream.visible = !!visible;
    if (!visible) return;

    // Convert both endpoints to body-local coordinates, so the stream remains
    // attached while the bottle and the jar's subtle idle turn both move.
    this.body.updateWorldMatrix(true, true);
    this._spout.set(0, 0.69, 0);
    bottle.localToWorld(this._spout);
    this.body.worldToLocal(this._spout);
    this._mouth.set(0, 1.06, 0);
    this.jar.localToWorld(this._mouth);
    this.body.worldToLocal(this._mouth);

    this._streamDir.subVectors(this._mouth, this._spout);
    const length = this._streamDir.length();
    this._streamMid.copy(this._spout).add(this._mouth).multiplyScalar(0.5);
    this.stream.position.copy(this._streamMid);
    this.stream.scale.set(1, length, 1);
    this.stream.quaternion.setFromUnitVectors(this._up, this._streamDir.normalize());
  }

  tick(dt, elapsed) {
    // Idle: a tiny turn catches the opaque rim and label without making a jar
    // full of food look as if it is spinning on the counter.
    this.jar.rotation.y = Math.sin(elapsed * 0.4) * 0.05;
    if (this._success > 0) {
      this._success = Math.max(0, this._success - dt * 1.45);
      const bounce = Math.sin((1 - this._success) * Math.PI * 3) * 0.035 * this._success;
      this.jar.scale.setScalar(this._jarScale * (1 + bounce));
    } else {
      this.jar.scale.setScalar(this._jarScale);
    }

    // Lid screws itself down once tapped.
    if (this._sealing !== undefined && this._sealing !== null && this._sealing < 1) {
      this._sealing = Math.min(1, this._sealing + dt * 1.6);
      this.lid.rotation.y = this._sealing * Math.PI * 3;
      this.lid.position.y = 1.12 - this._sealing * 0.06;
    }

    const pourK = 1 - Math.pow(0.004, dt);
    for (const bottle of this.bottleList) {
      const pouring = bottle === this._pouringBottle && this._fill > 0.015 && this._fill < 0.985;
      const home = bottle.userData.home;
      bottle.rotation.z = THREE.MathUtils.lerp(bottle.rotation.z, pouring ? -1.15 : 0, pourK);
      // The bottle pivots around its base, so its origin must sit above and to
      // the left of the mouth; the old lower target put most of it behind the
      // jar body once tilted in the centred Fact Book view.
      bottle.position.x = THREE.MathUtils.lerp(bottle.position.x, pouring ? -0.90 : home.x, pourK);
      bottle.position.y = THREE.MathUtils.lerp(bottle.position.y, pouring ? 2.40 : home.y, pourK);
      bottle.position.z = THREE.MathUtils.lerp(bottle.position.z, pouring ? 0.12 : home.z, pourK);
    }
    this._updatePourStream();

    let fizzing = false;
    for (const [i, f] of this.fizz.entries()) {
      if (f.t >= 1) {
        this._tmpFizz.position.set(0, -2, 0);
        this._tmpFizz.scale.setScalar(0.001);
        this._tmpFizz.updateMatrix();
        this.fizzMesh.setMatrixAt(i, this._tmpFizz.matrix);
        continue;
      }
      f.t += dt * 1.1;
      fizzing = true;
      this._tmpFizz.position.set(f.x, 0.08 + f.t * 0.9 * Math.max(0.2, this._fill), f.z);
      const fizzScale = Math.max(0.001, Math.sin(Math.min(1, f.t) * Math.PI)) * (0.7 + f.t * 0.7);
      this._tmpFizz.scale.setScalar(fizzScale);
      this._tmpFizz.updateMatrix();
      this.fizzMesh.setMatrixAt(i, this._tmpFizz.matrix);
    }
    this.fizzMesh.visible = fizzing;
    if (fizzing) this.fizzMesh.instanceMatrix.needsUpdate = true;

    if (this._loading && this.food) {
      this._prepareFoodFit(this.food);
      // The shared parent-aware docking helper converts the station-root
      // target into food.group's parent-local space for the Fact Book.
      this.foodTarget(this._fitTargetRoot, this._dockTargetParent);
      this.food.group.position.lerp(this._dockTargetParent, 1 - Math.pow(0.004, dt));
      this._foodScale.setScalar(this.food.baseScale * this._targetFitK);
      this.food.model.scale.lerp(this._foodScale, 1 - Math.pow(0.02, dt));
    }
  }
}
