/**
 * GLB assets: the six station machines, and the food models.
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
 * FOODS
 * `tools/blender/build_foods.py` writes one GLB per food model into
 * `public/assets/models/foods/<model>.glb`. These are not optional in the same
 * sense: where a food asset exists it is the shipped model, because silhouette
 * is what makes a food nameable at counter size and the modelled shapes beat
 * the procedural blobs outright. A missing file still falls back to the
 * procedural builder, so a partial set ships fine.
 *
 * WHY THE STATIONS ARE OPTIONAL
 * Every station builds a complete procedural version first, and that stays as
 * the fallback. If a GLB is missing, malformed, or fails to load, the game is
 * unaffected — it simply keeps the procedural machine. Nothing about gameplay,
 * the interactions or the animation hooks depends on an asset existing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const STATION_BASE = 'assets/models/stations/';
const FOOD_BASE = 'assets/models/foods/';

/** Blender node name -> the Station property the game animates. */
export const MOVER_BINDINGS = {
  DryingRack:   { sun: 'sun' },
  Freezer:      { door: 'door', dial: 'dialKnob' },
  VacuumSealer: { lid: 'lid', needle: 'needle', pump: 'pumpBody' },
  PicklingJar:  { lid: 'lid' },
  SaltTable:    { scoop: 'scoop' },
  Pasteuriser:  {},
};

class Registry {
  /**
   * @param {string} base            url prefix for this registry's files
   * @param {() => string[]} available  ids the build found on disk
   * @param {boolean} optIn          require ?models=1, or load whenever present
   */
  constructor(base, available, optIn = false) {
    this.base = base;
    this.available = available;
    this.optIn = optIn;
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
   * Load whichever GLBs the build found on disk. The id list is baked in by
   * vite.config.js, so the empty case costs zero requests and logs nothing —
   * probing at runtime would mean a red 404 per file on every boot.
   */
  async preload(ids) {
    // Station GLBs remain opt-in: the procedural machines are the canonical
    // gameplay visuals and are also what the Fact Book animates.
    if (this.optIn && !(typeof location !== 'undefined' &&
        new URLSearchParams(location.search).get('models') === '1')) {
      this.report.push('off (add ?models=1 to load Blender shells)');
      return this.report;
    }
    const present = new Set(this.available());
    const wanted = ids.filter((id) => present.has(id));
    if (!wanted.length) return this.report;
    const loader = this._loader();
    await Promise.all(wanted.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${this.base}${id}.glb`);
        this.models.set(id, gltf.scene);
        this.report.push(`${id}: loaded`);
      } catch (e) {
        // A broken asset must never take the game down; the procedural version
        // is still there.
        console.warn(`[assets] ${id} failed to load, using the procedural build`, e);
        this.report.push(`${id}: failed`);
      }
    }));
    this.enabled = this.models.size > 0;
    return this.report;
  }

  has(id) { return this.models.has(id); }

  /** A fresh clone, so two users of one asset never share a mutated graph. */
  instance(id) {
    const tpl = this.models.get(id);
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

/** Station shells — opt-in; see the header. */
export const assets = new Registry(
  STATION_BASE,
  () => (typeof __PP_STATION_MODELS__ !== 'undefined' ? __PP_STATION_MODELS__ : []),
  true);

/** Food models — used whenever the file exists. */
export const foodAssets = new Registry(
  FOOD_BASE,
  () => (typeof __PP_FOOD_MODELS__ !== 'undefined' ? __PP_FOOD_MODELS__ : []),
  false);
