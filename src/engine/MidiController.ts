/**
 * MidiController — Web MIDI API input mapping for foot pedals and controllers.
 * Supports MIDI learn mode and expression pedals.
 */

export type MidiAction =
  | "track_1_record" | "track_1_play" | "track_1_stop" | "track_1_overdub"
  | "track_1_mute" | "track_1_clear" | "track_1_undo"
  | "track_2_record" | "track_2_play" | "track_2_stop" | "track_2_overdub"
  | "track_2_mute" | "track_2_clear" | "track_2_undo"
  | "track_3_record" | "track_3_play" | "track_3_stop" | "track_3_overdub"
  | "track_3_mute" | "track_3_clear" | "track_3_undo"
  | "play_all" | "stop_all" | "metronome_toggle" | "tap_tempo"
  | "track_1_volume" | "track_2_volume" | "track_3_volume";

export interface MidiMapping {
  channel: number;
  type: "cc" | "note";
  number: number;
  action: MidiAction;
}

const STORAGE_KEY = "mloop-midi-mappings";

export class MidiController {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [];
  private learnCallback: ((mapping: Omit<MidiMapping, "action">) => void) | null = null;
  private learnTimer: number | null = null;

  onAction: ((action: MidiAction, value: number) => void) | null = null;

  static isSupported(): boolean {
    return "requestMIDIAccess" in navigator;
  }

  async init(): Promise<boolean> {
    if (!MidiController.isSupported()) return false;

    try {
      this.access = await navigator.requestMIDIAccess();
      this.loadMappings();
      this.listenToInputs();

      // Re-listen on device changes
      this.access.onstatechange = () => this.listenToInputs();
      return true;
    } catch {
      return false;
    }
  }

  private listenToInputs(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (e) => this.handleMessage(e);
    }
  }

  private handleMessage(e: MIDIMessageEvent): void {
    if (!e.data || e.data.length < 2) return;

    const status = e.data[0] & 0xF0;
    const channel = e.data[0] & 0x0F;
    const number = e.data[1];
    const value = e.data.length > 2 ? e.data[2] : 0;

    let type: "cc" | "note" | null = null;
    if (status === 0xB0) type = "cc";         // Control Change
    else if (status === 0x90 && value > 0) type = "note";  // Note On

    if (!type) return;

    // MIDI learn mode
    if (this.learnCallback) {
      this.learnCallback({ channel, type, number });
      this.learnCallback = null;
      return;
    }

    // Find matching mapping
    for (const m of this.mappings) {
      if (m.channel === channel && m.type === type && m.number === number) {
        this.onAction?.(m.action, value);
        return;
      }
    }
  }

  /** Enter learn mode — next MIDI input triggers the callback. 30s timeout. */
  startLearn(callback: (mapping: Omit<MidiMapping, "action">) => void): void {
    this.cancelLearn();
    this.learnCallback = callback;
    this.learnTimer = window.setTimeout(() => {
      this.learnCallback = null;
      this.learnTimer = null;
    }, 30000);
  }

  cancelLearn(): void {
    this.learnCallback = null;
    if (this.learnTimer !== null) {
      clearTimeout(this.learnTimer);
      this.learnTimer = null;
    }
  }

  /** Add or update a mapping. */
  setMapping(mapping: MidiMapping): void {
    // Remove existing mapping for this action
    this.mappings = this.mappings.filter((m) => m.action !== mapping.action);
    this.mappings.push(mapping);
    this.saveMappings();
  }

  /** Remove a mapping by action. */
  removeMapping(action: MidiAction): void {
    this.mappings = this.mappings.filter((m) => m.action !== action);
    this.saveMappings();
  }

  getMappings(): MidiMapping[] {
    return [...this.mappings];
  }

  getMappingForAction(action: MidiAction): MidiMapping | undefined {
    return this.mappings.find((m) => m.action === action);
  }

  private saveMappings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mappings));
    } catch { /* quota exceeded */ }
  }

  private loadMappings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.mappings = JSON.parse(stored);
      }
    } catch { /* corrupt data */ }
  }
}
