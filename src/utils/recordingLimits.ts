/**
 * Recording limits — safety guards to prevent giant files from
 * filling up IndexedDB storage or crashing the browser.
 *
 * Limits are configurable via the settings UI and persisted to localStorage.
 * The engine checks these before starting a recording.
 */

/** User-configurable recording constraints. */
export interface RecordingLimits {
  maxRecordingTimeSec: number;  // per track/pad, 0 = unlimited
  maxSessionSizeMB: number;     // total across all tracks, 0 = unlimited
}

const STORAGE_KEY = "mloop-recording-limits";

const DEFAULT_LIMITS: RecordingLimits = {
  maxRecordingTimeSec: 120, // 2 minutes per recording — generous but safe
  maxSessionSizeMB: 100,    // 100MB total — well within IndexedDB quotas
};

/** Preset options for the settings UI dropdowns. */
export const TIME_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "Unlimited" },
];

export const SIZE_OPTIONS = [
  { value: 50, label: "50 MB" },
  { value: 100, label: "100 MB" },
  { value: 200, label: "200 MB" },
  { value: 0, label: "Unlimited" },
];

/** Load limits from localStorage, falling back to defaults. */
export function loadLimits(): RecordingLimits {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_LIMITS, ...JSON.parse(stored) };
  } catch { /* corrupt data — use defaults */ }
  return { ...DEFAULT_LIMITS };
}

/** Persist limits to localStorage. */
export function saveLimits(limits: RecordingLimits): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
}

/**
 * Estimate total session size in MB from all active audio buffers.
 * Each Float32Array sample is 4 bytes.
 */
export function estimateSessionSizeMB(buffers: Float32Array[]): number {
  let totalBytes = 0;
  for (const b of buffers) {
    totalBytes += b.byteLength;
  }
  return totalBytes / (1024 * 1024);
}

/**
 * Convert max recording time to a sample count for the engine.
 * Returns 0 for unlimited (engine interprets 0 as no limit).
 */
export function maxRecordingSamples(limits: RecordingLimits, sampleRate: number): number {
  if (limits.maxRecordingTimeSec <= 0) return 0;
  return limits.maxRecordingTimeSec * sampleRate;
}
