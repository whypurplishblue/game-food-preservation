/**
 * A small self-contained turntable for one object.
 *
 * Deliberately NOT OrbitControls: the reader must not be able to lose the
 * drying rack by panning it off screen or zooming into its leg. Azimuth is
 * free, elevation and distance are clamped, and there is no pan at all. The
 * controls are also driven from outside, by whichever DOM zone owns them, so
 * dragging a model can never reach the book (§19).
 */
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

export class ObjectViewer {
  constructor({ fov = 34, background = 0xe9f2f8, ground = true, fit = 1.1 } = {}) {
    this.scene = new THREE.Scene();
    this.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 60);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    const key = new THREE.DirectionalLight(0xfff2da, 1.45);
    key.position.set(-3, 5, 4);
    const fill = new THREE.DirectionalLight(0xbcd8ff, 0.45);
    fill.position.set(4, 2, 3);
    const rim = new THREE.DirectionalLight(0xffd9a8, 0.5);
    rim.position.set(1, 3, -5);
    this.scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0x9aa8b4, 0.42));

    if (ground) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(40,60,80,0.42)');
      g.addColorStop(1, 'rgba(40,60,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      this._shadowTex = new THREE.CanvasTexture(c);
      this._shadowGeo = new THREE.PlaneGeometry(1, 1);
      this._shadowMat = new THREE.MeshBasicMaterial({
        map: this._shadowTex, transparent: true, depthWrite: false, toneMapped: false,
      });
      this.shadow = new THREE.Mesh(this._shadowGeo, this._shadowMat);
      this.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(this.shadow);
    }

    this.home = { az: 0.62, el: 0.42 };
    this.az = this.home.az;
    this.el = this.home.el;
    this.zoom = 1;
    this._targetAz = this.az;
    this._targetEl = this.el;
    this._targetZoom = 1;
    this.radius = 1;
    // How much room to leave around the object. The normalising radius is the
    // bounding-box DIAGONAL, so a value near 1 still leaves real margin.
    this.fit = fit;
    this.baseDist = 4;
    this.spin = 0;             // gentle idle turn, paused while the reader drags
    this._idle = 0;
    this.entry = 1;            // 0..1 fade/scale used by the method transition
    this.holder = null;
    this._content = null;
  }

  /**
   * Measure and centre an object once, so showing it costs a parent swap.
   * A 3-metre smokehouse and a 20-cm prawn come out framed identically.
   */
  prepare(obj) {
    const holder = new THREE.Group();
    holder.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    obj.position.sub(centre);
    const r = Math.max(1e-3, size.length() * 0.5);
    holder.scale.setScalar(1 / r);
    return {
      holder, radius: r,
      shadowS: Math.max(size.x, size.z) / r * 1.5,
      shadowY: -(size.y * 0.5) / r - 0.01,
    };
  }

  /** Show a prepared descriptor (or null to clear). Ownership stays with the caller. */
  use(desc, { spin = 0.16, keepAngles = false } = {}) {
    if (this.holder) { this.pivot.remove(this.holder); this.holder = null; }
    this._desc = desc || null;
    if (!desc) return;
    this.holder = desc.holder;
    this.radius = desc.radius;
    this.pivot.add(this.holder);
    if (this.shadow) {
      this.shadow.scale.set(desc.shadowS, desc.shadowS, 1);
      this.shadow.position.y = desc.shadowY;
    }
    this.spin = spin;
    this.baseDist = 1 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * this.fit;
    if (!keepAngles) this.reset(true);
  }

  /** Convenience: prepare and show in one call. */
  setObject(obj, opts) {
    if (!obj) { this.use(null); return null; }
    const desc = this.prepare(obj);
    this.use(desc, opts);
    return desc;
  }

  reset(instant = false) {
    this._targetAz = this.home.az;
    this._targetEl = this.home.el;
    this._targetZoom = 1;
    this._idle = 0;
    if (instant) { this.az = this._targetAz; this.el = this._targetEl; this.zoom = 1; }
  }

  rotateBy(dxNorm, dyNorm) {
    this._targetAz -= dxNorm * Math.PI * 1.6;
    this._targetEl = clamp(this._targetEl + dyNorm * Math.PI * 0.9, -0.15, 1.15);
    this._idle = 2.5;   // hold the idle spin off for a moment after a drag
  }

  zoomBy(delta) {
    this._targetZoom = clamp(this._targetZoom * (1 - delta * 0.0016), 0.62, 1.55);
    this._idle = 2.5;
  }

  update(dt, elapsed) {
    this._idle = Math.max(0, this._idle - dt);
    if (this.spin && this._idle <= 0) this._targetAz += dt * this.spin;
    // Time-based ease with an exact destination: no frame-rate dependence.
    const k = 1 - Math.pow(0.0008, Math.min(dt, 0.05));
    this.az += (this._targetAz - this.az) * k;
    this.el += (this._targetEl - this.el) * k;
    this.zoom += (this._targetZoom - this.zoom) * k;

    const d = this.baseDist / this.zoom;
    this.camera.position.set(
      Math.sin(this.az) * Math.cos(this.el) * d,
      Math.sin(this.el) * d,
      Math.cos(this.az) * Math.cos(this.el) * d
    );
    this.camera.lookAt(0, 0, 0);

    if (this.holder) {
      const e = this.entry;
      this.holder.scale.setScalar((1 / this.radius) * (0.58 + 0.42 * e));
      this.holder.visible = e > 0.04;
    }
    if (this.shadow) this.shadow.material.opacity = this.entry;
  }

  /** Project a local-space point of the current object into viewport pixels. */
  project(v3, rect) {
    if (!this.holder) return null;
    const p = this.holder.localToWorld(v3.clone()).project(this.camera);
    if (p.z > 1) return null;
    return { x: rect.x + (p.x * 0.5 + 0.5) * rect.w, y: rect.y + (-p.y * 0.5 + 0.5) * rect.h };
  }

  dispose() {
    this._shadowGeo?.dispose();
    this._shadowMat?.dispose();
    this._shadowTex?.dispose();
  }
}
