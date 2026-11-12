// The only module that talks to VexFlow (loaded as global `VexFlow` from vendor/vexflow).
// Draws glyphs at positions computed by layout.js; results are added incrementally.
import { DURATIONS, TIME_SIGNATURES } from '../core/music.js';
import { midiOf, staffPosition, ledgerLines } from '../core/pitch.js';
import { layoutScore, verticalMetrics, LAYOUT } from './layout.js';
import { vexflowKey } from '../core/keys.js';
import { accidentalAgainstKey } from '../core/accidentals.js';

const VF = () => globalThis.VexFlow;
const SVG_NS = 'http://www.w3.org/2000/svg';

const VF_ACCIDENTAL = { '-2': 'bb', '-1': 'b', 1: '#', 2: '##', natural: 'n' };
const VF_BASE = { whole: 'w', half: 'h', quarter: 'q', eighth: '8' };
const REST_KEY = { treble: 'b/4', bass: 'd/3' };
const RESULT_GAP = 4;
const FLAG_WIDTH = 9; // an up-stem eighth flag extends right of the notehead

export async function fontsReady() {
  await Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('14px Academico')]);
}

/** @param accidental -2..2 | 'natural' | null */
export function makeNote({ spelling, durationId, clef, accidental = null, rest = false }) {
  const { StaveNote, Accidental, Dot } = VF();
  const d = DURATIONS[durationId];
  const note = new StaveNote({
    clef,
    keys: [rest ? REST_KEY[clef] : `${spelling.step.toLowerCase()}/${spelling.octave}`],
    duration: VF_BASE[d.base] + (rest ? 'r' : ''),
    dots: d.dots,
    autoStem: true,
  });
  if (!rest && accidental != null) note.addModifier(new Accidental(VF_ACCIDENTAL[accidental]), 0);
  if (d.dots) Dot.buildAndAttach([note], { all: true });
  return note;
}

function contextFor(note) {
  // modifiers (accidentals, dots) are only measured through a ModifierContext
  const mc = new (VF().ModifierContext)();
  note.addToModifierContext(mc);
  mc.preFormat();
  const tc = new (VF().TickContext)();
  tc.addTickable(note);
  tc.preFormat();
  return tc;
}

/** Formats a note once (a note must not be pre-formatted twice: modifiers would shift again). */
function prepare(note) {
  const tc = contextFor(note);
  const m = tc.getMetrics();
  return { tc, metrics: { left: m.totalLeftPx || 0, head: m.notePx || 12, right: m.totalRightPx || 0 } };
}

/** { left, head, right } in px for a note (accidentals left, dots right). */
export const noteMetrics = (note) => prepare(note).metrics;

/** Width from stave start to the first note (clef + key signature [+ time signature]). */
export function headerWidth(clef, timeSignatureId, keyFifths = 0) {
  const stave = new (VF().Stave)(0, 0, 1000);
  stave.addClef(clef).addKeySignature(vexflowKey(keyFifths));
  if (timeSignatureId) stave.addTimeSignature(timeSignatureId);
  return stave.getNoteStartX();
}

/**
 * Space reserved right of a note for a red note of the same value: gap, flag (eighths only), the
 * widest accidental a red note can get (♭ ♮ ♯; 𝄫 𝄪 only with rare spellings), notehead and dot.
 */
export function resultSlotWidth(clef, durationId, rareSpellings) {
  const accidentals = rareSpellings ? [-2, -1, 'natural', 1, 2] : [-1, 'natural', 1];
  let widest = null;
  for (const accidental of accidentals) {
    const m = noteMetrics(makeNote({ spelling: { step: 'B', alter: typeof accidental === 'number' ? accidental : 0, octave: 4 }, durationId, clef, accidental }));
    if (!widest || m.left > widest.left) widest = m;
  }
  const flag = DURATIONS[durationId].base === 'eighth' ? FLAG_WIDTH : 0;
  return RESULT_GAP + flag + widest.left + widest.head + widest.right + 4;
}

// ---- result marks (drawn as paths: text glyphs like ✓ may come from colour emoji fonts) ----
function markPath(kind) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', kind === 'ok' ? 'M-6,0 L-2,5 L7,-6' : 'M-5,-5 L5,5 M5,-5 L-5,5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-width', '2.5');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('class', kind === 'ok' ? 'mark mark-ok' : 'mark mark-bad');
  return p;
}

/**
 * A drawn score: one box (div + SVG) per line so that lines can be arranged freely (page turning).
 * Usage: const view = new ScoreView(container); view.draw({...}); view.showResult(...); view.showArrow(...)
 */
export class ScoreView {
  constructor(container) {
    this.container = container;
    this.copies = new Map(); // eventId → [{ line, event, note, stave, ctx, svg, offset, metrics, headX, markY }]
    this.lineEls = [];
  }

  /**
   * @param {object} p
   * @param {object} p.exercise
   * @param {string} p.clef
   * @param {string} p.timeSignatureId
   * @param {number} p.width line width in score units (viewport width / scale)
   * @param {boolean} p.overlap single-line pages with the last bar repeated
   * @param {{name:string, bpm:number}} p.tempo
   * @param {string|null} p.transpositionLabel e.g. "in B"
   * @param {boolean} [p.rareSpellings] red notes may need double accidentals (affects reserved space)
   */
  draw({ exercise, clef, timeSignatureId, width, overlap, tempo, transpositionLabel, rareSpellings = false }) {
    const { Renderer, Stave, BarlineType } = VF();
    this.container.innerHTML = '';
    this.copies.clear();
    this.lineEls = [];
    this.clef = clef;

    // 1. metrics → layout
    const slots = new Map();
    const slotFor = (durationId) => {
      if (!slots.has(durationId)) slots.set(durationId, resultSlotWidth(clef, durationId, rareSpellings));
      return slots.get(durationId);
    };
    const measures = exercise.measures.map((m) => ({
      index: m.index,
      events: m.events.map((e) => ({
        id: e.id, ticks: e.ticks,
        metrics: noteMetrics(makeNote({ spelling: e.spelling, durationId: e.durationId, clef, accidental: e.shownAccidental })),
        slot: slotFor(e.durationId),
      })),
    }));
    const keyFifths = exercise.keyFifths ?? 0;
    const header = { first: headerWidth(clef, timeSignatureId, keyFifths), other: headerWidth(clef, null, keyFifths) };
    // room for ledger lines: the highest/lowest written note, +1 for a red note up to 2 positions away
    let above = 0, below = 0;
    for (const m of exercise.measures) for (const e of m.events) {
      const l = ledgerLines(staffPosition(e.spelling), clef);
      above = Math.max(above, l + 1);
      below = Math.max(below, -l + 1);
    }
    const vm = verticalMetrics(above, below);
    const layout = layoutScore({ measures, width, header, lineHeight: vm.lineHeight, overlap });
    this.layout = layout;

    // 2. draw every line into its own box
    const ts = TIME_SIGNATURES[timeSignatureId];
    const beat = DURATIONS[ts.beatDuration];
    const lastIndex = exercise.measures.length - 1;
    for (const line of layout.lines) {
      const box = document.createElement('div');
      box.className = 'score-line';
      this.container.appendChild(box);
      this.lineEls.push(box);
      const renderer = new Renderer(box, Renderer.Backends.SVG);
      renderer.resize(layout.width, layout.lineBox);
      const ctx = renderer.getContext();
      const svg = box.querySelector('svg');
      svg.setAttribute('aria-hidden', 'true');
      const y = LAYOUT.top + vm.staffOffset - 40; // Stave y = top of its own 40px header space

      for (const lm of line.measures) {
        const stave = new Stave(lm.x, y, lm.width);
        if (lm.withClef) stave.addClef(clef).addKeySignature(vexflowKey(keyFifths));
        if (lm.withTimeSignature) {
          stave.addTimeSignature(timeSignatureId);
          // keep the tempo marking at the top of the line box, above any ledger-line notes
          stave.setTempo({ name: tempo.name, duration: VF_BASE[beat.base], dots: beat.dots, bpm: tempo.bpm }, -20 - (vm.staffOffset - 70));
        }
        if (lm.index === lastIndex) stave.setEndBarType(BarlineType.END);
        stave.setContext(ctx).draw();
        if (lm.withTimeSignature && transpositionLabel) text(svg, transpositionLabel, stave.getNoteStartX() - 8, LAYOUT.top - 3);

        const measure = exercise.measures[lm.index];
        for (const e of measure.events) {
          // a bar repeated on the next page needs its own note objects
          const note = makeNote({ spelling: e.spelling, durationId: e.durationId, clef, accidental: e.shownAccidental });
          const { tc, metrics } = prepare(note);
          const pos = layout.events[e.id].find((p) => p.line === line.index);
          note.setStave(stave);
          tc.setX(pos.offset);
          note.setContext(ctx).draw();
          const copy = { line: line.index, event: e, note, stave, ctx, svg, offset: pos.offset, metrics, headX: note.getAbsoluteX(), markY: stave.getYForLine(0) + vm.markOffset };
          if (!this.copies.has(e.id)) this.copies.set(e.id, []);
          this.copies.get(e.id).push(copy);
        }
      }
    }

    // arrow (moved between line boxes during the test)
    this.arrow = document.createElementNS(SVG_NS, 'path');
    this.arrow.setAttribute('d', 'M0,-8 L-7,5 L7,5 Z');
    this.arrow.setAttribute('class', 'arrow');
    this.arrow.style.display = 'none';
    return layout;
  }

  /** Positions of an event: one entry per line (page) containing its bar. */
  linesOf(eventId) { return (this.copies.get(eventId) || []).map((c) => ({ line: c.line })); }

  /** Shows the arrow under the event's copy on the given line (default: first copy); null hides it. */
  showArrow(eventId, line) {
    const copies = eventId && this.copies.get(eventId);
    const c = copies && (copies.find((x) => x.line === line) || copies[0]);
    if (!c) { this.arrow.style.display = 'none'; return; }
    c.svg.appendChild(this.arrow);
    this.arrow.style.display = '';
    this.arrow.setAttribute('transform', `translate(${c.headX + c.metrics.head / 2},${c.markY})`);
  }

  /**
   * Draws a result on every copy of the event.
   * @param {{outcome:'correct'|'wrong'|'missed', playedSpelling?:object, accidental?:any}} r
   */
  showResult(eventId, r) {
    for (const c of this.copies.get(eventId) || []) {
      if (r.outcome === 'correct') {
        c.note.getSVGElement()?.classList.add('res-ok');
      } else {
        const rest = r.outcome === 'missed' || !r.playedSpelling;
        const red = makeNote({ spelling: r.playedSpelling, durationId: c.event.durationId, clef: this.clef, accidental: rest ? null : r.accidental, rest });
        const tc = contextFor(red);
        const left = tc.getMetrics().totalLeftPx || 0;
        red.setStave(c.stave);
        const flag = DURATIONS[c.event.durationId].base === 'eighth' ? FLAG_WIDTH : 0;
        tc.setX(c.offset + c.metrics.head + c.metrics.right + RESULT_GAP + flag + left);
        red.setContext(c.ctx).draw();
        red.getSVGElement()?.classList.add('res-bad');
      }
      const mark = markPath(r.outcome === 'correct' ? 'ok' : 'bad');
      mark.setAttribute('transform', `translate(${c.headX + c.metrics.head / 2},${c.markY + 4})`);
      c.svg.appendChild(mark);
    }
  }
}

function text(svg, str, x, y) {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('class', 'score-label');
  el.textContent = str;
  svg.appendChild(el);
}

/**
 * Mini staff for the config screen: whole notes sorted by pitch, no barlines, wrapped over lines.
 * Accidentals are always shown (no bar context).
 */
export function drawNoteList(container, spellings, clef, width, keyFifths = 0) {
  const { Renderer, Stave } = VF();
  container.innerHTML = '';
  if (!spellings.length) return;
  const sorted = [...spellings].sort((a, b) => midiOf(a) - midiOf(b) || a.octave * 7 - b.octave * 7);
  const prepared = sorted.map((s) => {
    const note = makeNote({ spelling: s, durationId: 'whole', clef, accidental: accidentalAgainstKey(s, keyFifths) });
    const { tc, metrics } = prepare(note);
    return { note, tc, m: metrics };
  });
  const head = headerWidth(clef, null, keyFifths);
  const ledgers = sorted.map((s) => ledgerLines(staffPosition(s), clef));
  const vm = verticalMetrics(Math.max(0, ...ledgers), Math.max(0, ...ledgers.map((l) => -l)));
  const lineH = vm.lineHeight - 40;
  const lines = [];
  let cur = [], used = 0;
  for (const p of prepared) {
    const w = p.m.left + p.m.head + 16;
    if (cur.length && used + w > width - head - 20) { lines.push(cur); cur = []; used = 0; }
    cur.push({ ...p, w }); used += w;
  }
  if (cur.length) lines.push(cur);
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * lineH);
  const ctx = renderer.getContext();
  container.querySelector('svg').setAttribute('aria-hidden', 'true');
  lines.forEach((line, i) => {
    const stave = new Stave(0, i * lineH + vm.staffOffset - 55, Math.min(width - 2, head + line.reduce((s, p) => s + p.w, 0) + 16));
    stave.addClef(clef).addKeySignature(vexflowKey(keyFifths)).setContext(ctx).draw();
    let x = 8;
    for (const p of line) {
      p.note.setStave(stave);
      p.tc.setX(x + p.m.left);
      p.note.setContext(ctx).draw();
      x += p.w;
    }
  });
}
