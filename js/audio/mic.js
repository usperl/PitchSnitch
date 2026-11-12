// Microphone input: getUserMedia with browser filters off, AudioWorklet ring buffer, frames every 10 ms.

export const FRAME_SIZE = 2048;
export const HOP_SECONDS = 0.01;

/** Error kinds for the user message. */
export function micErrorKind(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'noDevice';
  if (name === 'unsupported') return 'unsupported';
  return 'other';
}

export class MicInput {
  /**
   * @param {AudioContext} ctx
   * @param {(frame: Float32Array, endTime: number) => void} onFrame endTime = audio-clock time of the last sample
   * @throws an Error whose kind is given by micErrorKind()
   */
  async start(ctx, onFrame) {
    if (!navigator.mediaDevices?.getUserMedia || !ctx?.audioWorklet) throw Object.assign(new Error('unsupported'), { name: 'unsupported' });
    // echo cancellation, noise suppression and auto gain distort instrument sound
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(ctx, 'capture-processor', {
      processorOptions: { size: FRAME_SIZE, hop: Math.round(ctx.sampleRate * HOP_SECONDS) },
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.node);
    const blockSeconds = 128 / ctx.sampleRate; // worklet currentTime = start of the render quantum
    this.node.port.onmessage = ({ data }) => onFrame(data.frame, data.time + blockSeconds);
    const settings = this.stream.getAudioTracks()[0]?.getSettings?.() || {};
    this.inputLatency = typeof settings.latency === 'number' ? settings.latency : (ctx.baseLatency || 0);
    this.sampleRate = ctx.sampleRate;
  }

  stop() {
    if (this.node) this.node.port.onmessage = null;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.node = this.source = this.stream = null;
  }
}
