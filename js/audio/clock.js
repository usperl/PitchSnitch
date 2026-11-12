// Single time base for display and evaluation: AudioContext.currentTime.
// The same AudioContext carries the microphone input.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AudioClock {
  /**
   * Creates the AudioContext and tries to resume it. Without a user gesture (e.g. URL parameter
   * autostart) browsers may keep it suspended; resume() then never settles, hence the timeout.
   * @returns {Promise<boolean>} true if the audio clock is running
   */
  async start() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.t0 = performance.now();
    if (!Ctx) return false;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await Promise.race([this.ctx.resume().catch(() => {}), sleep(300)]);
    return this.running;
  }

  get running() { return this.ctx?.state === 'running'; }

  /** Resumes after a user gesture (call from a click/keydown handler). */
  async resume() {
    if (this.ctx && !this.running) await this.ctx.resume().catch(() => {});
    return this.running;
  }

  /** Seconds, monotonic. Falls back to performance.now() if there is no running audio clock. */
  now() {
    if (this.running) return this.ctx.currentTime;
    return (performance.now() - this.t0) / 1000;
  }

  close() {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
