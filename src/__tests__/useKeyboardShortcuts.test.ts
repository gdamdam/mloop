import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

/** Dispatch a Cmd/Ctrl+Z keydown on document. */
function dispatchUndo() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }),
  );
}

describe("useKeyboardShortcuts onUndo", () => {
  it("invokes the latest onUndo after rerender, not the stale one", () => {
    const command = vi.fn();
    const firstUndo = vi.fn();
    const secondUndo = vi.fn();

    const { rerender } = renderHook(
      ({ onUndo }) =>
        useKeyboardShortcuts(command, true, undefined, "tracks", undefined, onUndo),
      { initialProps: { onUndo: firstUndo } },
    );

    rerender({ onUndo: secondUndo });

    dispatchUndo();

    expect(secondUndo).toHaveBeenCalledOnce();
    expect(firstUndo).not.toHaveBeenCalled();
  });
});

describe("modifier chords are not bare-key shortcuts", () => {
  function press(key: string, mods: Partial<KeyboardEventInit> = {}) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...mods }));
  }

  it("does not dispatch destructive commands on Cmd/Ctrl chords", () => {
    const command = vi.fn();
    renderHook(() => useKeyboardShortcuts(command, true, undefined, "tracks"));
    press("r", { metaKey: true }); // Cmd+R = reload, not track reverse
    press("c", { ctrlKey: true }); // Ctrl+C = copy, not clear track
    press("a", { metaKey: true }); // Cmd+A = select all, not mute
    expect(command).not.toHaveBeenCalled();
  });

  it("still dispatches bare-key shortcuts", () => {
    const command = vi.fn();
    renderHook(() => useKeyboardShortcuts(command, true, undefined, "tracks"));
    press("r");
    expect(command).toHaveBeenCalledWith({ type: "track_reverse", trackId: 0 });
  });

  it("does not trigger pads on modifier chords in pad mode", () => {
    const command = vi.fn();
    const onPad = vi.fn();
    renderHook(() => useKeyboardShortcuts(command, true, undefined, "pads", onPad));
    press("m", { metaKey: true });
    expect(onPad).not.toHaveBeenCalled();
    press("m");
    expect(onPad).toHaveBeenCalledWith(0);
  });

  it("Cmd+S still saves the session", () => {
    const command = vi.fn();
    renderHook(() => useKeyboardShortcuts(command, true, undefined, "tracks"));
    press("s", { metaKey: true });
    expect(command).toHaveBeenCalledWith({ type: "save_session", name: "__quicksave__" });
  });
});
