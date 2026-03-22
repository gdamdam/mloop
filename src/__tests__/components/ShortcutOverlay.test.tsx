import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShortcutOverlay } from "../../components/ShortcutOverlay";

describe("ShortcutOverlay", () => {
  it("renders shortcut sections", () => {
    render(<ShortcutOverlay onClose={vi.fn()} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("shows looper shortcuts", () => {
    render(<ShortcutOverlay onClose={vi.fn()} />);
    // Should show common looper keys
    expect(screen.getByText(/Record track/i)).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    fireEvent.click(screen.getByText("×"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    fireEvent.click(document.querySelector(".sheet-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
