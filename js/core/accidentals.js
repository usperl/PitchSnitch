// Accidental rule: at the start of each bar every step letter carries the key
// signature's alteration (all octaves). Accidentals hold until the end of the bar for the same
// staff position (same line, same octave).
import { staffPosition } from './pitch.js';
import { keyAlters } from './keys.js';

/**
 * Value shown in front of each note of one bar: -2..2 for 𝄫 ♭ ♯ 𝄪, 'natural' for ♮, null for nothing.
 * @param {Array} spellings notes of one bar in order
 * @param {number} keyFifths key signature (-5…5), default C major
 */
export function shownAccidentals(spellings, keyFifths = 0) {
  const key = keyAlters(keyFifths);
  const state = new Map();
  return spellings.map((s) => {
    const pos = staffPosition(s);
    const current = state.has(pos) ? state.get(pos) : key[s.step];
    state.set(pos, s.alter);
    if (current === s.alter) return null;
    return s.alter === 0 ? 'natural' : s.alter;
  });
}

/** Alteration in force at a staff position after the first `count` notes of a bar. */
export function alterInForce(spellings, count, pos, step, keyFifths = 0) {
  let alter = keyAlters(keyFifths)[step];
  for (let i = 0; i < count; i++) if (staffPosition(spellings[i]) === pos) alter = spellings[i].alter;
  return alter;
}

/**
 * Accidental for a red (played) note: always explicit. A natural note gets ♮ only if another
 * alteration (key signature or accidental) is in force at its position at that point of the bar.
 */
export function resultAccidental(played, barSpellings, indexInBar, keyFifths = 0) {
  if (played.alter !== 0) return played.alter;
  return alterInForce(barSpellings, indexInBar + 1, staffPosition(played), played.step, keyFifths) !== 0 ? 'natural' : null;
}

/** Accidental of a single note relative to the key only (mini staff without bars). */
export function accidentalAgainstKey(s, keyFifths = 0) {
  const k = keyAlters(keyFifths)[s.step];
  if (k === s.alter) return null;
  return s.alter === 0 ? 'natural' : s.alter;
}
