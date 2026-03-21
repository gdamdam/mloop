/**
 * RecorderWorkletProcessor — runs on the audio thread.
 * Accumulates incoming audio into a growing buffer and posts it
 * back to the main thread when stopped.
 */

// Pre-allocate in 5-second chunks (~220K samples at 44.1kHz)
const CHUNK_SIZE = 44100 * 5;

class RecorderWorkletProcessor extends AudioWorkletProcessor {
  private chunks: Float32Array[] = [];
  private current: Float32Array = new Float32Array(CHUNK_SIZE);
  private writePos = 0;
  private recording = false;
  private totalSamples = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "start") {
        this.chunks = [];
        this.current = new Float32Array(CHUNK_SIZE);
        this.writePos = 0;
        this.totalSamples = 0;
        this.recording = true;
      } else if (e.data.type === "stop") {
        this.recording = false;
        // Assemble final buffer
        const result = new Float32Array(this.totalSamples);
        let offset = 0;
        for (const chunk of this.chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        // Copy remaining from current chunk
        result.set(this.current.subarray(0, this.writePos), offset);
        this.port.postMessage({ type: "buffer", buffer: result }, [result.buffer]);
        this.chunks = [];
        this.current = new Float32Array(CHUNK_SIZE);
        this.writePos = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.recording) return true;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Mono downmix: average all channels
    const numChannels = input.length;
    const blockSize = input[0].length;

    for (let i = 0; i < blockSize; i++) {
      let sample = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sample += input[ch][i];
      }
      sample /= numChannels;

      this.current[this.writePos++] = sample;
      this.totalSamples++;

      // Chunk full — push and start new one
      if (this.writePos >= CHUNK_SIZE) {
        this.chunks.push(this.current);
        this.current = new Float32Array(CHUNK_SIZE);
        this.writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("recorder-worklet", RecorderWorkletProcessor);
