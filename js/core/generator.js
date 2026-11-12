// Random exercise generator. Deterministic for a given seed.
import { DURATIONS } from './music.js';
import { midiOf } from './pitch.js';
import { fits, fillTable } from './rhythm.js';
import { shownAccidentals } from './accidentals.js';

/** mulberry32: small, fast, good enough for exercises. Returns floats in [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/**
 * @param {object} p
 * @param {Array} p.notes        selected spellings
 * @param {string[]} p.durations selected duration ids
 * @param {object} p.timeSignature
 * @param {boolean} p.allowSyncopation
 * @param {number} p.bars
 * @param {number} p.seed
 * @param {number} [p.keyFifths] key signature (-5…5)
 */
export function generateExercise({ notes, durations, timeSignature: ts, allowSyncopation, bars, seed, keyFifths = 0 }) {
  if (!notes.length) throw new Error('no notes selected');
  const can = fillTable(durations, ts, allowSyncopation);
  if (!can[0]) throw new Error('bar cannot be filled');
  const rng = createRng(seed);
  const durs = durations.map((id) => DURATIONS[id]);
  const distinctPitches = new Set(notes.map(midiOf)).size;

  const measures = [];
  let prevMidi = null;
  for (let m = 0; m < bars; m++) {
    const events = [];
    let pos = 0;
    while (pos < ts.barTicks) {
      const options = durs.filter((d) => fits(pos, d.ticks, ts, allowSyncopation) && can[pos + d.ticks]);
      const d = pick(rng, options);
      const candidates = distinctPitches > 1 ? notes.filter((s) => midiOf(s) !== prevMidi) : notes;
      const s = pick(rng, candidates);
      prevMidi = midiOf(s);
      events.push({ id: `m${m}e${events.length}`, kind: 'note', measure: m, startTick: pos, durationId: d.id, ticks: d.ticks, spelling: s });
      pos += d.ticks;
    }
    shownAccidentals(events.map((e) => e.spelling), keyFifths).forEach((acc, i) => { events[i].shownAccidental = acc; });
    measures.push({ index: m, events });
  }
  return { seed, keyFifths, measures };
}

/** All events in order. */
export const flatEvents = (exercise) => exercise.measures.flatMap((m) => m.events);
