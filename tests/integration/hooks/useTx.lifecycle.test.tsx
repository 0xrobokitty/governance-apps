import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTx } from "@/lib/tx/useTx";

const mocks = vi.hoisted(() => ({
  rpcWait: vi.fn(),
  wagmiWait: vi.fn(),
  publicClient: true,
  fallback: false,
  loading: vi.fn(() => "tx"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn(),
}));
vi.mock("@/state/protocol", () => ({ useProtocol: () => ({ publicClient: mocks.publicClient ? { waitForTransactionReceipt: mocks.rpcWait } : null }) }));
vi.mock("wagmi/actions", () => ({ waitForTransactionReceipt: mocks.wagmiWait }));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("@/lib/runtime/features", () => ({ isSimulationTransportFallbackEnabled: () => mocks.fallback }));
vi.mock("@/components/ui/Toast", () => ({ toast: mocks }));

const hash = `0x${"11".repeat(32)}` as const;
const replacement = `0x${"22".repeat(32)}` as const;
const successReceipt = { status: "success", transactionHash: hash };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.publicClient = true;
  mocks.fallback = false;
  mocks.loading.mockReturnValue("tx");
  mocks.rpcWait.mockResolvedValue(successReceipt);
  mocks.wagmiWait.mockResolvedValue(successReceipt);
});

describe("receipt outcomes", () => {
  it.each([true, false])("rejects a reverted receipt with public client %s", async publicClient => {
    mocks.publicClient = publicClient;
    mocks.rpcWait.mockResolvedValue({ ...successReceipt, status: "reverted" });
    mocks.wagmiWait.mockResolvedValue({ ...successReceipt, status: "reverted" });
    const onSuccess = vi.fn(), invalidate = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { onSuccess, invalidate }); });
    expect(result.current.state).toMatchObject({ status: "error", errorType: "revert", hash });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "replaced"])("rejects a successful receipt for a %s transaction", async reason => {
    mocks.rpcWait.mockImplementation(async ({ onReplaced }) => {
      onReplaced({ reason });
      return { ...successReceipt, transactionHash: replacement };
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { onSuccess }); });
    expect(result.current.state).toMatchObject({ status: "error", hash: replacement });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("uses the canonical hash after repricing", async () => {
    mocks.rpcWait.mockImplementation(async ({ onReplaced }) => {
      onReplaced({ reason: "repriced" });
      return { ...successReceipt, transactionHash: replacement };
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { onSuccess }); });
    expect(result.current.state).toEqual({ status: "success", hash: replacement });
    expect(onSuccess).toHaveBeenCalledWith(replacement);
  });

  it("checks receipts from the fallback RPC too", async () => {
    mocks.fallback = true;
    mocks.rpcWait.mockRejectedValue(new Error("Network failed"));
    mocks.wagmiWait.mockResolvedValue({ ...successReceipt, status: "reverted" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash); });
    expect(mocks.wagmiWait).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({ status: "error", errorType: "revert" });
  });
});

describe("execution ownership", () => {
  it("fences overlapping calls before React renders, including after reset", async () => {
    const submission = deferred<typeof hash>();
    const send = vi.fn(() => submission.promise);
    const secondSend = vi.fn(async () => replacement);
    const onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.execute(send, { onSuccess });
      await result.current.execute(secondSend);
    });
    expect(send).toHaveBeenCalledOnce();
    expect(secondSend).not.toHaveBeenCalled();
    act(() => result.current.reset());
    await act(async () => { await result.current.execute(secondSend); });
    expect(secondSend).not.toHaveBeenCalled();
    await act(async () => { submission.resolve(hash); await first; });
    expect(result.current.state).toEqual({ status: "idle" });
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => { await result.current.execute(secondSend); });
    expect(secondSend).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe("success");
  });

  it("allows another attempt after a failed submission", async () => {
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => { throw new Error("rejected"); }); });
    expect(result.current.state.status).toBe("error");
    await act(async () => { await result.current.execute(async () => hash); });
    expect(result.current.state.status).toBe("success");
  });

  it("keeps confirmation and success callbacks when cache refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const invalidate = vi.fn(async () => { throw new Error("refresh failed"); });
    const onSuccess = vi.fn(), onError = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { invalidate, onSuccess, onError }); });
    expect(result.current.state).toEqual({ status: "success", hash });
    expect(onSuccess).toHaveBeenCalledWith(hash);
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Transaction confirmed"), expect.anything());
  });

  it("continues receipt tracking when submission notification fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { onSubmitted: () => { throw new Error("storage unavailable"); } }); });
    expect(mocks.rpcWait).toHaveBeenCalledOnce();
    expect(result.current.state).toEqual({ status: "success", hash });
  });

  it("keeps success if its observer fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => hash, { onSuccess: () => { throw new Error("render failed"); }, onError }); });
    expect(result.current.state.status).toBe("success");
    expect(onError).not.toHaveBeenCalled();
  });
});
