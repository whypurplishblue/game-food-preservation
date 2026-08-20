/**
 * Renderer, camera, lighting and post-processing.
 *
 * Lighting recipe (this is most of what makes it look "premium" rather than
 * "a three.js demo"):
 *   - RoomEnvironment IBL for soft omnidirectional bounce. Without this,
 *     MeshPhysicalMaterial clearcoat has nothing to reflect and everything
 *     reads as flat plastic.
 *   - One warm key with a tight, high-res shadow frustum over the play area.
 *   - Cool fill from the opposite side so shadow sides aren't dead black.
 *   - A back rim light to separate machine silhouettes from the backdrop.
 *   - ACES tonemapping + slight exposure lift for that saturated casual-game punch.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PALETTE } from './Palette.js';

/** Cheap vignette + very slight chromatic warmth at the edges. */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.74 },
    offset: { value: 1.02 },
    tint: { value: new THREE.Color(0x2a1b30) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float strength; uniform float offset; uniform vec3 tint;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * offset;
      float v = smoothstep(0.8, 0.15, dot(uv, uv) * 1.6);
      v = mix(1.0, v, strength);
      c.rgb = mix(tint * 0.35, c.rgb, v);
      gl_FragColor = c;
    }
  `,
};

export class Stage3D {
  /**
   * World half-width that must stay inside the frame at every aspect ratio.
   * Set per stage from the widest ACTIVE station, so a two-station stage is not
   * framed as if all six were present — that was pushing early levels miles
   * back on portrait screens for no reason.
   */
  static DEFAULT_HALF_WIDTH = 10.9;

  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.clock = new THREE.Clock();
    this.frameHalfWidth = Stage3D.DEFAULT_HALF_WIDTH;

    this.renderer = new THREE.WebGLRenderer({
      // High-DPI mobile screens get edge smoothing from pixel density; MSAA on
      // top of that multiplies fill cost. Reserve it for the high tier.
      canvas, antialias: quality === 'high', alpha: false,
      powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    // Every station already has a soft blob shadow. The real-time map costs a
    // full extra draw for each caster, so it is a desktop/high-tier feature.
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = this._backdrop();
    this.scene.fog = new THREE.Fog(0xb99a72, 34, 78);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 140);
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);
    this.setCameraFraming('play');

    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this._lights();
    this._environment();
    if (quality === 'high') this._post();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    if (screen.orientation?.addEventListener) {
      screen.orientation.addEventListener('change', this._onResize);
    }
    this.resize();
  }

  _pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    // Capping at 2 costs almost nothing visually and saves a huge amount of
    // fill rate on 3x phones — the single biggest mobile perf win available.
    if (this.quality === 'low') return Math.min(1.25, dpr);
    if (this.quality === 'medium') return Math.min(1.35, dpr);
    return Math.min(2, dpr);
  }

  _shadowMapSize() {
    if (this.quality === 'low') return 512;
    if (this.quality === 'medium') {
      const w = window.innerWidth;
      return w < 720 ? 512 : 1024;
    }
    const w = window.innerWidth;
    return w < 1080 ? 1024 : 2048;
  }

  /** Vertical gradient sky so the backdrop isn't a flat fill. */
  _backdrop() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#79b8d6');
    g.addColorStop(0.38, '#c9d9d2');
    g.addColorStop(0.68, '#b08a5f');
    g.addColorStop(1.00, '#6b482e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  _lights() {
    // Key — warm, from front-left-high. Owns the only shadow map.
    const key = new THREE.DirectionalLight(0xfff0d0, 1.75);
    key.position.set(-9, 15, 10);
    key.castShadow = this.quality === 'high';
    const s = this._shadowMapSize();
    key.shadow.mapSize.set(s, s);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    // Tight frustum around the counter = crisp shadows at modest resolution.
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 13, bottom: -11 });
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 3;
    this.scene.add(key, key.target);
    this.key = key;

    // Fill — cool, opposite side, no shadow. Keeps shadow sides readable.
    const fill = new THREE.DirectionalLight(0xa8c8ff, 0.42);
    fill.position.set(10, 7, 6);
    this.scene.add(fill);

    // Rim — from behind, separates machine silhouettes from the backdrop.
    // Skipped on low quality: one fewer light in the per-fragment loop on
    // weak mobile GPUs, where every directional light is a real fixed cost.
    if (this.quality !== 'low') {
      const rim = new THREE.DirectionalLight(0xffc98a, 0.85);
      rim.position.set(2, 8, -12);
      this.scene.add(rim);
    }

    // Ambient bounce, tinted from the warm floor upward.
    this.scene.add(new THREE.HemisphereLight(0xffe4bd, 0x4a3524, 0.32));
  }

  _environment() {
    // The IBL env map is only read by clearcoat/sheen (which are zeroed out
    // off the high tier in Materials.js) plus roughness-based reflections —
    // on low quality it's pure fragment-shader cost for a look nobody sees.
    if (this.quality === 'low') return;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(new RoomEnvironment(), 0.035);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.40;
    pmrem.dispose();
  }

  _post() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.quality === 'high' ? 0.30 : 0.22, // strength — restrained; big bloom looks cheap
      0.72,  // radius
      0.90   // threshold: only genuinely bright things (glows, sparkles) bloom
    );
    this.composer.addPass(this.bloom);

    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
  }

  /**
   * Named camera framings. Keeping these as data means the "bad camera framing"
   * failure mode is fixable in one place instead of hunting through gameplay code.
   */
  setCameraFraming(name, { instant = true, focus = null } = {}) {
    const FRAMINGS = {
      // Wide shot: both counter columns plus the prep table, machines large.
      play:    { pos: [0, 11.3, 14.3],   look: [0, 3.0, -2.5],  fov: 35 },
      // Pushed in during a mini-interaction, but still showing both columns.
      station: { pos: [0, 10.2, 12.8],   look: [0, 2.5, -2.6],  fov: 34 },
      // Low three-quarter hero angle for stage intros and results.
      hero:    { pos: [-5.6, 6.2, 11.6], look: [0, 3.0, -3.0],  fov: 42 },
      // Behind the title menu.
      menu:    { pos: [3.6, 8.8, 16.6],  look: [0, 3.4, -3.6],  fov: 38 },
    };
    let f = FRAMINGS[name] || FRAMINGS.play;
    if (focus) {
      // Slide toward the active machine rather than staying centred on the room.
      // Partial, not full: keeping the prep table in shot preserves the spatial
      // relationship between "where food arrives" and "where it must go".
      const fx = THREE.MathUtils.clamp(focus.x, -9, 9);
      f = {
        pos: [fx * 0.20, 9.6, focus.z + 10.4],
        look: [fx * 0.42, 2.1, focus.z - 0.4],
        fov: f.fov,
      };
    }
    this._targetFraming = f;
    if (instant) {
      this.camera.position.set(...f.pos);
      this.camera.lookAt(...f.look);
      this.camera.fov = f.fov;
      this.camera.updateProjectionMatrix();
      this._lookAt = new THREE.Vector3(...f.look);
    }
  }

  /** Smoothly ease toward the active framing; call from the update loop. */
  updateCamera(dt) {
    const f = this._targetFraming;
    if (!f) return;
    this._tmpPos ||= new THREE.Vector3();
    this._tmpLook ||= new THREE.Vector3();
    this._lookAt ||= new THREE.Vector3(...f.look);

    // Frame-rate independent exponential ease.
    const k = 1 - Math.pow(0.0012, Math.min(dt, 0.1));

    // Dolly along the view vector so a fixed world half-width always fits,
    // whatever the aspect ratio. Portrait phones need a much bigger pull-back
    // than a linear fudge factor gives.
    this._tmpLook.set(...f.look);
    const vHalf = THREE.MathUtils.degToRad(f.fov) * 0.5;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.35, this.camera.aspect));
    const baseDist = Math.hypot(f.pos[0] - f.look[0], f.pos[1] - f.look[1], f.pos[2] - f.look[2]);
    const needed = (this.frameHalfWidth || Stage3D.DEFAULT_HALF_WIDTH) / Math.tan(hHalf);
    const dolly = THREE.MathUtils.clamp(needed / baseDist, 1, 2.4);
    this._tmpPos.set(
      f.look[0] + (f.pos[0] - f.look[0]) * dolly,
      f.look[1] + (f.pos[1] - f.look[1]) * dolly,
      f.look[2] + (f.pos[2] - f.look[2]) * dolly
    );
    this.camera.position.lerp(this._tmpPos, k);

    this._lookAt.lerp(this._tmpLook, k);
    this.camera.lookAt(this._lookAt);

    if (Math.abs(this.camera.fov - f.fov) > 0.01) {
      this.camera.fov += (f.fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Screen shake, used on spoilage and on big successes. */
  shake(amount = 0.3, ms = 220) {
    this._shake = { amount, until: performance.now() + ms, total: ms };
  }

  _applyShake() {
    if (!this._shake) return;
    const left = this._shake.until - performance.now();
    if (left <= 0) { this._shake = null; this.cameraRig.position.set(0, 0, 0); return; }
    const f = (left / this._shake.total) * this._shake.amount;
    this.cameraRig.position.set(
      (Math.random() - 0.5) * f, (Math.random() - 0.5) * f, 0
    );
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;

    // Portrait phones: pull the camera back and widen so the whole counter
    // still fits rather than cropping stations off the sides.
    this.portrait = aspect < 1.0;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  /** Compile station shaders behind the loading cover to avoid first-use hitching. */
  async warmup(objects = []) {
    const visibility = objects.map((object) => object.visible);
    for (const object of objects) object.visible = true;
    try {
      const compile = this.renderer.compileAsync
        ? this.renderer.compileAsync(this.scene, this.camera)
        : Promise.resolve(this.renderer.compile(this.scene, this.camera));
      // Shader compilation must never turn into an unbounded loading screen on
      // a weak browser. Work already queued by compileAsync may finish later.
      await Promise.race([compile, new Promise((resolve) => setTimeout(resolve, 1200))]);
    } catch (error) {
      if (import.meta.env?.DEV) console.warn('[render] shader warm-up skipped', error);
    } finally {
      objects.forEach((object, i) => { object.visible = visibility[i]; });
    }
  }

  render(dt) {
    this.updateCamera(dt);
    this._applyShake();
    this._updateFrustum();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  _updateFrustum() {
    this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  isPointInViewFrustum(pos, margin = 2) {
    return this.frustum.containsPoint(pos) || pos.distanceTo(this.camera.position) < margin;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    screen.orientation?.removeEventListener?.('change', this._onResize);
    this.renderer.dispose();
    this.composer?.dispose?.();
  }
}
