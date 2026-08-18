/**
 * Unified pointer input: mouse, touch and pen through one Pointer Events path,
 * plus a full keyboard route so the game is playable without a pointer at all.
 *
 * Drag model: the food lifts off the counter and follows a horizontal plane at
 * carry height. Snapping is by nearest-station-within-radius rather than exact
 * raycast onto machine geometry — a child dragging with a thumb should not have
 * to hit a small target, and forgiving drop zones are the difference between
 * "responsive" and "fiddly" on a tablet.
 */
import * as THREE from 'three';

// Carry height sits just above the machines so the food visually overlaps the
// station the player is pointing at.
const CARRY_Y = 2.5;
// Drop targeting is done in SCREEN space, as a fraction of the smaller viewport
// dimension. World-space distance was wrong: the food rides a horizontal plane,
// so pointing at a machine put the food short of it and the drop silently
// failed — which reads to a child as "the game ignored me".
const DROP_SCREEN_FRAC = 0.19;

export class Input {
  constructor(canvas, stage3d, opts = {}) {
    this.canvas = canvas;
    this.stage = stage3d;
    this.opts = opts;                 // { getFoods, getStations, onDrop, onPick, enabled }
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_Y);
    this.hitPoint = new THREE.Vector3();
    this.held = null;
    this.hoverStation = null;
    this.enabled = true;
    this.keyboardIndex = 0;

    this._onDown = this._down.bind(this);
    this._onMove = this._move.bind(this);
    this._onUp = this._up.bind(this);
    this._onKey = this._key.bind(this);

    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    window.addEventListener('keydown', this._onKey);
    // Stop the browser from treating a drag on the canvas as a scroll/zoom.
    canvas.style.touchAction = 'none';
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this._clearHover();
  }

  _toNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  _pickFood(e) {
    this._toNdc(e);
    this.ray.setFromCamera(this.ndc, this.stage.camera);
    const foods = this.opts.getFoods().filter((f) => f.state === 'idle');
    if (!foods.length) return null;

    // Raycast against food meshes, but with a generous fallback: if nothing is
    // hit directly, take the food whose screen-space centre is closest to the
    // tap, within a comfortable radius. Fat-finger tolerance, essentially.
    const objs = foods.map((f) => f.model);
    const hits = this.ray.intersectObjects(objs, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.food) o = o.parent;
      if (o?.userData.food) return o.userData.food;
    }
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const f of foods) {
      v.copy(f.group.position).project(this.stage.camera);
      const d = Math.hypot(v.x - this.ndc.x, v.y - this.ndc.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    return bestD < 0.13 ? best : null;
  }

  _down(e) {
    if (!this.enabled || e.button > 0) return;
    const food = this._pickFood(e);
    if (!food) return;
    e.preventDefault();
    this._pointerPx = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture?.(e.pointerId);
    this.held = food;
    food.state = 'held';
    food._grabOffsetY = 0;
    this.opts.onPick?.(food);
    this._move(e);
  }

  _move(e) {
    if (!this.enabled) return;
    if (!this.held) return;
    this._toNdc(e);
    this._pointerPx = { x: e.clientX, y: e.clientY };
    this.ray.setFromCamera(this.ndc, this.stage.camera);
    if (this.ray.ray.intersectPlane(this.plane, this.hitPoint)) {
      this.held.group.position.lerp(this.hitPoint, 0.55);
    }
    this._updateHover();
  }

  _updateHover() {
    const stations = this.opts.getStations();
    const r = this.canvas.getBoundingClientRect();
    const limit = Math.min(r.width, r.height) * DROP_SCREEN_FRAC;
    const px = this._pointerPx?.x ?? 0, py = this._pointerPx?.y ?? 0;
    let best = null, bestD = limit;
    for (const s of stations) {
      if (!s.enabled) continue;
      // Aim point is the machine's mid-body, which is what the eye tracks.
      this._v ||= new THREE.Vector3();
      this._v.copy(s.root.position).setY(s.root.position.y + 1.0).project(this.stage.camera);
      const sx = r.left + (this._v.x * 0.5 + 0.5) * r.width;
      const sy = r.top + (-this._v.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best !== this.hoverStation) {
      this.hoverStation?.setHighlight(false);
      best?.setHighlight(true);
      this.hoverStation = best;
      if (best) this.opts.onHover?.(best);
    }
  }

  _clearHover() {
    this.hoverStation?.setHighlight(false);
    this.hoverStation = null;
  }

  _up() {
    if (!this.held) return;
    const food = this.held;
    const station = this.hoverStation;
    this.held = null;
    this._clearHover();
    if (station && !station.busy) {
      this.opts.onDrop?.(food, station);
    } else {
      food.state = 'idle';
      this.opts.onReturn?.(food);
    }
  }

  /**
   * Keyboard route: Tab/arrows cycle the food, 1–6 send it to a station.
   * Announced via the a11y live region in HUD.
   */
  _key(e) {
    if (!this.enabled) return;
    const foods = this.opts.getFoods().filter((f) => f.state === 'idle');
    if (!foods.length) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Only claim arrows when no widget has focus, so panel controls win.
      if (document.activeElement && document.activeElement !== document.body) return;
      e.preventDefault();
      this.keyboardIndex = (this.keyboardIndex + (e.key === 'ArrowRight' ? 1 : -1) + foods.length) % foods.length;
      this.opts.onKeyboardSelect?.(foods[this.keyboardIndex]);
      return;
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) {
      if (document.activeElement && document.activeElement !== document.body) return;
      const stations = this.opts.getStations().filter((s) => s.enabled);
      const st = stations[n - 1];
      const food = foods[Math.min(this.keyboardIndex, foods.length - 1)];
      if (st && food && !st.busy) {
        e.preventDefault();
        this.opts.onDrop?.(food, st);
      }
    }
  }

  update() {
    // Held food floats with a slight lag and tilt — gives the drag weight.
    if (this.held) {
      const g = this.held.group;
      g.position.y = THREE.MathUtils.lerp(g.position.y, CARRY_Y, 0.25);
      this.held.model.rotation.z = THREE.MathUtils.lerp(this.held.model.rotation.z, 0.12, 0.1);
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown', this._onKey);
  }
}
