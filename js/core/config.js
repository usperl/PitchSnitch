// Configuration: defaults, validation, sanitising and migration of stored data.
// Stored configurations of older schema versions are migrated step by step (MIGRATIONS);
// unknown or newer versions are discarded (replaced by defaults).
import { parseSpellingId, spellingId, midiOf, staffPosition, transposeSpelling, isRareSpelling } from './pitch.js';
import { offeredSpellings, isValidSelection, applyInstrument, selectionById, CUSTOM } from './instruments.js';
import { DURATIONS, DURATION_IDS, TIME_SIGNATURES, tempoById, transpositionById, CONCERT_A_VALUES } from './music.js';
import { canFillBar, usableDurations } from './rhythm.js';
import { durationSeconds } from './timeline.js';
import { KEY_FIFTHS, transposeKey } from './keys.js';

export const SCHEMA_VERSION = 1;
export const MIN_NOTE_SECONDS = 0.15;
export const LANGUAGES = ['de', 'en'];
export const CLEF_IDS = ['treble', 'bass'];
export const COUNTDOWN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  language: 'de',
  instrument: CUSTOM,
  registers: [],
  clef: 'treble',
  showRareSpellings: false,
  keySignature: 0,
  notes: [],
  concertA: 442,
  transposition: 'none',
  durations: ['whole'],
  allowSyncopation: false,
  timeSignature: '4/4',
  tempo: 'largo',
  bars: 5,
  countdown: 10,
});

export const defaultConfig = () => ({ ...DEFAULT_CONFIG, registers: [], notes: [], durations: [...DEFAULT_CONFIG.durations] });

const isValidBars = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 && n <= 100;
};

/**
 * Issues that block "Test beginnen". Empty array = startable.
 * Each issue: { code, field, params? }
 */
export function validate(cfg) {
  const issues = [];
  if (!selectedSpellings(cfg).length) issues.push({ code: 'noNotes', field: 'notes' });
  if (!cfg.durations.length) issues.push({ code: 'noDurations', field: 'durations' });
  if (!isValidBars(cfg.bars)) issues.push({ code: 'barsInvalid', field: 'bars' });
  const ts = TIME_SIGNATURES[cfg.timeSignature];
  const tempo = tempoById(cfg.tempo);
  if (cfg.durations.length && ts) {
    if (!canFillBar(cfg.durations, ts, cfg.allowSyncopation)) {
      issues.push({ code: 'cannotFillBar', field: 'durations' });
    } else if (tempo) {
      const usable = usableDurations(cfg.durations, ts, cfg.allowSyncopation);
      const shortest = usable.reduce((a, id) => (DURATIONS[id].ticks < DURATIONS[a].ticks ? id : a), usable[0]);
      const ms = Math.round(durationSeconds(DURATIONS[shortest].ticks, ts, tempo.bpm) * 1000);
      if (ms < MIN_NOTE_SECONDS * 1000) issues.push({ code: 'noteTooShort', field: 'tempo', params: { duration: shortest, ms } });
    }
  }
  return issues;
}

/** Parsed spellings of cfg.notes that are currently offered (order preserved). */
export function selectedSpellings(cfg) {
  const { ids } = offeredSpellings(cfg);
  return cfg.notes.filter((id) => ids.has(id)).map(parseSpellingId);
}

/** Drops selected notes that are no longer offered (after clef/transposition/filter changes). */
export function pruneNotes(cfg) {
  const { ids } = offeredSpellings(cfg);
  return { ...cfg, notes: cfg.notes.filter((id) => ids.has(id)) };
}

/** Applies the instrument selection (fixed clef/transposition, valid registers) and prunes the notes. */
export const normalize = (cfg) => pruneNotes(applyInstrument(cfg));

/**
 * Switches "Instrument & Notierung": selected notes that the new instrument can play are kept.
 * The sounding pitch is preserved; spellings move diatonically by the difference of the transpositions.
 * If that spelling is a rare spelling while rare spellings are hidden, the rare-spelling filter is
 * switched on (result.rareSpellingsEnabled = true) so the change stays lossless and reversible.
 * If the spelling is not offered for other reasons, the nearest offered enharmonic is used.
 * The registers are set to cover all kept notes (default register if none). Switching to
 * "Eigene Einstellung" keeps clef, transposition and notes.
 */
export function changeInstrument(cfg, selectionId) {
  if (!selectionById(selectionId)) return normalize({ ...cfg, instrument: CUSTOM, registers: [] });
  const from = transpositionById(cfg.transposition) || transpositionById('none');
  const target = applyInstrument({ ...cfg, instrument: selectionId, registers: [] });
  const to = transpositionById(target.transposition);
  const steps = from.steps - to.steps;
  const semis = from.semitones - to.semitones;
  const { instrument } = selectionById(selectionId);
  const allRegisters = instrument.registers.map((r) => r.id);
  const all = offeredSpellings({ ...target, registers: allRegisters });
  const allWithRare = offeredSpellings({ ...target, registers: allRegisters, showRareSpellings: true });
  const offeredList = all.positions.flatMap((p) => p.spellings.filter(Boolean));

  const notes = [];
  let needRare = false;
  for (const id of cfg.notes) {
    const s = parseSpellingId(id);
    if (!s) continue;
    let moved = transposeSpelling(s, steps, semis);
    if (moved && !target.showRareSpellings && isRareSpelling(moved) && allWithRare.ids.has(spellingId(moved))) {
      needRare = true;
    } else if (!moved || !all.ids.has(spellingId(moved))) {
      const midi = midiOf(s) + semis;
      const pos = staffPosition(s) + steps;
      moved = offeredList
        .filter((o) => midiOf(o) === midi)
        .sort((a, b) => Math.abs(staffPosition(a) - pos) - Math.abs(staffPosition(b) - pos) || Math.abs(a.alter) - Math.abs(b.alter))[0] || null;
    }
    if (moved && !notes.includes(spellingId(moved))) notes.push(spellingId(moved));
  }
  const sounding = notes.map((id) => midiOf(parseSpellingId(id)) + to.semitones);
  const registers = instrument.registers.filter((r) => sounding.some((m) => m >= r.low && m <= r.high)).map((r) => r.id);
  const keySignature = transposeKey(cfg.keySignature ?? 0, steps, semis);
  const result = normalize({ ...target, notes, registers, keySignature, showRareSpellings: target.showRareSpellings || needRare });
  return needRare ? Object.defineProperty(result, 'rareSpellingsEnabled', { value: true, enumerable: false }) : result;
}

/**
 * Migration steps for stored configurations: MIGRATIONS[n] turns a version-n object into version n+1.
 * Every change of the stored format must raise SCHEMA_VERSION and add the step for the previous version,
 * so that configurations saved by users stay loadable. Steps must never be removed.
 * Example for a future version 2:  1: (cfg) => ({ ...cfg, schemaVersion: 2, newField: defaultValue }),
 */
export const MIGRATIONS = Object.freeze({});

/** Brings stored data to SCHEMA_VERSION. Returns null for unknown, newer or broken data. */
export function migrate(raw, migrations = MIGRATIONS, target = SCHEMA_VERSION) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.schemaVersion)) return null;
  let cfg = raw;
  while (cfg.schemaVersion < target) {
    const step = migrations[cfg.schemaVersion];
    if (!step) return null;
    cfg = step(cfg);
  }
  return cfg.schemaVersion === target ? cfg : null;
}

/**
 * Migrates stored data and replaces unknown/invalid values by defaults.
 * @returns {{ config: object, replaced: string[] }} replaced = field names that were reset or cleaned
 */
export function sanitize(raw) {
  const d = defaultConfig();
  const stored = migrate(raw);
  if (!stored) return { config: d, replaced: ['*'] };
  const replaced = [];
  const take = (field, ok) => {
    if (ok(stored[field])) return stored[field];
    replaced.push(field);
    return d[field];
  };
  const cfg = { schemaVersion: SCHEMA_VERSION };
  cfg.language = take('language', (v) => LANGUAGES.includes(v));
  cfg.clef = take('clef', (v) => CLEF_IDS.includes(v));
  cfg.instrument = take('instrument', isValidSelection);
  if (selectionById(cfg.instrument) && !Array.isArray(stored.registers)) replaced.push('registers');
  cfg.registers = Array.isArray(stored.registers) ? stored.registers : [];
  cfg.showRareSpellings = take('showRareSpellings', (v) => typeof v === 'boolean');
  cfg.keySignature = take('keySignature', (v) => KEY_FIFTHS.includes(v));
  cfg.concertA = take('concertA', (v) => CONCERT_A_VALUES.includes(v));
  cfg.transposition = take('transposition', (v) => !!transpositionById(v));
  cfg.allowSyncopation = take('allowSyncopation', (v) => typeof v === 'boolean');
  cfg.timeSignature = take('timeSignature', (v) => !!TIME_SIGNATURES[v]);
  cfg.tempo = take('tempo', (v) => !!tempoById(v));
  cfg.bars = take('bars', isValidBars);
  cfg.bars = Number(cfg.bars);
  cfg.countdown = take('countdown', (v) => COUNTDOWN_VALUES.includes(v));

  Object.assign(cfg, applyInstrument(cfg)); // fixes clef/transposition and registers for an instrument
  const notesIn = Array.isArray(stored.notes) ? stored.notes : null;
  if (!notesIn) { replaced.push('notes'); cfg.notes = []; } else {
    const { ids } = offeredSpellings(cfg);
    const parsed = notesIn.map(parseSpellingId).filter(Boolean).map(spellingId);
    cfg.notes = [...new Set(parsed.filter((id) => ids.has(id)))];
    if (cfg.notes.length !== notesIn.length) replaced.push('notes');
  }
  const dursIn = Array.isArray(stored.durations) ? stored.durations : null;
  if (!dursIn) { replaced.push('durations'); cfg.durations = d.durations; } else {
    cfg.durations = DURATION_IDS.filter((id) => dursIn.includes(id));
    if (cfg.durations.length !== dursIn.length) replaced.push('durations');
  }
  return { config: cfg, replaced };
}

/** Serialisable copy for localStorage. */
export const toStored = (cfg) => ({ ...cfg, bars: Number(cfg.bars), schemaVersion: SCHEMA_VERSION });
