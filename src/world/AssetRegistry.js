/**
 * Optional GLB assets for the six station machines.
 *
 * THE CONTRACT
 * `tools/blender/build_stations.py` writes one GLB per station into
 * `public/assets/models/stations/<id>.glb`, each containing:
 *
 *     shell      every static part, merged
 *     <mover>    one node per animated part, origin already on its hinge
 *
 * The mover names per station are declared in MOVER_BINDINGS below, mapping a
 * GLB node name to the Station property that drives it (`door`, `dialKnob`, …).
 * Only `shell` and the nodes named there are used: anything else in the file is
 * discarded, because a part the game animates piece by piece (the pasteuriser's
 * coils, the pickling bottles) cannot be driven as one merged mesh and would
 * only duplicate the procedural version that is still doing the work.
 *
 * WHY IT IS OPTIONAL
 * Every station builds a complete procedural version first, and that stays as
 * the fallback. If a GLB is missing, malformed, or fails to load, the game is
 * unaffected — it simply keeps the procedural machine. Nothing about gameplay,
 * the interactions or the animation hooks depends on an asset existing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = 'assets/models/stations/';

/** Blender node name -> the Station property the game animates. */
export const MOVER_BINDINGS = {
  DryingRack:   { sun: 'sun' },
  Freezer:      { door: 'door', dial: 'dialKnob' },
  VacuumSealer: { lid: 'lid', needle: 'needle' },
  PicklingJar:  { lid: 'lid' },
  SaltTable:    { scoop: 'scoop' },
  Pasteuriser:  {},
};

class Registry {
  constructor() {
    this.models = new Map();     // stationId -> gltf.scene (template)
    this.enabled = false;
    this.report = [];
  }

  _loader() {
    if (this._gltf) return this._gltf;
    // No Draco: these machines are a few thousand triangles each, so the
    // decoder would cost more bytes than the compression saves — and it would
    // be a runtime dependency on a CDN for a game that must work offline.
    const loader = new GLTFLoader();
    this._gltf = loader;
    return loader;
  }

  /**
   * Load whichever station GLBs the build found in public/assets/models/.
   * `__PP_STATION_MODELS__` is baked in by vite.config.js, so the usual case —
   * no models at all — costs zero requests and logs nothing.
   */
  async preload(stationIds) {
    // OPT-IN, and deliberately so. The visual gauntlet judged the Blender
    // shells against the procedural machines they replace and the procedural
    // ones won: they carry canvas-drawn displays, gauges and badges that the
    // exported meshes have no equivalent for, so swapping them in trades a
    // readable machine for a blank one. The pipeline stays wired and verified —
    // `?models=1` runs it — but the shipped look is the one that reads better.
    if (typeof location === 'undefined' ||
        new URLSearchParams(location.search).get('models') !== '1') {
      this.report.push('off (add ?models=1 to load Blender shells)');
      return this.report;
    }
    const present = new Set(
      (typeof __PP_STATION_MODELS__ !== 'undefined' ? __PP_STATION_MODELS__ : [])
    );
    const wanted = stationIds.filter((id) => present.has(id));
    if (!wanted.length) return this.report;
    const loader = this._loader();
    await Promise.all(wanted.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${BASE}${id}.glb`);
        this.models.set(id, gltf.scene);
        this.report.push(`${id}: loaded`);
      } catch (e) {
        // A broken asset must never take the game down; the procedural machine
        // is still there.
        console.warn(`[assets] ${id} failed to load, using procedural machine`, e);
        this.report.push(`${id}: failed`);
      }
    }));
    this.enabled = this.models.size > 0;
    return this.report;
  }

  has(stationId) { return this.models.has(stationId); }

  /** A fresh clone, so six stations never share one mutated scene graph. */
  instance(stationId) {
    const tpl = this.models.get(stationId);
    if (!tpl) return null;
    const root = tpl.clone(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Clone materials so a per-station tint cannot bleed across machines.
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else if (o.material) o.material = o.material.clone();
    });
    return root;
  }
}

export const assets = new Registry();
