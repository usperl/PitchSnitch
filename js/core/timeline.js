// Schedule of a test run in seconds relative to the start of the count-in bar.
import { secondsPerTick, beatsPerBar } from './music.js';
import { flatEvents } from './generator.js';

export const EVAL_SKIP_SHARE = 0.1;
export const EVAL_SKIP_MAX = 0.1;

export function buildTimeline(exercise, ts, bpm) {
  const spt = secondsPerTick(ts, bpm);
  const countInBeats = beatsPerBar(ts);
  const beatSeconds = ts.beatTicks * spt;
  const countInDuration = countInBeats * beatSeconds;
  const items = [];
  for (const e of flatEvents(exercise)) {
    const absTick = e.measure * ts.barTicks + e.startTick;
    const start = countInDuration + absTick * spt;
    const duration = e.ticks * spt;
    items.push({
      eventId: e.id,
      index: items.length,
      start,
      end: start + duration,
      evalFrom: start + Math.min(EVAL_SKIP_SHARE * duration, EVAL_SKIP_MAX),
      evalTo: start + duration,
    });
  }
  return { countInBeats, beatSeconds, countInDuration, items, end: items.length ? items.at(-1).end : countInDuration };
}

/** Index of the item playing at time t (seconds since count-in start); -1 before, items.length after. */
export function itemIndexAt(timeline, t) {
  const { items } = timeline;
  if (!items.length || t < items[0].start) return -1;
  if (t >= items.at(-1).end) return items.length;
  let lo = 0, hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (items[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Shortest duration in seconds of the given ticks. */
export const durationSeconds = (ticks, ts, bpm) => ticks * secondsPerTick(ts, bpm);
