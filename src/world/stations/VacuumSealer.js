/**
 * VACUUM PACKING — "removes air" (§5D).
 *
 * Interaction: bag it → HOLD the pump until the air gauge reads zero → seal.
 *
 * The hold is the mechanism made physical. Air is a quantity that has to be
 * pulled out over time; the bag visibly shrink-wraps as the gauge falls, and
 * the microorganisms get squashed flat against the food. Releasing early stops
 * the gauge, so the child learns that partial air removal is not preservation.
 */
import * as THREE from 'three';
import { Station } from './Station.js';
import { PALETTE } from '../Palette.js';
import { plastic, metal, matte, glass, roundedBox, cyl, sphere, torus, mesh, clearcoatFor } from '../Materials.js';

export class VacuumSealer extends Station {
  build() {
    const shell = plastic(0xeef1f6, { rough: 0.32, clearcoat: 0.75 });
    const accent = plastic(PALETTE.vacuum, { rough: 0.4, clearcoat: 0.6 });

    // Low, wide machine body — deliberately a different silhouette from the
    // tall freezer so the two never get confused once labels are off.
    this.body.add(mesh(roundedBox(2.25, 0.72, 1.5, 0.14), shell, { y: 0.58 }));
    this.body.add(mesh(roundedBox(2.3, 0.16, 1.55, 0.07), accent, { y: 0.96 }));

    // Hinged lid with a transparent window — you watch the air leave.
    const lid = new THREE.Group();
    lid.position.set(0, 0.98, -0.72);
    const lidPanel = new THREE.Group();
    lidPanel.position.z = 0.72;
    lidPanel.add(mesh(roundedBox(2.2, 0.24, 1.44, 0.1), shell));
    lidPanel.add(mesh(roundedBox(1.5, 0.06, 0.9, 0.04), glass(0xe4d4f5, { opacity: 0.4 }), { y: 0.12 }));
    lidPanel.add(mesh(roundedBox(1.62, 0.05, 1.0, 0.04), accent, { y: 0.09 }));
    lidPanel.add(mesh(cyl(0.05, 0.05, 1.0, 10), metal(PALETTE.steel), { y: 0.2, z: 0.6, rz: Math.PI / 2 }));
    lid.add(lidPanel);
    this.lid = lid;
    this.body.add(lid);

    // Sealing bar — glows red-hot on the final step.
    this.sealBar = mesh(roundedBox(1.6, 0.05, 0.09, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x7a5b8f, emissive: 0x000000, roughness: 0.5 }),
      { y: 0.98, z: 0.42 });
    this.body.add(this.sealBar);

    // The bag. Built as a box we squash on the Y and Z axes during the pump.
    const bagMat = new THREE.MeshPhysicalMaterial({
      color: 0xe8eef5, roughness: 0.1, transparent: true, opacity: 0.42,
      clearcoat: clearcoatFor(1), clearcoatRoughness: 0.05, side: THREE.DoubleSide, metalness: 0,
    });
    this.bag = mesh(roundedBox(1.25, 0.62, 0.95, 0.16), bagMat, { y: 1.32, z: 0.12, cast: false });
    this.bag.visible = false;
    this.body.add(this.bag);

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

    // Pump housing with a ribbed hose — reads as "this thing sucks air".
    const pump = new THREE.Group();
    pump.position.set(0.85, 1.15, 0.5);
    pump.add(mesh(cyl(0.3, 0.36, 0.66, 16), accent, { y: 0.18 }));
    pump.add(mesh(cyl(0.32, 0.32, 0.09, 16), metal(PALETTE.steelDark), { y: 0.54 }));
    for (let i = 0; i < 7; i++) {
      pump.add(mesh(torus(0.075, 0.028, 6, 12), matte(0x4a3f55, 0.7), {
        x: -0.18 - i * 0.1, y: 0.34 - i * 0.035, rx: Math.PI / 2, rz: 0.35,
      }));
    }
    this.pumpBody = pump;
    this.body.add(pump);

    // Air particles streaming out of the bag toward the pump.
    this.airBits = [];
    const airMat = new THREE.MeshBasicMaterial({ color: 0xd9c7ee, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const a = mesh(sphere(0.05, 8, 6), airMat.clone(), { cast: false, receive: false });
      a.visible = false;
      this.body.add(a);
      this.airBits.push({ mesh: a, t: 1 });
    }

    this._lidOpen = 0.45; this._targetLid = 0.45; this._air = 1;   // ajar at rest
    this._pumpPower = 0;
  }

  _drawGauge(v = 1) {
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

    // The bag collapses onto the food — the single clearest "air is gone" image.
    const squash = 1 - progress;
    this.bag.scale.set(1 - progress * 0.16, 0.36 + squash * 0.64, 1 - progress * 0.14);
    this.bag.material.opacity = 0.42 + progress * 0.2;
    // Drive a bounded vibration in tick(). The old cumulative rotation depended
    // on input-event frequency and could leave the pump at an arbitrary angle.
    this._pumpPower = Math.sin(Math.min(progress, 1) * Math.PI);

    for (let i = 0; i < Math.floor(progress * this.airBits.length); i++) {
      const a = this.airBits[i];
      if (a.t >= 1) { a.t = 0; a.y = 1.1 + Math.random() * 0.4; a.x = (Math.random() - 0.5) * 0.8; }
    }
    if (this.food) {
      this.food.model.scale.setScalar(this.food.baseScale * (1 - progress * 0.08));
    }
  }

  onStepDone(index) {
    if (index === 0) { this._targetLid = 1; this.bag.visible = true; this._loading = true; }
    if (index === 1) this._pumpPower = 0;
    if (index === 2) {
      this._sealFlash = 1;
      this._targetLid = 0;
    }
  }

  async playSuccess() {
    this._sealFlash = 1;
    await new Promise((r) => setTimeout(r, 700));
  }

  resetVisuals() {
    this._targetLid = 0.45; this._air = 1; this._loading = false;
    this._pumpPower = 0;
    this.bag.visible = false;
    this.bag.scale.set(1, 1, 1);
    this.needle.rotation.z = -Math.PI * 0.75;
    this.pumpBody.rotation.y = 0;
    this._drawGauge(1);
    this.sealBar.material.emissive.setHex(0x000000);
  }

  tick(dt, elapsed) {
    this._lidOpen += (this._targetLid - this._lidOpen) * (1 - Math.pow(0.0008, dt));
    this.lid.rotation.x = -this._lidOpen * 1.05;

    if (this._sealFlash > 0) {
      this._sealFlash = Math.max(0, this._sealFlash - dt * 1.6);
      const e = this._sealFlash;
      this.sealBar.material.emissive.setRGB(e * 1.0, e * 0.25, e * 0.05);
      this.sealBar.material.emissiveIntensity = 2.5;
    }

    for (const a of this.airBits) {
      if (a.t >= 1) { a.mesh.visible = false; continue; }
      a.t += dt * 1.8;
      a.mesh.visible = true;
      const p = a.t;
      // arc from the bag toward the pump inlet
      a.mesh.position.set(
        THREE.MathUtils.lerp(a.x, 0.85, p),
        THREE.MathUtils.lerp(a.y, 1.3, p) + Math.sin(p * Math.PI) * 0.25,
        THREE.MathUtils.lerp(0.12, 0.5, p)
      );
      a.mesh.scale.setScalar(1 - p * 0.6);
      a.mesh.material.opacity = 0.75 * Math.sin(p * Math.PI);
    }

    if (this._loading && this.food) {
      const target = this.root.localToWorld(new THREE.Vector3(0, 1.32, 0.12));
      this.food.group.position.lerp(target, 1 - Math.pow(0.004, dt));
    }
    this.pumpBody.position.y = 1.15 + Math.sin(elapsed * 20) * 0.014 * this._pumpPower;
    this.pumpBody.rotation.y = Math.sin(elapsed * 17) * 0.035 * this._pumpPower;
  }
}
