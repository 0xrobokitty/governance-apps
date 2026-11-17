"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useHostname } from "@/lib/hooks/useHostname";
import { applyHostPrefix, resolveHostPrefix } from "@/lib/runtime/host-routing";

export function useDocumentVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateVisibility = () => {
      setIsVisible(document.visibilityState !== "hidden");
    };

    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return isVisible;
}

function useCurrentPathname() {
  try {
    const pathname = usePathname();
    if (pathname) return pathname;
  } catch {
    // App router context is unavailable in some test/runtime shells.
  }
  if (typeof window !== "undefined") {
    return window.location.pathname || "/";
  }
  return "/";
}

export function useIsRouteActive(prefixes: readonly string[]) {
  const currentPathname = useCurrentPathname();
  const hostname = useHostname();
  const pathname = applyHostPrefix(currentPathname, hostname ? resolveHostPrefix(hostname) : null);
  return prefixes.some((prefix) => {
    if (!prefix) return false;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
