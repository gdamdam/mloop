/**
 * Standard MIDI File (.mid) import and export for the pad sequencer.
 *
 * Export: builds a Format 0 (single track) SMF with tempo meta-event
 * and note events on channel 10 (drums). Each sequencer step maps to
 * a 16th note.
 *
 * Import: parses an SMF, quantizes note-on events to the nearest 16th
 * note grid position, and returns a boolean[][] grid.
 */

// GM drum map for pads 0-7, then chromatic 48-55 for pads 8-15
const PAD_TO_NOTE: number[] = [
  36, // 0: kick
  38, // 1: snare
  42, // 2: closed hi-hat
  39, // 3: clap / hand clap
  46, // 4: open hi-hat
  45, // 5: low tom
  48, // 6: hi mid tom
  51, // 7: ride cymbal
  // Pads 8-15: chromatic range for melodic/misc
  48, 49, 50, 51, 52, 53, 54, 55,
];

// Reverse map: MIDI note -> pad index (first match wins)
const NOTE_TO_PAD = new Map<number, number>();
// Build reverse map — earlier pads take priority on collision
for (let i = PAD_TO_NOTE.length - 1; i >= 0; i--) {
  NOTE_TO_PAD.set(PAD_TO_NOTE[i], i);
}

const TICKS_PER_QUARTER = 480;
const TICKS_PER_16TH = TICKS_PER_QUARTER / 4; // 120

// ---------------------------------------------------------------------------
// Variable-length quantity encoding (MIDI spec)
// ---------------------------------------------------------------------------
function encodeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}

function writeString(out: number[], str: string) {
  for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
}

function write32(out: number[], val: number) {
  out.push((val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff);
}

function write16(out: number[], val: number) {
  out.push((val >> 8) & 0xff, val & 0xff);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Create a Standard MIDI File (Format 0) from the sequencer grid.
 */
export function exportMidi(grid: boolean[][], numSteps: number, bpm: number): Blob {
  const out: number[] = [];

  // --- MThd header ---
  writeString(out, "MThd");
  write32(out, 6);             // header length
  write16(out, 0);             // format 0
  write16(out, 1);             // 1 track
  write16(out, TICKS_PER_QUARTER); // ticks per quarter note

  // --- MTrk (build track data first, then prepend header) ---
  const trk: number[] = [];

  // Tempo meta event: FF 51 03 tt tt tt  (microseconds per quarter note)
  const usPerQuarter = Math.round(60_000_000 / bpm);
  trk.push(...encodeVLQ(0)); // delta = 0
  trk.push(0xff, 0x51, 0x03);
  trk.push((usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);

  // Collect all note-on/off events, sort by tick then by type (note-on before note-off at same tick)
  const events: { tick: number; status: number; note: number; vel: number }[] = [];
  const NOTE_DURATION = TICKS_PER_16TH - 1; // slightly shorter than a 16th to avoid overlap

  for (let step = 0; step < numSteps; step++) {
    const tick = step * TICKS_PER_16TH;
    for (let pad = 0; pad < 16; pad++) {
      if (grid[step]?.[pad]) {
        const note = PAD_TO_NOTE[pad] ?? (36 + pad);
        events.push({ tick, status: 0x99, note, vel: 100 });           // note-on ch10
        events.push({ tick: tick + NOTE_DURATION, status: 0x89, note, vel: 0 }); // note-off ch10
      }
    }
  }

  // Sort: by tick ascending, then note-off before note-on at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    // note-off (0x8x) before note-on (0x9x) at same tick
    return a.status - b.status;
  });

  // Write events with delta times
  let prevTick = 0;
  for (const ev of events) {
    const delta = ev.tick - prevTick;
    trk.push(...encodeVLQ(delta));
    trk.push(ev.status, ev.note, ev.vel);
    prevTick = ev.tick;
  }

  // End-of-track meta event: FF 2F 00
  trk.push(...encodeVLQ(0));
  trk.push(0xff, 0x2f, 0x00);

  // Write MTrk header + track data
  writeString(out, "MTrk");
  write32(out, trk.length);
  out.push(...trk);

  return new Blob([new Uint8Array(out)], { type: "audio/midi" });
}

/**
 * Export and trigger a browser download of "mloop-pattern.mid".
 */
export function exportMidiDownload(grid: boolean[][], numSteps: number, bpm: number): void {
  const blob = exportMidi(grid, numSteps, bpm);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mloop-pattern.mid";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Read a big-endian uint32 from a DataView. */
function read32(view: DataView, off: number): number {
  return view.getUint32(off, false);
}

/** Read a big-endian uint16 from a DataView. */
function read16(view: DataView, off: number): number {
  return view.getUint16(off, false);
}

/** Read a variable-length quantity, return [value, bytesConsumed]. */
function readVLQ(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let len = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (offset + len >= data.length) break;
    const byte = data[offset + len];
    value = (value << 7) | (byte & 0x7f);
    len++;
    if ((byte & 0x80) === 0) break;
  }
  return [value, len];
}

/** Read 4 ASCII chars as a string. */
function readChunkId(data: Uint8Array, off: number): string {
  return String.fromCharCode(data[off], data[off + 1], data[off + 2], data[off + 3]);
}

/**
 * Parse a Standard MIDI File and return a sequencer grid + step count.
 * Quantizes note-on events to the nearest 16th-note grid position.
 */
export async function importMidi(file: File): Promise<{ grid: boolean[][]; numSteps: number }> {
  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  const view = new DataView(buf);

  // --- Validate MThd ---
  if (readChunkId(data, 0) !== "MThd") {
    throw new Error("Not a valid MIDI file (missing MThd header)");
  }
  const headerLen = read32(view, 4);
  const ticksPerQN = read16(view, 12);
  if (ticksPerQN & 0x8000) {
    throw new Error("SMPTE time division not supported");
  }

  const ticksPer16th = ticksPerQN / 4;

  // --- Parse all tracks ---
  // Collect note-on events with their absolute tick position
  const noteOns: { tick: number; note: number }[] = [];
  let maxTick = 0;
  let offset = 8 + headerLen;

  while (offset < data.length) {
    if (offset + 8 > data.length) break;
    const chunkId = readChunkId(data, offset);
    const chunkLen = read32(view, offset + 4);
    offset += 8;

    if (chunkId !== "MTrk") {
      // Skip non-track chunks
      offset += chunkLen;
      continue;
    }

    const trackEnd = offset + chunkLen;
    let tick = 0;
    let runningStatus = 0;

    while (offset < trackEnd) {
      // Delta time
      const [delta, vlqLen] = readVLQ(data, offset);
      offset += vlqLen;
      tick += delta;

      if (offset >= trackEnd) break;

      let statusByte = data[offset];

      // Meta event
      if (statusByte === 0xff) {
        offset++; // skip 0xFF
        if (offset >= trackEnd) break;
        offset++; // skip meta type
        const [metaLen, metaVlqLen] = readVLQ(data, offset);
        offset += metaVlqLen + metaLen;
        continue;
      }

      // SysEx
      if (statusByte === 0xf0 || statusByte === 0xf7) {
        offset++; // skip status
        const [sysexLen, sysexVlqLen] = readVLQ(data, offset);
        offset += sysexVlqLen + sysexLen;
        continue;
      }

      // Running status: if high bit not set, reuse previous status
      if ((statusByte & 0x80) === 0) {
        statusByte = runningStatus;
      } else {
        runningStatus = statusByte;
        offset++;
      }

      const type = statusByte & 0xf0;

      // Channel messages
      if (type === 0x80 || type === 0x90 || type === 0xa0 || type === 0xb0 || type === 0xe0) {
        // 2 data bytes
        const d1 = data[offset++];
        const d2 = data[offset++];
        // Note-on with velocity > 0
        if (type === 0x90 && d2 > 0) {
          noteOns.push({ tick, note: d1 });
          if (tick > maxTick) maxTick = tick;
        }
      } else if (type === 0xc0 || type === 0xd0) {
        // 1 data byte
        offset++;
      }
    }

    offset = trackEnd;
  }

  // --- Quantize to grid ---
  // Determine total steps from maxTick
  const rawSteps = Math.ceil((maxTick + 1) / ticksPer16th);
  // Round up to nearest valid step count (8, 16, 32, 64)
  const STEP_OPTIONS = [8, 16, 32, 64];
  let numSteps = STEP_OPTIONS[STEP_OPTIONS.length - 1];
  for (const opt of STEP_OPTIONS) {
    if (rawSteps <= opt) { numSteps = opt; break; }
  }

  const grid: boolean[][] = Array.from({ length: 64 }, () => Array(16).fill(false));

  for (const { tick, note } of noteOns) {
    const step = Math.round(tick / ticksPer16th);
    if (step < 0 || step >= numSteps) continue;
    const pad = NOTE_TO_PAD.get(note);
    if (pad !== undefined) {
      grid[step][pad] = true;
    }
    // Notes not in our map are silently ignored
  }

  return { grid, numSteps };
}
