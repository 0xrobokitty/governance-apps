import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "@/components/ui/Tooltip";

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the popover open while moving from the trigger into the tooltip surface", () => {
    render(
      <Tooltip content="Tooltip body">
        <button type="button">Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    const tooltip = screen.getByRole("tooltip");

    fireEvent.mouseEnter(trigger);
    expect(tooltip.className).toContain("pointer-events-auto");

    fireEvent.mouseLeave(trigger);
    expect(tooltip.className).toContain("pointer-events-auto");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.mouseEnter(tooltip);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(tooltip.className).toContain("pointer-events-auto");
    expect(tooltip.className).not.toContain("pointer-events-none");
  });

  it("hides after leaving both the trigger and the tooltip", () => {
    render(
      <Tooltip content="Tooltip body">
        <button type="button">Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    const tooltip = screen.getByRole("tooltip");

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(tooltip.className).toContain("pointer-events-none");
  });

  it("dismisses hover content with Escape without moving focus or the pointer", () => {
    render(<Tooltip content="Tooltip body"><button type="button">Trigger</button></Tooltip>);
    const trigger = screen.getByRole("button", { name: "Trigger" });
    const tooltip = screen.getByRole("tooltip");
    act(() => trigger.focus());
    fireEvent.mouseEnter(trigger);
    expect(tooltip.className).toContain("pointer-events-auto");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(tooltip.className).toContain("pointer-events-none");
    expect(trigger).toHaveFocus();
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(trigger);
    expect(tooltip.className).toContain("pointer-events-auto");
  });

  it("can align an edge tooltip within a viewport-width constraint", () => {
    render(
      <Tooltip content="Tooltip body" align="end">
        <button type="button">Trigger</button>
      </Tooltip>
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveClass("right-0");
    expect(tooltip).not.toHaveClass("left-1/2", "-translate-x-1/2");
    expect(tooltip.className).toContain(
      "max-w-[min(280px,calc(100vw-2rem))]"
    );
  });

  it("associates a direct trigger with the tooltip content", () => {
    render(
      <Tooltip content="Supplementary math">
        <button type="button">Math inputs</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Math inputs" });
    const tooltip = screen.getByRole("tooltip");

    expect(tooltip.id).not.toBe("");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    expect(trigger).toHaveAccessibleDescription("Supplementary math");
  });

  it("preserves existing aria-describedby ids when associating the tooltip", () => {
    render(
      <>
        <p id="persistent-help">Persistent help</p>
        <p id="validation-help">Validation help</p>
        <Tooltip content="Supplementary help">
          <button
            type="button"
            aria-describedby="persistent-help validation-help"
          >
            Trigger
          </button>
        </Tooltip>
      </>
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    const tooltip = screen.getByRole("tooltip");
    const describedBy = trigger
      .getAttribute("aria-describedby")
      ?.split(/\s+/);

    expect(describedBy).toEqual([
      "persistent-help",
      "validation-help",
      tooltip.id,
    ]);
  });
});
