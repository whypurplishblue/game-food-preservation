const INTRO_MS = 800;
const RIPPLE_MS = 240;
const MAX_PARTICLES = 680;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => t * t * (3 - 2 * t);

/** One-shot, decorative effects for the title screen. */
export class TitleEffects {
  constructor() {
    this.introPlayed = false;
    this._raf = 0;
    this._canvas = null;
    this._ripple = null;
    this._scanner = null;
    this._scannerRaf = 0;
    this._scannerResize = null;
    this._scannerPointer = null;
  }

  playIntro(title) {
    if (!title || this.introPlayed) return;
    this.introPlayed = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = title.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'pp-title-particles';
    canvas.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.ceil(rect.width * dpr);
    canvas.height = Math.ceil(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    title.appendChild(canvas);
    this._canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) { this.destroy(); return; }
    ctx.scale(dpr, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const word of title.querySelectorAll('.pp-title__word1, .pp-title__word2')) {
      const wordRect = word.getBoundingClientRect();
      const style = getComputedStyle(word);
      const x = wordRect.left - rect.left + wordRect.width / 2;
      const y = wordRect.top - rect.top + wordRect.height / 2;
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      const angle = Math.atan2(matrix.b, matrix.a);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = style.webkitTextStrokeColor || style.color;
      ctx.lineWidth = Math.max(0, parseFloat(style.webkitTextStrokeWidth) || 0);
      if (ctx.lineWidth) ctx.strokeText(word.textContent, 0, 0);
      ctx.fillStyle = style.color;
      ctx.fillText(word.textContent, 0, 0);
      ctx.restore();
    }

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.ceil(Math.sqrt((canvas.width * canvas.height) / (MAX_PARTICLES * 12))));
    const points = [];
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i + 3] < 90) continue;
        points.push({
          tx: x / dpr, ty: y / dpr,
          x: x / dpr + (Math.random() - 0.5) * Math.min(150, rect.width * 0.32),
          y: y / dpr + (Math.random() - 0.5) * Math.min(100, rect.height * 0.8),
          r: 1.1 + Math.random() * 1.4,
          colour: `rgb(${pixels[i]} ${pixels[i + 1]} ${pixels[i + 2]})`,
          delay: Math.random() * 0.18,
        });
      }
    }
    while (points.length > MAX_PARTICLES) points.splice((Math.random() * points.length) | 0, 1);

    title.classList.add('is-particle-intro');
    const start = performance.now();
    const frame = (now) => {
      if (this._canvas !== canvas || !canvas.isConnected) return;
      const elapsed = now - start;
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of points) {
        const local = Math.max(0, Math.min(1, elapsed / INTRO_MS - p.delay));
        const progress = easeOutCubic(local / Math.max(0.01, 1 - p.delay));
        const x = p.x + (p.tx - p.x) * progress;
        const y = p.y + (p.ty - p.y) * progress;
        ctx.globalAlpha = Math.min(1, progress * 2) * (elapsed > 650 ? 1 - easeInOut((elapsed - 650) / 150) : 1);
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(x, y, p.r * (0.65 + progress * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      title.style.setProperty('--title-intro-progress', String(Math.max(0, Math.min(1, (elapsed - 620) / 180))));
      if (elapsed < INTRO_MS) this._raf = requestAnimationFrame(frame);
      else this._finishIntro(title, canvas);
    };
    this._raf = requestAnimationFrame(frame);
  }

  _finishIntro(title, canvas) {
    title.classList.remove('is-particle-intro');
    title.style.removeProperty('--title-intro-progress');
    canvas.remove();
    if (this._canvas === canvas) this._canvas = null;
    this._raf = 0;
  }

  playRipple(button, event) {
    if (!button || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(true);
    this._ripple?.remove();
    const screen = button.closest('.pp-screens');
    if (!screen) return Promise.resolve(true);
    const rect = screen.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const x = Number.isFinite(event?.clientX) && event.clientX > 0 ? event.clientX - rect.left : buttonRect.left - rect.left + buttonRect.width / 2;
    const y = Number.isFinite(event?.clientY) && event.clientY > 0 ? event.clientY - rect.top : buttonRect.top - rect.top + buttonRect.height / 2;
    const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
    const ripple = document.createElement('span');
    ripple.className = 'pp-title-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.setProperty('--ripple-x', `${x}px`);
    ripple.style.setProperty('--ripple-y', `${y}px`);
    ripple.style.setProperty('--ripple-size', `${radius * 2}px`);
    screen.appendChild(ripple);
    this._ripple = ripple;
    requestAnimationFrame(() => ripple.classList.add('is-running'));
    return new Promise((resolve) => setTimeout(() => resolve(this._ripple === ripple && ripple.isConnected), RIPPLE_MS));
  }

  mountScanner(screen, sourceCanvas, {
    targets = [], found = [], status = null, progress = null,
    progressText = (count, total) => `${count} / ${total}`,
    completeText = () => 'Complete', onScan = null, onFound = null,
  } = {}) {
    if (!screen || !sourceCanvas || !targets.length) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lens = document.createElement('div');
    lens.className = 'pp-title-scanner';
    lens.setAttribute('aria-hidden', 'true');
    screen.appendChild(lens);

    const foundSet = new Set(found);
    const state = {
      screen, sourceCanvas, lens, targets, foundSet, status, progress, onScan,
      x: 0, y: 0, tx: 0, ty: 0, size: 0, scanned: -1, last: performance.now(),
    };
    this._scanner = state;
    if (status) status.hidden = false;

    const updateProgress = () => {
      if (progress) progress.textContent = foundSet.size === targets.length
        ? completeText()
        : progressText(foundSet.size, targets.length);
      status?.classList.toggle('is-complete', foundSet.size === targets.length);
      screen.classList.toggle('is-scanner-complete', foundSet.size === targets.length);
    };

    const resize = () => {
      if (this._scanner !== state) return;
      const rect = lens.getBoundingClientRect();
      state.size = Math.max(2, rect.width);
      const screenRect = screen.getBoundingClientRect();
      if (!state.x) {
        state.x = state.tx = screenRect.width * 0.18;
        state.y = state.ty = screenRect.height * 0.56;
      }
    };

    const findTargets = (screenRect) => {
      const revealReach = state.size * 0.48;
      const findReach = state.size * 0.24;
      let scanned = -1;
      let nearest = Infinity;
      targets.forEach((target, index) => {
        if (foundSet.has(index)) return;
        const dx = state.x - screenRect.width * target.x;
        const dy = state.y - screenRect.height * target.y;
        const distance = Math.hypot(dx, dy);
        if (distance < revealReach && distance < nearest) {
          nearest = distance;
          scanned = index;
        }
        if (distance > findReach) return;
        foundSet.add(index);
        lens.classList.remove('is-hit');
        void lens.offsetWidth;
        lens.classList.add('is-hit');
        onFound?.(index);
        updateProgress();
      });
      if (scanned !== state.scanned) {
        state.scanned = scanned;
        lens.dataset.scanTarget = scanned < 0 ? '' : String(scanned);
        lens.classList.toggle('has-target', scanned >= 0);
        onScan?.(scanned);
      }
    };

    const frame = (now) => {
      if (this._scanner !== state || !screen.isConnected) return;
      const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
      state.last = now;
      const follow = 1 - Math.pow(0.003, dt);
      state.x += (state.tx - state.x) * follow;
      state.y += (state.ty - state.y) * follow;
      lens.style.transform = `translate3d(${state.x - state.size / 2}px, ${state.y - state.size / 2}px, 0)`;
      findTargets(screen.getBoundingClientRect());
      this._scannerRaf = requestAnimationFrame(frame);
    };

    const pointer = (event) => {
      if (this._scanner !== state) return;
      if (event.pointerType === 'touch' && event.buttons === 0 && event.type === 'pointermove') return;
      const rect = screen.getBoundingClientRect();
      state.tx = Math.max(state.size * 0.5, Math.min(rect.width - state.size * 0.5, event.clientX - rect.left));
      state.ty = Math.max(state.size * 0.5, Math.min(rect.height - state.size * 0.5, event.clientY - rect.top));
      lens.classList.add('has-input');
    };

    this._scannerResize = resize;
    this._scannerPointer = pointer;
    window.addEventListener('resize', resize, { passive: true });
    screen.addEventListener('pointerdown', pointer, { passive: true });
    screen.addEventListener('pointermove', pointer, { passive: true });
    resize();
    updateProgress();
    this._scannerRaf = requestAnimationFrame(frame);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._canvas?.remove();
    this._canvas = null;
    this._ripple?.remove();
    this._ripple = null;
    cancelAnimationFrame(this._scannerRaf);
    this._scannerRaf = 0;
    if (this._scannerResize) window.removeEventListener('resize', this._scannerResize);
    if (this._scannerPointer && this._scanner?.screen) {
      this._scanner.screen.removeEventListener('pointerdown', this._scannerPointer);
      this._scanner.screen.removeEventListener('pointermove', this._scannerPointer);
    }
    this._scanner?.screen?.classList.remove('is-scanner-complete');
    this._scanner?.onScan?.(-1);
    this._scanner?.lens?.remove();
    this._scanner = null;
    this._scannerResize = null;
    this._scannerPointer = null;
  }
}
