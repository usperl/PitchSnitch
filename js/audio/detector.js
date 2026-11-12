// Pitch detection: pitchy (McLeod) by default, own YIN as fallback.
// The only module that touches vendor/pitchy.
import { PitchDetector } from '../../vendor/pitchy/pitchy.js';
import { createYin, rms } from './yin.js';

/** Default thresholds for clarity and loudness. */
export const DETECTOR_DEFAULTS = Object.freeze({ minClarity: 0.85, minDb: -45, algorithm: 'pitchy' });

/**
 * @returns {(frame: Float32Array) => number|null} frequency in Hz, or null for silence/unclear signal
 */
export function createDetector(frameSize, sampleRate, options = {}) {
  const { minClarity, minDb, algorithm } = { ...DETECTOR_DEFAULTS, ...options };
  let detect;
  if (algorithm === 'yin') {
    const yin = createYin({ sampleRate, bufferSize: frameSize, minFreq: 45, maxFreq: 2200 });
    detect = (buf) => { const r = yin(buf); return [r.freq, r.clarity]; };
  } else {
    const mpm = PitchDetector.forFloat32Array(frameSize);
    mpm.minVolumeDecibels = -100; // loudness is checked below
    detect = (buf) => mpm.findPitch(buf, sampleRate);
  }
  return (buf) => {
    if (20 * Math.log10(rms(buf) + 1e-9) < minDb) return null;
    const [freq, clarity] = detect(buf);
    return freq > 0 && clarity >= minClarity ? freq : null;
  };
}
