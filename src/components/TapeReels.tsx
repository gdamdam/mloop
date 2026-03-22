/**
 * TapeReels — SVG reel-to-reel tape recorder animation.
 * Two spoked reels with dynamic spool size, tape path between them.
 * Reels spin when playing/recording, speed varies by state.
 */

interface TapeReelsProps {
  status: "empty" | "recording" | "playing" | "overdubbing" | "stopped";
  /** 0–1 progress through the loop (for spool size animation). */
  progress?: number;
}

/** Single reel SVG with 3 spokes + hub + spool. */
function Reel({ size, spokeColor, spinning, speed, direction }: {
  size: number; spokeColor: string; spinning: boolean; speed: string; direction: "cw" | "ccw";
}) {
  const r = size / 2;
  const hubR = r * 0.22;
  const spoolR = r * 0.85;
  const spokeW = r * 0.08;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{
      animation: spinning ? `tapeSpin${direction === "cw" ? "Left" : "Right"} ${speed} linear infinite` : "none",
    }}>
      {/* Spool ring */}
      <circle cx={r} cy={r} r={spoolR} fill="none" stroke={spokeColor} strokeWidth={1.5} opacity={0.3} />
      {/* Tape area (filled circle representing wound tape) */}
      <circle cx={r} cy={r} r={spoolR * 0.7} fill={spokeColor} opacity={0.08} />
      {/* 3 Spokes */}
      {[0, 120, 240].map(deg => {
        const rad = (deg * Math.PI) / 180;
        const x2 = r + Math.cos(rad) * (spoolR - 2);
        const y2 = r + Math.sin(rad) * (spoolR - 2);
        return (
          <line key={deg} x1={r} y1={r} x2={x2} y2={y2}
            stroke={spokeColor} strokeWidth={spokeW} strokeLinecap="round" opacity={0.5} />
        );
      })}
      {/* Hub (center circle) */}
      <circle cx={r} cy={r} r={hubR} fill={spokeColor} opacity={0.6} />
      {/* Hub hole */}
      <circle cx={r} cy={r} r={hubR * 0.4} fill="var(--bg-cell)" />
    </svg>
  );
}

export function TapeReels({ status }: TapeReelsProps) {
  const spinning = status === "playing" || status === "recording" || status === "overdubbing";
  const color = status === "recording" ? "var(--record)"
    : status === "overdubbing" ? "var(--overdub)"
    : status === "playing" ? "var(--playing)"
    : "var(--text-dim)";
  const speed = status === "recording" ? "2s" : "1.2s";
  const reelSize = 36;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      opacity: status === "empty" ? 0.3 : 1,
    }}>
      {/* Left reel (supply) */}
      <Reel size={reelSize} spokeColor={color} spinning={spinning} speed={speed} direction="cw" />
      {/* Tape path indicator (thin line between reels) */}
      <div style={{
        width: 8, height: 2, background: color,
        opacity: spinning ? 0.6 : 0.2,
        margin: "0 -2px",
      }} />
      {/* Right reel (take-up) */}
      <Reel size={reelSize} spokeColor={color} spinning={spinning} speed={speed} direction="ccw" />
    </div>
  );
}
