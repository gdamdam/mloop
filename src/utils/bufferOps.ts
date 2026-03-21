/**
 * Audio buffer operations — pure functions for manipulating Float32Array PCM data.
 *
 * All functions return new arrays (no mutation) and assume mono audio.
 * Used by LoopTrack for buffer manipulation and by export for mixdown.
 */

/** Reverse a Float32Array (returns a new array). */
export function reverseBuffer(buf: Float32Array): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[buf.length - 1 - i];
  }
  return out;
}

/**
 * Mix multiple buffers into one by summing samples.
 * All buffers must be the same length. Output is clamped to [-1, 1]
 * to prevent digital clipping when layers stack.
 */
export function mixBuffers(buffers: Float32Array[]): Float32Array {
  if (buffers.length === 0) return new Float32Array(0);
  const len = buffers[0].length;
  const out = new Float32Array(len);
  for (const buf of buffers) {
    for (let i = 0; i < len; i++) {
      out[i] += buf[i];
    }
  }
  // Hard clamp to prevent overflow artifacts
  for (let i = 0; i < len; i++) {
    if (out[i] > 1) out[i] = 1;
    else if (out[i] < -1) out[i] = -1;
  }
  return out;
}

/**
 * Normalize buffer so peak amplitude reaches 0.95.
 * Preserves dynamics — just scales everything uniformly.
 * Returns original buffer unchanged if it's silent (all zeros).
 */
export function normalizeBuffer(buf: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
  }
  if (peak === 0) return buf;
  const scale = 0.95 / peak;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] * scale;
  }
  return out;
}

/**
 * Trim or zero-pad a buffer to the target length.
 * Used to conform imported/recorded audio to the master loop length.
 */
export function trimToLength(buf: Float32Array, length: number): Float32Array {
  if (buf.length === length) return buf;
  const out = new Float32Array(length);
  const copyLen = Math.min(buf.length, length);
  out.set(buf.subarray(0, copyLen));
  return out;
}
