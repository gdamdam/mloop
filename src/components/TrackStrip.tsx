import { useCallback } from "react";
import type { TrackState, LoopCommand, EffectName } from "../types";
import { DEFAULT_EFFECTS } from "../types";
import { EffectRack } from "./EffectRack";
import { WaveformDisplay } from "./WaveformDisplay";
import { FileImport } from "./FileImport";
import type { AudioEngine } from "../engine/AudioEngine";
import type { PadEngine } from "../engine/PadEngine";
import { SoundDNA } from "./SoundDNA";

interface TrackStripProps {
  track: TrackState;
  command: (cmd: LoopCommand) => void;
  engine: AudioEngine | null;
  padEngine?: PadEngine | null;
}

export function TrackStrip({ track, command, engine, padEngine }: TrackStripProps) {
  const { id, status, volume, muted, layers, isReversed, playbackRate, loopLengthSamples } = track;

  const effects = engine?.tracks[id]?.getEffects() ?? DEFAULT_EFFECTS;
  const bufferData = engine?.tracks[id]?.getMixedData() ?? null;
  const inputAnalyser = engine?.getInputAnalyser() ?? null;

  const handleToggleEffect = useCallback((name: EffectName) => {
    command({ type: "track_toggle_effect", trackId: id, name });
  }, [command, id]);

  const handleSetParams = useCallback((name: EffectName, params: Record<string, unknown>) => {
    command({ type: "track_set_effect", trackId: id, name, params });
  }, [command, id]);

  return (
    <div className="track-strip">
      <div className="track-header">
        <div className="track-label">
          <div className={`track-status ${status}`} />
          <SoundDNA buffer={bufferData} size={24} />
          <span>TRACK {id + 1}</span>
          {layers > 0 && (
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {layers} layer{layers !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Reverse + Half-speed toggles */}
        {layers > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              style={{
                fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 4,
                background: isReversed ? "var(--preview)" : "var(--bg-cell)",
                color: isReversed ? "var(--bg)" : "var(--text-dim)",
              }}
              onClick={() => command({ type: "track_reverse", trackId: id })}
              title="Reverse"
            >
              REV
            </button>
            <button
              style={{
                fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 4,
                background: playbackRate === 0.5 ? "var(--overdub)" : "var(--bg-cell)",
                color: playbackRate === 0.5 ? "var(--bg)" : "var(--text-dim)",
              }}
              onClick={() => command({ type: "track_half_speed", trackId: id })}
              title="Half Speed"
            >
              ½×
            </button>
            {/* Copy track buffer to next empty pad slot */}
            {padEngine && (
              <button
                style={{
                  fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 4,
                  background: "var(--bg-cell)", color: "var(--text-dim)",
                }}
                onClick={() => {
                  const data = engine?.tracks[id]?.getMixedData();
                  if (!data || !padEngine) return;
                  const emptySlot = padEngine.slots.find(s => s.status === "empty");
                  if (emptySlot) {
                    padEngine.importBuffer(emptySlot.id, new Float32Array(data));
                  } else {
                    alert("No empty pad slots available");
                  }
                }}
                title="Copy to next empty pad"
              >
                →PAD
              </button>
            )}
          </div>
        )}
      </div>

      <WaveformDisplay
        bufferData={bufferData}
        status={status}
        loopLengthSamples={loopLengthSamples}
        analyser={status === "recording" ? inputAnalyser : null}
      />

      <div className="transport-row">
        <button
          className={`transport-btn ${status === "recording" ? "active-record" : ""}`}
          onClick={() => command(
            status === "recording"
              ? { type: "track_stop", trackId: id }
              : { type: "track_record", trackId: id }
          )}
          title="Record"
        >
          ●
        </button>
        <button
          className={`transport-btn ${status === "playing" ? "active-play" : ""}`}
          onClick={() => command(
            status === "playing"
              ? { type: "track_stop", trackId: id }
              : { type: "track_play", trackId: id }
          )}
          disabled={layers === 0}
          title="Play"
        >
          ▶
        </button>
        <button
          className={`transport-btn ${status === "overdubbing" ? "active-overdub" : ""}`}
          onClick={() => command(
            status === "overdubbing"
              ? { type: "track_stop", trackId: id }
              : { type: "track_overdub", trackId: id }
          )}
          disabled={layers === 0}
          title="Overdub"
        >
          ◎
        </button>
        <button
          className={`transport-btn ${muted ? "muted" : ""}`}
          onClick={() => command({ type: "track_mute", trackId: id })}
          disabled={layers === 0}
          title="Mute"
        >
          M
        </button>
        <button
          className="transport-btn"
          onClick={() => command({ type: "track_undo", trackId: id })}
          disabled={layers < 2}
          title="Undo last layer"
          style={{ fontSize: 14 }}
        >
          ↩
        </button>
        <button
          className="transport-btn"
          onClick={() => command({ type: "track_clear", trackId: id })}
          disabled={layers === 0}
          title="Clear"
          style={{ fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <div className="volume-control" style={{ marginTop: 8 }}>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => command({ type: "set_volume", trackId: id, volume: parseFloat(e.target.value) })}
        />
        <span className="volume-label">{Math.round(volume * 100)}%</span>
      </div>

      {/* Destruction mode — progressive loop degradation */}
      {layers > 0 && (
        <div className="volume-control" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-dim)", minWidth: 36 }}>DECAY</span>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={engine?.tracks[id]?.destruction.amount ?? 0}
            onChange={(e) => {
              const track = engine?.tracks[id];
              if (track) track.destruction.amount = parseFloat(e.target.value);
            }}
          />
          <span className="volume-label">
            {Math.round((engine?.tracks[id]?.destruction.amount ?? 0) * 100)}%
          </span>
        </div>
      )}

      <EffectRack
        trackId={id}
        effects={effects}
        onToggle={handleToggleEffect}
        onSetParams={handleSetParams}
      />

      <FileImport
        onFileLoaded={(buffer) => command({ type: "import_file", trackId: id, buffer })}
        disabled={layers > 0}
      />
    </div>
  );
}
