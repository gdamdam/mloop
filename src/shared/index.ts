/**
 * Candidate shared module — primitives that are reusable between
 * mloop and mpump.
 *
 * This is a barrel file only: it re-exports existing implementations
 * from their current homes so the "shared surface" is visible in one
 * place. Nothing here is a duplicate — if you need to edit behavior,
 * edit the source file, not this barrel.
 *
 * Why this exists: P3 of the mloop/mpump parity plan calls for
 * extracting these primitives into a real shared package. mpump is
 * currently treated as read-only from mloop's side, so this module
 * sits in mloop for now and documents the extraction target. When the
 * time comes to split it out (npm workspace / pnpm / git subtree),
 * this file is the contract.
 *
 * Extraction target: `@mpump/audio-core` (or similar) containing:
 *   - EffectsChain        — 9-effect per-track pipeline
 *   - DestructionEngine   — progressive tape degradation
 *   - GestureRecorder     — touch/XY gesture capture + playback
 *   - encodeWav           — 16-bit PCM WAV encoder
 *   - encodeShareLink / decodeShareLink — URL-encoded session codec
 *   - mixBuffers          — Float32Array summing helper
 *   - ReverbType + reverb IR generation (currently inlined in EffectsChain)
 */

export { EffectsChain } from "../engine/EffectsChain";
export { DestructionEngine } from "../engine/DestructionEngine";
export { GestureRecorder } from "../engine/GestureRecorder";
export { encodeWav } from "../utils/wav";
export { encodeShareLink, decodeShareLink } from "../utils/shareLink";
export { mixBuffers } from "../utils/bufferOps";

export type { EffectParams, EffectName, ReverbType } from "../types";
