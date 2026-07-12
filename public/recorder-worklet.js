/**
 * RecorderWorkletProcessor — runs on the audio thread.
 * Streams each filled chunk to the main thread (transferred) as it fills,
 * then posts the remaining tail when stopped. The main thread accumulates
 * chunks and sends a fresh buffer back for each one, so process() never
 * allocates: allocating ~880KB inside process() every ~5s caused GC
 * pressure on the audio thread (audible underrun click).
 */

const CHUNK_SIZE = 44100 * 5;

class RecorderWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Two pre-allocated buffers: fill one while the main thread's
    // replacement for the transferred one is still in flight.
    this.current = new Float32Array(CHUNK_SIZE);
    this.pool = [new Float32Array(CHUNK_SIZE)];
    this.writePos = 0;
    this.recording = false;
    this.stopped = false;

    this.port.onmessage = (e) => {
      if (e.data.type === "start") {
        this.writePos = 0;
        this.recording = true;
      } else if (e.data.type === "replace") {
        // Main thread returns a same-size buffer for each transferred chunk
        this.pool.push(new Float32Array(e.data.buffer));
      } else if (e.data.type === "stop") {
        this.recording = false;
        // Only the unfilled tail — full chunks were already streamed out
        const tail = new Float32Array(this.writePos);
        tail.set(this.current.subarray(0, this.writePos));
        this.port.postMessage({ type: "buffer", buffer: tail }, [tail.buffer]);
        this.writePos = 0;
        // Each recording gets a fresh node; let this processor die —
        // returning true forever would pin it on the audio thread.
        this.stopped = true;
      }
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    if (!this.recording) return true;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const numChannels = input.length;
    const blockSize = input[0].length;

    for (let i = 0; i < blockSize; i++) {
      let sample = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sample += input[ch][i];
      }
      sample /= numChannels;

      this.current[this.writePos++] = sample;

      if (this.writePos >= CHUNK_SIZE) {
        this.port.postMessage({ type: "chunk", buffer: this.current }, [this.current.buffer]);
        // Replacement round-trips in ms while a chunk takes ~5s to fill, so
        // the pool is never empty in practice; allocate only as a safety net.
        this.current = this.pool.pop() || new Float32Array(CHUNK_SIZE);
        this.writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("recorder-worklet", RecorderWorkletProcessor);
