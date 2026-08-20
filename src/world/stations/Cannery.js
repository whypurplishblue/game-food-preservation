/**
 * CANNING AND BOTTLING — "killing microorganisms and sealing the food in
 * airtight containers" (§5J).
 *
 * Interaction: drop it in the can → HOLD to cook it hot → TWIST the lid shut.
 *
 * §5J names two actions and the exam sentence names both, so the interaction
 * has to be both or it teaches half a method. The heat is a hold, like the
 * pasteuriser's — but there is no cooling window here, because canning is not
 * pasteurising: this one kills and then locks the container. The twist is the
 * seal, and it is a gesture nothing else in the game uses, so "airtight" gets
 * its own muscle memory rather than another button labelled SEAL.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, hot, roundedBox, cyl, torus, sphere, mesh } from '../Materials.js';

export class Cannery extends Station {
  build() {
    const steel = metal(PALETTE.steel, { rough: 0.3 });
    const steelDark = metal(PALETTE.steelDark, { rough: 0.38 });
    const grey = plastic(0x90a4ae, { rough: 0.4, clearcoat: 0.5 });

    // Machine body: a squat retort with a gantry over it. The gantry is what
    // separates this silhouette from the vacuum sealer's flat clamshell.
    this.body.add(mesh(roundedBox(2.1, 0.9, 1.5, 0.09), grey, { y: 0.62 }));
    this.body.add(mesh(roundedBox(2.16, 0.14, 1.56, 0.06), steelDark, { y: 1.12 }));
    for (const sx of [-1, 1]) {
      this.body.add(mesh(roundedBox(0.16, 1.5, 0.18, 0.05), steelDark, { x: sx * 0.86, y: 1.9, z: -0.2 }));
    }
    this.body.add(mesh(roundedBox(2.0, 0.22, 0.4, 0.07), grey, { y: 2.6, z: -0.2 }));

    // The can itself, open, on the plate. Food drops into it.
    const can = new THREE.Group();
    can.position.set(0, 1.2, 0.18);
    can.add(mesh(cyl(0.52, 0.52, 0.9, 26, true), steel, { y: 0.45 }));
    can.add(mesh(cyl(0.52, 0.52, 0.06, 26), steelDark, { y: 0.02 }));
    can.add(mesh(torus(0.52, 0.05, 8, 26), steelDark, { y: 0.9, rx: Math.PI / 2 }));
    // A paper label, because a bare cylinder does not read as a can.
    can.add(mesh(cyl(0.535, 0.535, 0.46, 26, true), matte(0xef6c47, 0.75), { y: 0.44 }));
    can.add(mesh(cyl(0.545, 0.545, 0.1, 26, true), matte(0xf6f2e6, 0.7), { y: 0.44 }));
    this.body.add(can);
    this.can = can;

    // Contents: a liquid disc that rises as the food goes in.
    const fill = mesh(cyl(0.47, 0.47, 0.08, 24), glass(0xffcc80, { opacity: 0.75 }), { y: 0.12 });
    fill.visible = false;
    can.add(fill);
    this.fill = fill;

    // The seamer head on the gantry: descends and spins during the twist.
    const head = new THREE.Group();
    this._headRestY = 2.34;
    // Can rim: can.y (1.20) + wall height (0.90) = 2.10. The lid is centred
    // 0.045 above that rim and sits -0.02 below the head origin, so a sealed
    // head belongs at 2.165 — not deep inside the container.
    this._headSealY = 2.165;
    head.position.set(0, this._headRestY, 0.18);
    head.add(mesh(cyl(0.2, 0.2, 0.5, 14), steelDark, { y: 0.25 }));
    const lid = new THREE.Group();
    lid.add(mesh(cyl(0.56, 0.56, 0.09, 26), steel));
    lid.add(mesh(torus(0.5, 0.04, 8, 24), steelDark, { rx: Math.PI / 2, y: 0.05 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      lid.add(mesh(roundedBox(0.1, 0.05, 0.22, 0.02), steelDark,
        { x: Math.cos(a) * 0.38, z: Math.sin(a) * 0.38, y: 0.06, ry: -a, cast: false }));
    }
    lid.position.y = -0.02;
    head.add(lid);
    this.body.add(head);
    this.head = head;
    this.lid = lid;

    // Burner ring under the plate — this is the "kills microorganisms" half.
    const burnerMat = hot(0xff7043, 0);
    this.burner = mesh(torus(0.62, 0.06, 8, 28), burnerMat, { y: 1.16, z: 0.18, rx: Math.PI / 2, cast: false });
    this.body.add(this.burner);
    const heatLight = new THREE.PointLight(0xff7043, 0, 3.6, 2);
    heatLight.position.set(0, 1.3, 0.18);
    this.body.add(heatLight);
    this.heatLight = heatLight;

    // Temperature gauge on the side, so the heat is a number as well as a glow.
    const gaugeCanvas = document.createElement('canvas');
    gaugeCanvas.width = 256; gaugeCanvas.height = 128;
    this._gCtx = gaugeCanvas.getContext('2d');
    this._gTex = new THREE.CanvasTexture(gaugeCanvas);
    this._gTex.colorSpace = THREE.SRGBColorSpace;
    // On the front face of the body, not floating beside the can: a readout has
    // to look bolted to the machine it belongs to.
    this.body.add(mesh(roundedBox(0.86, 0.44, 0.08, 0.04), matte(0x1c2833, 0.6), { x: -0.52, y: 0.78, z: 0.74 }));
    this.body.add(mesh(new THREE.PlaneGeometry(0.76, 0.34), new THREE.MeshBasicMaterial({
      map: this._gTex, transparent: true, toneMapped: false, depthWrite: false,
    }), { x: -0.52, y: 0.78, z: 0.79, cast: false, receive: false }));
    this._drawGauge(0);

    // Steam from the retort while it cooks.
    this.steam = [];
    const steamMat = new THREE.MeshBasicMaterial({
      color: 0xeceff1, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
    });
    for (let i = 0; i < 10; i++) {
      const p = mesh(sphere(0.14 + Math.random() * 0.1, 10, 8), steamMat.clone(), { cast: false, receive: false });
      p.visible = false;
      this.body.add(p);
      this.steam.push({ mesh: p, t: 1, drift: (Math.random() - 0.5) * 0.6 });
    }

    this._heat = 0;
    this._sealT = 0;
    this._loading = false;
  }

  _drawGauge(temp) {
    const ctx = this._gCtx;
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = '#0d1620';
    ctx.beginPath(); ctx.roundRect(2, 2, 252, 124, 14); ctx.fill();
    ctx.font = '800 58px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const c = temp > 0.66 ? '#ff8a65' : temp > 0.2 ? '#ffd54f' : '#4a6b80';
    ctx.fillStyle = c;
    ctx.shadowColor = c; ctx.shadowBlur = temp * 20;
    ctx.fillText(`${Math.round(20 + temp * 101)}°C`, 128, 66);
    ctx.shadowBlur = 0;
    this._gTex.needsUpdate = true;
  }

  getSteps() {
    return [
      { kind: 'tap', id: 'fill', textKey: 'station.canning.fill', icon: 'can' },
      { kind: 'hold', id: 'cook', textKey: 'station.canning.heat', icon: 'flame', ms: 2600, hot: true },
      { kind: 'twist', id: 'seal', textKey: 'station.canning.seal', turns: 2, hintKey: 'station.canning.twistHint' },
    ];
  }

  onStepProgress(index, progress) {
    if (index === 1) {
      this._heat = progress;
      this._drawGauge(progress);
      if (progress > 0.25 && Math.random() < 0.25) this._puff(1);
      if (this.food) this.food.swarm.setActivity(1 - progress * 0.9);
    } else if (index === 2) {
      // The head comes down and screws the lid on as the child turns.
      this._sealT = progress;
      this.head.position.y = THREE.MathUtils.lerp(this._headRestY, this._headSealY, progress);
      this.lid.rotation.y = progress * Math.PI * 4;
      if (this.food) this.food.swarm.setActivity(Math.max(0, 0.1 - progress * 0.1));
    }
  }

  onStepDone(index) {
    if (index === 0) { this._loading = true; this.fill.visible = true; }
    if (index === 1) this._puff(4);
  }

  _puff(n = 2) {
    let made = 0;
    for (const s of this.steam) {
      if (made >= n) break;
      if (s.t < 1) continue;
      s.t = 0;
      s.x = (Math.random() - 0.5) * 0.6;
      made++;
    }
  }

  async playSuccess() {
    this._puff(5);
    await new Promise((r) => setTimeout(r, 650));
  }

  resetVisuals() {
    this._heat = 0;
    this._sealT = 0;
    this._loading = false;
    this.head.position.y = this._headRestY;
    this.lid.rotation.y = 0;
    this.fill.visible = false;
    this.fill.scale.set(1, 0.4, 1);
    this.heatLight.intensity = 0;
    this.burner.material.emissiveIntensity = 0;
    this._drawGauge(0);
  }

  tick(dt, elapsed) {
    this.burner.material.emissiveIntensity = this._heat * 2.4 + Math.sin(elapsed * 9) * 0.15 * this._heat;
    this.heatLight.intensity = this._heat * 3.2;
    if (this.fill.visible) {
      const want = 0.4 + this._heat * 1.4;
      this.fill.scale.y += (want - this.fill.scale.y) * (1 - Math.pow(0.02, dt));
      this.fill.position.y = 0.12 + this.fill.scale.y * 0.04;
    }

    for (const s of this.steam) {
      if (s.t >= 1) { s.mesh.visible = false; continue; }
      s.t += dt * 0.6;
      s.mesh.visible = true;
      s.mesh.position.set(s.x + s.drift * s.t, 2.1 + s.t * 1.1, 0.18 + s.drift * 0.3 * s.t);
      s.mesh.scale.setScalar(0.5 + s.t * 1.6);
      s.mesh.material.opacity = 0.45 * (1 - s.t);
    }

    if (this._loading && this.food) {
      // Sinks into the can, and disappears under the rim as it fills.
      const target = this.root.localToWorld(new THREE.Vector3(0, 1.62, 0.22));
      this.food.group.position.lerp(target, 1 - Math.pow(0.005, dt));
      this.food.model.rotation.y += dt * 0.9;
      this.food.model.scale.setScalar(this.food.baseScale * (1 - this._sealT * 0.55));
    }
  }
}
