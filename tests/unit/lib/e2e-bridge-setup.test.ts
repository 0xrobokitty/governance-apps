import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { prepareTestBridge } from "../../e2e/utils";

function createPage() {
  return {
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
  };
}

describe("idempotent test bridge setup", () => {
  it("waits for hydration again after one document reload", async () => {
    const page = createPage();
    const setup = vi.fn()
      .mockRejectedValueOnce(new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation."))
      .mockResolvedValueOnce(undefined);

    await prepareTestBridge(page as unknown as Page, setup);

    expect(page.waitForFunction).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledExactlyOnceWith("domcontentloaded");
    expect(page.waitForFunction.mock.invocationCallOrder[1]).toBeGreaterThan(page.waitForLoadState.mock.invocationCallOrder[0]);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it("does not hide fixture or application failures", async () => {
    const page = createPage();
    const error = new Error("DAO authoring test controls are unavailable.");
    const setup = vi.fn().mockRejectedValue(error);

    await expect(prepareTestBridge(page as unknown as Page, setup)).rejects.toBe(error);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });

  it("fails after a second reload instead of retrying indefinitely", async () => {
    const page = createPage();
    const error = new Error("page.evaluate: Execution context was destroyed");
    const setup = vi.fn().mockRejectedValue(error);

    await expect(prepareTestBridge(page as unknown as Page, setup)).rejects.toBe(error);

    expect(setup).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledTimes(1);
  });
});
