import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StartGate } from "../../components/StartGate";

describe("StartGate", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders the start button", () => {
    render(<StartGate onStart={vi.fn()} />);
    expect(screen.getByText("START")).toBeInTheDocument();
  });

  it("shows version number", () => {
    render(<StartGate onStart={vi.fn()} />);
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it("calls onStart after logo flash delay", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    // Logo flash delay is 450ms
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("disables button while starting", async () => {
    const onStart = vi.fn(() => new Promise(() => {})); // never resolves
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("shows error message if onStart fails", async () => {
    vi.useRealTimers(); // real timers needed for async rejection
    const onStart = vi.fn().mockRejectedValue(new Error("Mic denied"));
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    expect(await screen.findByText("Mic denied", {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
