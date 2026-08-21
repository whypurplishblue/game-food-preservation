/**
 * Persistent controls shared by menus, overlays, and the gameplay HUD.
 *
 * The control owns only presentation and keyboard interaction. Game supplies
 * the callbacks so changing language or mute state follows the same persisted
 * settings path as the rest of the application.
 */
import { AVAILABLE_LANGS, getLang, onLangChange, t } from '../content/i18n.js';

const NATIVE_NAMES = {
  en: 'English',
  zh: '中文',
  ms: 'Bahasa Melayu',
};

const fallbackText = (key, fallback) => {
  const value = t(key);
  return value === key ? fallback : value;
};

const make = (tag, className, text = null) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

let menuId = 0;

export class QuickControls {
  constructor(root, { hudSlot = null, onMute = null, onLanguage = null } = {}) {
    this.overlayRoot = root;
    this.hudSlot = hudSlot;
    this.onMute = onMute;
    this.onLanguage = onLanguage;
    this.visible = false;
    this.placement = 'overlay';
    this.languageVisible = true;
    this.muted = false;
    this.language = getLang();
    this._menuId = `pp-language-menu-${++menuId}`;

    this.root = make('div', 'pp-quick is-overlay');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', fallbackText('ui.quickControls', 'Quick controls'));

    this.muteBtn = make('button', 'pp-quick__mute');
    this.muteBtn.type = 'button';
    this.muteBtn.dataset.quick = 'mute';
    this.muteBtn.setAttribute('aria-pressed', 'false');
    // Keep the visible control compact while retaining the full action label
    // in the DOM for assistive technology and existing interaction checks.
    this.muteLabel = make('span', 'pp-quick__label');
    this.muteAssistiveLabel = make('span', 'pp-sr');
    this.muteBtn.append(this.muteLabel, this.muteAssistiveLabel);
    this.muteBtn.addEventListener('click', () => {
      const value = !this.muted;
      // Update immediately for a responsive control. Game persists the value
      // and calls setMuted again through its normal settings path.
      this.setMuted(value);
      this.onMute?.(value);
    });

    this.languageBtn = make('button', 'pp-quick__language');
    this.languageBtn.type = 'button';
    this.languageBtn.dataset.quick = 'language';
    this.languageBtn.setAttribute('aria-haspopup', 'listbox');
    this.languageBtn.setAttribute('aria-expanded', 'false');
    this.languageBtn.setAttribute('aria-controls', this._menuId);
    this.languageBtn.addEventListener('click', () => {
      if (this.menu.hidden) this.openLanguageMenu();
      else this.closeLanguageMenu({ restoreFocus: true });
    });
    this.languageBtn.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.openLanguageMenu(event.key === 'ArrowUp' ? 'last' : 'first');
      } else if (event.key === 'Escape' && !this.menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.closeLanguageMenu({ restoreFocus: true });
      }
    });

    this.menu = make('div', 'pp-language-menu');
    this.menu.id = this._menuId;
    this.menu.hidden = true;
    this.menu.setAttribute('role', 'listbox');
    this.menu.setAttribute('tabindex', '-1');
    this.menu.setAttribute('aria-label', fallbackText('ui.languageMenu', 'Language'));
    this.menuHint = make('p', 'pp-sr', fallbackText(
      'a11y.languageKeyboardHelp',
      'Use arrow keys to choose a language. Press Enter to apply or Escape to close.',
    ));
    this.menuHint.id = `${this._menuId}-hint`;
    this.menu.setAttribute('aria-describedby', this.menuHint.id);
    this.menu.addEventListener('keydown', (event) => this._onMenuKeyDown(event));

    this.languageOptions = new Map();
    for (const code of AVAILABLE_LANGS) {
      const option = make('button', 'pp-language-menu__option', NATIVE_NAMES[code] || code);
      option.type = 'button';
      option.dataset.lang = code;
      option.setAttribute('role', 'option');
      option.setAttribute('lang', code);
      option.setAttribute('aria-selected', 'false');
      option.tabIndex = -1;
      option.addEventListener('click', () => this._chooseLanguage(code));
      this.menu.appendChild(option);
      this.languageOptions.set(code, option);
    }

    this.root.append(this.muteBtn, this.languageBtn, this.menu, this.menuHint);
    this.overlayRoot.appendChild(this.root);

    this._onOutsidePointer = (event) => {
      if (!this.menu.hidden && !this.root.contains(event.target)) {
        this.closeLanguageMenu();
      }
    };
    document.addEventListener('pointerdown', this._onOutsidePointer, true);
    this._onResize = () => this._syncVisibility();
    window.addEventListener('resize', this._onResize);
    this._unsubLang = onLangChange((code) => this.setLanguage(code));

    this.setLanguage(this.language);
    this.setMuted(false);
    this._syncVisibility();
  }

  setCallbacks({ onMute = this.onMute, onLanguage = this.onLanguage } = {}) {
    this.onMute = onMute;
    this.onLanguage = onLanguage;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.muteBtn.setAttribute('aria-pressed', String(this.muted));
    const label = this.muted
      ? fallbackText('ui.unmute', 'Unmute')
      : fallbackText('ui.mute', 'Mute');
    const compactLabel = fallbackText('ui.audio', 'Audio');
    this.muteLabel.textContent = `${this.muted ? '🔇' : '🔊'} ${compactLabel}`;
    this.muteAssistiveLabel.textContent = label;
    this.muteBtn.setAttribute('aria-label', label);
    this.muteBtn.title = label;
  }

  setLanguage(code) {
    if (!AVAILABLE_LANGS.includes(code)) return;
    this.language = code;
    // Language changes must refresh every localized quick-control label, not
    // only the language trigger.  In particular, a mute button whose boolean
    // state did not change would otherwise keep the previous locale's text.
    this.setMuted(this.muted);
    const label = fallbackText('ui.language', 'Language');
    const trigger = fallbackText('ui.languageMenuLabel', `${label} · {code}`)
      .replace('{code}', code.toUpperCase());
    this.languageBtn.textContent = `🌐 ${code.toUpperCase()} ▾`;
    this.languageBtn.setAttribute('aria-label', trigger);
    this.languageBtn.title = trigger;
    for (const [optionCode, option] of this.languageOptions) {
      const selected = optionCode === code;
      option.setAttribute('aria-selected', String(selected));
      option.classList.toggle('is-selected', selected);
    }
    this.menu.setAttribute('aria-label', fallbackText('ui.languageMenu', label));
    this.menuHint.textContent = fallbackText(
      'a11y.languageKeyboardHelp',
      'Use arrow keys to choose a language. Press Enter to apply or Escape to close.',
    );
  }

  /**
   * Move the same control between the safe overlay position and the HUD slot.
   * Language is deliberately hidden during gameplay, but the mute control
   * remains available in both placements.
   */
  setContext({ placement = 'overlay', languageVisible = true } = {}) {
    this.placement = placement === 'hud' ? 'hud' : 'overlay';
    this.languageVisible = Boolean(languageVisible);
    this.root.classList.toggle('is-overlay', this.placement === 'overlay');
    this.root.classList.toggle('is-hud', this.placement === 'hud');
    this.languageBtn.hidden = !this.languageVisible;
    this.languageBtn.setAttribute('aria-hidden', String(!this.languageVisible));
    if (!this.languageVisible) this.closeLanguageMenu();

    const parent = this.placement === 'hud' && this.hudSlot
      ? this.hudSlot
      : this.overlayRoot;
    if (this.root.parentElement !== parent) parent.appendChild(this.root);
    this._syncTabIndices();
    this._syncVisibility();
  }

  setVisible(value) {
    this.visible = Boolean(value);
    if (!this.visible) this.closeLanguageMenu();
    this._syncTabIndices();
    this._syncVisibility();
  }

  focusLanguageTrigger() {
    if (!this.languageBtn.hidden && !this.root.hidden) {
      this.languageBtn.focus({ preventScroll: true });
    }
  }

  _rotateBlocked() {
    const blocker = document.getElementById('rotate');
    if (!blocker) return false;
    // jsdom has no layout, so an unstyled blocker should not hide controls.
    try { return getComputedStyle(blocker).display !== 'none'; } catch { return false; }
  }

  _syncVisibility() {
    this.root.hidden = !this.visible || this._rotateBlocked();
    this._syncTabIndices();
  }

  _syncTabIndices() {
    const enabled = this.visible && !this._rotateBlocked();
    this.muteBtn.tabIndex = enabled ? 0 : -1;
    this.languageBtn.tabIndex = enabled && this.languageVisible ? 0 : -1;
    for (const option of this.languageOptions.values()) option.tabIndex = -1;
  }

  openLanguageMenu(focus = 'selected') {
    if (!this.languageVisible || !this.visible || this._rotateBlocked()) return;
    this.menu.hidden = false;
    this.languageBtn.setAttribute('aria-expanded', 'true');
    const options = [...this.languageOptions.values()];
    const target = focus === 'last'
      ? options[options.length - 1]
      : focus === 'first'
        ? options[0]
        : this.languageOptions.get(this.language) || options[0];
    options.forEach((option) => { option.tabIndex = option === target ? 0 : -1; });
    target?.focus({ preventScroll: true });
  }

  closeLanguageMenu({ restoreFocus = false } = {}) {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.languageBtn.setAttribute('aria-expanded', 'false');
    for (const option of this.languageOptions.values()) option.tabIndex = -1;
    if (restoreFocus && !this.languageBtn.hidden && !this.root.hidden) {
      this.languageBtn.focus({ preventScroll: true });
    }
  }

  _onMenuKeyDown(event) {
    const options = [...this.languageOptions.values()];
    const current = options.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeLanguageMenu({ restoreFocus: true });
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (current < 0 ? 0 : (current + delta + options.length) % options.length);
      options.forEach((option, index) => { option.tabIndex = index === next ? 0 : -1; });
      options[next]?.focus({ preventScroll: true });
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault();
      this._chooseLanguage(options[current].dataset.lang);
    }
  }

  _chooseLanguage(code) {
    if (!AVAILABLE_LANGS.includes(code)) return;
    this.setLanguage(code);
    this.closeLanguageMenu({ restoreFocus: true });
    this.onLanguage?.(code);
  }

  dispose() {
    this._unsubLang?.();
    document.removeEventListener('pointerdown', this._onOutsidePointer, true);
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }
}
