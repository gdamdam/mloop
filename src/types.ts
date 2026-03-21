// ── Track state ──────────────────────────────────────────────────────────

export type TrackStatus = "empty" | "recording" | "playing" | "overdubbing" | "stopped";

export interface TrackState {
  id: number;
  status: TrackStatus;
  volume: number;    // 0–1
  muted: boolean;
  layers: number;    // count of recorded layers
  loopLengthSamples: number;
  isReversed: boolean;
  playbackRate: number;
}

// ── Engine state ─────────────────────────────────────────────────────────

export type TimingMode = "free" | "quantized";
export type SyncMode = "free" | "sync" | "lock";

export interface EngineState {
  started: boolean;
  tracks: TrackState[];
  masterLoopLength: number | null; // samples, set by first recording
  bpm: number;
  timingMode: TimingMode;
  syncMode: SyncMode;
  metronome: boolean;
  inputLevel: number; // 0–1, for mic input meter
}

export const NUM_TRACKS = 3;

export function createInitialState(): EngineState {
  return {
    started: false,
    tracks: Array.from({ length: NUM_TRACKS }, (_, i) => ({
      id: i,
      status: "empty" as TrackStatus,
      volume: 0.8,
      muted: false,
      layers: 0,
      loopLengthSamples: 0,
      isReversed: false,
      playbackRate: 1,
    })),
    masterLoopLength: null,
    bpm: 120,
    timingMode: "free",
    syncMode: "free",
    metronome: false,
    inputLevel: 0,
  };
}

// ── Commands ─────────────────────────────────────────────────────────────

export type LoopCommand =
  | { type: "track_record"; trackId: number }
  | { type: "track_stop"; trackId: number }
  | { type: "track_play"; trackId: number }
  | { type: "track_overdub"; trackId: number }
  | { type: "track_mute"; trackId: number }
  | { type: "track_clear"; trackId: number }
  | { type: "track_undo"; trackId: number }
  | { type: "track_reverse"; trackId: number }
  | { type: "track_half_speed"; trackId: number }
  | { type: "set_volume"; trackId: number; volume: number }
  | { type: "track_set_effect"; trackId: number; name: EffectName; params: Record<string, unknown> }
  | { type: "track_toggle_effect"; trackId: number; name: EffectName }
  | { type: "set_sync_mode"; mode: SyncMode }
  | { type: "set_bpm"; bpm: number }
  | { type: "tap_tempo" }
  | { type: "import_file"; trackId: number; buffer: Float32Array }
  | { type: "save_session"; name: string }
  | { type: "load_session"; name: string }
  | { type: "export_wav" }
  | { type: "export_session_file" }
  | { type: "import_session_file" }
  | { type: "pin_session" }
  | { type: "share_link" }
  | { type: "set_timing_mode"; mode: TimingMode }
  | { type: "toggle_metronome" }
  | { type: "stop_all" }
  | { type: "play_all" }
  | { type: "state_sync"; state: Partial<EngineState> };

// ── Effects (ported from mpump) ──────────────────────────────────────────

export type EffectName = "lowpass" | "compressor" | "highpass" | "distortion" | "bitcrusher" | "chorus" | "phaser" | "delay" | "reverb";

export interface EffectParams {
  lowpass: { on: boolean; cutoff: number; q: number };
  delay: { on: boolean; time: number; feedback: number; mix: number; sync: boolean; division: string };
  distortion: { on: boolean; drive: number };
  reverb: { on: boolean; decay: number; mix: number };
  compressor: { on: boolean; threshold: number; ratio: number };
  highpass: { on: boolean; cutoff: number; q: number };
  chorus: { on: boolean; rate: number; depth: number; mix: number };
  phaser: { on: boolean; rate: number; depth: number };
  bitcrusher: { on: boolean; bits: number };
}

export const DEFAULT_EFFECTS: EffectParams = {
  lowpass: { on: false, cutoff: 8000, q: 1 },
  delay: { on: false, time: 0.3, feedback: 0.4, mix: 0.3, sync: true, division: "1/16" },
  distortion: { on: false, drive: 20 },
  reverb: { on: false, decay: 2, mix: 0.3 },
  compressor: { on: false, threshold: -24, ratio: 4 },
  highpass: { on: false, cutoff: 200, q: 1 },
  chorus: { on: false, rate: 1.5, depth: 0.003, mix: 0.3 },
  phaser: { on: false, rate: 0.5, depth: 1000 },
  bitcrusher: { on: false, bits: 8 },
};
