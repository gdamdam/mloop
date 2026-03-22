/**
 * WAV encoding/decoding utilities.
 *
 * Handles conversion between Float32Array audio buffers and the WAV
 * file format (RIFF container, 16-bit PCM). Supports LIST/INFO metadata
 * chunks for title, artist, software, and creation date.
 */

export interface WavMetadata {
  title?: string;    // INAM
  artist?: string;   // IART
  software?: string; // ISFT
  date?: string;     // ICRD
  comment?: string;  // ICMT
}

/**
 * Encode a mono Float32Array as a WAV file (16-bit PCM) with optional metadata.
 */
export function encodeWav(buffer: Float32Array, sampleRate = 44100, meta?: WavMetadata): ArrayBuffer {
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;

  // Build LIST/INFO chunk if metadata provided
  const infoChunk = meta ? buildInfoChunk(meta) : null;
  const infoSize = infoChunk ? infoChunk.byteLength : 0;

  const headerSize = 44;
  const totalSize = headerSize + infoSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF container header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);

  // LIST/INFO chunk (before data)
  let offset = 36;
  if (infoChunk) {
    new Uint8Array(arrayBuffer, offset, infoSize).set(new Uint8Array(infoChunk));
    offset += infoSize;
  }

  // data chunk
  writeString(view, offset, "data");
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;

  // Convert float samples to 16-bit PCM
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return arrayBuffer;
}

/**
 * Encode stereo Float32Array channels as WAV with optional metadata.
 * Used by master recorder (AudioEngine.encodeWav).
 */
export function encodeWavStereo(channels: Float32Array[], sampleRate: number, meta?: WavMetadata): ArrayBuffer {
  const numCh = channels.length;
  const len = channels[0].length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;

  const infoChunk = meta ? buildInfoChunk(meta) : null;
  const infoSize = infoChunk ? infoChunk.byteLength : 0;

  const totalSize = 44 + infoSize + dataSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);

  let offset = 36;
  if (infoChunk) {
    new Uint8Array(buf, offset, infoSize).set(new Uint8Array(infoChunk));
    offset += infoSize;
  }

  writeString(view, offset, "data");
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;

  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return buf;
}

/** Build a LIST/INFO RIFF chunk from metadata fields. */
function buildInfoChunk(meta: WavMetadata): ArrayBuffer {
  const tags: [string, string][] = [];
  if (meta.title) tags.push(["INAM", meta.title]);
  if (meta.artist) tags.push(["IART", meta.artist]);
  if (meta.software) tags.push(["ISFT", meta.software]);
  if (meta.date) tags.push(["ICRD", meta.date]);
  if (meta.comment) tags.push(["ICMT", meta.comment]);
  if (tags.length === 0) return new ArrayBuffer(0);

  // Calculate total size: "LIST" (4) + size (4) + "INFO" (4) + sum of sub-chunks
  // Each sub-chunk: tag (4) + size (4) + string bytes + null terminator + padding to even
  let bodySize = 4; // "INFO"
  for (const [, val] of tags) {
    const strLen = val.length + 1; // null-terminated
    const padded = strLen % 2 === 0 ? strLen : strLen + 1; // pad to even
    bodySize += 4 + 4 + padded; // tag + size + data
  }

  const buf = new ArrayBuffer(8 + bodySize);
  const view = new DataView(buf);
  let off = 0;

  writeString(view, off, "LIST"); off += 4;
  view.setUint32(off, bodySize, true); off += 4;
  writeString(view, off, "INFO"); off += 4;

  for (const [tag, val] of tags) {
    writeString(view, off, tag); off += 4;
    const strLen = val.length + 1;
    const padded = strLen % 2 === 0 ? strLen : strLen + 1;
    view.setUint32(off, strLen, true); off += 4;
    writeString(view, off, val); off += val.length;
    view.setUint8(off, 0); off++; // null terminator
    if (padded > strLen) { view.setUint8(off, 0); off++; } // padding byte
  }

  return buf;
}

/** Write an ASCII string into a DataView at a given byte offset. */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Decode any browser-supported audio file into a mono Float32Array.
 * Multi-channel files are downmixed by averaging all channels.
 */
export async function decodeAudioFile(file: File, ctx: AudioContext): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const len = audioBuffer.length;
  const mono = new Float32Array(len);
  const numCh = audioBuffer.numberOfChannels;
  for (let ch = 0; ch < numCh; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      mono[i] += data[i];
    }
  }
  for (let i = 0; i < len; i++) {
    mono[i] /= numCh;
  }
  return mono;
}

/** Trigger a file download from an ArrayBuffer via a temporary link element. */
export function downloadBlob(data: ArrayBuffer, filename: string, mime = "audio/wav"): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
