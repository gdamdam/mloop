/**
 * Test setup — extends vitest with DOM matchers and mocks Web Audio API
 * globals that jsdom doesn't provide.
 */

import "@testing-library/jest-dom/vitest";

// Stub Web Audio API classes that jsdom doesn't implement
class StubAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  state = "running" as AudioContextState;
  createGain() { return { gain: { value: 1, setValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }; }
  createAnalyser() { return { fftSize: 256, connect: () => {}, disconnect: () => {}, getByteTimeDomainData: () => {} }; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 1 }, attack: { value: 0 }, release: { value: 0 }, knee: { value: 0 }, connect: () => {}, disconnect: () => {} }; }
  createOscillator() { return { frequency: { value: 0 }, type: "sine", connect: () => {}, start: () => {}, stop: () => {} }; }
  createBiquadFilter() { return { frequency: { value: 0, setTargetAtTime: () => {} }, Q: { value: 0, setTargetAtTime: () => {} }, type: "lowpass", connect: () => {}, disconnect: () => {} }; }
  createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
  createMediaStreamDestination() { return { stream: new MediaStream() }; }
  createBuffer() { return { getChannelData: () => new Float32Array(0) }; }
  createBufferSource() { return { buffer: null, loop: false, playbackRate: { value: 1 }, connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {} }; }
  createStereoPanner() { return { pan: { value: 0, setValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }; }
  createWaveShaper() { return { curve: null, oversample: "none", connect: () => {}, disconnect: () => {} }; }
  createConvolver() { return { buffer: null, connect: () => {}, disconnect: () => {} }; }
  createDelay() { return { delayTime: { value: 0, setTargetAtTime: () => {} }, connect: () => {}, disconnect: () => {} }; }
  decodeAudioData() { return Promise.resolve(this.createBuffer()); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  get destination() { return { connect: () => {} }; }
}

Object.defineProperty(window, "AudioContext", { value: StubAudioContext, writable: true });
Object.defineProperty(window, "webkitAudioContext", { value: StubAudioContext, writable: true });

// Stub MediaRecorder
class StubMediaRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
Object.defineProperty(window, "MediaRecorder", { value: StubMediaRecorder, writable: true });

// Stub ResizeObserver
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", { value: StubResizeObserver, writable: true });

// Stub requestAnimationFrame
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => setTimeout(cb, 16) as unknown as number;
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Stub matchMedia
Object.defineProperty(window, "matchMedia", {
  value: () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }),
});
