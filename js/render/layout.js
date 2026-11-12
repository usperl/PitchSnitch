// Own score layout. Pure: glyph metrics are passed in by the VexFlow adapter.
// The score is broken into lines of the viewport width; each line is drawn in its own box so that
// lines can be shown in any order (page turning, see paging.js).
import { TPQ } from '../core/music.js';

export const LAYOUT = Object.freeze({
  margin: 10,          // left/right page margin
  top: 20,             // space above each line box (tempo marking on the first line)
  padStart: 14,        // space after barline / header before the first note
  padEnd: 8,           // space before the barline
  lineHeight: 190,     // default line height (3 ledger lines above and below)
  maxStretch: 2,       // justification limit for full lines
});

/** Horizontal space that grows with duration (logarithmic, like common engraving). */
export const durationSpace = (ticks) => 8 + 16 * Math.log2(ticks / (TPQ / 2) + 1);

/**
 * Vertical metrics for a score whose notes need up to `above`/`below` ledger lines (at least 3 each).
 * staffOffset = y of the top staff line inside a line (below LAYOUT.top); lineHeight includes the arrow/mark row.
 */
export function verticalMetrics(above = 3, below = 3) {
  const a = Math.max(3, above), b = Math.max(3, below);
  const staffOffset = 40 + a * 10;
  return { staffOffset, lineHeight: staffOffset + 40 + b * 10 + 50, markOffset: 40 + b * 10 + 18 };
}

/**
 * @param {object} p
 * @param {Array<{index:number, events:Array<{id:string, ticks:number, metrics:{left:number, head:number, right:number}, slot?:number}>}>} p.measures
 *   slot: space reserved right of this note for a red note (default: p.resultSlot)
 * @param {number} p.width line width (viewport width)
 * @param {{first:number, other:number}} p.header width from stave start to note start (clef + key [+ time signature])
 * @param {number} [p.resultSlot] default reserved space right of a note for a red note
 * @param {number} [p.lineHeight]
 * @param {boolean} [p.overlap] single-line pages: the last bar of a page is repeated as the first bar of the next
 * @returns {{width:number, lineBox:number, lineHeight:number, lines:Array<{index:number, measures:Array}>, events:Object<string, Array<{line:number, measure:number, offset:number, indexInBar:number}>>}}
 *   Coordinates are relative to each line box: x from the left edge, the line content starts at y = LAYOUT.top.
 *   offset = x of the notehead relative to the measure's note start. An event appears once per line containing its bar.
 */
export function layoutScore({ measures, width, header, resultSlot = 0, lineHeight = LAYOUT.lineHeight, overlap = false }) {
  const L = LAYOUT;
  const measured = measures.map((m) => {
    let x = L.padStart;
    const events = m.events.map((e, i) => {
      const offset = x + e.metrics.left;
      x += e.metrics.left + e.metrics.head + e.metrics.right + (e.slot ?? resultSlot) + durationSpace(e.ticks);
      return { id: e.id, offset, indexInBar: i };
    });
    return { index: m.index, content: x + L.padEnd, events };
  });

  // line breaking: whole bars only; with overlap a line starts with the previous line's last bar
  const groups = [];
  let i = 0;
  while (i < measured.length) {
    const head = groups.length === 0 ? header.first : header.other;
    const avail = width - 2 * L.margin - head;
    const group = [measured[i]];
    let used = measured[i].content;
    let j = i + 1;
    while (j < measured.length && used + measured[j].content <= avail) { group.push(measured[j]); used += measured[j].content; j++; }
    groups.push(group);
    if (j >= measured.length) break;
    i = overlap && group.length > 1 ? j - 1 : j;
  }

  const lines = [];
  const events = {};
  groups.forEach((group, li) => {
    const head = li === 0 ? header.first : header.other;
    const natural = group.reduce((s, m) => s + m.content, 0);
    const avail = width - 2 * L.margin - head;
    const isLast = li === groups.length - 1;
    const stretch = isLast ? 1 : Math.min(L.maxStretch, Math.max(1, avail / natural));
    let x = L.margin;
    const lineMeasures = group.map((m, k) => {
      const withClef = k === 0;
      const w = m.content * stretch + (withClef ? head : 0);
      const lm = { index: m.index, x, width: w, withClef, withTimeSignature: withClef && li === 0 };
      for (const e of m.events) (events[e.id] ||= []).push({ line: li, measure: m.index, offset: e.offset * stretch, indexInBar: e.indexInBar });
      x += w;
      return lm;
    });
    lines.push({ index: li, measures: lineMeasures });
  });
  return { width: Math.ceil(width), lineBox: L.top + lineHeight, lineHeight, lines, events };
}
