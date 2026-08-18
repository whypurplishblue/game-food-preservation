/**
 * i18n — dotted-key lookup with automatic fallback to English.
 *
 * Design contract: gameplay code NEVER contains a display string. It calls
 * t('methods.drying.exam'). A locale file may be partial; any missing key
 * silently falls back to en.json, so a half-translated Malay file still ships.
 */
import en from './locales/en.json';
import zh from './locales/zh.json';
import ms from './locales/ms.json';

const BUNDLES = { en, zh, ms };
export const AVAILABLE_LANGS = Object.keys(BUNDLES);

let current = 'en';
const listeners = new Set();

function dig(obj, path) {
  let node = obj;
  for (const part of path) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/**
 * @param {string} key   dotted path, e.g. 'methods.drying.exam'
 * @param {object} [vars] {method:'Drying'} replaces {method} in the result
 */
export function t(key, vars) {
  const path = key.split('.');
  let val = dig(BUNDLES[current], path);
  if (val === undefined && current !== 'en') val = dig(en, path);
  if (val === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (typeof val === 'string' && vars) {
    return val.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
  }
  return val;
}

/** Array-returning variant, for lists like spoilage.signs */
export function tList(key) {
  const v = t(key);
  return Array.isArray(v) ? v : [];
}

export function setLang(lang) {
  if (!BUNDLES[lang]) return false;
  current = lang;
  try { localStorage.setItem('pp.lang', lang); } catch { /* private mode */ }
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
  return true;
}

export function getLang() { return current; }
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem('pp.lang'); } catch { /* ignore */ }
  const nav = (navigator.language || 'en').toLowerCase();
  const guess = saved || (nav.startsWith('zh') ? 'zh' : nav.startsWith('ms') ? 'ms' : 'en');
  setLang(BUNDLES[guess] ? guess : 'en');
}

// -- convenience accessors used all over the game ---------------------------
export const methodName = (id) => t(`methods.${id}.name`);
export const methodExam = (id) => t(`methods.${id}.exam`);
export const methodExplain = (id) => t(`methods.${id}.explain`);
export const methodHint = (id) => t(`methods.${id}.hint`);
export const methodInstruction = (id) => t(`methods.${id}.instruction`);
export const methodClue = (id) => t(`methods.${id}.recallClue`);
export const foodName = (id) => t(`foods.${id}`);
export const mechShort = (id) => t(`mechanisms.${id}.short`);
/**
 * The label to show for a METHOD's mechanism. Prefers the method's own wording
 * (§5F "removes moisture" for salting, §5I "heat, then cool quickly") and falls
 * back to the shared mechanism label.
 */
export function methodMechShort(methodId, mechanismId) {
  const key = `methods.${methodId}.mechanismShort`;
  const own = t(key);
  return own === key ? mechShort(mechanismId) : own;
}
export const mechLong = (id) => t(`mechanisms.${id}.long`);
