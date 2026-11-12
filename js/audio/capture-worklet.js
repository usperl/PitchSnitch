// AudioWorklet: keeps a ring buffer and posts the latest `size` samples every `hop` samples.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { size = 2048, hop = 480 } = options.processorOptions || {};
    this.size = size;
    this.hop = hop;
    this.ring = new Float32Array(size);
    this.pos = 0;
    this.sinceHop = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.ring[this.pos] = ch[i];
      this.pos = (this.pos + 1) % this.size;
    }
    this.sinceHop += ch.length;
    if (this.sinceHop >= this.hop) {
      this.sinceHop = 0;
      const frame = new Float32Array(this.size);
      frame.set(this.ring.subarray(this.pos));
      frame.set(this.ring.subarray(0, this.pos), this.size - this.pos);
      // currentTime = context time at the end of this block
      this.port.postMessage({ frame, time: currentTime }, [frame.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
