/**
 * Base class for the six preservation stations.
 *
 * INTERACTION PROTOCOL
 * Each station declares a short `steps` sequence. A step is a control spec that
 * StationPanel renders as a chunky physical widget:
 *
 *   { kind:'tap',    label, ... }        press once
 *   { kind:'hold',   label, ms, ... }    press and hold for a duration
 *   { kind:'sweep',  label, ... }        drag horizontally across a pad
 *   { kind:'scrub',  label, reps }       rub back and forth
 *   { kind:'dial',   label, min,max, target:[lo,hi] }   rotate to a value
 *   { kind:'choice', label, options:[…] } pick one
 *
 * The station receives onStepProgress / onStepDone and drives its 3D animation
 * from them, so the machine and the control always agree.
 *
 * WHY SEQUENCES, NOT ONE BUTTON: the brief requires six interactions that do
 * not reduce to the same click. A sequence of two or three *different* widget
 * kinds per station makes each one feel like operating a different machine,
 * while keeping every interaction under ~4 seconds so practice stays dense.
 */
import * as THREE from 'three';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, roundedBox, cyl, mesh, labelTexture, blobShadow, mergeStatic } from '../Materials.js';
import { METHODS } from '../../content/curriculum.js';
import { assets, MOVER_BINDINGS } from '../AssetRegistry.js';
import { t, methodName, methodClue } from '../../content/i18n.js';

export class Station {
  /** @param {string} methodId key into METHODS */
  constructor(methodId) {
    this.methodId = methodId;
    this.def = METHODS[methodId];
    this.root = new THREE.Group();
    this.root.name = `Station:${methodId}`;
    this.root.userData.station = this;

    this.busy = false;
    this.food = null;
    this.stepIndex = 0;
    this._t = 0;
    this._highlight = 0;
    this._targetHighlight = 0;

    this.body = new THREE.Group();
    // The arc layout gives each machine its own island; scale up to fill it.
    this.body.scale.setScalar(1.22);
    this.root.add(this.body);

    this._buildBase();
    // Everything the subclass adds is recorded, so an optional GLB shell can
    // later hide the procedural static geometry without touching the movers.
    const procStart = this.body.children.length;
    this.build();               // subclass geometry
    this._procParts = this.body.children.slice(procStart);
    this._buildPlaque();
    this._buildGlowRing();
  }

  // ------------------------------------------------------------- shared bits
  _buildBase() {
    // Every machine sits on the same plinth. Shared footprint = coherent set.
    const plinth = mesh(roundedBox(2.2, 0.1, 1.75, 0.04), matte(0x9c6a3c, 0.7), { y: 0.05 });
    this.body.add(plinth);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.body.add(mesh(cyl(0.07, 0.08, 0.08, 8), metal(PALETTE.steelDark), { x: sx * 0.92, z: sz * 0.68, y: 0.04 }));
    }
    const sh = blobShadow(1.5, 0.55);
    sh.position.y = 0.012;
    this.body.add(sh);
  }

  /**
   * The name plaque. Hidden from Stage 4 onward — the machine's own shape and
   * animation must carry the identity by then.
   */
  _buildPlaque() {
    const g = new THREE.Group();
    g.position.set(0, 2.82, 0.55);
    const board = mesh(new THREE.PlaneGeometry(2.4, 0.66), new THREE.MeshBasicMaterial({
      map: this._plaqueTexture(), transparent: true, toneMapped: false, depthWrite: false,
    }), { cast: false, receive: false });
    board.renderOrder = 3;
    g.add(board);
    // little post so the plaque reads as physically mounted
    g.add(mesh(cyl(0.04, 0.04, 0.56, 8), metal(PALETTE.steelDark), { y: -0.51, z: -0.02 }));
    this.plaqueBoard = board;
    this.plaque = g;
    this.body.add(g);
  }

  /** Localised station name rendered large enough for the kitchen-wide camera. */
  _plaqueTexture() {
    const key = `methods.${this.methodId}.stationName`;
    // A station serving two methods (Freezer = freezing + cooling) needs its
    // own name; falling back to one method's name would mislabel the other.
    const translated = t(key);
    const label = translated === key ? methodName(this.methodId) : translated;
    this.plaqueLabel = label;
    const hex = `#${this.def.colour.toString(16).padStart(6, '0')}`;
    return labelTexture(label.toUpperCase(), {
      width: 640, height: 176, bg: hex, fg: '#ffffff', border: 'rgba(255,255,255,0.92)',
      font: '800 88px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      maxLines: 2,
    });
  }

  /** Redraw language-dependent canvas textures without rebuilding the machine. */
  refreshLabels() {
    if (this.plaqueBoard) {
      const old = this.plaqueBoard.material.map;
      this.plaqueBoard.material.map = this._plaqueTexture();
      this.plaqueBoard.material.needsUpdate = true;
      old?.dispose();
    }
    if (this._clue) {
      const old = this._clue.material.map;
      this._clue.material.map = this._clueTexture();
      this._clue.material.needsUpdate = true;
      old?.dispose();
    }
  }

  /** Ground ring that lights up when a dragged food can be dropped here. */
  _buildGlowRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.12, 1.42, 40),
      new THREE.MeshBasicMaterial({
        color: this.def.colour, transparent: true, opacity: 0, toneMapped: false,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.renderOrder = 2;
    this.ring = ring;
    this.body.add(ring);
  }

  /**
   * Merge everything this machine does not animate into one mesh per material.
   *
   * A station is authored as fifty-odd small meshes — bricks, bolts, panels,
   * shelves — and every one was its own draw call. Eight machines meant ~900
   * draw calls a frame before a single food appeared: most of the frame budget
   * spent submitting geometry nobody is moving. The kitchen has been batched
   * this way from the start; the machines never were.
   *
   * Anything the station holds a reference to, and everything above it in the
   * tree, is marked dynamic and left alone — so doors still swing, dials still
   * turn, embers still glow.
   */
  batchStatic() {
    const dyn = this._dynamicObjects();
    const mark = (o) => { o.userData.dynamic = true; for (const c of o.children) mark(c); };
    for (const d of dyn) {
      mark(d);
      let n = d.parent;
      while (n && n !== this.body) { n.userData.dynamic = true; n = n.parent; }
    }
    mergeStatic(this.body);
    return this;
  }

  // ------------------------------------------------------------- GLB shells
  /**
   * Swap the *static* half of this machine for a Blender-authored GLB, keeping
   * every procedural moving part and its animation exactly as it is.
   *
   * The exporter (tools/blender/build_stations.py) writes one `shell` node plus
   * one node per hinged part, with the origin already on the hinge. A mover node
   * named in MOVER_BINDINGS is re-parented onto the procedural pivot that drives
   * it, so `this.door.rotation.y = …` keeps working unchanged; anything else in
   * the file is treated as shell.
   *
   * Returns false and changes nothing when no asset is present — which is the
   * normal case, since the procedural machines are the shipped visuals.
   */
  useModel(stationId) {
    const model = assets.instance(stationId);
    if (!model) return false;

    // 1. Hand each declared mover node to the procedural pivot that animates it.
    const bindings = MOVER_BINDINGS[stationId] || {};
    const replaced = new Set();
    for (const [nodeName, prop] of Object.entries(bindings)) {
      const node = model.getObjectByName(nodeName);
      const pivot = this[prop];
      if (!node || !pivot?.isObject3D) continue;
      node.removeFromParent();
      for (const child of [...pivot.children]) child.visible = false;
      // The exporter bakes each mover's origin onto its hinge, and the game's
      // pivot group is already sitting at that hinge — so the node's own
      // placement would apply the offset a second time.
      node.position.set(0, 0, 0);
      node.rotation.set(0, 0, 0);
      pivot.add(node);
      replaced.add(pivot);
    }

    // 2. Drop anything the file offers that the game does not drive. The
    //    exporter emits a node per moving part, but some of those parts are
    //    animated per-piece in code (the pasteuriser's four coils glow one by
    //    one) and cannot be a single merged mesh. Keeping them would double the
    //    geometry, so the shell plus the bound movers is all that is used.
    for (const child of [...model.children]) {
      if (child.name !== 'shell' && !(child.name in bindings)) child.removeFromParent();
    }

    // 3. Hide procedural geometry that nothing animates. A subtree is kept only
    //    if it contains a live object, so static leaves inside a moving group
    //    (a bracket bolted to a door) go away too.
    const dyn = new Set(this._dynamicObjects());
    const prune = (node) => {
      if (replaced.has(node)) return true;
      let live = dyn.has(node);
      for (const c of node.children) if (prune(c)) live = true;
      if (!live) node.visible = false;
      return live;
    };
    for (const part of this._procParts || []) prune(part);

    this.model = model;
    this.body.add(model);
    return true;
  }

  /** Every Object3D this station holds a reference to: the things it animates. */
  _dynamicObjects() {
    const out = [];
    for (const key of Object.keys(this)) {
      // `_procParts` is the full list of everything build() made, so counting it
      // marked the entire machine as animated — which silently disabled both the
      // static batching and the GLB prune that depend on this list.
      if (key === 'root' || key === 'body' || key === 'model' || key === '_procParts') continue;
      const v = this[key];
      if (v?.isObject3D) out.push(v);
      else if (Array.isArray(v)) {
        for (const e of v) {
          if (e?.isObject3D) out.push(e);
          // Particle state commonly wraps its render object as `{ mesh, t }`.
          // Treat that mesh as dynamic too; otherwise static batching can leave
          // the animation driving an object that is no longer in the scene.
          else if (e?.mesh?.isObject3D) out.push(e.mesh);
        }
      }
    }
    return out;
  }

  setLabelsVisible(v) { if (this.plaque) this.plaque.visible = v; }

  /** Stage 4+ replaces the name with a process clue, so recall has a scaffold. */
  showClue(on) {
    if (!this._clue) {
      const m = mesh(new THREE.PlaneGeometry(2.25, 0.52), new THREE.MeshBasicMaterial({
        map: this._clueTexture(), transparent: true, toneMapped: false, depthWrite: false,
      }), { y: 2.82, z: 0.55, cast: false, receive: false });
      m.renderOrder = 3;
      this._clue = m;
      if (this.slot) m.rotation.y = -this.slot.rotationY;
      this.body.add(m);
    }
    this._clue.visible = on;
  }

  _clueTexture() {
    return labelTexture(methodClue(this.methodId), {
      width: 640, height: 148, bg: 'rgba(20,14,26,0.78)', fg: '#ffe9c9', radius: 44,
      font: '600 52px system-ui, sans-serif', maxLines: 2,
    });
  }

  setHighlight(on) { this._targetHighlight = on ? 1 : 0; }

  /** Position/rotation come from Kitchen.STATION_SLOTS so layout is data. */
  placeAt(slot) {
    this.root.position.copy(slot.position).setY(slot.position.y);
    this.root.rotation.y = slot.rotationY;
    this.slot = slot;
    // Cancel the station's inward turn on the signage only, so every plaque
    // and clue faces the player square-on and stays legible.
    // Uniform plaque height: on the arc no machine hides another, so staggering
    // them just looked arbitrary.
    if (this.plaque) this.plaque.rotation.y = -slot.rotationY;
    if (this._clue) this._clue.rotation.y = -slot.rotationY;
  }

  /** World point where a food should sit while this station works on it. */
  get dockPoint() {
    return this.root.localToWorld(new THREE.Vector3(0, 1.05, 0.35));
  }

  /** Convert a world-space station target into the docked food parent's space. */
  foodParentPoint(worldPoint, out = worldPoint) {
    out.copy(worldPoint);
    const parent = this.food?.group?.parent;
    if (parent) parent.worldToLocal(out);
    return out;
  }

  /** Convert a point authored on this station into the docked food parent's space. */
  foodTarget(localPoint, out = localPoint, source = this.root) {
    out.copy(localPoint);
    source.localToWorld(out);
    return this.foodParentPoint(out, out);
  }

  /** Fit a food model into a host-local box and return its target in root space. */
  fitFoodToBox(food, host, min, max, outTarget) {
    const model = food?.model;
    if (!model) return 1;
    const baseScale = Number.isFinite(food.baseScale) ? food.baseScale : model.scale.x || 1;
    const worldBox = new THREE.Box3();
    const localBox = new THREE.Box3();
    const corner = new THREE.Vector3();
    const boundsInHost = () => {
      model.updateWorldMatrix(true, true);
      worldBox.setFromObject(model);
      localBox.makeEmpty();
      for (const x of [worldBox.min.x, worldBox.max.x]) {
        for (const y of [worldBox.min.y, worldBox.max.y]) {
          for (const z of [worldBox.min.z, worldBox.max.z]) {
            corner.set(x, y, z);
            host.worldToLocal(corner);
            localBox.expandByPoint(corner);
          }
        }
      }
      return localBox;
    };

    model.scale.setScalar(baseScale);
    this.root.updateWorldMatrix(true, true);
    host.updateWorldMatrix(true, true);
    food.group.updateWorldMatrix(true, true);
    const size = boundsInHost().getSize(new THREE.Vector3());
    const capacity = new THREE.Vector3().subVectors(max, min);
    const k = Math.max(0.01, Math.min(
      1,
      capacity.x / Math.max(1e-5, size.x),
      capacity.y / Math.max(1e-5, size.y),
      capacity.z / Math.max(1e-5, size.z),
    ));

    model.scale.setScalar(baseScale * k);
    const fittedCentre = boundsInHost().getCenter(new THREE.Vector3());
    const desiredCentre = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    host.localToWorld(fittedCentre);
    host.localToWorld(desiredCentre);
    const groupOrigin = food.group.getWorldPosition(new THREE.Vector3());
    this.root.worldToLocal(fittedCentre);
    this.root.worldToLocal(desiredCentre);
    this.root.worldToLocal(groupOrigin);
    outTarget.copy(desiredCentre).sub(fittedCentre).add(groupOrigin);
    model.scale.setScalar(baseScale);
    return k;
  }

  // ------------------------------------------------------------ subclass API
  /** @abstract build the machine geometry into this.body */
  build() {}
  /** @abstract @returns {Array} step specs, may depend on the food */
  getSteps() { return [{ kind: 'tap', labelKey: 'ok' }]; }
  /** @abstract called with (stepIndex, progress 0..1, value) every frame a step is active */
  onStepProgress() {}
  /** @abstract called when a step completes */
  onStepDone() {}
  /** @abstract play the success animation; resolve when done */
  playSuccess() { return Promise.resolve(); }
  /** @abstract reset visuals for the next food */
  resetVisuals() {}
  /** Optional no-food setup for the Fact Book's real-sequence autoplay. */
  beginAutoplay() {}

  // ---------------------------------------------------------------- lifecycle
  accept(food) {
    this.busy = true;
    this.food = food;
    this.stepIndex = 0;
    food.state = 'processing';
    const p = this.dockPoint;
    food.group.position.copy(this.foodParentPoint(p));
    return this.getSteps(food);
  }

  release() {
    this.busy = false;
    this.food = null;
    this.stepIndex = 0;
    this.resetVisuals();
  }

  update(dt, elapsed) {
    this._t += dt;
    this._highlight += (this._targetHighlight - this._highlight) * (1 - Math.pow(0.001, dt));
    if (this.ring) {
      const pulse = 0.55 + Math.sin(elapsed * 6) * 0.2;
      this.ring.material.opacity = this._highlight * pulse;
      this.ring.scale.setScalar(1 + this._highlight * 0.06 + Math.sin(elapsed * 6) * 0.02 * this._highlight);
    }
    this.tick?.(dt, elapsed);
  }
}
