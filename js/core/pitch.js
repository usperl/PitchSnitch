// Spellings (written notes) and pitches.
// A Spelling is { step: 'C'..'B', alter: -2..2, octave: int } in scientific octave numbering (C4 = c').

export const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const ALTERS = [-2, -1, 0, 1, 2];
const ALTER_ID = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };

export function spelling(step, alter, octave) {
  return Object.freeze({ step, alter, octave });
}

export const midiOf = (s) => 12 * (s.octave + 1) + STEP_SEMITONE[s.step] + s.alter;

/** Diatonic position: one unit per line/space on the staff. */
export const staffPosition = (s) => s.octave * 7 + STEPS.indexOf(s.step);

/** Spelling at a diatonic position with the given alteration. */
export function fromStaffPosition(pos, alter = 0) {
  const step = STEPS[((pos % 7) + 7) % 7];
  return spelling(step, alter, Math.floor(pos / 7));
}

export const spellingId = (s) => `${s.step}${ALTER_ID[s.alter]}${s.octave}`;

const ID_RE = /^([A-G])(bb|b|##|#|)(-?\d)$/;
const ALTER_OF = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 };

/** Parses "Bb4", "C##5", "E4"; returns null for invalid input. */
export function parseSpellingId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  return m ? spelling(m[1], ALTER_OF[m[2]], Number(m[3])) : null;
}

/**
 * Diatonic transposition: moves a spelling by `steps` staff positions and `semitones` semitones
 * (e.g. major ninth up = +8 steps, +14 semitones). Returns null if more than a double accidental is needed.
 */
export function transposeSpelling(s, steps, semitones) {
  const natural = fromStaffPosition(staffPosition(s) + steps, 0);
  const alter = midiOf(s) + semitones - midiOf(natural);
  return alter >= -2 && alter <= 2 ? fromStaffPosition(staffPosition(s) + steps, alter) : null;
}

export const sameSpelling = (a, b) => a.step === b.step && a.alter === b.alter && a.octave === b.octave;

// ---- clefs -------------------------------------------------------------------

const P = (id) => staffPosition(parseSpellingId(id));

/** Staff lines (bottom/top), selectable range ±3 ledger lines (low/high) and ±5 ledger lines (lowExt/highExt, with instrument filter). */
export const CLEFS = {
  treble: { bottomLine: P('E4'), topLine: P('F5'), low: P('F3'), high: P('E6'), lowExt: P('B2'), highExt: P('B6'), middleLine: P('B4') },
  bass: { bottomLine: P('G2'), topLine: P('A3'), low: P('A1'), high: P('G4'), lowExt: P('D1'), highExt: P('D5'), middleLine: P('D3') },
};

/** Ledger lines needed above (>0) / below (<0) the staff for a position; 0 inside. */
export function ledgerLines(pos, clef) {
  const c = CLEFS[clef];
  if (pos > c.topLine) return Math.floor((pos - c.topLine) / 2);
  if (pos < c.bottomLine) return -Math.floor((c.bottomLine - pos) / 2);
  return 0;
}

/** Staff positions of a clef's range, high → low (order of the selection grid rows). */
export function clefPositions(clef, extended = false) {
  const { low, high, lowExt, highExt } = CLEFS[clef];
  return positionsBetween(extended ? lowExt : low, extended ? highExt : high);
}

function positionsBetween(low, high) {
  const out = [];
  for (let p = high; p >= low; p--) out.push(p);
  return out;
}

/** All selectable spellings of a clef: positions high → low, alterations 𝄫 … 𝄪. */
export function spellingsForClef(clef) {
  return clefPositions(clef).flatMap((p) => ALTERS.map((a) => fromStaffPosition(p, a)));
}

export function inClefRange(s, clef, extended = false) {
  const p = staffPosition(s);
  const c = CLEFS[clef];
  return extended ? p >= c.lowExt && p <= c.highExt : p >= c.low && p <= c.high;
}

/** Doubly altered or E♯/B♯/C♭/F♭ – hidden unless "rare spellings" are shown. */
export function isRareSpelling(s) {
  return Math.abs(s.alter) === 2
    || (s.alter === 1 && (s.step === 'E' || s.step === 'B'))
    || (s.alter === -1 && (s.step === 'C' || s.step === 'F'));
}

/** Positions on the five staff lines and spaces (no ledger lines). */
export function isInsideStaff(s, clef) {
  const p = staffPosition(s);
  return p >= CLEFS[clef].bottomLine && p <= CLEFS[clef].topLine;
}
