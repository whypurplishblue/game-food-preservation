/**
 * THE 3D FACT BOOK.
 *
 * A presentation layer, and only that. Every sentence it shows arrives through
 * viewModel.js from curriculum.js + the locale files; nothing educational is
 * decided here. What this file owns is the physical experience: one book that
 * animates continuously from shut to open, pages that bend when they turn, and
 * a detail panel whose model, foods and exam note stay in step with whichever
 * page is face up.
 *
 * INTERACTION ZONES (§19) are DOM elements, not raycasts. The book zone owns
 * page dragging, the viewer zone owns model rotation, each food card owns its
 * own click. A pointer that went down on the drying rack can therefore never
 * reach the page underneath it, whatever the camera is doing.
 *
 * RENDERING is one WebGL context shared between several views by scissor
 * rectangle: the book fills the canvas, then the method viewer and each food
 * card are drawn into the exact screen rectangle of their DOM element. One
 * renderer, one frame budget, no per-card canvases.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { t } from '../../content/i18n.js';
import { buildFactBook } from './viewModel.js';
import {
  renderPage, PAGE_W as TEX_W, PAGE_H as TEX_H, drawIcon, iconForMethod, drawFoodGlyph, hexOf,
} from './pageArt.js';
import { BookMesh, PAGE_W, PAGE_H } from './BookMesh.js';
import { ObjectViewer } from './Viewer.js';
import { buildMethodModel, buildFoodObject } from './models.js';
import { StationAutoplay } from '../../world/stations/autoplay.js';
import { sfx } from '../../core/Audio.js';
import './factbook.css';

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

/** How long the shut book is held on screen before it opens itself (§38). */
const AUTO_OPEN_MS = 1000;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * A deterministic tween: start value, elapsed time, duration, easing, and an
 * exact destination assigned on the final frame. §54 rules out the
 * `x += (target - x) * 0.1` pattern for anything a state depends on.
 */
class Tween {
  constructor(value = 0) { this.active = false; this.value = value; this.target = value; }
  to(from, to, dur, ease = easeInOutCubic, onDone = null) {
    this.from = from; this.target = to; this.dur = Math.max(0.001, dur);
    this.ease = ease; this.onDone = onDone; this.t = 0; this.value = from;
    this.active = true;
    return this;
  }
  update(dt) {
    if (!this.active) return this.value;
    this.t += dt;
    if (this.t >= this.dur) {
      this.value = this.target;            // exact, never "close enough"
      this.active = false;
      const cb = this.onDone; this.onDone = null;
      cb?.();
    } else {
      this.value = this.from + (this.target - this.from) * this.ease(this.t / this.dur);
    }
    return this.value;
  }
  cancel() { this.active = false; this.onDone = null; }
}

export class FactBook3D {
  /**
   * @param {HTMLElement} root  the app container
   * @param {object} opts
   * @param {() => boolean} opts.reducedMotion
   * @param {string} opts.quality  'low' | 'medium' | 'high'
   */
  constructor(root, { reducedMotion = () => false, quality = 'high' } = {}) {
    this.root = root;
    this.quality = quality;
    this._reducedMotion = reducedMotion;
    this.isOpen = false;
    this.state = 'closed';   // closed opening reading drag turn food closing
    this.index = 0;
    this._shownIndex = -1;
    this._built = false;
    this._raf = 0;
    this._openTimer = 0;
    this._framedAt = -1;     // openness the camera framing was last built for
    this._elapsed = 0;
    this._cardEls = [];
    this._modelCache = new Map();   // methodId -> built model, current spread +/- 1
    this._foodCache = new Map();    // foodId   -> built thumbnail, kept for the session
    this._autoplay = null;          // StationAutoplay | null — "watch it work" in progress
  }

  get reduced() {
    return this._reducedMotion() ||
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Durations, cut to a blink when the reader has asked for less motion. */
  _dur(seconds) { return this.reduced ? Math.min(0.2, seconds * 0.28) : seconds; }

  // ======================================================== build (once only)
  _build() {
    if (this._built) return;
    this._built = true;

    // ------------------------------------------------------------------ DOM
    const wrap = el('div', 'pp-fb');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', t('ui.factBook'));
    wrap.hidden = true;
    this.wrap = wrap;

    this.canvas = el('canvas', 'pp-fb__canvas');
    wrap.appendChild(this.canvas);

    const body = el('div', 'pp-fb__body');
    this.bookZone = el('div', 'pp-fb__bookzone');
    this.bookZone.setAttribute('role', 'group');
    this.bookZone.setAttribute('aria-label', t('a11y.bookArea'));
    this.bookZone.tabIndex = 0;
    this.panel = el('aside', 'pp-fb__panel');
    this.bookNote = el('aside', 'pp-fb__booknote');
    this.bookNote.setAttribute('role', 'note');
    this.bookNoteText = el('p', 'pp-fb__exam');
    this.bookNote.appendChild(this.bookNoteText);
    this.bookNote.hidden = true;
    body.append(this.bookZone, this.bookNote, this.panel);
    wrap.appendChild(body);

    this.closeBtn = el('button', 'pp-fb__close', '✕');
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', t('ui.close'));
    wrap.appendChild(this.closeBtn);

    this.tabs = el('nav', 'pp-fb__tabs');
    this.tabs.setAttribute('aria-label', t('ui.factBookMethods'));
    wrap.appendChild(this.tabs);

    this.live = el('p', 'pp-sr');
    this.live.setAttribute('aria-live', 'polite');
    wrap.appendChild(this.live);

    this.root.appendChild(wrap);

    this._buildPanelSkeleton();

    // ---------------------------------------------------------------- three
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: this.quality === 'high', alpha: true,
      powerPreference: 'high-performance', stencil: false,
    });
    const maxDpr = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1.15;
    this.renderer.setPixelRatio(Math.min(maxDpr, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene = new THREE.Scene();
    this.scene.environment = this._env;
    this.scene.environmentIntensity = 0.32;
    this._lights();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

    this._buildPageTextures();
    this.book = new BookMesh({
      // The printed sheet is one flat artwork of the whole volume; the front
      // face and the spine are cropped out of it by UV window.
      coverArt: this._coverArt(0.118, 0.014, 0.866, 0.972),
      spineArt: this._coverArt(0.030, 0.014, 0.068, 0.972),
      pageTextures: [this.tex.left, this.tex.right, this.tex.front, this.tex.back],
    });
    this.scene.add(this.book.root);

    this.methodViewer = new ObjectViewer({ fov: 32, fit: 0.85 });
    this.methodViewer.scene.environment = this._env;
    this.thumbViewer = new ObjectViewer({ fov: 30, fit: 0.95 });
    this.thumbViewer.scene.environment = this._env;
    this.thumbViewer.home = { az: 0.72, el: 0.34 };
    this.thumbViewer.reset(true);

    this.tOpen = new Tween(0);
    this.tTurn = new Tween(0);
    this.tProgress = new Tween(0);

    this._wireInput();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  /**
   * The book area does two different jobs, so it says which one it is doing:
   * shut, it is the control that opens the book; open, it is the pages.
   */
  _describeBookZone() {
    const shut = this.state === 'closed';
    this.bookZone.setAttribute('role', shut ? 'button' : 'group');
    this.bookZone.setAttribute('aria-label', shut ? t('ui.openBook') : t('a11y.bookArea'));
  }

  /** Structural labels, re-resolved on every open so a language switch takes. */
  _headings() {
    return {
      chapter: t('ui.chapter'),
      howItWorks: t('ui.howItWorks'),
      inThisChapter: t('ui.inThisChapter'),
      theEnd: t('ui.theEnd'),
      referenceOnly: t('ui.referenceOnly'),
    };
  }

  _lights() {
    // Cream paper blows out fast: this rig is deliberately dimmer than the
    // kitchen's, so the page stays paper-coloured instead of white.
    const key = new THREE.DirectionalLight(0xfff3dd, 1.55);
    key.position.set(-2.6, 4.4, 3.2);
    key.castShadow = this.quality === 'high';
    const s = this.quality === 'high' ? 1024 : 512;
    key.shadow.mapSize.set(s, s);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4 });
    key.shadow.bias = -0.0007;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 3;
    const fill = new THREE.DirectionalLight(0xcfe3ff, 0.5);
    fill.position.set(3.4, 2.2, 2.4);
    const rim = new THREE.DirectionalLight(0xffe0b8, 0.4);
    rim.position.set(0.5, 2.0, -4.0);
    this.scene.add(key, key.target, fill, rim, new THREE.HemisphereLight(0xffffff, 0x9fb0bd, 0.34));
  }

  /** Crop a window out of the printed cover sheet (front face, or spine). */
  _coverArt(ox, oy, rx, ry) {
    if (!this._coverTexSource) {
      this._coverCrops = [];
      this._coverTexSource = new THREE.TextureLoader().load(
        'assets/book/book-cover.png',
        // Clones made before the image arrives have nothing to upload; flagging
        // them at creation time is what produces "marked for update but no image
        // data found". Flag them here, once, when there is actually a bitmap.
        () => { for (const c of this._coverCrops) c.needsUpdate = true; },
        undefined,
        () => { if (import.meta.env?.DEV) console.warn('[factbook] cover artwork missing; using plain cloth'); }
      );
      this._coverTexSource.colorSpace = THREE.SRGBColorSpace;
    }
    const tex = this._coverTexSource.clone();
    this._coverCrops.push(tex);
    // Texture.copy() flags the clone for upload. Before the PNG has arrived
    // there is nothing to upload, and three warns on every frame until it does,
    // so the flag is cleared and re-set from the loader's callback above.
    if (!this._coverTexSource.image) tex.version = 0;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.offset.set(ox, oy);
    tex.repeat.set(rx, ry);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Four canvases, four textures, for the whole book. Pages are redrawn into
   * the same GPU allocation as the reader moves, so a thirty-page field guide
   * costs the video memory of four pages and a page turn never waits on an
   * upload it could have avoided (§45, §56).
   */
  _buildPageTextures() {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = TEX_W; c.height = TEX_H;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return { canvas: c, ctx: c.getContext('2d'), tex };
    };
    this.page = { left: make(), right: make(), front: make(), back: make() };
    this.tex = {
      left: this.page.left.tex, right: this.page.right.tex,
      front: this.page.front.tex, back: this.page.back.tex,
    };
  }

  _paint(slot, spreadIndex, side) {
    const spread = this.model.spreads[spreadIndex] || null;
    const folio = spreadIndex * 2 + (side === 'left' ? 1 : 2);
    const p = this.page[slot];
    renderPage(p.ctx, spread, side, folio, this.headings);
    p.tex.needsUpdate = true;
  }

  // =============================================================== panel DOM
  _buildPanelSkeleton() {
    // Static structure only; every string is written with textContent below.
    this.panel.innerHTML = `
      <div class="pp-fb__panelinner">
        <header class="pp-fb__head">
          <h2 class="pp-fb__title"></h2>
          <div class="pp-fb__badges"></div>
        </header>
        <p class="pp-fb__lead"></p>
        <div class="pp-fb__featuregrid">
          <section class="pp-fb__viewersec" hidden>
            <div class="pp-fb__seclabel"><span></span></div>
            <div class="pp-fb__viewer">
              <div class="pp-fb__viewport" tabindex="0" role="application"></div>
              <span class="pp-fb__hint"></span>
              <button class="pp-fb__reset" type="button">&#8635;</button>
              <button class="pp-fb__backfood" type="button" hidden></button>
              <button class="pp-fb__animate" type="button" hidden>
                <span class="pp-fb__animatelabel"></span>
              </button>
            </div>
          </section>
          <section class="pp-fb__foodsec" hidden>
            <div class="pp-fb__seclabel"><span></span></div>
            <div class="pp-fb__cards"></div>
          </section>
        </div>
        <section class="pp-fb__alsosec" hidden>
          <div class="pp-fb__seclabel pp-fb__seclabel--quiet"><span></span></div>
          <div class="pp-fb__chips"></div>
        </section>
        <section class="pp-fb__listsec" hidden>
          <div class="pp-fb__seclabel"><span></span></div>
          <ul class="pp-fb__list"></ul>
        </section>
        <p class="pp-fb__source"></p>
      </div>`;

    const q = (s) => this.panel.querySelector(s);
    this.ui = {
      inner: q('.pp-fb__panelinner'),
      title: q('.pp-fb__title'),
      badges: q('.pp-fb__badges'),
      lead: q('.pp-fb__lead'),
      viewerSec: q('.pp-fb__viewersec'),
      viewerLabel: q('.pp-fb__viewersec .pp-fb__seclabel span'),
      viewport: q('.pp-fb__viewport'),
      hint: q('.pp-fb__hint'),
      reset: q('.pp-fb__reset'),
      backFood: q('.pp-fb__backfood'),
      animate: q('.pp-fb__animate'),
      animateLabel: q('.pp-fb__animatelabel'),
      foodSec: q('.pp-fb__foodsec'),
      foodLabel: q('.pp-fb__foodsec .pp-fb__seclabel span'),
      cards: q('.pp-fb__cards'),
      alsoSec: q('.pp-fb__alsosec'),
      alsoLabel: q('.pp-fb__alsosec .pp-fb__seclabel span'),
      chips: q('.pp-fb__chips'),
      listSec: q('.pp-fb__listsec'),
      listLabel: q('.pp-fb__listsec .pp-fb__seclabel span'),
      list: q('.pp-fb__list'),
      source: q('.pp-fb__source'),
    };
    this.ui.reset.setAttribute('aria-label', t('ui.resetView'));
  }

  /** One tab per method, straight off the curriculum — never a written list. */
  _buildTabs() {
    this.tabs.textContent = '';
    this._tabEls = [];
    for (const mv of this.model.methods) {
      const b = el('button', `pp-fb__tab${mv.playable ? '' : ' is-extra'}`);
      b.type = 'button';
      b.style.setProperty('--c', hexOf(mv.colour));
      const cv = el('canvas', 'pp-fb__tabicon');
      cv.width = cv.height = 44;
      drawIcon(cv.getContext('2d'), iconForMethod(mv), 22, 22, 15, hexOf(mv.colour));
      b.append(cv, el('span', null, mv.name));
      b.addEventListener('click', () => this.goToMethod(mv.id));
      this.tabs.appendChild(b);
      this._tabEls.push({ id: mv.id, el: b });
    }
  }

  // ============================================================== panel fill
  /** Cards are rebuilt on every spread; the food models behind them are not. */
  _clearCards() { this._cardEls = []; }

  _updatePanel() {
    const s = this.model.spreads[this.index];
    const u = this.ui;
    if (!s) return;
    this._shownIndex = this.index;

    const isMethod = s.kind === 'method';
    const mv = isMethod ? s.method : null;
    this.panel.style.setProperty('--m', hexOf(mv ? mv.colour : 0x3f7fa8));
    this.panel.style.setProperty('--m-accent', hexOf(mv ? mv.accent : 0x8fc7e4));

    u.title.textContent = s.title;
    u.badges.textContent = '';
    if (isMethod) {
      // Playable and Fact-Book-only methods must never look the same (§8, §28).
      u.badges.append(
        el('span', `pp-fb__badge pp-fb__badge--kind${mv.playable ? '' : ' is-extra'}`,
          mv.playable ? t('ui.methodBadge') : t('ui.referenceOnly')),
        el('span', 'pp-fb__badge pp-fb__badge--mech', mv.mechLabel)
      );
    }

    // The panel is the DEEPER read: a method leads with `detail`, while the
    // book page carries `explain` — the same sentence is not printed twice.
    u.lead.textContent = isMethod ? (mv.detail || mv.explain || '') : this._sectionLead(s);
    u.lead.hidden = !u.lead.textContent;

    if (isMethod) {
      u.viewerSec.hidden = false;
      u.viewerLabel.textContent = t('ui.interactive3d');
      u.hint.textContent = t('ui.dragToRotate');
    } else {
      u.viewerSec.hidden = true;
    }
    this._mv = mv;
    // Only a playable method has a station with a real sequence to replay; a
    // Fact-Book-only method's model is a diorama that already animates on its
    // own (§ models.js DIORAMAS), so there is nothing here to press play on.
    this.ui.animate.hidden = !(isMethod && mv.playable);
    this._setAnimatePlaying(false);

    this._clearCards();
    if (isMethod && mv.foods.length) {
      u.foodSec.hidden = false;
      u.foodLabel.textContent = t('ui.suitableFoods');
      u.cards.textContent = '';
      for (const fv of mv.foods) {
        const card = el('button', 'pp-fb__card');
        card.type = 'button';
        const slot = el('div', 'pp-fb__cardslot');
        if (!fv.model) {
          // §26: a food the notes name but the game has no model for is still
          // taught — an illustration stands in for the missing asset.
          const cv = el('canvas', 'pp-fb__glyph');
          cv.width = cv.height = 128;
          drawFoodGlyph(cv.getContext('2d'), fv.id, 128);
          slot.appendChild(cv);
          card.classList.add('is-illustration');
        }
        card.append(slot, el('span', 'pp-fb__cardname', fv.name));
        if (fv.model) {
          card.setAttribute('aria-label', t('ui.inspectFood', { food: fv.name }));
          card.addEventListener('click', () => this.inspectFood(fv));
        } else {
          card.setAttribute('aria-label', fv.name);
          card.disabled = true;
        }
        u.cards.appendChild(card);
        this._cardEls.push({ fv, el: card, slot, built: null, desc: null });
      }
    } else {
      u.foodSec.hidden = true;
    }

    // Chips, not cards: `alsoWorks` pairings are true but are NOT the Unit 8
    // taught examples, and the layout has to keep saying so (§22).
    if (isMethod && mv.alsoWorks.length) {
      u.alsoSec.hidden = false;
      u.alsoLabel.textContent = t('ui.alsoWorksWith');
      u.chips.textContent = '';
      for (const fv of mv.alsoWorks) u.chips.appendChild(el('span', 'pp-fb__chip', fv.name));
    } else {
      u.alsoSec.hidden = true;
    }

    // Exam notes sit in the former page-navigation row below the book. There
    // is deliberately no label: the orange rule and the note's placement make
    // it a quiet callout without stealing another heading from the page.
    const exam = isMethod ? (mv.exam || '') : '';
    this.bookNoteText.textContent = exam;
    this.bookNote.hidden = !exam;

    const list = this._sectionList(s);
    if (list) {
      u.listSec.hidden = false;
      u.listLabel.textContent = list.label;
      u.list.textContent = '';
      u.list.className = `pp-fb__list${list.ordered ? ' is-ordered' : ''}`;
      for (const item of list.items) u.list.appendChild(el('li', null, item));
    } else {
      u.listSec.hidden = true;
    }

    // §32: the teaching-notes reference stays attached, quietly.
    u.source.textContent = isMethod && mv.sourceRef ? t('ui.source', { ref: mv.sourceRef }) : '';
    u.source.hidden = !u.source.textContent;

    for (const tab of this._tabEls) {
      const isOn = isMethod && tab.id === mv.id;
      tab.el.classList.toggle('is-on', isOn);
      if (isOn) tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    this.live.textContent = `${s.label} — ${s.title}`;
    this._loadMethodModel(mv);
    // Content just changed height — recheck once the browser has laid it out.
    requestAnimationFrame(() => this._updatePanelFade());
  }

  /** Fade the panel's bottom (and top, once scrolled) edge against its actual overflow. */
  _updatePanelFade() {
    const el = this.ui.inner;
    if (!el) return;
    el.classList.toggle('has-more-below', el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    el.classList.toggle('has-more-above', el.scrollTop > 4);
  }

  /** Toggle left/right fade edges on the method tab strip against its overflow. */
  _updateTabsFade() {
    const el = this.tabs;
    if (!el) return;
    this.tabs.classList.toggle('has-fade-left', el.scrollLeft > 4);
    this.tabs.classList.toggle('has-fade-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  _sectionLead(s) {
    switch (s.kind) {
      case 'divider': return s.note || '';
      default: return '';
    }
  }

  _sectionList(s) {
    switch (s.kind) {
      case 'importance': return { label: s.title, items: s.items, ordered: true };
      case 'divider': return {
        label: t('ui.inThisChapter'), ordered: false,
        items: s.methods.map((m) => `${m.name} — ${m.mechLabel}`),
      };
      default: return null;
    }
  }

  // ==================================================================== models
  /**
   * Method models are built once and kept for the spread on either side (§45).
   *
   * A drying rack is fifty-odd procedural meshes; building one at the moment
   * the sheet crosses the spine put a visible hitch in the middle of every page
   * turn. Now the neighbours are ready before the reader asks for them, and the
   * cache is trimmed back to three so a long book never grows without bound.
   */
  _ensureModel(mv) {
    if (!mv) return null;
    let entry = this._modelCache.get(mv.id);
    if (!entry) {
      entry = buildMethodModel(mv);
      entry.desc = this.methodViewer.prepare(entry.object);
      this._modelCache.set(mv.id, entry);
    }
    return entry;
  }

  _loadMethodModel(mv) {
    const id = mv ? mv.id : null;
    if (this._modelId === id) return;
    this._modelId = id;
    this._cancelAutoplay();
    this._disposeInspected();
    this._method = null;
    this._methodDesc = null;
    this.methodViewer.use(null);
    this.ui.backFood.hidden = true;
    if (!mv) return;
    const entry = this._ensureModel(mv);
    this._method = entry;
    this._methodDesc = entry.desc;
    this.methodViewer.use(entry.desc, { spin: this.reduced ? 0 : 0.16 });
  }

  /** Warm the models and food thumbnails around the current spread. */
  _prefetch() {
    clearTimeout(this._prefetchTimer);
    this._prefetchTimer = setTimeout(() => {
      if (!this.isOpen) return;
      const wanted = new Set();
      for (const i of [this.index, this.index - 1, this.index + 1]) {
        const sp = this.model.spreads[i];
        if (sp?.kind === 'method') { wanted.add(sp.method.id); this._ensureModel(sp.method); }
      }
      for (const [id, entry] of this._modelCache) {
        if (wanted.has(id)) continue;
        entry.dispose?.();
        this._modelCache.delete(id);
      }
      // Food models are few and shared between methods, so they are simply kept
      // for the life of the book rather than churned.
      for (const card of this._cardEls) this._ensureFood(card);
    }, 60);
  }

  _ensureFood(card) {
    if (card.desc || !card.fv.model) return card.desc;
    let entry = this._foodCache.get(card.fv.id);
    if (!entry) {
      const built = buildFoodObject(card.fv);
      if (!built) return null;
      entry = { built, desc: this.thumbViewer.prepare(built.object) };
      this._foodCache.set(card.fv.id, entry);
    }
    card.built = entry.built;
    card.desc = entry.desc;
    return card.desc;
  }

  _disposeInspected() {
    this._inspected?.dispose?.();
    this._inspected = null;
    this._inspecting = null;
  }

  /** Focus one food in the big viewer, with a way back that is not "close" (§25). */
  inspectFood(fv) {
    const built = buildFoodObject(fv);
    if (!built) return;
    sfx('ui.tap');
    this._cancelAutoplay();
    this._disposeInspected();
    this._inspected = built;
    this._inspecting = fv;
    this.methodViewer.setObject(built.object, { spin: this.reduced ? 0 : 0.34 });
    this.methodViewer.entry = 1;
    this.ui.viewerLabel.textContent = fv.name;
    this.ui.animate.hidden = true;
    this.ui.backFood.hidden = false;
    this.ui.backFood.textContent = `‹ ${t('ui.backToMethod')}`;
    this.ui.viewport.focus({ preventScroll: true });
    this.state = 'food';
    this.live.textContent = fv.name;
  }

  backToMethod() {
    if (!this._inspecting) return;
    sfx('ui.back');
    this._disposeInspected();
    this.ui.backFood.hidden = true;
    this.ui.animate.hidden = !this._mv?.playable;
    this.ui.viewerLabel.textContent = t('ui.interactive3d');
    if (this._methodDesc) this.methodViewer.use(this._methodDesc, { spin: this.reduced ? 0 : 0.16 });
    this.state = 'reading';
  }

  // ================================================================= animate
  /**
   * "Watch it work" — replays the station's own step sequence (StationAutoplay,
   * driven from the station's real onStepProgress/onStepDone/playSuccess, same
   * as a player's hand would) so the machine on the page does what the machine
   * in the kitchen does, with nobody dragging or holding anything.
   */
  animateMethod() {
    if (this.state !== 'reading' || this._autoplay) return;
    const station = this._method?.station;
    if (!station) return;
    sfx('ui.tap');
    this._autoplay = new StationAutoplay(station);
    this._setAnimatePlaying(true);
    if (this._autoplay.done) this._finishAutoplay();
  }

  /** Ends the sequence early with the machine reset, never mid-pose (§ cache). */
  _cancelAutoplay() {
    if (!this._autoplay) return;
    this._autoplay.station.resetVisuals();
    this._autoplay = null;
    this._setAnimatePlaying(false);
  }

  async _finishAutoplay() {
    const { station } = this._autoplay;
    this._autoplay = null;
    // Never let a station's success flourish wedge the demo (§ Game._finishInteraction).
    await Promise.race([
      Promise.resolve(station.playSuccess()),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    station.resetVisuals();
    this._setAnimatePlaying(false);
  }

  _setAnimatePlaying(playing) {
    const btn = this.ui.animate;
    if (!btn) return;
    btn.disabled = playing;
    btn.classList.toggle('is-playing', playing);
    this.ui.animateLabel.textContent = t(playing ? 'ui.watching' : 'ui.watchItWork');
  }

  // ===================================================================== input
  _wireInput() {
    const zone = this.bookZone;
    let drag = null;

    zone.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      if (this.state === 'closed') { this.openBook(); return; }
      if (this.state !== 'reading' && this.state !== 'food') return;
      const r = zone.getBoundingClientRect();
      const dir = e.clientX < r.left + r.width / 2 ? -1 : 1;
      if (!this._canGo(dir)) return;
      drag = { x0: e.clientX, dir, w: Math.max(140, r.width * 0.4), moved: 0 };
      try { zone.setPointerCapture(e.pointerId); } catch { /* no capture available */ }
      this.state = 'drag';
      this._beginTurn(dir);
    });

    zone.addEventListener('pointermove', (e) => {
      if (!drag) { if (this.state === 'closed') this._hover = true; return; }
      const dx = e.clientX - drag.x0;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      // Forward turns are dragged right-to-left, backward the other way.
      this.tTurn.cancel();
      this.tTurn.value = clamp01((drag.dir > 0 ? -dx : dx) / drag.w);
      this._applyTurn();
    });

    const endDrag = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      try { zone.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      // A tap, not a drag: treat it as a page button and run the full turn.
      const commit = d.moved < 8 ? true : this.tTurn.value >= 0.34;
      this._endTurn(commit);
    };
    zone.addEventListener('pointerup', endDrag);
    zone.addEventListener('pointercancel', endDrag);
    zone.addEventListener('pointerleave', () => { this._hover = false; });
    zone.addEventListener('keydown', (e) => {
      if (this.state !== 'closed') return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      this.openBook();
    });

    // While it is shut the book stands centre stage, over ground the book zone
    // does not own. Anywhere but the ✕ opens it, so no part of the book it is
    // showing you is dead to the touch.
    this.wrap.addEventListener('pointerdown', (e) => {
      if (!this.isOpen || this.state !== 'closed') return;
      if (e.target.closest('.pp-fb__close')) return;
      this.openBook();
    });

    // ---- viewer zone: model rotation only, and it never reaches the book.
    const vp = this.ui.viewport;
    let rot = null;
    vp.addEventListener('pointerdown', (e) => {
      rot = { x: e.clientX, y: e.clientY };
      try { vp.setPointerCapture(e.pointerId); } catch { /* no capture available */ }
      vp.classList.add('is-grabbing');
      e.stopPropagation();
    });
    vp.addEventListener('pointermove', (e) => {
      if (!rot) return;
      const r = vp.getBoundingClientRect();
      this.methodViewer.rotateBy((e.clientX - rot.x) / Math.max(1, r.width),
        (e.clientY - rot.y) / Math.max(1, r.height));
      rot = { x: e.clientX, y: e.clientY };
    });
    const endRot = (e) => {
      if (!rot) return;
      rot = null;
      vp.classList.remove('is-grabbing');
      try { vp.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    vp.addEventListener('pointerup', endRot);
    vp.addEventListener('pointercancel', endRot);
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.methodViewer.zoomBy(e.deltaY);
    }, { passive: false });
    vp.addEventListener('keydown', (e) => {
      const step = 0.07;
      if (e.key === 'ArrowLeft') this.methodViewer.rotateBy(-step, 0);
      else if (e.key === 'ArrowRight') this.methodViewer.rotateBy(step, 0);
      else if (e.key === 'ArrowUp') this.methodViewer.rotateBy(0, -step);
      else if (e.key === 'ArrowDown') this.methodViewer.rotateBy(0, step);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });

    this.ui.reset.addEventListener('click', () => { sfx('ui.tap'); this.methodViewer.reset(); });
    this.ui.backFood.addEventListener('click', () => this.backToMethod());
    this.ui.animate.addEventListener('click', () => this.animateMethod());
    this.closeBtn.addEventListener('click', () => this.close());

    this.ui.inner.addEventListener('scroll', () => this._updatePanelFade(), { passive: true });
    this.tabs.addEventListener('scroll', () => this._updateTabsFade(), { passive: true });

    this._onKey = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.go(-1); }
      else if (e.key === 'Home') { e.preventDefault(); this.jumpTo(0); }
      else if (e.key === 'End') { e.preventDefault(); this.jumpTo(this.model.spreads.length - 1); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  // ================================================================ page turns
  _canGo(dir) {
    return dir > 0 ? this.index < this.model.spreads.length - 1 : this.index > 0;
  }

  /**
   * Arm a turn. `turn` runs 0 → 1 whichever way the sheet is going; the sheet's
   * own angle is derived from it, so the drag maths never has to branch.
   */
  _beginTurn(dir, targetIndex = null) {
    const from = this.index;
    const to = targetIndex != null ? targetIndex : from + dir;
    this._turnFrom = from;
    this._turnTo = to;
    this._turnDir = dir;
    this._crossed = false;

    if (dir > 0) {
      // The flying sheet shows this spread's right page on one side and the
      // destination's left page on the other; the destination's right page is
      // painted underneath it, waiting to be revealed.
      this._paint('front', from, 'right');
      this._paint('back', to, 'left');
      this._paint('right', to, 'right');
    } else {
      this._paint('front', to, 'right');
      this._paint('back', from, 'left');
      this._paint('left', to, 'left');
    }
    this.tTurn.cancel();
    this.tTurn.value = 0;
    this._applyTurn();
    sfx('book.turn');
  }

  /** Push `turn` into the book and keep the panel in step (§42, §43). */
  _applyTurn() {
    if (this._turnFrom == null) return;
    const p = this.tTurn.value;
    const dir = this._turnDir;
    // Forwards the sheet swings 0 → π, backwards π → 0.
    this.book.setTurn(true, dir > 0 ? p : 1 - p, dir);

    // Crossing the spine is what changes the content — with hysteresis, so a
    // reader wobbling around the middle does not thrash the panel.
    if (!this._crossed && p >= 0.52) {
      this._crossed = true;
      this.index = this._turnTo;
      this._showSpread();
    } else if (this._crossed && p < 0.44) {
      this._crossed = false;
      this.index = this._turnFrom;
      this._showSpread();
    }

    const e = p < 0.5 ? 1 - smooth(p, 0.22, 0.5) : smooth(p, 0.5, 0.88);
    this.methodViewer.entry = e;
    this.ui.inner.style.opacity = String(0.2 + 0.8 * e);
  }

  _showSpread() {
    if (this._shownIndex === this.index) return;
    this._disposeInspected();
    this.ui.backFood.hidden = true;
    this._updatePanel();
    this.tProgress.to(this.book.progress, this._progressFor(this.index), this._dur(0.32), easeOutCubic);
  }

  /**
   * Land the sheet. A committed page runs to exactly 1 and never springs
   * back (§40); an abandoned one runs to exactly 0 and restores what was there.
   */
  _endTurn(commit) {
    if (this._turnFrom == null) return;
    const start = this.tTurn.value;
    const target = commit ? 1 : 0;
    const dur = this._dur(0.62) * Math.max(0.3, Math.abs(target - start));
    this.state = 'turn';
    this.tTurn.to(start, target, dur, easeInOutCubic, () => {
      this.index = commit ? this._turnTo : this._turnFrom;
      this._crossed = commit;
      this._showSpread();
      this._turnFrom = this._turnTo = null;
      this.book.setTurn(false);
      this._repaintStatic();
      this.methodViewer.entry = 1;
      this.ui.inner.style.opacity = '1';
      this.state = this._inspecting ? 'food' : 'reading';
      this._prefetch();
    });
  }

  _progressFor(i) {
    return i / Math.max(1, this.model.spreads.length - 1);
  }

  /** Redraw the two resting pages for the spread that is now face up. */
  _repaintStatic() {
    this._paint('left', this.index, 'left');
    this._paint('right', this.index, 'right');
  }

  go(dir) {
    if (!this.isOpen || this.state === 'opening' || this.state === 'closing') return;
    if (this.state === 'turn' || this.state === 'drag') return;
    if (!this._canGo(dir)) return;
    this._beginTurn(dir);
    this._endTurn(true);
  }

  /**
   * Jump anywhere in the book. More than one spread away still turns exactly
   * one sheet — the reader sees a page cross the spine and lands on the content
   * they asked for, rather than watching fifteen flips.
   */
  jumpTo(index) {
    index = THREE.MathUtils.clamp(index, 0, this.model.spreads.length - 1);
    if (index === this.index) return;
    if (!this.isOpen || this.state === 'turn' || this.state === 'drag') return;
    if (this.state === 'opening' || this.state === 'closing') return;
    this._beginTurn(index > this.index ? 1 : -1, index);
    this._endTurn(true);
  }

  goToMethod(id) {
    const i = this.model.spreadOfMethod.get(id);
    if (i != null) this.jumpTo(i);
  }

  // ================================================================= lifecycle
  open(onClose) {
    this._build();
    // The Fact Book instance survives closing so its WebGL resources can be
    // reused. Its prose must not: buildFactBook() resolves every curriculum
    // string in the language that is active at the time it is called.
    this.model = buildFactBook();
    this.headings = this._headings();
    this.wrap.setAttribute('aria-label', t('ui.factBook'));
    this.closeBtn.setAttribute('aria-label', t('ui.close'));
    this.tabs.setAttribute('aria-label', t('ui.factBookMethods'));
    this.ui.reset.setAttribute('aria-label', t('ui.resetView'));
    this.onClose = onClose;
    this.isOpen = true;
    this.wrap.hidden = false;
    this.wrap.classList.remove('is-open');
    this.index = 0;
    this._shownIndex = -1;
    this._modelId = undefined;
    this._turnFrom = this._turnTo = null;
    this._hover = false;
    this._buildTabs();
    this._repaintStatic();
    this._updatePanel();
    requestAnimationFrame(() => this._updateTabsFade());

    this.book.setProgress(0);
    this.book.setTurn(false);
    this.tProgress.cancel(); this.tProgress.value = 0;
    this.tTurn.cancel(); this.tTurn.value = 0;
    this.tOpen.cancel(); this.tOpen.value = 0;
    this.book.setOpenness(0);
    this.book.apply();
    this.state = 'closed';
    this._framedAt = -1;          // centre stage until it opens
    this._describeBookZone();
    this._resize();

    // The book arrives SHUT, is held there for a beat so the reader sees the
    // object they are about to open, then opens itself. It is the same object
    // throughout — never a second one faded in (§38).
    this._prefetch();
    this._last = performance.now();
    if (!this._raf) this._loop();
    // A tap, a click, Enter or Space during that beat opens it early; the shut
    // book is still the control, it just does not wait to be asked.
    requestAnimationFrame(() => this.bookZone.focus({ preventScroll: true }));
    clearTimeout(this._openTimer);
    this._openTimer = setTimeout(() => this.openBook(), AUTO_OPEN_MS);
  }

  openBook() {
    clearTimeout(this._openTimer);
    if (this.state !== 'closed' || !this.isOpen) return;
    this.state = 'opening';
    this._describeBookZone();
    sfx('ui.open');
    this.tOpen.to(this.tOpen.value, 1, this._dur(1.05), easeInOutCubic, () => {
      this.state = 'reading';
      this.wrap.classList.add('is-open');
      this._describeBookZone();
      this.bookZone.focus({ preventScroll: true });
    });
  }

  close() {
    if (!this.isOpen || this.state === 'closing') return;
    clearTimeout(this._openTimer);
    this.state = 'closing';
    sfx('ui.back');
    this.wrap.classList.remove('is-open');
    this.book.setTurn(false);
    this.tTurn.cancel();
    this._turnFrom = this._turnTo = null;
    this._cancelAutoplay();
    this._disposeInspected();
    // The geometry stays alive until the cover has actually shut (§46).
    this.tOpen.to(this.tOpen.value, 0, this._dur(0.72), easeInOutCubic, () => {
      this.isOpen = false;
      this.wrap.hidden = true;
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this.state = 'closed';
      const cb = this.onClose;
      this.onClose = null;
      cb?.();
    });
  }

  // ====================================================================== loop
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    // Clamped so a stalled frame cannot teleport a page across the spine, but
    // not so tightly that a slow machine runs every animation in slow motion.
    const dt = Math.min(0.12, (now - this._last) / 1000);
    this._last = now;
    this._elapsed += dt;
    this._update(dt);
    this._render();
  }

  _update(dt) {
    if (this.tOpen.active) this.book.setOpenness(this.tOpen.update(dt));
    else if (this.state === 'closed') {
      // Hover crack: restrained, and it falls shut on its own (§38).
      const want = this._hover ? 0.11 : 0;
      const v = this.tOpen.value + (want - this.tOpen.value) * (1 - Math.pow(0.004, dt));
      this.tOpen.value = v;
      this.book.setOpenness(v);
    }

    // The book is presented centre stage while shut and slides into its zone as
    // it opens — late enough that the cover is visibly moving first, and
    // finished as the pages settle. Closing walks it back to the middle.
    if (this.tOpen.value !== this._framedAt) { this._framedAt = this.tOpen.value; this._frameBook(); }

    if (this.tTurn.active) { this.tTurn.update(dt); this._applyTurn(); }
    if (this.tProgress.active) this.book.setProgress(this.tProgress.update(dt));
    this.book.apply();

    this.methodViewer.update(dt, this._elapsed);
    if (!this._inspecting) this._method?.update?.(dt, this._elapsed);
    if (this._autoplay && !this._inspecting && this._autoplay.advance(dt)) this._finishAutoplay();
    this.thumbViewer.update(dt, this._elapsed);
  }

  // ==================================================================== render
  _resize() {
    if (!this._built) return;
    const w = this.wrap.clientWidth || window.innerWidth;
    const h = this.wrap.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this._measureFrame(w, h);
    this._frameBook();
    this._updatePanelFade();
    this._updateTabsFade();
  }

  /**
   * Where the book zone is, in canvas pixels. Read on resize only: `_frameBook`
   * runs every frame while the book is opening, and a layout read per frame is
   * exactly the kind of thing that turns a smooth open into a stutter.
   */
  _measureFrame(w, h) {
    const zr = this.bookZone.getBoundingClientRect();
    const cr = this.canvas.getBoundingClientRect();
    const zw = Math.max(80, zr.width);
    const zh = Math.max(80, zr.height);
    this._frame = {
      w, h,
      cx: zr.left - cr.left + zw / 2,
      // Biased downward: at the middle of a page turn the sheet stands on end
      // and is taller than the whole open book. Centring the book exactly would
      // send it off the top of the frame.
      cy: zr.top - cr.top + zh * 0.55,
      fw: THREE.MathUtils.clamp(zw / w, 0.2, 1),
      fh: THREE.MathUtils.clamp(zh / h, 0.2, 1),
    };
  }

  /**
   * Frame the book, with an off-centre frustum so it keeps a natural
   * perspective instead of being shrunk to pay for the panel (§10).
   *
   * The shut book is presented centre stage and larger than life; as it opens
   * it walks across into the book ZONE, making room for its own contents. Two
   * curves, both driven by the opening:
   *
   *   POSITION travels late and lands with the pages — the cover is visibly
   *     moving before the book starts crossing the screen.
   *   SIZE gives that magnification back early, before the cover is a third
   *     of the way up. A half-open book stands on end and is the tallest this
   *     thing ever gets; any extra scale in that pose overflows the frame.
   */
  _frameBook() {
    const f = this._frame;
    if (!f) return;
    const { w, h } = f;
    const o = this.tOpen.value;
    // How much of the "presented" pose is left, and how far across it has come.
    const pres = 1 - smooth(o, 0.02, 0.30);
    const s = smooth(o, 0.30, 0.95);
    const cx = lerp(w / 2, f.cx, s);
    const cy = lerp(h * 0.5, f.cy, s);

    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    cam.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);

    // Fit the book's actual projected extents, not a bounding sphere — an open
    // book is more than twice as wide as it is tall on screen, and fitting a
    // sphere around it left it small in the middle of a large empty zone.
    const elev = THREE.MathUtils.degToRad(64);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    const fit = (halfW, halfV, fw, fh) => Math.max(
      halfV / Math.tan((vFov / 2) * fh),
      halfW / Math.tan((hFov / 2) * fw)) * 1.08;

    // Reading: the open book, fitted to the book zone. Presented: the shut
    // block, fitted to the whole canvas.
    const reading = fit(PAGE_W * 1.09, (PAGE_H * 0.5) * Math.sin(elev) + 0.2 * Math.cos(elev), f.fw, f.fh);
    // Shut, the block hangs a whole cover to the LEFT of the spine, which is the
    // origin the camera aims at — so its half-width is a full cover, not half of
    // one. Understate it and a narrow screen crops the fore-edge.
    const presented = fit(PAGE_W * 1.12, PAGE_H * 0.62, 0.96, Math.max(f.fh, 0.86));
    const dist = lerp(reading, presented, pres);

    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, 0.02, 0);
    cam.updateProjectionMatrix();
  }

  /**
   * Screen rectangle of a DOM element, in canvas CSS pixels, y from the top,
   * plus the part of it that is actually on screen.
   *
   * The panel scrolls, and the canvas behind it knows nothing about that: a
   * card scrolled out of the panel would still have its thumbnail painted, as
   * a 3D model floating over the tab bar. `clip` is the intersection with the
   * scroll container, and it becomes the scissor while the full rect stays the
   * viewport — so a half-scrolled card is cropped exactly like the DOM around
   * it rather than re-framed.
   */
  _rectOf(node) {
    const r = node.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const c = this.canvas.getBoundingClientRect();
    // The food cards have their own vertical scroller. Clip thumbnails to
    // both it and the panel so a card leaving that list cannot paint over the
    // rest of the detail column.
    const clips = [this.ui.inner];
    if (this.ui.cards?.contains(node)) clips.push(this.ui.cards);
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (const scroller of clips) {
      const sr = scroller.getBoundingClientRect();
      x1 = Math.max(x1, sr.left);
      y1 = Math.max(y1, sr.top);
      x2 = Math.min(x2, sr.right);
      y2 = Math.min(y2, sr.bottom);
    }
    if (x2 - x1 < 4 || y2 - y1 < 4) return null;
    return {
      x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height,
      clip: { x: x1 - c.left, y: y1 - c.top, w: x2 - x1, h: y2 - y1 },
    };
  }

  _renderView(viewer, rect, bg) {
    const H = this.canvas.clientHeight;
    const clip = rect.clip;
    this.renderer.setViewport(rect.x, H - (rect.y + rect.h), rect.w, rect.h);
    this.renderer.setScissor(clip.x, H - (clip.y + clip.h), clip.w, clip.h);
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(bg, 1);
    this.renderer.clear(true, true, false);
    viewer.camera.aspect = rect.w / rect.h;
    viewer.camera.updateProjectionMatrix();
    this.renderer.render(viewer.scene, viewer.camera);
  }

  _render() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this._lastW !== w || this._lastH !== h) {
      this._lastW = w; this._lastH = h;
      this._resize();
    }

    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);

    // Nothing in the panel is live until the cover is open: the DOM fades, but
    // the canvas behind it would keep painting a model over a shut book.
    if (!this.wrap.classList.contains('is-open')) { r.setScissorTest(false); return; }

    if (!this.ui.viewerSec.hidden) {
      const rect = this._rectOf(this.ui.viewport);
      if (rect) this._renderView(this.methodViewer, rect, 0xe9f2f8);
    }

    // One shared thumbnail scene, re-pointed at each card in turn: a food card
    // costs a viewport change, not a scene, a canvas or a render target.
    if (this._cardEls.length) {
      let drew = false;
      for (const card of this._cardEls) {
        if (!card.fv.model) continue;
        const rect = this._rectOf(card.slot);
        if (!rect) continue;
        if (!card.desc && !this._ensureFood(card)) continue;
        this.thumbViewer.use(card.desc, { spin: 0, keepAngles: true });
        this.thumbViewer.entry = 1;
        this.thumbViewer.update(0, this._elapsed);
        this._renderView(this.thumbViewer, rect, 0xf3f8fb);
        drew = true;
      }
      if (drew) this.thumbViewer.use(null);
    }

    r.setScissorTest(false);
  }

  // ================================================================== teardown
  dispose() {
    if (!this._built) return;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    clearTimeout(this._prefetchTimer);
    clearTimeout(this._openTimer);
    this._disposeInspected();
    for (const e of this._modelCache.values()) e.dispose?.();
    this._modelCache.clear();
    for (const e of this._foodCache.values()) e.built?.dispose?.();
    this._foodCache.clear();
    this._clearCards();
    this.book.dispose();
    this.methodViewer.dispose();
    this.thumbViewer.dispose();
    for (const k of Object.keys(this.page)) this.page[k].tex.dispose();
    this._coverTexSource?.dispose();
    this._env?.dispose();
    this.renderer.dispose();
    this.wrap.remove();
    this._built = false;
  }
}
