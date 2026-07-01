import { describe, it, expect } from "vitest";
import {
  projectBeat, projectPhase, secondsUntilNextBar,
  followTransportDecision, joinOnConnect, shouldSendPlaying,
  type LinkClock,
} from "../utils/linkBridge";

// receivedAt is a performance.now() ms stamp; `now` passed to the helpers is in
// the same domain, so we can use plain millisecond literals here.
const clock = (over: Partial<LinkClock> = {}): LinkClock => ({
  tempo: 120, beat: 0, phase: 0, receivedAt: 1000, ...over,
});

describe("linkClock projection", () => {
  it("projects beat forward at the session tempo (fractional preserved)", () => {
    // 120 BPM = 2 beats/sec. 1500ms later (0.5s) → +1 beat.
    expect(projectBeat(clock({ tempo: 120, beat: 4 }), 1500)).toBeCloseTo(5, 6);
    // Fractional tempo must not be rounded away.
    expect(projectBeat(clock({ tempo: 121.5, beat: 0 }), 2000)).toBeCloseTo(121.5 / 60, 6);
  });

  it("wraps phase within the bar", () => {
    // phase 3 + 0.5s @120bpm (=1 beat) → 4 → wraps to 0.
    expect(projectPhase(clock({ phase: 3 }), 1500)).toBeCloseTo(0, 6);
    // phase 3.5 + 1 beat → 4.5 → 0.5.
    expect(projectPhase(clock({ phase: 3.5 }), 1500)).toBeCloseTo(0.5, 6);
  });

  it("never projects backward for a stale (negative-elapsed) now", () => {
    expect(projectBeat(clock({ beat: 2 }), 500)).toBe(2); // now < receivedAt clamped
  });

  describe("secondsUntilNextBar", () => {
    it("returns the time to the next downbeat", () => {
      // phase 1 of 4 @120bpm → 3 beats to bar → 3 * 0.5s = 1.5s.
      expect(secondsUntilNextBar(clock({ phase: 1 }), 1000)).toBeCloseTo(1.5, 6);
    });
    it("is 0 exactly on the downbeat (start immediately, still aligned)", () => {
      expect(secondsUntilNextBar(clock({ phase: 0 }), 1000)).toBeCloseTo(0, 6);
    });
    it("uses fractional tempo for the interval", () => {
      // phase 0 but 90 BPM: from phase 2 → 2 beats * (60/90) = 1.333s.
      expect(secondsUntilNextBar(clock({ tempo: 90, phase: 2 }), 1000)).toBeCloseTo((2 * 60) / 90, 6);
    });
  });

  it("preserves phase across a tempo change (continuous at the changeover)", () => {
    // Sample A at 120 BPM, then a new sample B arrives at the same instant with
    // the same beat/phase but a new tempo. Projected phase at that instant must
    // match — the tempo change doesn't jump the playhead.
    const now = 5000;
    const a: LinkClock = { tempo: 120, beat: 8, phase: 0, receivedAt: now };
    const b: LinkClock = { tempo: 140, beat: 8, phase: 0, receivedAt: now };
    expect(projectPhase(b, now)).toBeCloseTo(projectPhase(a, now), 6);
    // ...and it advances at the NEW rate afterward (140bpm → 2.333 beats/s).
    expect(projectBeat(b, now + 1000)).toBeCloseTo(8 + 140 / 60, 6);
  });
});

describe("transport decisions", () => {
  it("connect while stopped does not start (first observation, not playing)", () => {
    expect(joinOnConnect(null, true, false)).toBe(false);
    expect(followTransportDecision(null, false)).toBe("none");
  });

  it("connect while already playing joins (first observation, playing)", () => {
    expect(joinOnConnect(null, true, true)).toBe(true);
  });

  it("does not re-join once a state has been observed", () => {
    expect(joinOnConnect(false, true, true)).toBe(false);
    expect(joinOnConnect(true, true, true)).toBe(false);
  });

  it("follows genuine remote transitions only", () => {
    expect(followTransportDecision(false, true)).toBe("start"); // remote start
    expect(followTransportDecision(true, false)).toBe("stop");  // remote stop
    expect(followTransportDecision(true, true)).toBe("none");   // redundant
    expect(followTransportDecision(false, false)).toBe("none");
  });

  it("shouldSendPlaying is idempotent — no redundant command when unchanged", () => {
    expect(shouldSendPlaying(true, true)).toBe(false);  // local Play while already playing
    expect(shouldSendPlaying(false, false)).toBe(false);
    expect(shouldSendPlaying(false, true)).toBe(true);
    expect(shouldSendPlaying(true, false)).toBe(true);
  });
});
