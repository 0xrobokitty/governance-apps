import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCrossChainNudge } from "@/lib/hooks/useCrossChainNudge";
vi.mock("@/state/identity", () => ({ useIdentity: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }) }));
vi.mock("wagmi", () => ({ useAccount: () => ({ isConnected: true }) }));
vi.mock("@/state/protocol", () => ({ useProtocol: () => ({ usesMockBackend: true }) }));
vi.mock("@/lib/hooks/usePollingGate", () => ({ useDocumentVisibility: () => true, useIsRouteActive: () => true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { candidate: { id: "nudge", targetApp: "veyfi" }, checkedAt: Date.now() }, isLoading: false }) }));
afterEach(() => vi.restoreAllMocks());
it("dismisses locally when preference storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
  const { result, rerender } = renderHook(() => useCrossChainNudge({ currentApp: "styfi" }));
  expect(result.current.nudge?.id).toBe("nudge");
  act(() => result.current.dismiss("nudge"));
  rerender();
  expect(result.current.nudge).toBeNull();
});

it.each(["invalid", "Infinity"])("dismisses locally when stored %s cannot be replaced", stored => {
  vi.spyOn(Storage.prototype, "getItem").mockReturnValue(stored);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
  const { result, rerender } = renderHook(() => useCrossChainNudge({ currentApp: "styfi" }));
  expect(result.current.nudge?.id).toBe("nudge");
  act(() => result.current.dismiss("nudge"));
  rerender();
  expect(result.current.nudge).toBeNull();
});
