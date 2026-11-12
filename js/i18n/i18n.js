import de from './de.js';
import en from './en.js';

const TABLES = { de, en };
let current = 'de';

export const setLanguage = (lang) => { current = TABLES[lang] ? lang : 'de'; document.documentElement.lang = current; };
export const getLanguage = () => current;

/** Translate key with {placeholders}. Falls back to German, then to fallbackKey, then to the key itself. */
export function t(key, params = {}, fallbackKey = null) {
  const raw = TABLES[current][key] ?? TABLES.de[key];
  if (raw == null && fallbackKey) return t(fallbackKey, params);
  const s = raw ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Applies translations to elements with data-i18n="key" (textContent). */
export function translateDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  // links with a language-specific target (legal pages): data-href-en, German default kept in data-href-de
  for (const el of root.querySelectorAll('[data-href-en]')) {
    el.dataset.hrefDe ||= el.getAttribute('href');
    el.setAttribute('href', current === 'en' ? el.dataset.hrefEn : el.dataset.hrefDe);
  }
}
