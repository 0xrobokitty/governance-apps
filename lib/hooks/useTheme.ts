import { useEffect, useLayoutEffect, useState } from "react";

export type Theme = "light" | "soft-dark";

const STORAGE_KEY = "yearn-theme-pref";

const getSystemTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "soft-dark"
    : "light";
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [hasRestoredPreference, setHasRestoredPreference] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* Storage is optional in embedded contexts. */ }
    setTheme(
      stored === "light" || stored === "soft-dark" ? stored : getSystemTheme(),
    );
    setHasRestoredPreference(true);
  }, []);

  useEffect(() => {
    if (!hasRestoredPreference || typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "soft-dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* The current preference still works without persistence. */ }
  }, [theme, hasRestoredPreference]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "soft-dark" : "light"));
  };

  return { theme, setTheme, toggleTheme };
}
