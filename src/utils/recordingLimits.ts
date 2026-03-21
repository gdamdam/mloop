/**
 * Recording limits — prevent giant files filling storage.
 */

export interface RecordingLimits {
  maxRecordingTimeSec: number;  // per track/pad, 0 = unlimited
  maxSessionSizeMB: number;     // total, 0 = unlimited
}

const STORAGE_KEY = "mloop-recording-limits";

const DEFAULT_LIMITS: RecordingLimits = {
  maxRecordingTimeSec: 120, // 2 minutes per recording
  maxSessionSizeMB: 100,    // 100MB total
};

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

export function loadLimits(): RecordingLimits {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_LIMITS, ...JSON.parse(stored) };
  } catch { /* corrupt */ }
  return { ...DEFAULT_LIMITS };
}

export function saveLimits(limits: RecordingLimits): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
}

/** Estimate session size in MB from all track/pad buffers. */
export function estimateSessionSizeMB(buffers: Float32Array[]): number {
  let totalBytes = 0;
  for (const b of buffers) {
    totalBytes += b.byteLength;
  }
  return totalBytes / (1024 * 1024);
}

/** Convert max recording time to samples. */
export function maxRecordingSamples(limits: RecordingLimits, sampleRate: number): number {
  if (limits.maxRecordingTimeSec <= 0) return 0; // unlimited
  return limits.maxRecordingTimeSec * sampleRate;
}
