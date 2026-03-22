import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppFooter } from "../../components/AppFooter";

describe("AppFooter", () => {
  it("renders version number", () => {
    render(<AppFooter onShowHelp={vi.fn()} />);
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it("renders github link", () => {
    render(<AppFooter onShowHelp={vi.fn()} />);
    expect(screen.getByText("github.com/gdamdam/mloop")).toBeInTheDocument();
  });

  it("calls onShowHelp when help link is clicked", () => {
    const onShowHelp = vi.fn();
    render(<AppFooter onShowHelp={onShowHelp} />);
    fireEvent.click(screen.getByText("Help"));
    expect(onShowHelp).toHaveBeenCalledOnce();
  });
});
