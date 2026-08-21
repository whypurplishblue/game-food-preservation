/**
 * The mechanism quiz card — the "Why It Works!" panel from the concept art.
 *
 * Deliberate design choices, all in service of recall rather than scoring:
 *  - The question is asked AFTER the animation, while the image is fresh.
 *  - A wrong answer never creates a dead end: the correct option is highlighted
 *    and the verbatim exam sentence from the notes is shown. Learning mode may
 *    still apply its explicit score penalty through the answer callback.
 *  - The exam sentence is shown on BOTH outcomes. Right answers need the
 *    wording reinforced just as much as wrong ones do.
 */
import { t } from '../content/i18n.js';
import { METHODS } from '../content/curriculum.js';
import { sfx } from '../core/Audio.js';

export class QuizCard {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'pp-quiz';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    root.appendChild(this.el);
  }

  /**
   * @param {object} q from quiz.makeQuestion
   * @param {function} onDone (correct:boolean, msTaken:number) => void
   * @param {object} [hooks]
   * @param {function} [hooks.onAnswer] called immediately after an option is chosen;
   *   returning text displays it in the reveal panel
   */
  ask(q, onDone, { onAnswer } = {}) {
    const m = METHODS[q.methodId];
    const accent = `#${(m?.colour ?? 0x66bb6a).toString(16).padStart(6, '0')}`;
    // The ribbon names what is being asked: "Why it works" for mechanism
    // questions, plain "Quiz time" for recognition ones. A mismatched banner
    // makes the card feel templated.
    const ribbon = (q.type === 'mechanism' || q.type === 'microbe')
      ? t('ui.whyItWorks') : t('ui.quizTitle');
    this.el.style.setProperty('--accent', accent);
    this.el.hidden = false;
    this.el.classList.add('is-in');
    const t0 = performance.now();

    this.el.innerHTML = `
      <div class="pp-quiz__card">
        <div class="pp-quiz__ribbon">${ribbon}</div>
        <p class="pp-quiz__prompt">${q.prompt}</p>
        <div class="pp-quiz__options" role="group"></div>
        <div class="pp-quiz__reveal" hidden>
          <p class="pp-quiz__verdict"></p>
          <p class="pp-quiz__delta" hidden></p>
          <p class="pp-quiz__exam"></p>
          <button class="pp-btn pp-btn--confirm pp-quiz__next" type="button">${t('ui.next')}</button>
        </div>
      </div>`;

    const optWrap = this.el.querySelector('.pp-quiz__options');
    const reveal = this.el.querySelector('.pp-quiz__reveal');
    let answered = false;

    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pp-quiz__opt';
      b.innerHTML = `<span class="pp-quiz__key">${'ABC'[i]}</span><span>${opt.label}</span>`;
      b.addEventListener('click', () => choose(opt, b));
      optWrap.appendChild(b);
    });

    const choose = (opt, btn) => {
      if (answered) return;
      answered = true;
      const ms = performance.now() - t0;
      const correct = !!opt.correct;

      for (const b of optWrap.querySelectorAll('.pp-quiz__opt')) b.disabled = true;
      btn.classList.add(correct ? 'is-right' : 'is-wrong');
      if (!correct) {
        // Always surface the right answer — a wrong guess must still teach.
        const idx = q.options.findIndex((o) => o.correct);
        optWrap.children[idx]?.classList.add('is-right', 'is-revealed');
      }
      sfx(correct ? 'quiz.right' : 'quiz.wrong');

      const feedback = onAnswer?.(correct, ms);
      const delta = reveal.querySelector('.pp-quiz__delta');
      if (feedback) {
        delta.hidden = false;
        delta.textContent = feedback;
        delta.className = `pp-quiz__delta is-${correct ? 'right' : 'wrong'}`;
      }

      reveal.hidden = false;
      reveal.querySelector('.pp-quiz__verdict').textContent = correct ? t('ui.correct') : t('ui.wrong');
      reveal.querySelector('.pp-quiz__verdict').className = `pp-quiz__verdict is-${correct ? 'right' : 'wrong'}`;
      // The verbatim exam sentence from the notes, every single time.
      reveal.querySelector('.pp-quiz__exam').textContent = q.teachback || q.explanation;
      const next = reveal.querySelector('.pp-quiz__next');
      next.focus({ preventScroll: true });
      next.addEventListener('click', () => {
        this.close();
        onDone?.(correct, ms);
      });
    };

    // Keyboard: A/B/C or 1/2/3.
    this._onKey = (e) => {
      if (answered) return;
      const map = { a: 0, b: 1, c: 2, 1: 0, 2: 1, 3: 2 };
      const i = map[e.key.toLowerCase()];
      if (i !== undefined && optWrap.children[i]) {
        e.preventDefault();
        optWrap.children[i].click();
      }
    };
    window.addEventListener('keydown', this._onKey);
    optWrap.firstChild?.focus?.({ preventScroll: true });
  }

  close() {
    window.removeEventListener('keydown', this._onKey);
    this.el.classList.remove('is-in');
    this._clearShock();
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  get isOpen() { return !this.el.hidden; }

  /** Give the quiz card a brief, unmistakable error jolt. */
  shock() {
    if (this.el.hidden) return;
    this._clearShock();
    const onAnimationEnd = (event) => {
      if (event.target === this.el && event.animationName === 'quizshake') this._clearShock();
    };
    this._shockAnimationEnd = onAnimationEnd;
    this.el.addEventListener('animationend', onAnimationEnd);
    this._shockTimer = setTimeout(() => this._clearShock(), 500);
    this.el.classList.remove('is-shock');
    // Force a reflow so consecutive wrong answers can replay the animation.
    void this.el.offsetWidth;
    this.el.classList.add('is-shock');
  }

  _clearShock() {
    this.el.classList.remove('is-shock');
    if (this._shockTimer) clearTimeout(this._shockTimer);
    if (this._shockAnimationEnd) this.el.removeEventListener('animationend', this._shockAnimationEnd);
    this._shockTimer = null;
    this._shockAnimationEnd = null;
  }
}
