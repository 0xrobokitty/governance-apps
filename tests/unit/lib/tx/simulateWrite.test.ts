import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulateThenWrite } from "@/lib/tx/simulateWrite";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import { simulateContract, writeContract } from "wagmi/actions";

vi.mock("@/lib/tx/tracked-write", () => ({ trackedContractWrite: (_request: unknown, send: () => Promise<unknown>) => send() }));

vi.mock("wagmi/actions", () => ({
  simulateContract: vi.fn(),
  writeContract: vi.fn(),
}));

const REQUEST = {
  address: "0x1111111111111111111111111111111111111111",
  abi: [] as const,
  functionName: "noop",
  args: [] as const,
  account: "0x1111111111111111111111111111111111111111",
  chainId: MAINNET_CHAIN_ID,
} as const;

const ORIGINAL_ENV = { ...process.env };

describe("simulateThenWrite", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it("uses simulation request when simulation succeeds", async () => {
    vi.mocked(simulateContract).mockResolvedValue({
      request: REQUEST,
      result: undefined,
    } as never);
    vi.mocked(writeContract).mockResolvedValue("0xsimulated" as never);

    const hash = await simulateThenWrite(
      REQUEST as never,
      REQUEST as never,
      "test success"
    );

    expect(hash).toBe("0xsimulated");
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), REQUEST);
  });

  it("falls back to direct write for transport-level simulation failures", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK = "true";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(simulateContract).mockRejectedValue(new Error("HTTP request failed"));
    vi.mocked(writeContract).mockResolvedValue("0xfallback" as never);

    const hash = await simulateThenWrite(
      REQUEST as never,
      REQUEST as never,
      "test fallback"
    );

    expect(hash).toBe("0xfallback");
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), REQUEST);
  });

  it("does not fallback when the transport fallback flag is disabled", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK = "false";
    vi.mocked(simulateContract).mockRejectedValue(new Error("HTTP request failed"));

    await expect(
      simulateThenWrite(REQUEST as never, REQUEST as never, "test disabled")
    ).rejects.toThrow("HTTP request failed");

    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rethrows non-transport simulation failures", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK = "true";
    vi.mocked(simulateContract).mockRejectedValue(new Error("Execution reverted"));

    await expect(
      simulateThenWrite(REQUEST as never, REQUEST as never, "test revert")
    ).rejects.toThrow("Execution reverted");

    expect(writeContract).not.toHaveBeenCalled();
  });

  it("falls back for unknown simulation failures when flag is enabled", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK = "true";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(simulateContract).mockRejectedValue(new Error("Unexpected wallet provider error"));
    vi.mocked(writeContract).mockResolvedValue("0xunknown-fallback" as never);

    const hash = await simulateThenWrite(
      REQUEST as never,
      REQUEST as never,
      "test unknown fallback"
    );

    expect(hash).toBe("0xunknown-fallback");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("does not retry a wallet send through the simulation fallback", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK = "true";
    vi.mocked(simulateContract).mockResolvedValue({ request: REQUEST } as never);
    vi.mocked(writeContract).mockImplementation(() => { throw new Error("RPC request failed after send"); });
    await expect(simulateThenWrite(REQUEST as never, REQUEST as never, "test send error")).rejects.toThrow(/after send/);
    expect(writeContract).toHaveBeenCalledOnce();
  });

});
