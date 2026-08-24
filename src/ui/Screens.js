/**
 * Full-screen overlays: title, stage brief, results, fact book, pause.
 *
 * The FACT BOOK is not decoration — it is the reference layer. It carries every
 * method from the notes including the four that are not yet playable stations
 * (boiling, waxing, smoking, canning), plus the spoilage and importance
 * sections, so the game covers Unit 8 as a whole even though only six methods
 * are hands-on.
 */
import { t, tList, methodName, mechShort, methodMechShort, foodName } from '../content/i18n.js';
import { METHODS, FOODS, SCORING } from '../content/curriculum.js';
import { CREDIT_CATEGORIES } from '../content/credits.js';
import { sfx, audio } from '../core/Audio.js';
import { TitleEffects } from './TitleEffects.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
// Leaderboard names come from other players via the API and are rendered
// through innerHTML — escape before interpolation or a submitted name can
// inject markup/script that runs for everyone who views the board.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Screens {
  constructor(root) {
    this.root = root;
    this.el = el('div', 'pp-screens');
    this.el.hidden = true;
    root.appendChild(this.el);
    this._current = null;
    this._leaderboardState = null;
    this.titleEffects = new TitleEffects();
    this._onKey = (e) => {
      if (e.key === 'Escape' && this._escapable) {
        // Clear the handler before invoking it. A close callback can render a
        // new screen synchronously, and that screen must own the next Escape.
        const escape = this._escape;
        this._escape = null;
        escape?.();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _open(html, { escapable = false, onEscape = null, cls = '' } = {}) {
    this.titleEffects.destroy();
    this.root.classList.toggle('is-title-open', cls.split(/\s+/).includes('is-title'));
    this.el.inert = false;
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
    this.titleEffects.destroy();
    this.root.classList.remove('is-title-open');
    this._leaderboardState && (this._leaderboardState.closed = true);
    this._leaderboardState = null;
    this._current = null;
    this.el.hidden = true;
    this.el.className = 'pp-screens';
    this.el.innerHTML = '';
    this._escapable = false;
    this._escape = null;
  }

  get isOpen() { return !this.el.hidden; }

  /**
   * Rerender the currently supported menu screen after a locale change.
   * Gameplay-adjacent screens deliberately do not register a refresh closure:
   * their labels are owned by the HUD/gameplay layer and they should not be
   * torn down while a player is interacting with them.
   */
  refreshCurrent() {
    if (!this.isOpen) return false;
    this._current?.refresh?.();
    return !!this._current;
  }

  _setCurrent(kind, refresh, focus = null) {
    this._current = { kind, refresh, focus };
  }

  _focusContext() {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    const context = {
      element: active,
      act: active.dataset?.act || null,
      mode: active.dataset?.mode || null,
    };
    return context;
  }

  _restoreFocus(context, fallback = null) {
    const restore = () => {
      if (context?.element?.isConnected && !context.element.disabled) {
        context.element.focus({ preventScroll: true });
        return;
      }
      let target = null;
      if (context?.act) target = this.el.querySelector(`[data-act="${context.act}"]`);
      if (!target && context?.mode) target = this.el.querySelector(`[data-mode="${context.mode}"]`);
      if (!target && fallback) target = this.el.querySelector(fallback);
      target?.focus({ preventScroll: true });
    };
    // The close callbacks render their destination synchronously. Restore
    // immediately for keyboard callers that inspect focus right after
    // Escape/click, then repeat on the next frame for animated transitions.
    restore();
    requestAnimationFrame(restore);
  }

  _closeTo(onClose, focusContext, fallback = '[data-act="play"]') {
    this.close();
    onClose?.();
    this._restoreFocus(focusContext, fallback);
  }

  // ------------------------------------------------------------------ title
  title(opts) {
    const {
      onPlay, onFactBook, onCredits, onLeaderboard,
      scannerTargets = [], scannerFound = [], onScannerTarget = null, onScannerFound = null,
    } = opts || {};
    this._setCurrent('title', () => this.title(opts));
    const node = this._open(`
      <div class="pp-home pp-title">
        <h1 class="pp-home__logo pp-title__logo" aria-label="${t('ui.title')}">
          <span class="pp-title__word1" aria-hidden="true">Preservation</span>
          <span class="pp-title__word2" aria-hidden="true">Panic!</span>
        </h1>
        <p class="pp-home__subtitle pp-title__sub">${t('ui.subtitle')}</p>
        <div class="pp-home__actions pp-title__actions">
          <button class="pp-btn pp-btn--big pp-btn--primary" data-act="play">${t('ui.play')}</button>
        </div>
        <nav class="pp-home__utilities pp-title__utilities" aria-label="${t('ui.menuUtilities', {})}">
          <button class="pp-btn pp-home__utility pp-title__utility" data-act="fact">📖 ${t('ui.factBook')}</button>
          <button class="pp-btn pp-home__utility pp-title__utility" data-act="boards">🏆 ${t('ui.leaderboard')}</button>
          <button class="pp-btn pp-home__utility pp-title__utility" data-act="credits">© ${t('ui.credits')}</button>
        </nav>
        <p class="pp-home__hint pp-title__hint">${t('a11y.menuKeyboardHelp')}</p>
      </div>
      <div class="pp-title-scanner-status" data-el="scanner-status" aria-hidden="true" hidden>
        <strong>${t('ui.microbeScanner')}</strong>
        <span data-el="scanner-progress">${t('ui.microbesFound', { found: 0, total: scannerTargets.length })}</span>
      </div>`, { cls: 'is-title' });

    const play = node.querySelector('[data-act="play"]');
    requestAnimationFrame(() => {
      this.titleEffects.playIntro(node.querySelector('.pp-title__logo'));
      this.titleEffects.mountScanner(node, this.root.querySelector('#scene'), {
        targets: scannerTargets,
        found: typeof scannerFound === 'function' ? scannerFound() : scannerFound,
        status: node.querySelector('[data-el="scanner-status"]'),
        progress: node.querySelector('[data-el="scanner-progress"]'),
        progressText: (found, total) => t('ui.microbesFound', { found, total }),
        completeText: () => t('ui.scannerComplete'),
        onScan: onScannerTarget,
        onFound: onScannerFound,
      });
    });
    play.addEventListener('click', async (event) => {
      if (play.disabled) return;
      play.disabled = true;
      node.inert = true;
      sfx('ui.tap');
      const completed = await this.titleEffects.playRipple(play, event);
      if (completed) onPlay?.();
      else node.inert = false;
    });
    node.querySelector('[data-act="boards"]').addEventListener('click', () => {
      sfx('ui.open');
      // Home's contextual leaderboard starts on Learning. Game can ignore the
      // argument when it already bound the mode in its callback.
      onLeaderboard?.('learning');
    });
    node.querySelector('[data-act="fact"]').addEventListener('click', () => { sfx('ui.open'); onFactBook?.(); });
    node.querySelector('[data-act="credits"]').addEventListener('click', () => { sfx('ui.open'); onCredits?.(); });
    return node;
  }

  // ---------------------------------------------------------- mode selection
  /** Two image-led choices. Each complete card is the control. */
  modeSelect({ onSelect, onBack } = {}) {
    const modeIds = ['learning', 'arcade'];
    const focus = this._focusContext();
    const modeLabel = (mode) => mode === 'learning' ? t('ui.learningMode') : t('ui.arcadeMode');
    const modeDesc = (mode) => mode === 'learning' ? t('ui.learningModeDesc') : t('ui.arcadeModeDesc');
    const modeImage = (mode) => mode === 'learning'
      ? 'assets/ui/mode-learn.webp'
      : 'assets/ui/mode-arcade.webp';
    const modeCard = (mode) => `<button type="button" class="pp-mode-card pp-mode-card--${mode}" data-mode="${mode}">
      <span class="pp-mode-card__art"><img src="${modeImage(mode)}" alt="" draggable="false"></span>
      <span class="pp-mode-card__label">
        <strong>${modeLabel(mode)}</strong>
        <small>${modeDesc(mode)}</small>
      </span>
    </button>`;

    const goBack = () => {
      sfx('ui.back');
      this.close();
      onBack?.();
      this._restoreFocus(focus);
    };

    const render = () => {
      const node = this._open(`
        <button class="pp-btn pp-mode-select__back" data-act="back">← ${t('ui.back')}</button>
        <div class="pp-mode-select">
          <header class="pp-mode-select__header"><h1>${t('ui.modeSelection')}</h1><p>${t('ui.chooseMode')}</p></header>
          <div class="pp-mode-select__cards">${modeIds.map(modeCard).join('')}</div>
          <p class="pp-mode-select__hint">${t('a11y.modeKeyboardHelp')}</p>
        </div>`, { escapable: true, onEscape: goBack, cls: 'is-mode-select' });

      node.querySelector('[data-act="back"]').addEventListener('click', goBack);
      for (const button of node.querySelectorAll('.pp-mode-card[data-mode]')) {
        button.addEventListener('click', () => {
          sfx('ui.tap');
          onSelect?.(button.dataset.mode);
        });
      }
      return node;
    };

    this._setCurrent('mode-select', render, focus);
    return render();
  }

  // ------------------------------------------------------------ stage brief
  stageBrief(stage, unlocked, onStart) {
    // Stage briefs are intentionally not language-refreshable: gameplay owns
    // the transition into the brief and should not lose its pending start.
    this._current = null;
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
  results(opts) {
    const { stage, score, stars, preserved, target, spoilt, accuracy, bestCombo, learned, passed, runScore, isFinalLevel, leaderboardRank, leaderboardRankStatus, onNext, onRetry, onMenu, onOpenSubmit, onViewLeaderboard } = opts;
    this._setCurrent('results', () => this.results(opts));
    const endOfMode = Boolean(passed && isFinalLevel);
    const retryAction = endOfMode ? ''
      : `<button class="pp-btn pp-btn--big" data-act="retry">${t('ui.retry')}</button>`;
    const leaderboardAction = endOfMode ? ''
      : `<button class="pp-btn" data-act="board">🏆 ${t('ui.viewLeaderboard')}</button>`;
    const submitAction = endOfMode
      ? `<button class="pp-btn pp-btn--big pp-btn--primary" data-act="submit-score">${t('ui.submitScore')}</button>`
      : '';
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
          <div><span>${t('ui.runScore')}</span><b>${(runScore || 0).toLocaleString()}</b></div>
          <div><span>${t('ui.preserved')}</span><b>${preserved}/${target}</b></div>
          <div><span>${t('ui.spoilt')}</span><b>${spoilt}</b></div>
          <div><span>${t('ui.accuracy')}</span><b>${Math.round(accuracy * 100)}%</b></div>
          <div><span>${t('ui.bestCombo')}</span><b>x${bestCombo.toFixed(bestCombo % 1 ? 2 : 0)}</b></div>
        </div>
        ${learnedHtml}
        ${this._scoreSubmitHtml({ isFinalLevel, passed, leaderboardRank, leaderboardRankStatus })}
        <div class="pp-result__actions">
          ${passed && !isFinalLevel ? `<button class="pp-btn pp-btn--big pp-btn--primary" data-act="next">${t('ui.nextStage')}</button>` : ''}
          ${submitAction}
          ${retryAction}
          ${leaderboardAction}
          <button class="pp-btn" data-act="menu">${t('ui.quit')}</button>
        </div>
      </div>`, { cls: 'is-result' });
    node.querySelector('[data-act="next"]')?.addEventListener('click', () => { sfx('ui.tap'); onNext(); });
    node.querySelector('[data-act="submit-score"]')?.addEventListener('click', () => { sfx('ui.open'); onOpenSubmit?.(); });
    node.querySelector('[data-act="retry"]')?.addEventListener('click', () => { sfx('ui.tap'); onRetry(); });
    node.querySelector('[data-act="board"]')?.addEventListener('click', () => { sfx('ui.open'); onViewLeaderboard?.(); });
    node.querySelector('[data-act="menu"]').addEventListener('click', () => { sfx('ui.back'); onMenu(); });
    if (passed) sfx('stage.win'); else sfx('stage.lose');
  }

  /** Show the rank preview for a completed run; name entry lives on the board. */
  _scoreSubmitHtml({ isFinalLevel, passed, leaderboardRank, leaderboardRankStatus }) {
    if (passed && isFinalLevel) {
      const rankText = leaderboardRankStatus === 'loading'
        ? t('ui.leaderboardRankLoading')
        : Number.isFinite(Number(leaderboardRank))
          ? t('ui.leaderboardRank', { rank: Number(leaderboardRank) })
          : t('ui.leaderboardRankUnavailable');
      return `<p class="pp-result__rank" data-el="rank" aria-live="polite">${rankText}</p>`;
    }
    if (!isFinalLevel) {
      return `<p class="pp-result__submitHint">${t('ui.finishToSubmit')}</p>`;
    }
    return '';
  }

  // -------------------------------------------------------- learning results
  learningResults(opts) {
    const { stage, score, maxScore, timeBonus, passed, spoilt, breakdown, runScore, isFinalLevel, leaderboardRank, leaderboardRankStatus, onNext, onRetry, onMenu, onOpenSubmit, onViewLeaderboard } = opts;
    this._setCurrent('learning-results', () => this.learningResults(opts));
    const correctnessScore = score - timeBonus;
    const endOfMode = Boolean(passed && isFinalLevel);
    const submitAction = endOfMode
      ? `<button class="pp-btn pp-btn--big pp-btn--primary" data-act="submit-score">${t('ui.submitScore')}</button>`
      : '';
    const retryAction = !passed
      ? `<button class="pp-btn pp-btn--big" data-act="retry">${t('ui.retry')}</button>`
      : '';
    const leaderboardAction = !passed
      ? `<button class="pp-btn" data-act="board">🏆 ${t('ui.viewLeaderboard')}</button>`
      : '';
    const percent = maxScore ? Math.round((correctnessScore / maxScore) * 100) : 0;
    const rows = breakdown.map((b) => {
      const m = METHODS[b.methodId];
      const detail = b.quiz
        ? (b.correct === false ? t('ui.quizPenalty') : t('ui.quizBonus'))
        : (b.firstAttempt ? t('ui.firstAttempt') : t('ui.lateAttempt'));
      const pts = b.base + (b.timeBonus || 0);
      const points = pts < 0 ? `-${Math.abs(pts)}` : `+${pts}`;
      return `<li style="--c:${hex(m.colour)}"><b>${methodName(b.methodId)}</b><span>${detail}</span><b>${points}</b></li>`;
    }).join('');
    const node = this._open(`
      <div class="pp-result ${passed ? 'is-pass' : 'is-fail'}">
        <h2>${passed ? t('ui.stageComplete') : t('ui.stageFailed')}</h2>
        <div class="pp-result__grid">
          <div><span>${t('ui.score')}</span><b>${score.toLocaleString()}</b></div>
          <div><span>${t('ui.runScore')}</span><b>${(runScore || 0).toLocaleString()}</b></div>
          <div><span>${t('ui.accuracy')}</span><b>${percent}%</b></div>
          <div><span>${t('ui.timeBonus')}</span><b>+${timeBonus}</b></div>
          <div><span>${t('ui.spoilt')}</span><b>${spoilt}</b></div>
        </div>
        <div class="pp-result__learned">
          <h4>${t('ui.pointsBreakdown')}</h4>
          <ul class="pp-result__breakdown">${rows}</ul>
        </div>
        ${this._scoreSubmitHtml({ isFinalLevel, passed, leaderboardRank, leaderboardRankStatus })}
        <div class="pp-result__actions">
          ${passed && !isFinalLevel ? `<button class="pp-btn pp-btn--big pp-btn--primary" data-act="next">${t('ui.nextStage')}</button>` : ''}
          ${submitAction}
          ${retryAction}
          ${leaderboardAction}
          <button class="pp-btn" data-act="menu">${t('ui.quit')}</button>
        </div>
      </div>`, { cls: 'is-result' });
    node.querySelector('[data-act="next"]')?.addEventListener('click', () => { sfx('ui.tap'); onNext(); });
    node.querySelector('[data-act="submit-score"]')?.addEventListener('click', () => { sfx('ui.open'); onOpenSubmit?.(); });
    node.querySelector('[data-act="retry"]')?.addEventListener('click', () => { sfx('ui.tap'); onRetry(); });
    node.querySelector('[data-act="board"]')?.addEventListener('click', () => { sfx('ui.open'); onViewLeaderboard?.(); });
    node.querySelector('[data-act="menu"]').addEventListener('click', () => { sfx('ui.back'); onMenu(); });
    if (passed) sfx('stage.win'); else sfx('stage.lose');
  }

  // ----------------------------------------------------------- leaderboard
  /**
   * The two mode boards share one screen, but never share request state. Both
   * requests begin together; switching tabs only reveals cached state and a
   * retry only refetches the tab that failed.
   */
  leaderboard({ initialMode = 'learning', loadMode, onClose, submission = null } = {}) {
    const modes = ['learning', 'arcade'];
    const activeMode = modes.includes(initialMode) ? initialMode : 'learning';
    const focus = this._focusContext();
    const scoreSubmission = submission?.onSubmit ? {
      mode: modes.includes(submission.mode) ? submission.mode : activeMode,
      score: Number.isFinite(Number(submission.score)) ? Number(submission.score) : 0,
      onSubmit: submission.onSubmit,
      submitting: false,
      submitted: false,
      rank: null,
    } : null;
    const state = {
      activeMode,
      loadMode,
      onClose,
      submission: scoreSubmission,
      focus,
      closed: false,
      entries: { learning: null, arcade: null },
      status: { learning: 'loading', arcade: 'loading' },
      request: { learning: 0, arcade: 0 },
    };
    this._leaderboardState = state;
    this._setCurrent('leaderboard', () => this._refreshLeaderboard(state), focus);

    const node = this._open(`
      <div class="pp-fact pp-leaderboard">
        <header class="pp-fact__top pp-leaderboard__header">
          <h2 data-el="title">🏆 ${t('ui.leaderboard')}</h2>
          <button class="pp-icon-btn" data-act="close" aria-label="${t('ui.close')}">✕</button>
        </header>
        <div class="pp-leaderboard__body">
          <div class="pp-leaderboard__tabs" role="tablist" aria-label="${t('ui.leaderboardTabs')}" data-el="tabs">
            ${modes.map((mode) => `<button type="button" class="pp-leaderboard__tab" role="tab" id="leaderboard-tab-${mode}" data-mode="${mode}" aria-controls="leaderboard-panel" aria-selected="${mode === activeMode}" tabindex="${mode === activeMode ? '0' : '-1'}">${this._leaderboardModeLabel(mode)}</button>`).join('')}
          </div>
          <p class="pp-leaderboard__hint">${t('a11y.leaderboardKeyboardHelp')}</p>
          ${scoreSubmission ? `
            <section class="pp-leaderboard__submit" data-el="score-submit">
              <div class="pp-leaderboard__submit-copy">
                <h3 data-el="submit-title">${t('ui.submitScore')}</h3>
                <p data-el="submit-intro">${t('ui.submitScoreIntro')}</p>
                <p class="pp-leaderboard__submit-score"><span data-el="submit-score-label">${t('ui.score')}</span> <b>${scoreSubmission.score.toLocaleString()}</b></p>
              </div>
              <form data-el="score-submit-form">
                <label class="pp-sr" for="pp-score-name" data-el="submit-name-label">${t('ui.yourName')}</label>
                <input id="pp-score-name" type="text" maxlength="20" autocomplete="nickname" required placeholder="${t('ui.yourName')}" aria-label="${t('ui.yourName')}" data-el="submit-name" />
                <button class="pp-btn pp-btn--primary" type="submit" data-el="submit-button">${t('ui.submit')}</button>
                <span class="pp-leaderboard__submit-msg" data-el="submit-msg" aria-live="polite"></span>
              </form>
            </section>` : ''}
          <section class="pp-leaderboard__panel" role="tabpanel" id="leaderboard-panel" aria-labelledby="leaderboard-tab-${activeMode}" tabindex="0" data-el="panel"></section>
        </div>
      </div>`, { escapable: true, onEscape: () => this._finishLeaderboard(state), cls: 'is-fact is-leaderboard' });

    node.querySelector('[data-act="close"]').addEventListener('click', () => { sfx('ui.back'); this._finishLeaderboard(state); });
    const tabs = node.querySelector('[data-el="tabs"]');
    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab || !tabs.contains(tab)) return;
      this._selectLeaderboardTab(state, tab.dataset.mode, true);
    });
    tabs.addEventListener('keydown', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const index = modes.indexOf(tab.dataset.mode);
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % modes.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + modes.length) % modes.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = modes.length - 1;
      if (next == null) return;
      event.preventDefault();
      this._selectLeaderboardTab(state, modes[next], true);
      node.querySelector(`[role="tab"][data-mode="${modes[next]}"]`)?.focus({ preventScroll: true });
    });
    node.querySelector('[data-el="panel"]').addEventListener('click', (event) => {
      const retry = event.target.closest('[data-act="retry"]');
      if (!retry) return;
      sfx('ui.tap');
      this._loadLeaderboardMode(state, retry.dataset.mode, true);
    });
    node.querySelector('[data-el="score-submit-form"]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submissionState = state.submission;
      const input = node.querySelector('[data-el="submit-name"]');
      const button = node.querySelector('[data-el="submit-button"]');
      const msg = node.querySelector('[data-el="submit-msg"]');
      if (!submissionState || submissionState.submitting || submissionState.submitted || !input || !button) return;
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      submissionState.submitting = true;
      input.disabled = true;
      button.disabled = true;
      sfx('ui.tap');
      let result = null;
      try { result = await submissionState.onSubmit(name); } catch { /* callback normalizes network errors */ }
      submissionState.submitting = false;
      if (result?.ok) {
        submissionState.submitted = true;
        submissionState.rank = Number(result.rank);
        if (msg) {
          msg.textContent = Number.isFinite(submissionState.rank)
            ? t('ui.scoreSubmittedRank', { rank: submissionState.rank })
            : t('ui.scoreSubmitted');
        }
        this._loadLeaderboardMode(state, submissionState.mode, true);
      } else {
        input.disabled = false;
        button.disabled = false;
        if (msg) msg.textContent = t('ui.leaderboardError');
      }
    });
    this._renderLeaderboard(state);
    // Start both requests without awaiting either one. Promise.resolve also
    // turns a synchronous loader failure into the tab's own error state.
    for (const mode of modes) this._loadLeaderboardMode(state, mode);
    return node;
  }

  _leaderboardModeLabel(mode) {
    return mode === 'learning' ? t('ui.leaderboardLearning') : t('ui.leaderboardArcade');
  }

  _refreshLeaderboard(state) {
    if (!state || state.closed || this._leaderboardState !== state) return;
    const panel = this.el.querySelector('[data-el="panel"]');
    if (!panel) return;
    const title = this.el.querySelector('[data-el="title"]');
    const tablist = this.el.querySelector('[data-el="tabs"]');
    const hint = this.el.querySelector('.pp-leaderboard__hint');
    if (title) title.textContent = `🏆 ${t('ui.leaderboard')}`;
    this.el.querySelector('[data-act="close"]')?.setAttribute('aria-label', t('ui.close'));
    if (tablist) tablist.setAttribute('aria-label', t('ui.leaderboardTabs'));
    if (hint) hint.textContent = t('a11y.leaderboardKeyboardHelp');
    const submitPanel = this.el.querySelector('[data-el="score-submit"]');
    if (submitPanel && state.submission) {
      submitPanel.querySelector('[data-el="submit-title"]').textContent = t('ui.submitScore');
      submitPanel.querySelector('[data-el="submit-intro"]').textContent = t('ui.submitScoreIntro');
      submitPanel.querySelector('[data-el="submit-score-label"]').textContent = t('ui.score');
      submitPanel.querySelector('[data-el="submit-name-label"]').textContent = t('ui.yourName');
      const input = submitPanel.querySelector('[data-el="submit-name"]');
      input?.setAttribute('placeholder', t('ui.yourName'));
      input?.setAttribute('aria-label', t('ui.yourName'));
      const button = submitPanel.querySelector('[data-el="submit-button"]');
      if (!state.submission.submitted) button.textContent = t('ui.submit');
    }
    for (const tab of tablist?.querySelectorAll('[role="tab"]') || []) tab.textContent = this._leaderboardModeLabel(tab.dataset.mode);
    this._renderLeaderboard(state);
  }

  _renderLeaderboard(state) {
    if (!state || state.closed || this._leaderboardState !== state) return;
    const panel = this.el.querySelector('[data-el="panel"]');
    const tablist = this.el.querySelector('[data-el="tabs"]');
    if (!panel || !tablist) return;
    const active = state.activeMode;
    for (const tab of tablist.querySelectorAll('[role="tab"]')) {
      const selected = tab.dataset.mode === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `leaderboard-tab-${active}`);
    const status = state.status[active];
    panel.setAttribute('aria-busy', String(status === 'loading'));
    if (status === 'loading') {
      panel.innerHTML = `<p class="pp-leaderboard__status" role="status">${t('ui.leaderboardLoading')}</p>`;
      return;
    }
    if (status === 'error') {
      panel.innerHTML = `<div class="pp-leaderboard__status pp-leaderboard__error" role="alert"><p>${t('ui.leaderboardError')}</p><button class="pp-btn" data-act="retry" data-mode="${active}">${t('ui.leaderboardRetry')}</button></div>`;
      return;
    }
    const entries = state.entries[active] || [];
    if (!entries.length) {
      panel.innerHTML = `<p class="pp-leaderboard__status" role="status">${t('ui.leaderboardEmpty')}</p>`;
      return;
    }
    panel.innerHTML = `<ol class="pp-leaderboard__list">${entries.map((entry, index) => {
      const rank = Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : index + 1;
      const score = Number.isFinite(Number(entry?.score)) ? Number(entry.score).toLocaleString() : '0';
      return `<li><span class="pp-leaderboard__rank">${rank}</span><span class="pp-leaderboard__name">${esc(entry?.name ?? '')}</span><b>${score}</b></li>`;
    }).join('')}</ol>`;
  }

  _selectLeaderboardTab(state, mode, focus = false) {
    if (!state || state.closed || !['learning', 'arcade'].includes(mode)) return;
    state.activeMode = mode;
    this._renderLeaderboard(state);
    if (focus) this.el.querySelector(`[role="tab"][data-mode="${mode}"]`)?.focus({ preventScroll: true });
  }

  _loadLeaderboardMode(state, mode, retry = false) {
    if (!state || state.closed || this._leaderboardState !== state) return;
    if (!retry && state.status[mode] !== 'loading') return;
    const request = ++state.request[mode];
    state.status[mode] = 'loading';
    state.entries[mode] = null;
    this._renderLeaderboard(state);
    Promise.resolve().then(() => state.loadMode?.(mode)).then((entries) => {
      if (state.closed || this._leaderboardState !== state || state.request[mode] !== request) return;
      state.entries[mode] = Array.isArray(entries) ? entries : [];
      state.status[mode] = state.entries[mode].length ? 'ready' : 'empty';
      this._renderLeaderboard(state);
    }).catch(() => {
      if (state.closed || this._leaderboardState !== state || state.request[mode] !== request) return;
      state.entries[mode] = null;
      state.status[mode] = 'error';
      this._renderLeaderboard(state);
    });
  }

  _finishLeaderboard(state) {
    if (!state || state.closed || this._leaderboardState !== state) return;
    state.closed = true;
    const { onClose, focus } = state;
    this.close();
    onClose?.();
    this._restoreFocus(focus);
  }

  // -------------------------------------------------------------- fact book
  /**
   * The FLAT Fact Book. Since the 3D book landed (src/ui/factbook/) this is the
   * fallback Game.openFactBook() falls back to when a second WebGL context
   * cannot be created — an old driver, or a browser at its context limit. It
   * covers exactly the same curriculum from exactly the same sources, so the
   * reference layer is never simply missing.
   */
  factBook(onClose) {
    const focus = this._focusContext();
    this._current = null;
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
      </div>`, { escapable: true, onEscape: () => this._closeTo(onClose, focus), cls: 'is-fact' });
    node.querySelector('[data-act="close"]').addEventListener('click', () => {
      sfx('ui.back');
      this._closeTo(onClose, focus);
    });
  }

  // -------------------------------------------------------------- credits
  credits(onClose) {
    const focus = this._focusContext();
    this._setCurrent('credits', () => this.credits(onClose), focus);
    // Sourced from src/content/credits.js — the single place attribution
    // lives. tools/check-credits.mjs keeps the model list honest against what
    // is actually on disk, so this screen never drifts out of date.
    const sections = CREDIT_CATEGORIES
      .filter(({ entries }) => entries.length)
      .map(({ titleKey, entries }) => `
        <section class="pp-credits__section">
          <h3>${t(titleKey)}</h3>
          <ul class="pp-credits__list">${entries.map((c) => `
            <li class="pp-credits__item">
              <b><a href="${c.sourceUrl}" target="_blank" rel="noopener noreferrer">${c.title}</a></b>
              <span>${t('ui.creditsBy', { author: c.author })}</span>
              <a class="pp-credits__license" href="${c.licenseUrl}" target="_blank" rel="noopener noreferrer">${c.license}</a>
            </li>`).join('')}</ul>
        </section>`).join('');
    const node = this._open(`
      <div class="pp-fact pp-credits">
        <header class="pp-fact__top">
          <h2>© ${t('ui.credits')}</h2>
          <button class="pp-icon-btn" data-act="close" aria-label="${t('ui.close')}">✕</button>
        </header>
        <div class="pp-fact__scroll">
          <p class="pp-credits__intro">${t('ui.creditsIntro')}</p>
          ${sections}
        </div>
      </div>`, { escapable: true, onEscape: () => this._closeTo(onClose, focus), cls: 'is-fact is-credits' });
    node.querySelector('[data-act="close"]').addEventListener('click', () => {
      sfx('ui.back');
      this._closeTo(onClose, focus);
    });
  }

  // ------------------------------------------------------------------ pause
  pause({ onResume, onRestart, onMenu, onFactBook, onCredits, settings, onSetting }) {
    this._current = null;
    const node = this._open(`
      <div class="pp-pause">
        <h2>${t('ui.pause')}</h2>
        <div class="pp-pause__settings">
          <label><input type="checkbox" data-set="sound" ${settings.sound ? 'checked' : ''}> ${t('ui.sound')}</label>
          <label class="pp-pause__volume"><span>${t('ui.sfxVolume')}</span><input type="range" min="0" max="1" step="0.05" data-set="sfxVolume" value="${settings.sfxVolume}"></label>
          <label><input type="checkbox" data-set="music" ${settings.music ? 'checked' : ''}> ${t('ui.music')}</label>
          <label class="pp-pause__volume"><span>${t('ui.musicVolume')}</span><input type="range" min="0" max="1" step="0.05" data-set="musicVolume" value="${settings.musicVolume}"></label>
          <label><input type="checkbox" data-set="reducedMotion" ${settings.reducedMotion ? 'checked' : ''}> ${t('ui.reducedMotion')}</label>
        </div>
        <div class="pp-pause__actions">
          <button class="pp-btn pp-btn--big pp-btn--primary" data-act="resume">${t('ui.resume')}</button>
          <button class="pp-btn" data-act="fact">📖 ${t('ui.factBook')}</button>
          <button class="pp-btn" data-act="restart">${t('ui.restart')}</button>
          <button class="pp-btn" data-act="menu">${t('ui.quit')}</button>
        </div>
        <button class="pp-title__credits" data-act="credits">© ${t('ui.credits')}</button>
      </div>`, { escapable: true, onEscape: onResume, cls: 'is-pause' });
    node.querySelector('[data-act="resume"]').addEventListener('click', () => { sfx('ui.tap'); onResume(); });
    node.querySelector('[data-act="restart"]').addEventListener('click', () => { sfx('ui.tap'); onRestart(); });
    node.querySelector('[data-act="menu"]').addEventListener('click', () => { sfx('ui.back'); onMenu(); });
    node.querySelector('[data-act="fact"]').addEventListener('click', () => { sfx('ui.open'); onFactBook(); });
    node.querySelector('[data-act="credits"]').addEventListener('click', () => { sfx('ui.open'); onCredits(); });
    for (const c of node.querySelectorAll('[data-set]')) {
      const isRange = c.type === 'range';
      c.addEventListener(isRange ? 'input' : 'change', () => {
        onSetting(c.dataset.set, isRange ? parseFloat(c.value) : c.checked);
      });
    }
  }

  dispose() { window.removeEventListener('keydown', this._onKey); }
}
