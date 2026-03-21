/**
 * WAV encoding/decoding utilities.
 *
 * Handles conversion between Float32Array audio buffers and the WAV
 * file format (RIFF container, 16-bit PCM). Used for export and
 * for triggering browser downloads.
 */

/**
 * Encode a mono Float32Array as a WAV file (16-bit PCM).
 * Writes the standard 44-byte RIFF/WAV header followed by sample data.
 */
export function encodeWav(buffer: Float32Array, sampleRate = 44100): ArrayBuffer {
  const numSamples = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF container header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true); // file size minus RIFF header
  writeString(view, 8, "WAVE");

  // fmt chunk — describes the audio format
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size (PCM = 16 bytes)
  view.setUint16(20, 1, true);  // format tag: 1 = PCM (uncompressed)
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk — raw PCM samples
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Convert float samples (-1 to 1) to 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    // Asymmetric scaling: negative range is 0x8000, positive is 0x7FFF
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return arrayBuffer;
}

/** Write an ASCII string into a DataView at a given byte offset. */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Decode any browser-supported audio file into a mono Float32Array.
 * Uses the Web Audio API's decodeAudioData for format support (MP3, WAV, OGG, etc.).
 * Multi-channel files are downmixed by averaging all channels.
 */
export async function decodeAudioFile(file: File, ctx: AudioContext): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Downmix multi-channel to mono by averaging
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
