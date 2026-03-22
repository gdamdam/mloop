import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpModal } from "../../components/HelpModal";

describe("HelpModal", () => {
  it("renders all section titles", () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Sample Pads")).toBeInTheDocument();
    expect(screen.getByText("Looper Controls")).toBeInTheDocument();
    expect(screen.getByText("KAOS Pad & Effects")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("expands first section by default", () => {
    render(<HelpModal onClose={vi.fn()} />);
    // First section content should be visible
    expect(screen.getByText((_content, el) =>
      el?.tagName === "LI" && !!el?.textContent?.includes("START") && !!el?.textContent?.includes("initialize")
    )).toBeInTheDocument();
  });

  it("toggles section on click", () => {
    render(<HelpModal onClose={vi.fn()} />);
    // Click "Sample Pads" to expand it
    fireEvent.click(screen.getByText("Sample Pads"));
    expect(screen.getByText(/16 pads/)).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    // Click the backdrop (the outermost div)
    fireEvent.click(document.querySelector(".sheet-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows tutorial button when callback provided", () => {
    const onTutorial = vi.fn();
    render(<HelpModal onClose={vi.fn()} onShowTutorial={onTutorial} />);
    const btn = screen.getByText("Show Tutorial");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onTutorial).toHaveBeenCalledOnce();
  });

  it("hides tutorial button when no callback", () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.queryByText("Show Tutorial")).not.toBeInTheDocument();
  });
});
