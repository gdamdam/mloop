/**
 * Latency helpers — an honest, measured round-trip estimate.
 *
 * The Web Audio pipeline adds latency no app code can remove: baseLatency (the
 * context's internal processing buffer) plus outputLatency (the OS/hardware
 * output path). Their sum is the practical round-trip floor a performer hears.
 * Both fields are optional in the spec and absent in some browsers, so we guard
 * each independently — mirroring AudioEngine's read at initMic (AudioEngine.ts
 * ~L499).
 */

/** The subset of AudioContext we read for the latency estimate. */
export interface LatencySource {
  baseLatency?: number;
  outputLatency?: number;
}

/**
 * Measured round-trip latency estimate in milliseconds:
 * `(baseLatency + outputLatency) * 1000`. Missing fields (or a missing context)
 * count as 0 rather than throwing.
 */
export function roundTripLatencyMs(ctx: LatencySource | null | undefined): number {
  const base = ctx?.baseLatency ?? 0;
  const output = ctx?.outputLatency ?? 0;
  return (base + output) * 1000;
}
