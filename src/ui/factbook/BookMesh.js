/**
 * THE PHYSICAL BOOK.
 *
 * One object, animated continuously from closed to open — never two book states
 * cross-faded. Everything the reader sees moving (cover, spine, the two page
 * stacks, the sheet in flight, its shadow, the ribbon) is a real piece of
 * geometry whose transform is driven from two numbers:
 *
 *   openness  0 = shut and facing the reader, 1 = open flat in reading pose
 *   turn      the sheet in flight: 0 = lying on the right, 1 = landed on the left
 *
 * The controller owns the easing; this file owns the shapes.
 *
 * SIZES are in "book units": one page is 1.0 wide, so every offset below reads
 * as a fraction of a page.
 */
import * as THREE from 'three';

export const PAGE_W = 1.0;
export const PAGE_H = 1.32;
const COVER_W = PAGE_W + 0.05;
const COVER_H = PAGE_H + 0.07;
const COVER_T = 0.032;
const BLOCK_T = 0.128;             // the whole page block, split between sides
const SPINE_W = 0.15;
const GAP = 0.014;                 // gutter: pages do not touch the hinge line
const SEG_X = 26;                  // sheet segments along the turn
const SEG_Z = 4;

const CLOTH = 0x3f7fa8;
const CLOTH_DEEP = 0x2f6285;
const PAPER = 0xf3e9d4;
const RIBBON = 0x4a97c4;

const lerp = (a, b, t) => a + (b - a) * t;

// -------------------------------------------------------------- small assets
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 128; i++) {
    // Alternating warm creams so the block edge reads as many separate leaves.
    const v = i % 3 === 0 ? 0.86 : i % 3 === 1 ? 0.97 : 0.92;
    ctx.fillStyle = `rgb(${Math.round(243 * v)},${Math.round(233 * v)},${Math.round(212 * v)})`;
    ctx.fillRect(0, i, 8, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function clothNormal() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      // A shallow woven bump — enough to catch the key light, not enough to
      // turn the cover into sandpaper.
      const w = Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.5 + 0.5;
      img.data[i] = 128 + (w - 0.5) * 26;
      img.data[i + 1] = 128 + (w - 0.5) * 26;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
  return tex;
}

function softShadowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Cover board. Kept as a plain slab; the softened look comes from the cloth
 *  normal map and the printed faces pinned just proud of it. */
function slab(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

export class BookMesh {
  /**
   * @param {object} opts
   * @param {THREE.Texture|null} opts.coverArt  front-cover artwork, already cropped
   * @param {THREE.Texture|null} opts.spineArt
   * @param {THREE.Texture[]} opts.pageTextures [left, right, turnFront, turnBack]
   */
  constructor({ coverArt = null, spineArt = null, pageTextures }) {
    this.root = new THREE.Group();
    this.root.name = 'FactBook';

    // The whole book slides sideways as it opens, so the closed cover and the
    // open spread are both centred on the same point.
    this.centre = new THREE.Group();
    this.root.add(this.centre);

    this.openness = 0;
    this.turn = 0;          // 0..1 within the current sheet flight
    this.turning = false;
    this.turnDir = 1;
    this.progress = 0;      // 0..1 through the book, drives the two stack depths

    this._materials = [];
    this._geometries = [];
    this._textures = [];

    this._buildShadow();
    this._buildCovers(coverArt, spineArt);
    this._buildBlocks();
    this._buildPages(pageTextures);
    this._buildRibbon();
    this.apply();
  }

  _track(x) {
    if (x.isMaterial) this._materials.push(x);
    else if (x.isBufferGeometry) this._geometries.push(x);
    else if (x.isTexture) this._textures.push(x);
    return x;
  }

  _buildShadow() {
    const tex = this._track(softShadowTexture());
    const m = this._track(new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.5, toneMapped: false,
    }));
    const g = this._track(new THREE.PlaneGeometry(1, 1));
    this.contactShadow = new THREE.Mesh(g, m);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = -0.004;
    this.contactShadow.renderOrder = -1;
    this.centre.add(this.contactShadow);
  }

  _buildCovers(coverArt, spineArt) {
    const normal = this._track(clothNormal());
    const cloth = this._track(new THREE.MeshStandardMaterial({
      color: CLOTH, roughness: 0.74, metalness: 0.0,
      normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
    }));
    const clothDeep = this._track(new THREE.MeshStandardMaterial({
      color: CLOTH_DEEP, roughness: 0.78, normalMap: normal,
      normalScale: new THREE.Vector2(0.3, 0.3),
    }));
    const endpaper = this._track(new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.92 }));

    const plate = () => this._track(slab(COVER_W, COVER_T, COVER_H));

    // --- back cover: static, the book opens off it
    this.backCover = new THREE.Group();
    const back = new THREE.Mesh(plate(), cloth);
    back.position.set(COVER_W / 2, 0, 0);
    back.castShadow = back.receiveShadow = true;
    this.backCover.add(back);
    this.backCover.position.y = COVER_T / 2;
    this.centre.add(this.backCover);
    this._face(this.backCover, endpaper, COVER_W / 2, COVER_T / 2 + 0.001, 1);

    // --- front cover: hinged on the same line, rotates a full 180°
    this.frontCover = new THREE.Group();
    const front = new THREE.Mesh(plate(), cloth);
    front.position.set(COVER_W / 2, 0, 0);
    front.castShadow = front.receiveShadow = true;
    this.frontCover.add(front);
    this.centre.add(this.frontCover);
    // The cover swings a full half-turn, so the face that is up when the book is
    // shut is the face that is DOWN once it has opened. Artwork therefore lives
    // on +Y (up while closed) and the endpaper on -Y (up while open).
    if (coverArt) {
      const artMat = this._track(new THREE.MeshStandardMaterial({
        map: coverArt, roughness: 0.6, metalness: 0.0,
        normalMap: normal, normalScale: new THREE.Vector2(0.18, 0.18),
      }));
      this._face(this.frontCover, artMat, COVER_W / 2, COVER_T / 2 + 0.001, 1, COVER_W - 0.012, COVER_H - 0.012);
    }
    this._face(this.frontCover, endpaper, COVER_W / 2, -COVER_T / 2 - 0.001, -1);

    // --- spine: one piece, rotated down into the gutter as the book opens
    this.spine = new THREE.Group();
    const spineMesh = new THREE.Mesh(this._track(slab(SPINE_W, COVER_T + BLOCK_T + COVER_T, COVER_H)), clothDeep);
    spineMesh.position.set(-SPINE_W / 2, (COVER_T * 2 + BLOCK_T) / 2, 0);
    spineMesh.castShadow = spineMesh.receiveShadow = true;
    this.spine.add(spineMesh);
    this.spineMesh = spineMesh;
    this.centre.add(this.spine);
    if (spineArt) {
      const sm = this._track(new THREE.MeshStandardMaterial({ map: spineArt, roughness: 0.62 }));
      const g = this._track(new THREE.PlaneGeometry(COVER_T * 2 + BLOCK_T - 0.01, COVER_H - 0.02));
      const p = new THREE.Mesh(g, sm);
      p.rotation.set(0, -Math.PI / 2, Math.PI / 2);
      p.position.set(-SPINE_W - 0.001, (COVER_T * 2 + BLOCK_T) / 2, 0);
      this.spine.add(p);
    }
  }

  /** A thin printed plane pinned to one side of a cover board. */
  _face(parent, material, x, y, dir, w = COVER_W - 0.02, h = COVER_H - 0.02) {
    const g = this._track(new THREE.PlaneGeometry(w, h));
    const m = new THREE.Mesh(g, material);
    m.rotation.x = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.position.set(x, y, 0);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _buildBlocks() {
    const tex = this._track(stripeTexture());
    const mat = this._track(new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95, map: tex }));
    const make = () => {
      const m = new THREE.Mesh(this._track(new THREE.BoxGeometry(PAGE_W, 1, PAGE_H)), mat);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    this.rightBlock = make();
    this.leftBlock = make();
    this.centre.add(this.rightBlock, this.leftBlock);
  }

  _buildPages(pageTextures) {
    const [texL, texR, texTF, texTB] = pageTextures;
    const pageMat = (map) => this._track(new THREE.MeshStandardMaterial({
      map, roughness: 0.96, metalness: 0,
    }));

    const flat = () => {
      const g = this._track(new THREE.PlaneGeometry(PAGE_W, PAGE_H));
      g.rotateX(-Math.PI / 2);
      return g;
    };
    this.leftPage = new THREE.Mesh(flat(), pageMat(texL));
    this.rightPage = new THREE.Mesh(flat(), pageMat(texR));
    this.leftPage.receiveShadow = this.rightPage.receiveShadow = true;
    this.centre.add(this.leftPage, this.rightPage);

    // --- the sheet in flight -------------------------------------------------
    // Two meshes over one shared position stream: one shows the face that starts
    // on the right, the other the face that ends up on the left. Separate
    // geometries so the back face's UVs can be mirrored once, at build time,
    // instead of every frame.
    this.sheetPivot = new THREE.Group();
    this.centre.add(this.sheetPivot);

    const build = (mirror) => {
      const g = new THREE.PlaneGeometry(PAGE_W, PAGE_H, SEG_X, SEG_Z);
      g.rotateX(-Math.PI / 2);
      g.translate(GAP + PAGE_W / 2, 0, 0);
      if (mirror) {
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
        uv.needsUpdate = true;
      }
      return this._track(g);
    };
    this.sheetFrontGeo = build(false);
    this.sheetBackGeo = build(true);
    this._sheetBase = Float32Array.from(this.sheetFrontGeo.attributes.position.array);

    this.sheetFront = new THREE.Mesh(this.sheetFrontGeo, pageMat(texTF));
    this.sheetBack = new THREE.Mesh(this.sheetBackGeo, this._track(new THREE.MeshStandardMaterial({
      map: texTB, roughness: 0.96, side: THREE.BackSide,
    })));
    this.sheetFront.material.side = THREE.FrontSide;
    this.sheetFront.castShadow = true;
    this.sheetPivot.add(this.sheetFront, this.sheetBack);
    this.sheetPivot.visible = false;

    // Shadow the flying sheet casts on whatever is under it.
    const sTex = this._track(softShadowTexture());
    this.sheetShadow = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(1, 1)),
      this._track(new THREE.MeshBasicMaterial({
        map: sTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
      }))
    );
    this.sheetShadow.rotation.x = -Math.PI / 2;
    this.sheetShadow.renderOrder = 1;
    this.centre.add(this.sheetShadow);
  }

  _buildRibbon() {
    const m = this._track(new THREE.MeshStandardMaterial({
      color: RIBBON, roughness: 0.7, side: THREE.DoubleSide,
    }));
    this.ribbon = new THREE.Group();
    // Lies on the right-hand block, runs off the bottom edge and droops.
    const len = PAGE_H * 0.5 + 0.06;
    const strip = new THREE.Mesh(this._track(new THREE.PlaneGeometry(0.038, len)), m);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0.052, 0, len / 2 + 0.02);
    // Just past the bottom edge it stops being supported and falls.
    const tail = new THREE.Mesh(this._track(new THREE.PlaneGeometry(0.038, 0.1)), m);
    tail.rotation.x = -Math.PI / 2 - 0.85;
    tail.position.set(0.052, -0.036, PAGE_H * 0.5 + 0.1);
    this.ribbon.add(strip, tail);
    this.centre.add(this.ribbon);
  }

  // ------------------------------------------------------------------ updates
  setPageTexture(slot, tex) {
    const map = { left: this.leftPage, right: this.rightPage, front: this.sheetFront, back: this.sheetBack };
    const mesh = map[slot];
    if (!mesh) return;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  }

  /** @param {number} v 0 shut, 1 open flat */
  setOpenness(v) { this.openness = THREE.MathUtils.clamp(v, 0, 1); }

  /** @param {number} v how far through the book we are — sets the stack depths */
  setProgress(v) { this.progress = THREE.MathUtils.clamp(v, 0, 1); }

  /** Start showing the sheet in flight. dir +1 forwards, -1 backwards. */
  setTurn(active, p = 0, dir = 1) {
    this.turning = active;
    this.turn = THREE.MathUtils.clamp(p, 0, 1);
    this.turnDir = dir;
    this.sheetPivot.visible = active;
    this.sheetShadow.visible = active;
  }

  /** Recompute every transform from `openness`, `progress` and `turn`. */
  apply() {
    const o = this.openness;
    // Ease the layout with the cover, so the stacks flatten out as it swings.
    const flat = o * o * (3 - 2 * o);

    this.centre.position.x = -COVER_W / 2 * (1 - flat);
    // Closed, the book stands up and faces the reader; open, it lies down.
    this.root.rotation.x = (1 - flat) * 0.86;
    this.root.scale.setScalar(lerp(1.14, 1.0, flat));

    // --- cover ---------------------------------------------------------------
    this.frontCover.rotation.z = Math.PI * o;
    this.frontCover.position.y = lerp(COVER_T * 1.5 + BLOCK_T, COVER_T / 2, flat);

    // --- spine ---------------------------------------------------------------
    // One rotation lays the standing spine down into the gutter, printed face
    // downward, so the artwork on it is never seen edge-on from the reading
    // camera. Its top stops just under the covers.
    const spineT = COVER_T * 2 + BLOCK_T;
    this.spine.rotation.z = flat * Math.PI / 2;
    this.spine.position.set(lerp(0, spineT / 2, flat), lerp(0, COVER_T * 0.9, flat), 0);

    // --- page stacks ---------------------------------------------------------
    // The right stack empties into the left one as the reader advances, which is
    // the single cheapest cue that this is a real book with a middle. Both keep
    // a floor: a spread with no leaves under one page does not read as a book.
    const hL = BLOCK_T * (0.13 + 0.74 * this.progress) * flat + 0.0001;
    const hR = BLOCK_T * (0.13 + 0.74 * (1 - this.progress)) * flat + BLOCK_T * (1 - flat) + 0.0001;

    this.leftBlock.scale.y = hL;
    this.leftBlock.position.set(-(GAP + PAGE_W / 2), COVER_T + hL / 2, 0);
    // Nothing exists on the left of the book until the cover has swung past
    // vertical: showing the stack sooner puts a slab of paper in mid-air beside
    // a book that is still shut.
    this.leftBlock.visible = o > 0.55;

    this.rightBlock.scale.y = hR;
    this.rightBlock.position.set(GAP + PAGE_W / 2, COVER_T + hR / 2, 0);

    const yL = COVER_T + hL + 0.0012;
    const yR = COVER_T + hR + 0.0012;
    this.leftPage.position.set(-(GAP + PAGE_W / 2), yL, 0);
    this.rightPage.position.set(GAP + PAGE_W / 2, yR, 0);
    // The right page is under the cover the whole time, so it can come up
    // early; the left page is where the cover is still swinging, and showing it
    // sooner puts a printed sheet out beyond the edge of the frame.
    const revR = THREE.MathUtils.smoothstep(flat, 0.3, 0.72);
    const revL = THREE.MathUtils.smoothstep(o, 0.62, 0.95);
    this.rightPage.visible = revR > 0.02;
    this.leftPage.visible = revL > 0.02;
    for (const [p, v] of [[this.leftPage, revL], [this.rightPage, revR]]) {
      p.material.transparent = v < 1;
      p.material.opacity = v;
    }

    this.ribbon.position.set(0, COVER_T + Math.max(hL, hR) - 0.002, 0);
    this.ribbon.visible = flat > 0.5;
    this.ribbon.rotation.y = 0;

    // --- contact shadow ------------------------------------------------------
    const w = lerp(COVER_W * 1.4, COVER_W * 2.6, flat);
    this.contactShadow.scale.set(w, COVER_H * 1.55, 1);
    this.contactShadow.position.x = lerp(COVER_W / 2, 0, flat);
    this.contactShadow.material.opacity = lerp(0.5, 0.7, flat);

    if (this.turning) this._applySheet(yL, yR);
  }

  /**
   * Deform and place the sheet in flight.
   *
   * The sheet bends as a developable arc — every vertex keeps its distance from
   * the spine, and only the direction changes — which is how paper behaves and
   * why a straight lerp of a flat plane always reads as a rigid card.
   */
  _applySheet(yL, yR) {
    const p = this.turn;
    const bend = Math.sin(Math.PI * p);
    const k = 0.2 * bend;                 // curvature; sagitta stays ≈ 0.10 page
    const twist = 0.05 * bend;
    const lift = 0.115 * bend;

    const base = this._sheetBase;
    const posF = this.sheetFrontGeo.attributes.position;
    const posB = this.sheetBackGeo.attributes.position;
    const arr = posF.array;
    const halfH = PAGE_H / 2;
    for (let i = 0; i < base.length; i += 3) {
      const x0 = base[i], z0 = base[i + 2];
      const s = x0 - GAP;
      let x = x0, y = 0;
      if (k > 1e-4) {
        const a = k * s;
        x = GAP + Math.sin(a) / k;
        y = (1 - Math.cos(a)) / k;
      }
      const u = s / PAGE_W;
      y += twist * u * u * (z0 / halfH);
      arr[i] = x; arr[i + 1] = y; arr[i + 2] = z0;
    }
    posF.needsUpdate = true;
    posB.array.set(arr);
    posB.needsUpdate = true;
    this.sheetFrontGeo.computeVertexNormals();
    this.sheetBackGeo.computeVertexNormals();

    this.sheetPivot.rotation.z = Math.PI * p;
    this.sheetPivot.position.set(0, Math.max(yL, yR) + 0.004 + lift, 0);

    // Shadow: sits under the free edge, sweeping across and softening as the
    // sheet climbs away from the page it left.
    const a = Math.PI * p;
    const edgeX = Math.cos(a) * (GAP + PAGE_W * 0.62);
    const s = this.sheetShadow;
    s.position.set(edgeX, (p < 0.5 ? yR : yL) + 0.002, 0);
    s.scale.set(PAGE_W * (1.15 - bend * 0.25), PAGE_H * (1.25 - bend * 0.2), 1);
    s.material.opacity = 0.42 * (1 - bend * 0.55);
  }

  dispose() {
    for (const g of this._geometries) g.dispose();
    for (const m of this._materials) m.dispose();
    for (const t of this._textures) t.dispose();
    this.root.removeFromParent();
  }
}
