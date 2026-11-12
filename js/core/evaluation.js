// Frequency → written pitch, majority rule, spelling of red notes.
import { midiOf, staffPosition, fromStaffPosition, isRareSpelling } from './pitch.js';

/** Nearest semitone (±50 cents) as written MIDI pitch, considering concert A and transposition. */
export function frequencyToWritten(freq, concertA, transpositionSemitones) {
  const exact = 69 + 12 * Math.log2(freq / concertA);
  const sounding = Math.round(exact);
  return { midi: sounding - transpositionSemitones, cents: Math.round((exact - sounding) * 100) };
}

/** Frequency of a written MIDI pitch when played (inverse of the above, used by simulation/tests). */
export const writtenToFrequency = (midi, concertA, transpositionSemitones) =>
  concertA * 2 ** ((midi + transpositionSemitones - 69) / 12);

export const MIN_VOICED_SHARE = 0.5;

/**
 * Majority rule for one note.
 * @param {number} targetMidi
 * @param {Array<{writtenMidi:number|null}>} frames frames inside the evaluation window
 * @returns {{outcome:'correct'|'wrong'|'missed', playedMidi:number|null, voicedShare:number}}
 */
export function evaluateFrames(targetMidi, frames) {
  const voiced = frames.filter((f) => f.writtenMidi != null);
  const voicedShare = frames.length ? voiced.length / frames.length : 0;
  if (!frames.length || voicedShare < MIN_VOICED_SHARE) return { outcome: 'missed', playedMidi: null, voicedShare };
  const counts = new Map();
  for (const f of voiced) counts.set(f.writtenMidi, (counts.get(f.writtenMidi) || 0) + 1);
  let best = null;
  for (const [midi, n] of counts) {
    if (best === null) { best = { midi, n }; continue; }
    const better = n > best.n
      || (n === best.n && midi === targetMidi)
      || (n === best.n && best.midi !== targetMidi && Math.abs(midi - targetMidi) < Math.abs(best.midi - targetMidi));
    if (better) best = { midi, n };
  }
  return { outcome: best.midi === targetMidi ? 'correct' : 'wrong', playedMidi: best.midi, voicedShare };
}

/**
 * Spelling of a played pitch that sits closest to the target on the staff:
 * minimise 10·|Δposition| + |alter| over positions target±2 with alter in [-2, 2]; rare spellings
 * (double accidentals, E♯/B♯/C♭/F♭) only if nothing else fits (e.g. a whole step off gives g, not a𝄫).
 */
export function spellNear(midi, target) {
  const base = staffPosition(target);
  let best = null;
  for (let d = -2; d <= 2; d++) {
    const natural = fromStaffPosition(base + d, 0);
    const alter = midi - midiOf(natural);
    if (alter < -2 || alter > 2) continue;
    const candidate = fromStaffPosition(base + d, alter);
    const score = (isRareSpelling(candidate) ? 100 : 0) + 10 * Math.abs(d) + Math.abs(alter);
    if (!best || score < best.score) best = { score, s: candidate };
  }
  return best ? best.s : null;
}
