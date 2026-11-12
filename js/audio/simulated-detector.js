// Development only (?simulate=1): produces detection frames with random outcomes so the
// complete flow can be exercised without a microphone.
import { createRng } from '../core/generator.js';
import { midiOf } from '../core/pitch.js';

const HOP = 0.01;

export function createSimulatedDetector(seed) {
  const rng = createRng(seed ^ 0x5eed);
  /** Frames for one note's evaluation window. */
  return function framesFor(event, item) {
    const target = midiOf(event.spelling);
    const r = rng();
    let played = target, voicedShare = 1;
    if (r >= 0.7 && r < 0.9) played = target + [-2, -1, 1, 2][Math.floor(rng() * 4)];
    if (r >= 0.9) voicedShare = 0.3;
    const frames = [];
    for (let t = item.evalFrom; t <= item.evalTo; t += HOP) {
      frames.push({ time: t, writtenMidi: rng() < voicedShare ? played : null });
    }
    return frames;
  };
}
