import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const origin = "https://ybc.yearn.fi";
vi.mock("@/lib/identity/bridge-protocol", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/identity/bridge-protocol")>(),
  getAddressLabelBridgeOrigin: () => "https://ybc.yearn.fi",
}));

describe("parent address label bridge", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { document.querySelectorAll("iframe").forEach((frame) => frame.remove()); vi.useRealTimers(); });

  it("requires the exact iframe source, origin, and pending request ID", async () => {
    const bridge = await import("@/lib/identity/bridge");
    const result = bridge.requestAddressLabelBridge({ operation: "read" });
    const frame = document.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    frame.dispatchEvent(new Event("load"));
    await Promise.resolve();
    const request = post.mock.calls[0][0];
    const data = { kind: "yearn.address-labels.v1", id: request.id, status: "saved", aliases: { "0x1111111111111111111111111111111111111111": "Alice" } };
    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.test", source: frame.contentWindow, data }));
    window.dispatchEvent(new MessageEvent("message", { origin, source: window, data }));
    window.dispatchEvent(new MessageEvent("message", { origin, source: frame.contentWindow, data: { ...data, id: "22222222-2222-4222-8222-222222222222" } }));
    expect(bridge.getRemoteAddressAliases()).toEqual({});
    window.dispatchEvent(new MessageEvent("message", { origin, source: frame.contentWindow, data }));
    expect(await result).toBe("saved");
    expect(bridge.getRemoteAddressAliases()).toEqual(data.aliases);
  });

  it("reports a missing response and reloads the iframe for the next attempt", async () => {
    const bridge = await import("@/lib/identity/bridge");
    const result = bridge.requestAddressLabelBridge({ operation: "read" });
    const firstFrame = document.querySelector("iframe")!;
    firstFrame.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3_001);
    expect(await result).toBe("storage-error");
    expect(document.querySelector("iframe")).toBeNull();
    const retry = bridge.requestAddressLabelBridge({ operation: "read" });
    expect(document.querySelector("iframe")).not.toBe(firstFrame);
    await vi.advanceTimersByTimeAsync(3_001);
    expect(await retry).toBe("storage-error");
  });
});
