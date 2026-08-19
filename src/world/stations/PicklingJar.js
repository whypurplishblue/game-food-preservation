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
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh, clearcoatFor } from '../Materials.js';

const SOLUTION_LOOK = {
  vinegar:        { colour: 0xf2e18a, bottle: 0xd9c15a, fizz: 0xfff6c4 },
  sugar_solution: { colour: 0xf6d9b0, bottle: 0xe8c091, fizz: 0xfff0dc },
  salt_solution:  { colour: 0xdfeef5, bottle: 0xbcd8e6, fizz: 0xffffff },
};

export class PicklingJar extends Station {
  build() {
    const wood = matte(PALETTE.woodDark, 0.8);
    const green = plastic(PALETTE.pickling, { rough: 0.4, clearcoat: 0.6 });

    // Bench with a green splash-back — colour identity carries at a distance.
    this.body.add(mesh(roundedBox(2.3, 0.9, 1.5, 0.1), wood, { y: 0.66 }));
    this.body.add(mesh(roundedBox(2.35, 0.14, 1.55, 0.06), green, { y: 1.16 }));
    this.body.add(mesh(roundedBox(2.3, 1.1, 0.12, 0.05), green, { y: 1.72, z: -0.7 }));

    // THE JAR — the hero object. Big, glassy, centre stage.
    const jar = new THREE.Group();
    jar.position.set(0, 1.18, 0.2);
    jar.scale.setScalar(1.12);
    const jarGlass = new THREE.MeshPhysicalMaterial({
      color: 0xdff0e8, roughness: 0.04, transparent: true, opacity: 0.28,
      clearcoat: clearcoatFor(1), clearcoatRoughness: 0.02, side: THREE.DoubleSide, metalness: 0, ior: 1.5,
    });
    jar.add(mesh(cyl(0.46, 0.44, 1.05, 28, true), jarGlass, { y: 0.52, cast: false }));
    jar.add(mesh(cyl(0.44, 0.44, 0.04, 24), jarGlass, { y: 0.02, cast: false }));
    jar.add(mesh(torus(0.46, 0.045, 8, 26), jarGlass, { y: 1.03, rx: Math.PI / 2, cast: false }));
    // ribbed neck
    for (let i = 0; i < 3; i++) {
      jar.add(mesh(torus(0.44, 0.022, 6, 22), jarGlass, { y: 0.9 + i * 0.05, rx: Math.PI / 2, cast: false }));
    }

    // Liquid — a cylinder whose height and colour we animate.
    this.liquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff0e8, roughness: 0.08, transparent: true, opacity: 0.72,
      transmission: 0, clearcoat: clearcoatFor(1), metalness: 0,
    });
    this.liquid = mesh(cyl(0.42, 0.41, 1.0, 24), this.liquidMat, { y: 0.5, cast: false });
    this.liquid.scale.y = 0.001;
    jar.add(this.liquid);

    // Lid, screwed on in the final step.
    const lid = new THREE.Group();
    lid.position.y = 1.12;
    lid.add(mesh(cyl(0.5, 0.5, 0.16, 26), plastic(PALETTE.picklingDeep, { rough: 0.35 })));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      lid.add(mesh(roundedBox(0.035, 0.15, 0.035, 0.012), plastic(0x2f6b34),
        { x: Math.cos(a) * 0.49, z: Math.sin(a) * 0.49, cast: false }));
    }
    lid.add(mesh(cyl(0.42, 0.42, 0.03, 22), metal(PALETTE.brass), { y: 0.09 }));
    lid.visible = false;
    jar.add(lid);
    this.lid = lid;
    this.jar = jar;
    this.body.add(jar);

    // Three solution bottles on the shelf. All three are correct answers.
    this.bottles = {};
    const ids = Object.keys(SOLUTION_LOOK);
    ids.forEach((id, i) => {
      const b = new THREE.Group();
      b.position.set(-0.78 + i * 0.78, 1.26, -0.72);
      b.scale.setScalar(0.9);
      const look = SOLUTION_LOOK[id];
      b.add(mesh(cyl(0.14, 0.16, 0.46, 14), glass(look.bottle, { opacity: 0.55 }), { y: 0.23 }));
      b.add(mesh(cyl(0.15, 0.15, 0.3, 14), new THREE.MeshStandardMaterial({ color: look.colour, roughness: 0.2 }), { y: 0.18 }));
      b.add(mesh(cyl(0.06, 0.09, 0.16, 10), glass(look.bottle, { opacity: 0.55 }), { y: 0.53 }));
      b.add(mesh(cyl(0.07, 0.07, 0.07, 10), plastic(0x8d6e63), { y: 0.63 }));
      this.body.add(b);
      this.bottles[id] = b;
    });

    // Pour stream + fizz particles.
    this.stream = mesh(cyl(0.055, 0.075, 1.0, 10), new THREE.MeshBasicMaterial({
      color: 0xf2e18a, transparent: true, opacity: 0, toneMapped: false,
    }), { y: 1.95, z: 0.12, cast: false });
    this.body.add(this.stream);

    this.fizz = [];
    for (let i = 0; i < 14; i++) {
      const f = mesh(sphere(0.035, 8, 6), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
      }), { cast: false, receive: false });
      f.visible = false;
      jar.add(f);
      this.fizz.push({ mesh: f, t: 1 });
    }

    this._fill = 0;
    this._chosen = null;
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

  onStepProgress(index, progress, value) {
    if (index === 2) {                                  // pouring
      this._fill = progress;
      this.liquid.scale.y = Math.max(0.001, progress);
      this.liquid.position.y = 0.5 * progress + 0.02;
      this.stream.material.opacity = progress > 0.98 ? 0 : 0.85;
      this.stream.scale.y = 0.6;
      // Bubbles rise as the solution takes hold.
      for (let i = 0; i < Math.floor(progress * this.fizz.length); i++) {
        const f = this.fizz[i];
        if (f.t >= 1) { f.t = 0; f.x = (Math.random() - 0.5) * 0.6; f.z = (Math.random() - 0.5) * 0.6; }
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
      for (const f of this.fizz) f.mesh.material.color.setHex(look.fizz);
      // Lift the chosen bottle so the choice is acknowledged physically.
      this._pouringBottle = this.bottles[value];
    }
    if (index === 2) this.stream.material.opacity = 0;
    if (index === 3) { this.lid.visible = true; this._sealing = 0; }
  }

  async playSuccess() {
    await new Promise((r) => setTimeout(r, 650));
  }

  resetVisuals() {
    this._fill = 0; this._chosen = null; this._loading = false;
    this.liquid.scale.y = 0.001;
    this.liquid.position.y = 0.02;
    this.lid.visible = false;
    this.lid.rotation.y = 0;
    this.lid.position.y = 1.12;
    this._sealing = null;
    this.stream.material.opacity = 0;
    if (this._pouringBottle) { this._pouringBottle.rotation.z = 0; this._pouringBottle.position.y = 1.28; }
    this._pouringBottle = null;
  }

  tick(dt, elapsed) {
    // Idle: gentle glass glint via a slow rotation of the jar's highlights.
    this.jar.rotation.y = Math.sin(elapsed * 0.4) * 0.05;

    // Lid screws itself down once tapped.
    if (this._sealing !== undefined && this._sealing !== null && this._sealing < 1) {
      this._sealing = Math.min(1, this._sealing + dt * 1.6);
      this.lid.rotation.y = this._sealing * Math.PI * 3;
      this.lid.position.y = 1.12 - this._sealing * 0.06;
    }

    if (this._pouringBottle) {
      const want = this._fill > 0 && this._fill < 1;
      this._pouringBottle.rotation.z = THREE.MathUtils.lerp(this._pouringBottle.rotation.z, want ? -1.9 : 0, 1 - Math.pow(0.004, dt));
      this._pouringBottle.position.y = THREE.MathUtils.lerp(this._pouringBottle.position.y, want ? 2.0 : 1.28, 1 - Math.pow(0.004, dt));
      this._pouringBottle.position.x = THREE.MathUtils.lerp(this._pouringBottle.position.x, want ? 0.25 : this._pouringBottle.position.x, 1 - Math.pow(0.02, dt));
    }

    for (const f of this.fizz) {
      if (f.t >= 1) { f.mesh.visible = false; continue; }
      f.t += dt * 1.1;
      f.mesh.visible = true;
      f.mesh.position.set(f.x, 0.08 + f.t * 0.9 * Math.max(0.2, this._fill), f.z);
      f.mesh.scale.setScalar(0.6 + f.t * 0.9);
      f.mesh.material.opacity = 0.8 * Math.sin(f.t * Math.PI);
    }

    if (this._loading && this.food) {
      const target = this.root.localToWorld(new THREE.Vector3(0, 1.62, 0.12));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
      this.food.model.scale.lerp(new THREE.Vector3().setScalar(this.food.baseScale * 0.72), 1 - Math.pow(0.02, dt));
    }
  }
}
