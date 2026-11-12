// Durations, time signatures, tempi and transpositions.

/** Ticks per quarter note. 48 is divisible for sixteenths (12) and triplet eighths (16). */
export const TPQ = 48;

export const DURATIONS = {
  whole: { id: 'whole', base: 'whole', dots: 0, ticks: 4 * TPQ },
  dottedHalf: { id: 'dottedHalf', base: 'half', dots: 1, ticks: 3 * TPQ },
  half: { id: 'half', base: 'half', dots: 0, ticks: 2 * TPQ },
  dottedQuarter: { id: 'dottedQuarter', base: 'quarter', dots: 1, ticks: 1.5 * TPQ },
  quarter: { id: 'quarter', base: 'quarter', dots: 0, ticks: TPQ },
  eighth: { id: 'eighth', base: 'eighth', dots: 0, ticks: TPQ / 2 },
};
/** Order as offered in the config screen. */
export const DURATION_IDS = ['whole', 'dottedHalf', 'half', 'dottedQuarter', 'quarter', 'eighth'];

/**
 * beatTicks: counting unit (BPM refers to it). groups: compound grouping (6/8).
 * halfBarRule: without syncopation no note may cross the middle of the bar unless it starts at 0.
 */
export const TIME_SIGNATURES = {
  '4/4': { id: '4/4', num: 4, den: 4, barTicks: 4 * TPQ, beatTicks: TPQ, beatDuration: 'quarter', groups: null, halfBarRule: true },
  '3/4': { id: '3/4', num: 3, den: 4, barTicks: 3 * TPQ, beatTicks: TPQ, beatDuration: 'quarter', groups: null, halfBarRule: false },
  '2/4': { id: '2/4', num: 2, den: 4, barTicks: 2 * TPQ, beatTicks: TPQ, beatDuration: 'quarter', groups: null, halfBarRule: false },
  '2/2': { id: '2/2', num: 2, den: 2, barTicks: 4 * TPQ, beatTicks: 2 * TPQ, beatDuration: 'half', groups: null, halfBarRule: true },
  '6/8': { id: '6/8', num: 6, den: 8, barTicks: 3 * TPQ, beatTicks: 1.5 * TPQ, beatDuration: 'dottedQuarter', groups: 1.5 * TPQ, halfBarRule: false },
};
export const TIME_SIGNATURE_IDS = ['4/4', '3/4', '2/4', '2/2', '6/8'];

/** Beats per bar = number of count-in beats. */
export const beatsPerBar = (ts) => ts.barTicks / ts.beatTicks;

export const TEMPI = [
  { id: 'larghissimo', name: 'Larghissimo', range: '< 24', bpm: 24 },
  { id: 'grave', name: 'Grave', range: '25–45', bpm: 40 },
  { id: 'largo', name: 'Largo', range: '40–60', bpm: 50 },
  { id: 'larghetto', name: 'Larghetto', range: '60–66', bpm: 63 },
  { id: 'adagio', name: 'Adagio', range: '66–76', bpm: 72 },
  { id: 'andante', name: 'Andante', range: '76–108', bpm: 92 },
  { id: 'moderato', name: 'Moderato', range: '108–120', bpm: 112 },
  { id: 'allegretto', name: 'Allegretto', range: '112–120', bpm: 120 },
  { id: 'allegro', name: 'Allegro', range: '120–156', bpm: 138 },
  { id: 'vivace', name: 'Vivace', range: '156–176', bpm: 168 },
  { id: 'presto', name: 'Presto', range: '168–200', bpm: 184 },
  { id: 'prestissimo', name: 'Prestissimo', range: '> 200', bpm: 200 },
];
export const tempoById = (id) => TEMPI.find((t) => t.id === id) || null;

/** Interval written → sounding: semitones and diatonic steps (staff positions). */
export const TRANSPOSITIONS = [
  { id: 'none', semitones: 0, steps: 0 },
  { id: 'bb', semitones: -2, steps: -1 },      // major second down
  { id: 'bbTenor', semitones: -14, steps: -8 }, // major ninth down
  { id: 'a', semitones: -3, steps: -2 },       // minor third down
  { id: 'f', semitones: -7, steps: -4 },       // perfect fifth down
  { id: 'eb', semitones: -9, steps: -5 },      // major sixth down
  { id: 'ebHigh', semitones: 3, steps: 2 },    // minor third up
];
export const transpositionById = (id) => TRANSPOSITIONS.find((t) => t.id === id) || null;

export const CONCERT_A_VALUES = [440, 441, 442, 443];

/** Seconds per tick for a time signature and BPM (BPM refers to the counting unit). */
export const secondsPerTick = (ts, bpm) => 60 / bpm / ts.beatTicks;
