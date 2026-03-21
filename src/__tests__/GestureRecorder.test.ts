import { describe, it, expect, vi, beforeEach } from "vitest";
import { GestureRecorder } from "../engine/GestureRecorder";

// Mock performance.now for deterministic time control
let mockNow = 0;
vi.stubGlobal("performance", { now: () => mockNow });

// Mock requestAnimationFrame / cancelAnimationFrame
// (startPlayback uses rAF which isn't available in Node)
vi.stubGlobal("requestAnimationFrame", (_cb: FrameRequestCallback) => {
  // Don't actually schedule — playback tests are limited to unit-level concerns
  return 1;
});
vi.stubGlobal("cancelAnimationFrame", (_id: number) => {});

beforeEach(() => {
  mockNow = 0;
});

describe("GestureRecorder", () => {
  describe("initial state", () => {
    it("starts not recording and not playing", () => {
      const gr = new GestureRecorder();
      expect(gr.isRecording).toBe(false);
      expect(gr.isPlaying).toBe(false);
      expect(gr.hasGesture).toBe(false);
      expect(gr.points).toEqual([]);
    });
  });

  describe("addPoint", () => {
    it("does nothing when not recording", () => {
      const gr = new GestureRecorder();
      gr.addPoint(0.5, 0.5);
      expect(gr.points.length).toBe(0);
    });

    it("adds points during recording", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);

      mockNow = 0;
      gr.addPoint(0.1, 0.2);
      mockNow = 500;
      gr.addPoint(0.5, 0.6);
      mockNow = 1000;
      gr.addPoint(0.9, 0.8);

      expect(gr.points.length).toBe(3);
    });

    it("records correct relative time values", () => {
      const gr = new GestureRecorder();
      mockNow = 100;
      gr.startRecording(1000); // loop duration = 1000ms

      mockNow = 100; // elapsed = 0
      gr.addPoint(0.0, 0.0);

      mockNow = 600; // elapsed = 500
      gr.addPoint(0.5, 0.5);

      mockNow = 1100; // elapsed = 1000
      gr.addPoint(1.0, 1.0);

      expect(gr.points[0].t).toBeCloseTo(0.0);
      expect(gr.points[1].t).toBeCloseTo(0.5);
      expect(gr.points[2].t).toBeCloseTo(1.0);
    });

    it("clamps t to max 1.0", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);

      mockNow = 2000; // way past loop duration
      gr.addPoint(0.5, 0.5);

      expect(gr.points[0].t).toBe(1);
    });

    it("stores x and y values correctly", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);

      mockNow = 0;
      gr.addPoint(0.3, 0.7);

      expect(gr.points[0].x).toBe(0.3);
      expect(gr.points[0].y).toBe(0.7);
    });
  });

  describe("startRecording / stopRecording", () => {
    it("sets isRecording to true then false", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      expect(gr.isRecording).toBe(true);

      gr.stopRecording();
      expect(gr.isRecording).toBe(false);
    });

    it("clears previous points on startRecording", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.5, 0.5);
      expect(gr.points.length).toBe(1);

      // Start a new recording
      gr.startRecording(1000);
      expect(gr.points.length).toBe(0);
    });

    it("no longer adds points after stopRecording", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.5, 0.5);
      gr.stopRecording();

      gr.addPoint(0.6, 0.6);
      expect(gr.points.length).toBe(1); // only the one before stop
    });
  });

  describe("interpolate (tested via hasGesture and point structure)", () => {
    // interpolate is private, but we can test it indirectly through startPlayback
    // or by recording points and checking that the gesture data is correct.
    // Since rAF is mocked and won't actually run the loop, we test the data
    // that interpolate would operate on.

    it("hasGesture is true after recording points", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.1, 0.2);
      gr.addPoint(0.9, 0.8);
      gr.stopRecording();

      expect(gr.hasGesture).toBe(true);
    });

    it("hasGesture is false after clear", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.5, 0.5);
      gr.stopRecording();
      expect(gr.hasGesture).toBe(true);

      gr.clear();
      expect(gr.hasGesture).toBe(false);
      expect(gr.points.length).toBe(0);
    });

    it("points are sorted by time naturally through addPoint", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);

      mockNow = 100;
      gr.addPoint(0.1, 0.1);
      mockNow = 300;
      gr.addPoint(0.3, 0.3);
      mockNow = 500;
      gr.addPoint(0.5, 0.5);
      gr.stopRecording();

      for (let i = 1; i < gr.points.length; i++) {
        expect(gr.points[i].t).toBeGreaterThanOrEqual(gr.points[i - 1].t);
      }
    });
  });

  describe("startPlayback / stopPlayback", () => {
    // Note: startPlayback relies on requestAnimationFrame which is not available
    // in Node. We mock it above but don't execute the callback loop. These tests
    // verify state transitions only.

    it("requires at least 2 points to start playback", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.5, 0.5); // only 1 point
      gr.stopRecording();

      gr.startPlayback(1000);
      expect(gr.isPlaying).toBe(false); // won't start with < 2 points
    });

    it("sets isPlaying with 2+ points", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      mockNow = 0;
      gr.addPoint(0.1, 0.1);
      mockNow = 500;
      gr.addPoint(0.9, 0.9);
      gr.stopRecording();

      gr.startPlayback(1000);
      expect(gr.isPlaying).toBe(true);
    });

    it("stopPlayback sets isPlaying to false", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      mockNow = 0;
      gr.addPoint(0.1, 0.1);
      mockNow = 500;
      gr.addPoint(0.9, 0.9);
      gr.stopRecording();

      gr.startPlayback(1000);
      expect(gr.isPlaying).toBe(true);

      gr.stopPlayback();
      expect(gr.isPlaying).toBe(false);
    });
  });

  describe("clear", () => {
    it("stops recording, stops playback, and clears points", () => {
      const gr = new GestureRecorder();
      mockNow = 0;
      gr.startRecording(1000);
      gr.addPoint(0.5, 0.5);
      gr.addPoint(0.6, 0.6);
      gr.stopRecording();

      gr.startPlayback(1000);

      gr.clear();
      expect(gr.isRecording).toBe(false);
      expect(gr.isPlaying).toBe(false);
      expect(gr.hasGesture).toBe(false);
      expect(gr.points.length).toBe(0);
    });
  });
});
