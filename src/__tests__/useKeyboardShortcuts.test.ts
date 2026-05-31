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
