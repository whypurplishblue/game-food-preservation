/**
 * The heads-up display.
 *
 * The one piece of the HUD that matters educationally is the MEMORY PANEL —
 * the method→mechanism list on the left. It is fully visible in Stage 1, fades
 * to method names only in Stage 2, collapses to a tap-to-peek button in Stage 3,
 * and is gone from Stage 4 on. That fade is the scaffolding-removal curve the
 * brief asks for, expressed as one piece of UI rather than scattered flags.
 */
import { t, methodName, mechShort, methodMechShort, onLangChange } from '../content/i18n.js';
import { METHODS } from '../content/curriculum.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class HUD {
  constructor(root) {
    this.root = el('div', 'pp-hud');
    root.appendChild(this.root);
    this._build();
    this._unsub = onLangChange(() => this.refreshStatic());
    this.peekOpen = false;
  }

  _build() {
    // ---------------------------------------------------------- top bar
    const top = el('div', 'pp-hud__top');
    this.root.appendChild(top);

    const left = el('div', 'pp-hud__cluster');
    this.scoreEl = el('div', 'pp-chip pp-chip--score',
      `<span class="pp-chip__icon">★</span><b>0</b>`);
    this.stageEl = el('div', 'pp-chip pp-chip--stage', `<span></span><b></b>`);
    left.append(this.stageEl, this.scoreEl);

    const mid = el('div', 'pp-hud__cluster pp-hud__cluster--mid');
    this.comboEl = el('div', 'pp-combo',
      `<span class="pp-combo__label">${t('ui.combo')}</span>
       <span class="pp-combo__x">x1</span>
       <span class="pp-combo__bar"><i></i></span>`);
    mid.append(this.comboEl);

    const right = el('div', 'pp-hud__cluster pp-hud__cluster--right');
    this.goalEl = el('div', 'pp-chip pp-chip--goal', `<span class="pp-chip__icon">✔</span><b>0/0</b>`);
    this.starsEl = el('div', 'pp-stars', '<i></i><i></i><i></i>');
    this.factBtn = el('button', 'pp-icon-btn', '📖');
    this.factBtn.title = t('ui.factBook');
    this.factBtn.setAttribute('aria-label', t('ui.factBook'));
    // QuickControls moves its mute control into this slot while gameplay is
    // active. Keeping the slot immediately before Pause makes the control
    // discoverable without changing the HUD's score/status layout.
    this.quickSlot = el('div', 'pp-hud__quick-slot');
    this.pauseBtn = el('button', 'pp-icon-btn', '⏸');
    this.pauseBtn.title = t('ui.pause');
    this.pauseBtn.setAttribute('aria-label', t('ui.pause'));
    right.append(this.goalEl, this.starsEl, this.factBtn, this.quickSlot, this.pauseBtn);

    top.append(left, mid, right);

    // ------------------------------------------------- memory panel (left)
    this.memory = el('aside', 'pp-memory');
    this.memory.innerHTML = `<h3>${t('ui.preservationMemory')}</h3><ul></ul>`;
    this.root.appendChild(this.memory);

    this.peekBtn = el('button', 'pp-peek', `💡 ${t('ui.preservationMemory')}`);
    this.peekBtn.hidden = true;
    this.peekBtn.addEventListener('click', () => {
      this.peekOpen = !this.peekOpen;
      this.memory.classList.toggle('is-peeking', this.peekOpen);
      // Peeking is allowed but it costs the combo — recall should be cheaper
      // than looking it up, which is what pushes the child toward memory.
      if (this.peekOpen) this.onPeek?.();
    });
    this.root.appendChild(this.peekBtn);

    // ------------------------------------------ microbe meter (right side)
    this.microbe = el('aside', 'pp-microbe');
    this.microbe.innerHTML = `
      <h3>${t('ui.microbeMeter')}</h3>
      <div class="pp-microbe__bar"><i></i></div>
      <div class="pp-microbe__state"></div>
      <p class="pp-microbe__hint">${t('ui.microbeMeterHint')}</p>`;
    this.root.appendChild(this.microbe);

    // ------------------------------------------------------- banner + a11y
    this.banner = el('div', 'pp-banner');
    this.root.appendChild(this.banner);

    this.live = el('div', 'pp-sr');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'status');
    this.root.appendChild(this.live);

    this.refreshStatic();
  }

  refreshStatic() {
    const ul = this.memory.querySelector('ul');
    ul.innerHTML = '';
    for (const m of Object.values(METHODS)) {
      if (!m.playable) continue;
      const li = el('li');
      li.dataset.method = m.id;
      li.style.setProperty('--c', `#${m.colour.toString(16).padStart(6, '0')}`);
      li.innerHTML = `<span class="pp-memory__dot"></span>
        <span class="pp-memory__name">${methodName(m.id)}</span>
        <span class="pp-memory__arrow">→</span>
        <span class="pp-memory__mech">${methodMechShort(m.id, m.mechanism)}</span>`;
      ul.appendChild(li);
    }
    this.memory.querySelector('h3').textContent = t('ui.preservationMemory');
    this.microbe.querySelector('h3').textContent = t('ui.microbeMeter');
    this.microbe.querySelector('.pp-microbe__hint').textContent = t('ui.microbeMeterHint');
    this.peekBtn.innerHTML = `💡 ${t('ui.preservationMemory')}`;
    this.comboEl.querySelector('.pp-combo__label').textContent = t('ui.combo');
    this.factBtn.title = t('ui.factBook');
    this.factBtn.setAttribute('aria-label', t('ui.factBook'));
    this.pauseBtn.title = t('ui.pause');
    this.pauseBtn.setAttribute('aria-label', t('ui.pause'));
  }

  /**
   * Called on stage change — this is the hint-removal curve.
   * @param {string} [gameMode] 'arcade' (default, id-driven fade curve below)
   *   or 'learning', which keeps the memory panel fully open throughout since
   *   labels/hints never turn off in that mode.
   */
  applyStage(stage, unlockedMethods, gameMode = 'arcade') {
    this.stageEl.querySelector('span').textContent = t('ui.stage');
    this.stageEl.querySelector('b').textContent = `${stage.id} · ${t(`stages.${stage.key}.name`)}`;

    // Grey out methods this stage has not unlocked yet.
    for (const li of this.memory.querySelectorAll('li')) {
      li.classList.toggle('is-locked', !unlockedMethods.includes(li.dataset.method));
    }

    const mode = gameMode === 'learning'
      ? 'full'
      : stage.id === 1 ? 'full' : stage.id === 2 ? 'names' : stage.id === 3 ? 'peek' : 'off';
    this.memory.classList.remove('is-full', 'is-names', 'is-peek', 'is-off', 'is-peeking');
    this.memory.classList.add(`is-${mode}`);
    this.peekBtn.hidden = mode !== 'peek';
    this.peekOpen = false;
  }

  /** Learning mode has no combo/stars — hide that chrome rather than rebuild the HUD. */
  setArcadeUIVisible(v) {
    this.comboEl.hidden = !v;
    this.starsEl.hidden = !v;
  }

  setScore(v) { this.scoreEl.querySelector('b').textContent = v.toLocaleString(); }

  setCombo(mult, fill) {
    this.comboEl.querySelector('.pp-combo__x').textContent = `x${mult.toFixed(mult % 1 ? 2 : 0)}`;
    this.comboEl.querySelector('.pp-combo__bar i').style.transform = `scaleX(${fill})`;
    this.comboEl.classList.toggle('is-hot', mult >= 3);
  }

  setGoal(done, target) {
    this.goalEl.querySelector('b').textContent = `${done}/${target}`;
    this.goalEl.classList.toggle('is-close', target > 0 && done / target > 0.75);
  }

  setStars(n) {
    this.starsEl.querySelectorAll('i').forEach((s, i) => s.classList.toggle('is-on', i < n));
  }

  /** @param {number} v 0..1 average microorganism activity across active food */
  setMicrobe(v) {
    const bar = this.microbe.querySelector('.pp-microbe__bar i');
    bar.style.transform = `scaleX(${Math.max(0.02, v)})`;
    const key = v > 0.66 ? 'strong' : v > 0.33 ? 'weakening' : v > 0.08 ? 'weak' : 'safe';
    bar.dataset.level = key;
    this.microbe.querySelector('.pp-microbe__state').textContent = t(`microbes.${key}`);
    this.microbe.dataset.level = key;
  }

  /** Big transient message across the middle of the screen. */
  flash(text, { kind = 'good', ms = 1100 } = {}) {
    this.banner.textContent = text;
    this.banner.className = `pp-banner is-visible is-${kind}`;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { this.banner.className = 'pp-banner'; }, ms);
  }

  say(text) { this.live.textContent = text; }

  /**
   * The fact book lists every method -> mechanism pair and every food list, so
   * from the recall stages onward it has to be closed during play — otherwise
   * one tap bypasses the entire hint-removal curve.
   */
  setFactBookAvailable(v) {
    this.factBtn.classList.toggle('is-locked', !v);
    this.factBtn.setAttribute('aria-disabled', String(!v));
    this.factBtn.title = v ? t('ui.factBook') : t('ui.factBookLocked');
  }

  setVisible(v) {
    this.root.classList.toggle('is-hidden', !v);
    this.root.inert = !v;
    for (const button of this.root.querySelectorAll('button')) button.tabIndex = v ? 0 : -1;
    if (v) this.root.removeAttribute('aria-hidden');
    else this.root.setAttribute('aria-hidden', 'true');
  }
}
