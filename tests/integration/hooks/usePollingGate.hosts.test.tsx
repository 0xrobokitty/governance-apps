import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useIsRouteActive } from "@/lib/hooks/usePollingGate";
const route = vi.hoisted(() => ({ pathname: "/", hostname: "veyfi.yearn.fi" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/lib/hooks/useHostname", () => ({ useHostname: () => route.hostname }));
it("polls the rewritten app at its custom-host root", () => {
  const { result, rerender } = renderHook(() => ({ veyfi: useIsRouteActive(["/veyfi"]), styfi: useIsRouteActive(["/styfi"]) }));
  expect(result.current).toEqual({ veyfi: true, styfi: false });
  route.hostname = "app.dao-ops.com";
  rerender();
  expect(result.current).toEqual({ veyfi: false, styfi: false });
  route.pathname = "/styfi";
  rerender();
  expect(result.current).toEqual({ veyfi: false, styfi: true });
});
