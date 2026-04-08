import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackStrip } from "../../components/TrackStrip";
import { createInitialState } from "../../types";

describe("TrackStrip", () => {
  it("renders track label and transport buttons for an empty track", () => {
    const state = createInitialState();
    render(
      <TrackStrip
        track={state.tracks[0]}
        command={vi.fn()}
        engine={null}
      />,
    );
    expect(screen.getByText(/TRACK 1/)).toBeInTheDocument();
    expect(screen.getByTitle("Record")).toBeInTheDocument();
  });

  it("clicking REC on an empty track dispatches track_record", () => {
    const command = vi.fn();
    const state = createInitialState();
    render(<TrackStrip track={state.tracks[2]} command={command} engine={null} />);
    fireEvent.click(screen.getByTitle("Record"));
    expect(command).toHaveBeenCalledWith({ type: "track_record", trackId: 2 });
  });

  it("play/overdub/mute/undo/clear are disabled when track has no layers", () => {
    const state = createInitialState();
    render(<TrackStrip track={state.tracks[0]} command={vi.fn()} engine={null} />);
    expect(screen.getByTitle(/Play|Pause/)).toBeDisabled();
    expect(screen.getByTitle("Overdub")).toBeDisabled();
    expect(screen.getByTitle("Mute")).toBeDisabled();
    expect(screen.getByTitle("Undo last layer")).toBeDisabled();
    expect(screen.getByTitle("Clear")).toBeDisabled();
  });

  it("volume slider dispatches set_volume", () => {
    const command = vi.fn();
    const state = createInitialState();
    render(<TrackStrip track={state.tracks[0]} command={command} engine={null} />);
    const vol = screen.getByTitle("Volume") as HTMLInputElement;
    fireEvent.change(vol, { target: { value: "0.42" } });
    expect(command).toHaveBeenCalledWith({
      type: "set_volume",
      trackId: 0,
      volume: 0.42,
    });
  });
});
