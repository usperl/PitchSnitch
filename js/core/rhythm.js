// Placement rules and bar-filling feasibility.
import { DURATIONS } from './music.js';

/**
 * May a note of `ticks` start at bar position `pos`?
 * - must fit into the bar
 * - compound meters (6/8): must not cross a group boundary unless it starts on a group and fills whole groups
 * - simple meters without syncopation: notes ≥ beat start on a beat, shorter notes stay within a beat,
 *   and in 4/4 and 2/2 nothing crosses the middle of the bar unless it starts at 0
 */
export function fits(pos, ticks, ts, allowSyncopation) {
  if (pos + ticks > ts.barTicks) return false;
  if (ts.groups) {
    const g = ts.groups;
    const sameGroup = Math.floor(pos / g) === Math.floor((pos + ticks - 1) / g);
    return sameGroup || (pos % g === 0 && ticks % g === 0);
  }
  if (allowSyncopation) return true;
  const beat = ts.beatTicks;
  if (ticks >= beat) {
    if (pos % beat !== 0) return false;
  } else if (Math.floor(pos / beat) !== Math.floor((pos + ticks - 1) / beat)) {
    return false;
  }
  if (ts.halfBarRule) {
    const mid = ts.barTicks / 2;
    if (pos !== 0 && pos < mid && pos + ticks > mid) return false;
  }
  return true;
}

/** Feasibility table: canFill[pos] = the bar can be completed exactly from `pos`. */
export function fillTable(durationIds, ts, allowSyncopation) {
  const durs = durationIds.map((id) => DURATIONS[id]).filter(Boolean);
  const can = new Array(ts.barTicks + 1).fill(false);
  can[ts.barTicks] = true;
  for (let pos = ts.barTicks - 1; pos >= 0; pos--) {
    can[pos] = durs.some((d) => fits(pos, d.ticks, ts, allowSyncopation) && can[pos + d.ticks]);
  }
  return can;
}

export const canFillBar = (durationIds, ts, allowSyncopation) => fillTable(durationIds, ts, allowSyncopation)[0];

/** Duration ids that occur in at least one exact bar filling (relevant for the minimum-duration check). */
export function usableDurations(durationIds, ts, allowSyncopation) {
  const can = fillTable(durationIds, ts, allowSyncopation);
  if (!can[0]) return [];
  const reachable = new Array(ts.barTicks + 1).fill(false);
  reachable[0] = true;
  const used = new Set();
  for (let pos = 0; pos < ts.barTicks; pos++) {
    if (!reachable[pos] || !can[pos]) continue;
    for (const id of durationIds) {
      const d = DURATIONS[id];
      if (d && fits(pos, d.ticks, ts, allowSyncopation) && can[pos + d.ticks]) {
        used.add(id);
        reachable[pos + d.ticks] = true;
      }
    }
  }
  return durationIds.filter((id) => used.has(id));
}
