import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { readWalletSubmissionContext, type WalletSubmissionIdentity } from "@/lib/tx/wallet-context";
const account: Address = "0x1111111111111111111111111111111111111111";
const other: Address = "0x2222222222222222222222222222222222222222";
const hash = ("0x" + "a".repeat(64)) as `0x${string}`;
function fixture(connectorId = "walletConnect") {
  const provider = { request: vi.fn(async ({ method }: { method: string }): Promise<unknown> =>
    method === "eth_accounts" ? [account] : "0x1") };
  const connector = { id: connectorId, getProvider: vi.fn(async () => provider) };
  let identity: WalletSubmissionIdentity = { account, chainId: 1, connector };
  const rpc = {
    getChainId: vi.fn().mockResolvedValue(1),
    getBlock: vi.fn().mockResolvedValue({ number: 100n, hash }),
    getBytecode: vi.fn().mockResolvedValue("0x"),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => ({
      VERSION: "1.4.1", getOwners: [account, other], getThreshold: 2n, nonce: 7n,
    })[functionName]),
  };
  return { rpc, provider, connector, client: rpc as unknown as PublicClient,
    read: () => identity, change: (value: WalletSubmissionIdentity) => { identity = value; } };
}
describe("wallet submission identity", () => {
  it("identifies the Safe Apps proposal contract and verifies its provider scope", async () => {
    const f = fixture("safe");
    await expect(readWalletSubmissionContext(f.client, f.read)).resolves.toMatchObject({
      account, chainId: 1, connectorId: "safe", submittedBlock: "100",
      kind: "safe", hashKind: "safe-proposal", walletType: "safe-app", safeDetection: "confirmed",
    });
    expect(f.rpc.getBytecode).not.toHaveBeenCalled();
    expect(f.provider.request).toHaveBeenCalledWith({ method: "eth_accounts" });
    expect(f.provider.request).toHaveBeenCalledWith({ method: "eth_chainId" });
  });
  it("recognizes Safe contract accounts without assuming a WalletConnect hash format", async () => {
    const f = fixture();
    f.rpc.getBytecode.mockResolvedValue("0x6000");
    await expect(readWalletSubmissionContext(f.client, f.read)).resolves.toMatchObject({
      kind: "safe", hashKind: "unknown", walletType: "safe-contract", safeDetection: "confirmed",
    });
    expect(f.rpc.readContract).toHaveBeenCalledTimes(4);
    for (const [request] of f.rpc.readContract.mock.calls)
      expect(request).toMatchObject({ address: account, blockNumber: 100n });
    expect(f.rpc.getBlock).toHaveBeenLastCalledWith({ blockNumber: 100n });
  });
  it.each(["0x", "0xef0100" + "2".repeat(40)])("retains ordinary and delegated hash semantics for %s", async code => {
    const f = fixture();
    f.rpc.getBytecode.mockResolvedValue(code);
    await expect(readWalletSubmissionContext(f.client, f.read)).resolves.toMatchObject({
      kind: "transaction", hashKind: "transaction", walletType: code === "0x" ? "externally-owned" : "delegated",
    });
    expect(f.rpc.readContract).not.toHaveBeenCalled();
  });
  it("keeps an unrecognized smart account distinct from an EOA", async () => {
    const f = fixture();
    f.rpc.getBytecode.mockResolvedValue("0x6000");
    f.rpc.readContract.mockRejectedValue(new Error("method unavailable"));
    await expect(readWalletSubmissionContext(f.client, f.read)).resolves.toMatchObject({
      kind: "transaction", hashKind: "unknown", walletType: "unknown-contract", safeDetection: "unknown",
    });
  });
  it.each(["account", "chain", "connector"] as const)("rejects a selected %s change during identification", async field => {
    const f = fixture();
    f.rpc.getBytecode.mockImplementation(async () => {
      f.change({
        account: field === "account" ? other : account,
        chainId: field === "chain" ? 10 : 1,
        connector: field === "connector" ? { ...f.connector } : f.connector,
      });
      return "0x";
    });
    await expect(readWalletSubmissionContext(f.client, f.read)).rejects.toThrow("changed");
  });
  it.each(["eth_accounts", "eth_chainId"])("rejects mismatched provider %s", async method => {
    const f = fixture("safe");
    f.provider.request.mockImplementation(async request => request.method === method
      ? method === "eth_accounts" ? [other] : "0xa"
      : request.method === "eth_accounts" ? [account] : "0x1");
    await expect(readWalletSubmissionContext(f.client, f.read)).rejects.toThrow("provider changed");
  });
  it("does not silently classify a failed code lookup as an EOA", async () => {
    const f = fixture();
    f.rpc.getBytecode.mockRejectedValue(new Error("RPC unavailable"));
    await expect(readWalletSubmissionContext(f.client, f.read)).rejects.toThrow("RPC unavailable");
  });
  it("rejects a changed canonical block", async () => {
    const f = fixture();
    f.rpc.getBlock.mockResolvedValueOnce({ number: 100n, hash }).mockResolvedValueOnce({ number: 100n, hash: "0x" + "b".repeat(64) });
    await expect(readWalletSubmissionContext(f.client, f.read)).rejects.toThrow("snapshot changed");
  });
  it("rejects a changed public RPC chain", async () => {
    const f = fixture();
    f.rpc.getChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(10);
    await expect(readWalletSubmissionContext(f.client, f.read)).rejects.toThrow("snapshot changed");
  });
});
