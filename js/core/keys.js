// Key signatures (written) and scales. A key is stored as "fifths": -5 (5 flats) … +5 (5 sharps).
import { STEPS, spelling, midiOf, transposeSpelling } from './pitch.js';
import { germanForms, englishForms } from './names.js';

export const KEY_FIFTHS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
export const MAX_KEY_ACCIDENTALS = 5;

const LETTER_FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/** Alteration per step letter under a key signature, e.g. fifths -1 → { B: -1, others 0 }. */
export function keyAlters(fifths) {
  const alters = Object.fromEntries(STEPS.map((s) => [s, 0]));
  if (fifths > 0) for (const s of SHARP_ORDER.slice(0, fifths)) alters[s] = 1;
  if (fifths < 0) for (const s of [...SHARP_ORDER].reverse().slice(0, -fifths)) alters[s] = -1;
  return alters;
}

/** Major tonic (step + alter) of a key, valid for -7 … +7. */
export function majorTonic(fifths) {
  const alter = Math.floor((fifths + 1) / 7);
  const letterFifths = fifths - 7 * alter;
  const step = Object.keys(LETTER_FIFTHS).find((k) => LETTER_FIFTHS[k] === letterFifths);
  return { step, alter };
}

/** Relative minor tonic: a minor third below the major tonic (same key signature). */
export function minorTonic(fifths) {
  const t = majorTonic(fifths);
  const m = transposeSpelling(spelling(t.step, t.alter, 4), -2, -3);
  return { step: m.step, alter: m.alter };
}

export const fifthsOfMajorTonic = (step, alter) => LETTER_FIFTHS[step] + 7 * alter;

/**
 * Transposes a key by an interval (steps, semitones), e.g. when the notation changes.
 * Out of ±5: enharmonic key (±12 fifths) if that fits, otherwise C major (0).
 */
export function transposeKey(fifths, steps, semitones) {
  const t = majorTonic(fifths);
  const moved = transposeSpelling(spelling(t.step, t.alter, 4), steps, semitones);
  let f = moved ? fifthsOfMajorTonic(moved.step, moved.alter) : 99;
  if (Math.abs(f) > MAX_KEY_ACCIDENTALS) f += f > 0 ? -12 : 12;
  return Math.abs(f) <= MAX_KEY_ACCIDENTALS ? f : 0;
}

/** Semitone patterns per scale degree. Minor scales refer to the relative minor of the key. */
export const SCALES = {
  major: { minor: false, pattern: [0, 2, 4, 5, 7, 9, 11] },
  minorNatural: { minor: true, pattern: [0, 2, 3, 5, 7, 8, 10] },
  minorHarmonic: { minor: true, pattern: [0, 2, 3, 5, 7, 8, 11] },
  minorMelodic: { minor: true, pattern: [0, 2, 3, 5, 7, 9, 11] }, // ascending form
};
export const SCALE_IDS = Object.keys(SCALES);

/** All spellings of a scale over octaves 0–8, spelled diatonically from the tonic. */
export function scaleSpellings(fifths, scaleId) {
  const { minor, pattern } = SCALES[scaleId];
  const tonic = minor ? minorTonic(fifths) : majorTonic(fifths);
  const out = [];
  for (let octave = 0; octave <= 8; octave++) {
    const root = spelling(tonic.step, tonic.alter, octave);
    for (let degree = 0; degree < 7; degree++) {
      const s = transposeSpelling(root, degree, pattern[degree]);
      if (s) out.push(s);
    }
  }
  return out.sort((a, b) => midiOf(a) - midiOf(b));
}

const SYMBOL = { '-1': '♭', 1: '♯' };

/** Sounding key of a written key for a transposition (written → sounding interval); up to ±7, else enharmonic. */
export function soundingFifths(fifths, steps, semitones) {
  const t = majorTonic(fifths);
  const moved = transposeSpelling(spelling(t.step, t.alter, 4), steps, semitones);
  let f = moved ? fifthsOfMajorTonic(moved.step, moved.alter) : 0;
  if (Math.abs(f) > 7) f += f > 0 ? -12 : 12;
  return f;
}

/** UI label, e.g. "F-Dur / d-Moll (1♭)" or "F major / D minor (1♭)"; withCount=false omits "(1♭)". */
export function keyLabel(fifths, language, withCount = true) {
  const maj = majorTonic(fifths), min = minorTonic(fifths);
  const count = fifths === 0 || !withCount ? '' : ` (${Math.abs(fifths)}${SYMBOL[Math.sign(fifths)]})`;
  if (language === 'en') {
    const name = (t) => englishForms(spelling(t.step, t.alter, 4)).b.replace(/\d+$/, '');
    return `${name(maj)} major / ${name(min)} minor${count}`;
  }
  return `${germanForms(spelling(maj.step, maj.alter, 2)).a}-Dur / ${germanForms(spelling(min.step, min.alter, 3)).a}-Moll${count}`;
}

/** Major key name for VexFlow's addKeySignature, e.g. "Bb", "F#". */
export function vexflowKey(fifths) {
  const t = majorTonic(fifths);
  return t.step + (t.alter === 1 ? '#' : t.alter === -1 ? 'b' : '');
}
