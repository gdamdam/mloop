import { useCallback, useState } from "react";
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

      {/* Tape recorder visual: two reels flanking the waveform */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "4px 0" }}>
        <TapeReel spinning={status === "playing" || status === "recording" || status === "overdubbing"} direction="left" status={status} />
        <div style={{ flex: 1 }}>
          <WaveformDisplay
            bufferData={bufferData}
            status={status}
            loopLengthSamples={loopLengthSamples}
            analyser={status === "recording" ? inputAnalyser : null}
          />
        </div>
        <TapeReel spinning={status === "playing" || status === "recording" || status === "overdubbing"} direction="right" status={status} />
      </div>

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

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 7, color: "var(--text-dim)" }}>VOL</span>
        <input type="range" className="volume-slider" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => command({ type: "set_volume", trackId: id, volume: parseFloat(e.target.value) })}
          style={{ flex: 1, maxWidth: 80 }} />
        <span style={{ fontSize: 8, color: "var(--preview)", fontWeight: 700, minWidth: 24 }}>{Math.round(volume * 100)}%</span>
      </div>

      {/* Destruction mode — progressive loop degradation */}
      {layers > 0 && <DecaySlider engine={engine} trackId={id} />}

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

/** Decay slider with local state so it updates visually on drag. */
/** Tape reel visual — spinning circle that animates during playback. */
function TapeReel({ spinning, direction, status }: { spinning: boolean; direction: "left" | "right"; status: string }) {
  const color = status === "recording" ? "var(--record)"
    : status === "overdubbing" ? "var(--overdub)"
    : status === "playing" ? "var(--playing)"
    : "var(--border)";
  const speed = status === "recording" ? "1.5s" : "1s";
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      border: `2px solid ${color}`,
      background: "var(--bg-cell)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: spinning ? `tapeSpin${direction === "left" ? "Left" : "Right"} ${speed} linear infinite` : "none",
      position: "relative",
    }}>
      {/* Hub */}
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        background: color, opacity: spinning ? 1 : 0.3,
      }} />
      {/* Spokes */}
      {[0, 120, 240].map(deg => (
        <div key={deg} style={{
          position: "absolute", width: 1, height: 10,
          background: color, opacity: 0.4,
          transform: `rotate(${deg}deg)`, transformOrigin: "center center",
        }} />
      ))}
    </div>
  );
}

function DecaySlider({ engine, trackId }: { engine: AudioEngine | null; trackId: number }) {
  const [value, setValue] = useState(() => engine?.tracks[trackId]?.destruction.amount ?? 0);
  return (
    <div className="volume-control" style={{ marginTop: 4 }}>
      <span style={{ fontSize: 9, color: "var(--text-dim)", minWidth: 36 }}>DECAY</span>
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setValue(v);
          const track = engine?.tracks[trackId];
          if (track) track.destruction.amount = v;
        }}
      />
      <span className="volume-label">{Math.round(value * 100)}%</span>
    </div>
  );
}
