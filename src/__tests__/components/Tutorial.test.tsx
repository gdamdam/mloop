import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tutorial } from "../../components/Tutorial";

describe("Tutorial", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    // jsdom may not provide a fully functional localStorage; stub it
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("renders the first step", () => {
    render(<Tutorial onClose={vi.fn()} />);
    expect(screen.getByText("PAD / LOOPER Toggle")).toBeInTheDocument();
    expect(screen.getByText("1/10")).toBeInTheDocument();
  });

  it("navigates to next step", () => {
    render(<Tutorial onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Pad Grid")).toBeInTheDocument();
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("navigates back", () => {
    render(<Tutorial onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("PAD / LOOPER Toggle")).toBeInTheDocument();
  });

  it("calls onClose on skip", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on last step done", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    // Navigate to last step (10 steps, click Next 9 times)
    for (let i = 0; i < 9; i++) {
      fireEvent.click(screen.getByText("Next"));
    }
    fireEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("sets localStorage on close", () => {
    render(<Tutorial onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(localStorage.setItem).toHaveBeenCalledWith("mloop-tutorial-seen", "true");
  });
});
