"use client";

import * as React from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconClose } from "@/components/icons/IconClose";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  fitVisualViewport?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  overlayClassName,
  fitVisualViewport = false,
}: ModalProps) {
  const modalRef = useClickOutside<HTMLDivElement>(onClose);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Use setTimeout to avoid synchronous state update warning during mount
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Mobile browsers can pan their visual viewport within an overflowing page.
  // Keep opted-in dialogs inside the screen the user can currently see.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const viewport = window.visualViewport;
    if (!fitVisualViewport || !mounted || !isOpen || !overlay || !viewport) return;
    const fit = () => {
      overlay.style.left = `${viewport.offsetLeft}px`;
      overlay.style.top = `${viewport.offsetTop}px`;
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
      overlay.style.setProperty("--modal-viewport-width", `${viewport.width}px`);
      overlay.style.setProperty("--modal-viewport-height", `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      for (const property of ["left", "top", "width", "height", "--modal-viewport-width", "--modal-viewport-height"]) {
        overlay.style.removeProperty(property);
      }
    };
  }, [fitVisualViewport, isOpen, mounted]);

  // Keep keyboard focus in the dialog and restore its trigger when it closes.
  useEffect(() => {
    if (!mounted || !isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !modalRef.current) return;
      const controls = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )).filter(isTabbable);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) {
        event.preventDefault();
        modalRef.current.focus();
      } else if (event.shiftKey && (document.activeElement === first || !modalRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modalRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, mounted, modalRef]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div ref={overlayRef} className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200", overlayClassName)}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg rounded-box border border-border bg-surface p-6 shadow-xl animate-in zoom-in-95 duration-200",
          className
        )}
      >
        <div className="flex items-center justify-between mb-4">
          {title && <h2 id={titleId} className="min-w-0 pr-8 text-xl font-bold">{title}</h2>}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-text-tertiary transition-[background-color,color] duration-150 ease-out hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            aria-label="Close dialog"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Match native tab order, including disclosure controls and collapsed content. */
function isTabbable(element: HTMLElement): boolean {
  const isSummary = element.tagName === "SUMMARY";
  if (isSummary) {
    const details = element.parentElement;
    if (details?.tagName !== "DETAILS" || firstSummary(details) !== element) return false;
  }
  if (element.tabIndex < 0 && !(isSummary && !element.hasAttribute("tabindex"))) return false;
  if (element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;

  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor);
    if (style.display === "none" || style.contentVisibility === "hidden") return false;
    if (ancestor === element && (style.visibility === "hidden" || style.visibility === "collapse")) return false;
    if (ancestor.tagName === "DETAILS" && !ancestor.hasAttribute("open")) {
      if (!firstSummary(ancestor)?.contains(element)) return false;
    }
  }
  return true;
}

function firstSummary(details: HTMLElement): Element | undefined {
  return Array.from(details.children).find((child) => child.tagName === "SUMMARY");
}
