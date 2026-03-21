/**
 * Share link — encode/decode session settings into a URL hash.
 *
 * Audio buffers are far too large for URLs, so we only encode
 * configuration (BPM, effects, timing/sync mode). The recipient
 * gets the same setup but needs to record their own audio.
 *
 * Encoding: JSON → UTF-8 → base64 → URL hash fragment.
 * Full audio sharing would require a paste service or WebRTC.
 */

/** Compact serialization format for the URL hash payload. */
interface ShareData {
  v: number;        // schema version (for forward compat)
  bpm: number;
  tm: string;       // timing mode (abbreviated to save URL space)
  sm: string;       // sync mode
  fx: Record<string, unknown>; // effect params from track 0
}

/**
 * Encode current settings into a shareable URL.
 * Returns a full URL with the payload in the hash fragment.
 */
export function encodeShareLink(data: {
  bpm: number;
  timingMode: string;
  syncMode: string;
  effects: Record<string, unknown>;
}): string {
  const payload: ShareData = {
    v: 1,
    bpm: data.bpm,
    tm: data.timingMode,
    sm: data.syncMode,
    fx: data.effects,
  };
  const json = JSON.stringify(payload);
  // btoa requires Latin-1 input — escape Unicode via encodeURIComponent first
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`;
}

/**
 * Decode a share link hash back into settings.
 * Returns null if the hash is missing, malformed, or wrong version.
 */
export function decodeShareLink(hash: string): ShareData | null {
  try {
    const match = hash.match(/#share=(.+)/);
    if (!match) return null;
    const json = decodeURIComponent(escape(atob(match[1])));
    const data = JSON.parse(json) as ShareData;
    if (data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}
