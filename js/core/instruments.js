// "Instrument & Notierung" (config screen): an instrument in one notation fixes clef and
// transposition; its registers (checkboxes) restrict the offered pitches. Register ranges are stored
// as SOUNDING pitch and converted to written pitch with the transposition.
import { ALTERS, clefPositions, fromStaffPosition, midiOf, parseSpellingId, isRareSpelling, spellingId } from './pitch.js';
import { transpositionById } from './music.js';

const M = (id) => midiOf(parseSpellingId(id));
const reg = (id, low, high) => ({ id, low: M(low), high: M(high) });

/** Brass: register limits follow the harmonic series. Euphonium without 4th valve, no pedal tones. */
const LOW_BRASS = [reg('low', 'E2', 'Bb2'), reg('middle', 'B2', 'Bb3'), reg('high', 'B3', 'Bb4')];
const CONCERT_BASS = { id: 'bass', clef: 'bass', transposition: 'none' };
const TREBLE_BB_TENOR = { id: 'trebleBb', clef: 'treble', transposition: 'bbTenor' };

export const INSTRUMENTS = [
  { id: 'clarinetBb', defaultRegister: 'chalumeau', notations: [{ id: 'trebleBb', clef: 'treble', transposition: 'bb' }],
    registers: [reg('chalumeau', 'D3', 'Ab4'), reg('clarion', 'A4', 'Bb5'), reg('altissimo', 'B5', 'F6')] },
  { id: 'trumpetBb', defaultRegister: 'middle', notations: [{ id: 'trebleBb', clef: 'treble', transposition: 'bb' }],
    registers: [reg('low', 'E3', 'Bb3'), reg('middle', 'B3', 'Bb4'), reg('high', 'B4', 'Bb5')] },
  { id: 'euphonium', defaultRegister: 'middle', notations: [CONCERT_BASS, TREBLE_BB_TENOR], registers: LOW_BRASS },
  { id: 'tenorHorn', defaultRegister: 'middle', notations: [CONCERT_BASS, TREBLE_BB_TENOR], registers: LOW_BRASS },
  { id: 'baritone', defaultRegister: 'middle', notations: [CONCERT_BASS, TREBLE_BB_TENOR], registers: LOW_BRASS },
  { id: 'trombone', defaultRegister: 'middle', notations: [CONCERT_BASS, TREBLE_BB_TENOR],
    registers: [reg('low', 'E2', 'Bb2'), reg('middle', 'B2', 'Bb3'), reg('high', 'B3', 'F4')] },
  { id: 'flute', defaultRegister: 'middle', notations: [{ id: 'treble', clef: 'treble', transposition: 'none' }],
    registers: [reg('low', 'C4', 'C#5'), reg('middle', 'D5', 'C#6'), reg('high', 'D6', 'B6')] },
  { id: 'altoSaxEb', defaultRegister: 'middle', notations: [{ id: 'trebleEb', clef: 'treble', transposition: 'eb' }],
    registers: [reg('low', 'Db3', 'E4'), reg('middle', 'F4', 'E5'), reg('high', 'F5', 'Ab5')] },
];

/** Selection id for "Eigene Einstellung" (free clef and transposition, no register filter). */
export const CUSTOM = 'custom';

/** All selectable "<instrument>.<notation>" ids in display order. */
export const selectionIds = () => INSTRUMENTS.flatMap((i) => i.notations.map((n) => `${i.id}.${n.id}`));

/** @returns {{instrument:object, notation:object} | null} */
export function selectionById(id) {
  const [instId, notationId] = String(id).split('.');
  const instrument = INSTRUMENTS.find((i) => i.id === instId);
  const notation = instrument?.notations.find((n) => n.id === notationId);
  return notation ? { instrument, notation } : null;
}

export const isValidSelection = (id) => id === CUSTOM || !!selectionById(id);

/** Valid, non-empty register list for a selection (falls back to the instrument's default register). */
export function validRegisters(selectionId, registers) {
  const sel = selectionById(selectionId);
  if (!sel) return [];
  const ids = sel.instrument.registers.map((r) => r.id);
  const valid = ids.filter((id) => Array.isArray(registers) && registers.includes(id));
  return valid.length ? valid : [sel.instrument.defaultRegister];
}

/**
 * Applies the instrument selection: fixes clef and transposition and normalises the registers.
 * "Eigene Einstellung" leaves clef/transposition untouched and clears the registers.
 */
export function applyInstrument(cfg) {
  const sel = selectionById(cfg.instrument);
  if (!sel) return { ...cfg, instrument: CUSTOM, registers: [] };
  return { ...cfg, clef: sel.notation.clef, transposition: sel.notation.transposition, registers: validRegisters(cfg.instrument, cfg.registers) };
}

/**
 * Spellings offered in the pitch grid.
 * @returns {{ positions: Array<{pos:number, spellings:Array, registers:Array}>, clipped:boolean, ids:Set<string>, registerOrder:string[] }}
 *   positions high → low with at least one offered spelling; spellings/registers in ALTERS order (null = not offered)
 *   clipped: part of the selected registers is outside the displayable range (±5 ledger lines)
 */
export function offeredSpellings({ clef, transposition, instrument, registers, showRareSpellings }) {
  const sel = selectionById(instrument);
  const semis = transpositionById(transposition)?.semitones ?? 0;
  const regs = sel ? sel.instrument.registers.filter((r) => validRegisters(instrument, registers).includes(r.id))
    .map((r) => ({ id: r.id, low: r.low - semis, high: r.high - semis })) : null;
  const registerOf = (s) => {
    if (!regs) return '';
    const m = midiOf(s);
    return regs.find((r) => m >= r.low && m <= r.high)?.id ?? null;
  };

  const positions = [];
  const ids = new Set();
  const midis = new Set();
  for (const pos of clefPositions(clef, !!sel)) {
    const spellings = [], regIds = [];
    for (const a of ALTERS) {
      const s = fromStaffPosition(pos, a);
      const r = showRareSpellings || !isRareSpelling(s) ? registerOf(s) : null;
      spellings.push(r === null ? null : s);
      regIds.push(r === null ? null : r);
    }
    if (spellings.some(Boolean)) {
      positions.push({ pos, spellings, registers: regIds });
      for (const s of spellings) if (s) { ids.add(spellingId(s)); midis.add(midiOf(s)); }
    }
  }
  let clipped = false;
  if (regs) for (const r of regs) for (let m = r.low; m <= r.high && !clipped; m++) if (!midis.has(m)) clipped = true;
  return { positions, clipped, ids, registerOrder: sel ? sel.instrument.registers.map((r) => r.id) : [] };
}
