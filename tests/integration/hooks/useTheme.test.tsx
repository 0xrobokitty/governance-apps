import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "@/lib/hooks/useTheme";

const STORAGE_KEY = "yearn-theme-pref";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("theme preference", () => {
  it("does not overwrite a saved dark preference while controls mount in Strict Mode", () => {
    localStorage.setItem(STORAGE_KEY, "soft-dark");
    const persist = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(
      () => ({ desktop: useTheme(), mobile: useTheme() }),
      { wrapper: StrictMode },
    );

    expect(result.current.desktop.theme).toBe("soft-dark");
    expect(result.current.mobile.theme).toBe("soft-dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "soft-dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(persist).not.toHaveBeenCalledWith(STORAGE_KEY, "light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("soft-dark");
  });

  it("persists a toggled preference and restores it after remounting", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const first = renderHook(() => useTheme(), { wrapper: StrictMode });

    act(() => first.result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe("soft-dark");
    first.unmount();

    const second = renderHook(() => useTheme(), { wrapper: StrictMode });
    expect(second.result.current.theme).toBe("soft-dark");
    act(() => second.result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
