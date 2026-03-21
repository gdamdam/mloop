/** Reverse a Float32Array. */
export function reverseBuffer(buf: Float32Array): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[buf.length - 1 - i];
  }
  return out;
}

/** Mix multiple buffers into one, clamping to [-1, 1]. */
export function mixBuffers(buffers: Float32Array[]): Float32Array {
  if (buffers.length === 0) return new Float32Array(0);
  const len = buffers[0].length;
  const out = new Float32Array(len);
  for (const buf of buffers) {
    for (let i = 0; i < len; i++) {
      out[i] += buf[i];
    }
  }
  for (let i = 0; i < len; i++) {
    if (out[i] > 1) out[i] = 1;
    else if (out[i] < -1) out[i] = -1;
  }
  return out;
}

/** Normalize buffer to peak at 0.95. */
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

/** Trim or zero-pad a buffer to the target length. */
export function trimToLength(buf: Float32Array, length: number): Float32Array {
  if (buf.length === length) return buf;
  const out = new Float32Array(length);
  const copyLen = Math.min(buf.length, length);
  out.set(buf.subarray(0, copyLen));
  return out;
}
