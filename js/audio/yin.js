// Minimal YIN pitch detector (de Cheveigné & Kawahara 2002).
// ESM, no dependencies, works in browser and Node.
//
// detect(buf) returns { freq, clarity } where clarity = 1 - d'(tau) in [0, 1]
// (1 = perfectly periodic). freq is 0 if nothing periodic was found.

export function createYin({ sampleRate, bufferSize, threshold = 0.15, minFreq = 50, maxFreq = 2200 }) {
  const half = Math.floor(bufferSize / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(half - 1, Math.ceil(sampleRate / minFreq));
  const d = new Float32Array(tauMax + 2);

  return function detect(buf) {
    // 1+2: difference function and cumulative mean normalized difference
    d[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let sum = 0;
      for (let i = 0; i < half; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      runningSum += sum;
      d[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum;
    }

    // 3: absolute threshold — first dip below threshold, then walk to its local minimum
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) {
      // no dip below threshold: report global minimum as low-clarity candidate
      let best = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
      tau = best;
    }

    // 4: parabolic interpolation
    let betterTau = tau;
    if (tau > 1 && tau < tauMax + 1) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const denom = 2 * s1 - s2 - s0;
      if (denom !== 0) betterTau = tau + (s2 - s0) / (2 * denom);
    }
    const clarity = Math.max(0, 1 - d[tau]);
    return { freq: sampleRate / betterTau, clarity };
  };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
