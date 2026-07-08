/**
 * Vendored from mgrains (github.com/gdamdam/mgrains, same author,
 * AGPL-3.0-or-later) — the `GrainWindow` type extracted from
 * src/audio/contracts.ts @ commit 50cc17e, so windows.ts stays self-contained.
 * Kept byte-for-byte with upstream so it stays trivially re-syncable; do not
 * edit — change it upstream and re-copy.
 */

export type GrainWindow = 'hann' | 'percussive' | 'hard' | 'reverse' | 'morph'
