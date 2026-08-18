/**
 * Full-screen overlays: title, stage brief, results, fact book, pause.
 *
 * The FACT BOOK is not decoration — it is the reference layer. It carries every
 * method from the notes including the four that are not yet playable stations
 * (boiling, waxing, smoking, canning), plus the spoilage and importance
 * sections, so the game covers Unit 8 as a whole even though only six methods
 * are hands-on.
 */
import { t, tList, methodName, mechShort, methodMechShort, foodName, AVAILABLE_LANGS, getLang, setLang } from '../content/i18n.js';
import { METHODS, FOODS, SCORING } from '../content/curriculum.js';
import { sfx, audio } from '../core/Audio.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Screens {
  constructor(root) {
    this.root = root;
    this.el = el('div', 'pp-screens');
    this.el.hidden = true;
    root.appendChild(this.el);
    this._onKey = (e) => { if (e.key === 'Escape' && this._escapable) this._escape?.(); };
    window.addEventListener('keydown', this._onKey);
  }

  _open(html, { escapable = false, onEscape = null, cls = '' } = {}) {
    this.el.hidden = false;
    this.el.className = `pp-screens is-open ${cls}`;
    this.el.innerHTML = html;
    this._escapable = escapable;
    this._escape = onEscape;
    // Focus the first control so keyboard users land somewhere useful.
    requestAnimationFrame(() => this.el.querySelector('button, [tabindex]')?.focus({ preventScroll: true }));
    return this.el;
  }

  close() {
    this.el.hidden = true;
    this.el.className = 'pp-screens';
    this.el.innerHTML = '';
    this._escapable = false;
  }

  get isOpen() { return !this.el.hidden; }

  // ------------------------------------------------------------------ title
  title({ onPlay, onFactBook, hasSave, onContinue }) {
    const langs = AVAILABLE_LANGS.map((l) =>
      `<button class="pp-lang${l === getLang() ? ' is-on' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('');
    const node = this._open(`
      <div class="pp-title">
        <div class="pp-title__logo">
          <span class="pp-title__word1">Preservation</span>
          <span class="pp-title__word2">Panic!</span>
        </div>
        <p class="pp-title__sub">${t('ui.subtitle')}</p>
        <div class="pp-title__actions">
          ${hasSave ? `<button class="pp-btn pp-btn--big" data-act="continue">${t('ui.continue')}</button>` : ''}
          <button class="pp-btn pp-btn--big pp-btn--primary" data-act="play">${t('ui.play')}</button>
          <button class="pp-btn" data-act="fact">📖 ${t('ui.factBook')}</button>
        </div>
        <div class="pp-title__langs">${langs}</div>
        <p class="pp-title__hint">${t('a11y.keyboardHelp')}</p>
      </div>`, { cls: 'is-title' });

    node.querySelector('[data-act="play"]').addEventListener('click', () => { sfx('ui.tap'); onPlay(); });
    node.querySelector('[data-act="fact"]').addEventListener('click', () => { sfx('ui.open'); onFactBook(); });
    node.querySelector('[data-act="continue"]')?.addEventListener('click', () => { sfx('ui.tap'); onContinue(); });
    for (const b of node.querySelectorAll('.pp-lang')) {
      b.addEventListener('click', () => {
        setLang(b.dataset.lang);
        sfx('ui.tap');
        this.title({ onPlay, onFactBook, hasSave, onContinue });
      });
    }
  }

  // ------------------------------------------------------------ stage brief
  stageBrief(stage, unlocked, onStart) {
    const chips = unlocked.map((id) => {
      const m = METHODS[id];
      return `<li style="--c:${hex(m.colour)}">
        <b>${methodName(id)}</b><span>${methodMechShort(id, m.mechanism)}</span></li>`;
    }).join('');
    const node = this._open(`
      <div class="pp-brief">
        <div class="pp-brief__badge">${t('ui.stage')} ${stage.id}</div>
        <h2>${t(`stages.${stage.key}.name`)}</h2>
        <p class="pp-brief__tag">${t(`stages.${stage.key}.tagline`)}</p>
        <p class="pp-brief__body">${t(`stages.${stage.key}.brief`)}</p>
        <ul class="pp-brief__methods">${chips}</ul>
        <button class="pp-btn pp-btn--big pp-btn--primary" data-act="go">${t('ui.play')}</button>
      </div>`, { cls: 'is-brief' });
    node.querySelector('[data-act="go"]').addEventListener('click', () => { sfx('ui.tap'); onStart(); });
  }

  // ---------------------------------------------------------------- results
  results({ stage, score, stars, preserved, target, spoilt, accuracy, bestCombo, learned, passed, onNext, onRetry, onMenu }) {
    const starHtml = [0, 1, 2].map((i) =>
      `<span class="pp-result__star${i < stars ? ' is-on' : ''}" style="--d:${i * 0.18}s">★</span>`).join('');
    const learnedHtml = learned.length
      ? `<div class="pp-result__learned"><h4>${t('ui.learned')}</h4><ul>${
          learned.map((id) => `<li style="--c:${hex(METHODS[id].colour)}"><b>${methodName(id)}</b> → ${methodMechShort(id, METHODS[id].mechanism)}</li>`).join('')
        }</ul></div>` : '';
    const node = this._open(`
      <div class="pp-result ${passed ? 'is-pass' : 'is-fail'}">
        <h2>${passed ? t('ui.stageComplete') : t('ui.stageFailed')}</h2>
        <div class="pp-result__stars">${starHtml}</div>
        <div class="pp-result__grid">
          <div><span>${t('ui.score')}</span><b>${score.toLocaleString()}</b></div>
          <div><span>${t('ui.preserved')}</span><b>${preserved}/${target}</b></div>
          <div><span>${t('ui.spoilt')}</span><b>${spoilt}</b></div>
          <div><span>${t('ui.accuracy')}</span><b>${Math.round(accuracy * 100)}%</b></div>
          <div><span>${t('ui.bestCombo')}</span><b>x${bestCombo.toFixed(bestCombo % 1 ? 2 : 0)}</b></div>
        </div>
        ${learnedHtml}
        <div class="pp-result__actions">
          ${passed ? `<button class="pp-btn pp-btn--big pp-btn--primary" data-act="next">${t('ui.nextStage')}</button>` : ''}
          <button class="pp-btn pp-btn--big" data-act="retry">${t('ui.retry')}</button>
          <button class="pp-btn" data-act="menu">${t('ui.quit')}</button>
        </div>
      </div>`, { cls: 'is-result' });
    node.querySelector('[data-act="next"]')?.addEventListener('click', () => { sfx('ui.tap'); onNext(); });
    node.querySelector('[data-act="retry"]').addEventListener('click', () => { sfx('ui.tap'); onRetry(); });
    node.querySelector('[data-act="menu"]').addEventListener('click', () => { sfx('ui.back'); onMenu(); });
    if (passed) sfx('stage.win'); else sfx('stage.lose');
  }

  // -------------------------------------------------------------- fact book
  factBook(onClose) {
    const methodCard = (m) => {
      const foods = (m.foods || []).map((f) => FOODS[f] ? foodName(f) : t(`foods.${f}`)).join(' · ');
      return `<article class="pp-fact__card${m.playable ? '' : ' is-extra'}" style="--c:${hex(m.colour)}">
        <header><h4>${methodName(m.id)}</h4>
          <span class="pp-fact__mech">${methodMechShort(m.id, m.mechanism)}</span></header>
        <p class="pp-fact__explain">${t(`methods.${m.id}.explain`)}</p>
        <p class="pp-fact__exam">${t(`methods.${m.id}.exam`)}</p>
        ${t(`methods.${m.id}.detail`) !== `methods.${m.id}.detail` ? `<p class="pp-fact__detail">${t(`methods.${m.id}.detail`)}</p>` : ''}
        <p class="pp-fact__foods">${foods}</p>
        <span class="pp-fact__ref">${m.sourceRef}</span>
      </article>`;
    };
    const playable = Object.values(METHODS).filter((m) => m.playable).map(methodCard).join('');
    const extra = Object.values(METHODS).filter((m) => !m.playable).map(methodCard).join('');

    const node = this._open(`
      <div class="pp-fact">
        <header class="pp-fact__top">
          <h2>📖 ${t('ui.factBook')}</h2>
          <button class="pp-icon-btn" data-act="close" aria-label="${t('ui.close')}">✕</button>
        </header>
        <div class="pp-fact__scroll">
          <section class="pp-fact__intro">
            <h3>${t('spoilage.title')}</h3>
            <p>${t('spoilage.what')}</p>
            <p><b>${t('spoilage.why')}</b></p>
            <p>${t('spoilage.grow')}</p>
            <ul class="pp-fact__signs">${tList('spoilage.signs').map((s) => `<li>${s}</li>`).join('')}</ul>
            <table class="pp-fact__senses">
              <tbody>
                ${['sight', 'smell', 'taste', 'touch'].map((k) => `<tr>
                  <th>${k[0].toUpperCase() + k.slice(1)}</th><td>${t(`spoilage.senses.${k}`)}</td></tr>`).join('')}
              </tbody>
            </table>
            <p class="pp-fact__warn">⚠ ${t('spoilage.unsafe')}</p>
          </section>
          <h3 class="pp-fact__h">${t('ui.methodBadges')}</h3>
          <div class="pp-fact__grid">${playable}</div>
          <h3 class="pp-fact__h">${t('ui.factBook')} — +4</h3>
          <div class="pp-fact__grid">${extra}</div>
          <section class="pp-fact__intro">
            <h3>${t('importance.title')}</h3>
            <ol>${tList('importance.items').map((s) => `<li>${s}</li>`).join('')}</ol>
          </section>
        </div>
      </div>`, { escapable: true, onEscape: onClose, cls: 'is-fact' });
    node.querySelector('[data-act="close"]').addEventListener('click', () => { sfx('ui.back'); onClose(); });
  }

  // ------------------------------------------------------------------ pause
  pause({ onResume, onRestart, onMenu, onFactBook, settings, onSetting }) {
    const node = this._open(`
      <div class="pp-pause">
        <h2>${t('ui.pause')}</h2>
        <div class="pp-pause__settings">
          <label><input type="checkbox" data-set="sound" ${settings.sound ? 'checked' : ''}> ${t('ui.sound')}</label>
          <label><input type="checkbox" data-set="music" ${settings.music ? 'checked' : ''}> ${t('ui.music')}</label>
          <label><input type="checkbox" data-set="reducedMotion" ${settings.reducedMotion ? 'checked' : ''}> ${t('ui.reducedMotion')}</label>
        </div>
        <div class="pp-pause__actions">
          <button class="pp-btn pp-btn--big pp-btn--primary" data-act="resume">${t('ui.resume')}</button>
          <button class="pp-btn" data-act="fact">📖 ${t('ui.factBook')}</button>
          <button class="pp-btn" data-act="restart">${t('ui.restart')}</button>
          <button class="pp-btn" data-act="menu">${t('ui.quit')}</button>
        </div>
      </div>`, { escapable: true, onEscape: onResume, cls: 'is-pause' });
    node.querySelector('[data-act="resume"]').addEventListener('click', () => { sfx('ui.tap'); onResume(); });
    node.querySelector('[data-act="restart"]').addEventListener('click', () => { sfx('ui.tap'); onRestart(); });
    node.querySelector('[data-act="menu"]').addEventListener('click', () => { sfx('ui.back'); onMenu(); });
    node.querySelector('[data-act="fact"]').addEventListener('click', () => { sfx('ui.open'); onFactBook(); });
    for (const c of node.querySelectorAll('[data-set]')) {
      c.addEventListener('change', () => onSetting(c.dataset.set, c.checked));
    }
  }

  dispose() { window.removeEventListener('keydown', this._onKey); }
}
