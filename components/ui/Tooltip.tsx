"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
};

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
}: TooltipProps) {
  const tooltipId = React.useId();
  const [open, setOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const showTooltip = React.useCallback(() => {
    clearCloseTimeout();
    setOpen(true);
  }, [clearCloseTimeout]);

  const scheduleHideTooltip = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 100);
  }, [clearCloseTimeout]);

  React.useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, [clearCloseTimeout]);

  React.useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearCloseTimeout();
      setOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open, clearCloseTimeout]);

  const verticalAlignClasses =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const horizontalAlignClasses =
    align === "start"
      ? "top-0"
      : align === "end"
        ? "bottom-0"
        : "top-1/2 -translate-y-1/2";
  const sideClasses =
    side === "top"
      ? `bottom-full mb-2 ${verticalAlignClasses}`
      : side === "bottom"
        ? `top-full mt-2 ${verticalAlignClasses}`
        : side === "left"
          ? `right-full mr-2 ${horizontalAlignClasses}`
          : `left-full ml-2 ${horizontalAlignClasses}`;
  const trigger =
    React.isValidElement<{ "aria-describedby"?: string }>(children) &&
    children.type !== React.Fragment
      ? React.cloneElement(children, {
          "aria-describedby": mergeAriaDescribedBy(
            children.props["aria-describedby"],
            tooltipId
          ),
        })
      : children;

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={showTooltip}
      onMouseLeave={scheduleHideTooltip}
      onFocus={showTooltip}
      onBlur={scheduleHideTooltip}
    >
      {trigger}
      <span
        id={tooltipId}
        role="tooltip"
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleHideTooltip}
        className={cn(
          // Layout
          "absolute z-50 w-max max-w-[min(280px,calc(100vw-2rem))]",
          sideClasses,

          // Visuals (Pop-over Card style)
          "rounded-md border border-border bg-surface p-3 shadow-xl", // Increased padding/shadow

          // Typography
          "text-xs font-normal text-text-secondary leading-relaxed",

          // Animation
          "origin-center transition-[opacity,scale,visibility] duration-200 ease-out",
          open
            ? "pointer-events-auto opacity-100 scale-100 visible"
            : "pointer-events-none opacity-0 scale-95 invisible"
        )}
      >
        {content}
      </span>
    </span>
  );
}

function mergeAriaDescribedBy(
  existingIds: string | undefined,
  tooltipId: string
) {
  const ids = existingIds?.trim().split(/\s+/).filter(Boolean) ?? [];
  return Array.from(new Set([...ids, tooltipId])).join(" ");
}
