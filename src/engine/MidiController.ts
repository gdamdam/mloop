/**
 * MidiController — Web MIDI API integration for hardware controllers.
 *
 * Supports foot pedals, pad controllers, and expression pedals.
 * Features MIDI learn mode: user triggers a physical control and the
 * app captures the CC/note number + channel for binding to an action.
 *
 * Mappings are persisted to localStorage so they survive page reloads.
 */

/** All bindable MIDI actions — per-track controls + global transport. */
export type MidiAction =
  | "track_1_record" | "track_1_play" | "track_1_stop" | "track_1_overdub"
  | "track_1_mute" | "track_1_clear" | "track_1_undo"
  | "track_2_record" | "track_2_play" | "track_2_stop" | "track_2_overdub"
  | "track_2_mute" | "track_2_clear" | "track_2_undo"
  | "track_3_record" | "track_3_play" | "track_3_stop" | "track_3_overdub"
  | "track_3_mute" | "track_3_clear" | "track_3_undo"
  | "play_all" | "stop_all" | "metronome_toggle" | "tap_tempo"
  | "track_1_volume" | "track_2_volume" | "track_3_volume";

/** A single MIDI→action binding. */
export interface MidiMapping {
  channel: number;      // MIDI channel 0–15
  type: "cc" | "note";  // Control Change or Note On
  number: number;       // CC number or note number
  action: MidiAction;
}

const STORAGE_KEY = "mloop-midi-mappings";

export class MidiController {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [];
  /** Active learn callback — set during MIDI learn mode. */
  private learnCallback: ((mapping: Omit<MidiMapping, "action">) => void) | null = null;
  private learnTimer: number | null = null;

  /** Callback fired when a mapped MIDI message arrives. Value is 0–127. */
  onAction: ((action: MidiAction, value: number) => void) | null = null;

  /** Check if the browser supports the Web MIDI API. */
  static isSupported(): boolean {
    return "requestMIDIAccess" in navigator;
  }

  /** Request MIDI access, load saved mappings, and start listening. */
  async init(): Promise<boolean> {
    if (!MidiController.isSupported()) return false;

    try {
      this.access = await navigator.requestMIDIAccess();
      this.loadMappings();
      this.listenToInputs();

      // Re-listen when devices are connected/disconnected (hot-plug)
      this.access.onstatechange = () => this.listenToInputs();
      return true;
    } catch {
      return false;
    }
  }

  /** Attach message handlers to all connected MIDI input ports. */
  private listenToInputs(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (e) => this.handleMessage(e);
    }
  }

  /** Parse incoming MIDI messages and dispatch to learn mode or mapped actions. */
  private handleMessage(e: MIDIMessageEvent): void {
    if (!e.data || e.data.length < 2) return;

    // Extract MIDI message components from the status byte
    const status = e.data[0] & 0xF0;   // message type (upper nibble)
    const channel = e.data[0] & 0x0F;  // channel (lower nibble)
    const number = e.data[1];
    const value = e.data.length > 2 ? e.data[2] : 0;

    let type: "cc" | "note" | null = null;
    if (status === 0xB0) type = "cc";                    // Control Change
    else if (status === 0x90 && value > 0) type = "note"; // Note On (velocity > 0)

    if (!type) return;

    // In learn mode, capture the input instead of dispatching an action
    if (this.learnCallback) {
      this.learnCallback({ channel, type, number });
      this.learnCallback = null;
      return;
    }

    // Look up the mapping table for a matching binding
    for (const m of this.mappings) {
      if (m.channel === channel && m.type === type && m.number === number) {
        this.onAction?.(m.action, value);
        return;
      }
    }
  }

  /**
   * Enter MIDI learn mode — the next incoming MIDI message triggers the callback
   * with the captured channel/type/number. Times out after 30 seconds.
   */
  startLearn(callback: (mapping: Omit<MidiMapping, "action">) => void): void {
    this.cancelLearn();
    this.learnCallback = callback;
    this.learnTimer = window.setTimeout(() => {
      this.learnCallback = null;
      this.learnTimer = null;
    }, 30000);
  }

  /** Cancel an in-progress MIDI learn. */
  cancelLearn(): void {
    this.learnCallback = null;
    if (this.learnTimer !== null) {
      clearTimeout(this.learnTimer);
      this.learnTimer = null;
    }
  }

  /** Add or update a mapping. Replaces any existing mapping for the same action. */
  setMapping(mapping: MidiMapping): void {
    this.mappings = this.mappings.filter((m) => m.action !== mapping.action);
    this.mappings.push(mapping);
    this.saveMappings();
  }

  /** Remove a mapping by action name. */
  removeMapping(action: MidiAction): void {
    this.mappings = this.mappings.filter((m) => m.action !== action);
    this.saveMappings();
  }

  /** Get a copy of all current mappings. */
  getMappings(): MidiMapping[] {
    return [...this.mappings];
  }

  /** Look up the mapping for a specific action. */
  getMappingForAction(action: MidiAction): MidiMapping | undefined {
    return this.mappings.find((m) => m.action === action);
  }

  /** Persist mappings to localStorage. */
  private saveMappings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mappings));
    } catch { /* quota exceeded — non-critical */ }
  }

  /** Restore mappings from localStorage. */
  private loadMappings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.mappings = JSON.parse(stored);
      }
    } catch { /* corrupt data — start fresh */ }
  }
}
