/**
 * Share link — encode/decode session state into a URL hash.
 *
 * For sessions with audio, the buffers are too large for a URL.
 * We encode only the settings (BPM, effects, timing/sync mode)
 * so the recipient gets the same configuration but no audio.
 * Full audio sharing would require a paste service or WebRTC.
 */

interface ShareData {
  v: number;        // version
  bpm: number;
  tm: string;       // timing mode
  sm: string;       // sync mode
  fx: Record<string, unknown>; // effect params from first track
}

/** Encode current settings into a URL hash string. */
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
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`;
}

/** Decode a share link hash back into settings. Returns null if invalid. */
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
