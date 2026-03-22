import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StartGate } from "../../components/StartGate";

describe("StartGate", () => {
  it("renders the start button", () => {
    render(<StartGate onStart={vi.fn()} />);
    expect(screen.getByText("START")).toBeInTheDocument();
  });

  it("shows version number", () => {
    render(<StartGate onStart={vi.fn()} />);
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it("calls onStart when button is clicked", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("disables button while starting", () => {
    const onStart = vi.fn(() => new Promise(() => {})); // never resolves
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("shows error message if onStart fails", async () => {
    const onStart = vi.fn().mockRejectedValue(new Error("Mic denied"));
    render(<StartGate onStart={onStart} />);
    fireEvent.click(screen.getByText("START"));
    expect(await screen.findByText("Mic denied")).toBeInTheDocument();
  });
});
