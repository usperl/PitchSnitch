// Note names in German and English. Each name has two forms,
// e.g. German "b'" / "b¹", English "Bb4" / "B♭4"; identical forms are shown once.

const DE_BASE = { C: 'c', D: 'd', E: 'e', F: 'f', G: 'g', A: 'a', B: 'h' };
const DE_FLAT = { C: 'ces', D: 'des', E: 'es', F: 'fes', G: 'ges', A: 'as', B: 'b' };
const DE_DFLAT = { C: 'ceses', D: 'deses', E: 'eses', F: 'feses', G: 'geses', A: 'ases', B: 'heses' };
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function germanStem(s) {
  switch (s.alter) {
    case -2: return DE_DFLAT[s.step];
    case -1: return DE_FLAT[s.step];
    case 0: return DE_BASE[s.step];
    case 1: return DE_BASE[s.step] + 'is';
    case 2: return DE_BASE[s.step] + 'isis';
    default: throw new Error(`invalid alter ${s.alter}`);
  }
}

const capitalize = (w) => w[0].toUpperCase() + w.slice(1);

/** German Helmholtz names: { a: "b'", b: "b¹" } */
export function germanForms(s) {
  const stem = germanStem(s);
  const o = s.octave;
  if (o >= 4) {
    const n = o - 3;
    return { a: stem + "'".repeat(n), b: stem + SUPERSCRIPT[n] };
  }
  if (o === 3) return { a: stem, b: stem };
  if (o === 2) return { a: capitalize(stem), b: capitalize(stem) };
  const sub = o === 1 ? '₁' : o === 0 ? '₂' : '₃';
  return { a: capitalize(stem) + sub, b: capitalize(stem) + sub };
}

const EN_ASCII = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
const EN_UNICODE = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

/** English scientific names: { a: "Bb4", b: "B♭4" } */
export function englishForms(s) {
  return { a: `${s.step}${EN_ASCII[s.alter]}${s.octave}`, b: `${s.step}${EN_UNICODE[s.alter]}${s.octave}` };
}

export function noteForms(s, language) {
  return language === 'en' ? englishForms(s) : germanForms(s);
}

/** Full label, e.g. "b' / b¹" or "E4". */
export function noteLabel(s, language) {
  const { a, b } = noteForms(s, language);
  return a === b ? a : `${a} / ${b}`;
}

/** Short label for compact UI (grid cells): the first form. */
export const noteShort = (s, language) => noteForms(s, language).a;
