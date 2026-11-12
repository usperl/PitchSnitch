// Detection frames on the audio clock. Pure.

/**
 * Time a detection frame stands for: the middle of the analysed window, corrected by the input latency.
 * @param {number} endTime audio-clock time of the last sample in the frame
 */
export const frameCenterTime = (endTime, frameSize, sampleRate, inputLatency) =>
  endTime - inputLatency - frameSize / sampleRate / 2;

/**
 * How long after the end of a note its frames are complete: latency + half a frame + message jitter.
 * Evaluation of a note waits for this.
 */
export const evaluationDelay = (frameSize, sampleRate, inputLatency) => inputLatency + frameSize / sampleRate / 2 + 0.05;

/** Append-only store of frames { time, writtenMidi } with time relative to the count-in start. */
export class FrameStore {
  constructor() { this.frames = []; }
  push(frame) { this.frames.push(frame); }
  clear() { this.frames = []; }
  /** Frames with from ≤ time ≤ to. Frames arrive in time order, so this is a binary search + slice. */
  between(from, to) {
    const f = this.frames;
    let lo = 0, hi = f.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (f[mid].time < from) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let i = lo; i < f.length && f[i].time <= to; i++) out.push(f[i]);
    return out;
  }
}
