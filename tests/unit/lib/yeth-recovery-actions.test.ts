import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, parseEther, zeroAddress, type Address, type PublicClient, type TransactionReceipt } from "viem";
import { createRecoveryActionQuote, validateRecoveryTake, recoveryAllowanceNeedsReset, parseRecoveryReceipt, parseRecoveryApprovalReceipt, readRecoveryAccount, RECOVERY_AUCTION, RECOVERY_WRAPPER, RECOVERY_WETH, type RecoveryAccountState } from "@/lib/clients/yeth/recovery/onchain";
import { YETH_RECOVERY_VAULT } from "@/lib/clients/yeth/deployment";
import { getRecoveryEnvironment } from "@/lib/clients/yeth/recovery/environment";

const account = "0x1111111111111111111111111111111111111111";
const state = (): RecoveryAccountState => ({
  address: account, chainId: 1, blockNumber: 100n, blockHash: "0x1234", blockTimestamp: 1000,
  shares: parseEther("10"), allowance: 0n, wethBalance: 0n, maxRedeem: parseEther("10"),
  directAssets: parseEther("5"), vaultPps: parseEther("0.5"), recoveryRate: parseEther("0.32"),
  auctionPrice: parseEther("0.8"),
  auction: { kickedAt: 900, initialWeth: parseEther("20"), remainingWeth: parseEther("20"),
    startingPrice: parseEther("20"), minimumPrice: parseEther("0.32"), stepDuration: 225, stepDecayBps: 4, length: 604800 },
});
describe("recovery action protections", () => {
  it("caps the share budget and uses executable liquidity rather than a feed quote", () => {
    const current = state();
    const quote = createRecoveryActionQuote(current);
    expect(quote.requestedWeth).toBe(parseEther("12.5"));
    expect(quote.maxShares).toBe(current.shares);
    current.auction!.remainingWeth = parseEther("2");
    expect(createRecoveryActionQuote(current).maxShares).toBe(parseEther("1.6"));
    expect(() => createRecoveryActionQuote(current, { requestedWeth: parseEther("3") })).toThrow();
  });
  it("accepts a full-position request whose contract cost rounds down by one wei", () => {
    const current = state();
    current.auctionPrice = parseEther("0.9");
    const quote = createRecoveryActionQuote(current);
    expect(quote.maxShares).toBe(current.shares - 1n);
    expect(createRecoveryActionQuote(current, { requestedWeth: quote.requestedWeth, maxShares: quote.maxShares })).toEqual(quote);
    expect(() => createRecoveryActionQuote(current, { requestedWeth: quote.requestedWeth, maxShares: quote.maxShares - 1n })).toThrow();
  });
  it("reuses a bounded existing allowance only after explicit fresh review and keeps its actual cap", () => {
    const current = state();
    current.auction!.remainingWeth = parseEther("1");
    current.allowance = parseEther("8");
    const initial = createRecoveryActionQuote(current);
    expect(initial.maxShares).toBe(parseEther(".8"));
    expect(recoveryAllowanceNeedsReset(current, initial)).toBe(true);
    const reviewed = createRecoveryActionQuote(current, {
      requestedWeth: initial.requestedWeth, maxShares: initial.maxShares, reuseAllowance: true,
    });
    expect(reviewed.maxShares).toBe(current.allowance);
    expect(reviewed.requestedWeth).toBe(initial.requestedWeth);
    expect(recoveryAllowanceNeedsReset(current, reviewed)).toBe(false);
    expect(validateRecoveryTake(current, reviewed).needed).toBe(parseEther(".8"));
  });
  it.each([0n, parseEther(".7"), parseEther("11")])("does not reuse an empty, insufficient, or position-exceeding allowance of %s", allowance => {
    const current = state();
    current.auction!.remainingWeth = parseEther("1");
    current.allowance = allowance;
    const reviewed = createRecoveryActionQuote(current, { reuseAllowance: true });
    expect(reviewed.maxShares).toBe(parseEther(".8"));
    if (allowance > 0n) expect(recoveryAllowanceNeedsReset(current, reviewed)).toBe(true);
  });
  it("does not enlarge the requested cost budget when reusing an allowance", () => {
    const current = state();
    current.allowance = parseEther("8");
    expect(() => createRecoveryActionQuote(current, {
      requestedWeth: parseEther("1"), maxShares: parseEther(".7"), reuseAllowance: true,
    })).toThrow("exceeds");
  });
  it("requires excess and stale allowances to be reset", () => {
    const current = state();
    const quote = createRecoveryActionQuote(current);
    current.allowance = quote.maxShares + 1n;
    expect(recoveryAllowanceNeedsReset(current, quote)).toBe(true);
    expect(() => validateRecoveryTake(current, quote)).toThrow("exact");
    current.allowance = quote.maxShares;
    expect(validateRecoveryTake(current, quote).needed).toBe(quote.maxShares);
  });
  it.each(["account", "chain", "restart", "expired", "empty", "balance", "worse"] as const)("rejects changed %s before signing", (change) => {
    const current = state();
    const quote = createRecoveryActionQuote(current);
    current.allowance = quote.maxShares;
    if (change === "account") current.address = zeroAddress;
    if (change === "chain") current.chainId = 31337;
    if (change === "restart") current.auction!.kickedAt++;
    if (change === "expired") current.blockTimestamp += 181;
    if (change === "empty") current.auction!.remainingWeth = 0n;
    if (change === "balance") current.shares--;
    if (change === "worse") current.auctionPrice++;
    expect(() => validateRecoveryTake(current, quote)).toThrow();
  });
  it("accepts reduced inventory only as a capped partial fill", () => {
    const current = state();
    const quote = createRecoveryActionQuote(current);
    current.allowance = quote.maxShares;
    current.auction!.remainingWeth = parseEther("1");
    expect(validateRecoveryTake(current, quote)).toEqual({ fill: parseEther("1"), needed: parseEther("0.8") });
  });
  const transfer = (token: Address, from: Address, to: Address, value: bigint) => ({
    address: token, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  });
  it("reads an executable position without inspecting whether the wallet has deployed or delegated code", async () => {
    const current = state();
    const readContract = vi.fn().mockResolvedValue(current.directAssets);
    const client = {
      getChainId: vi.fn().mockResolvedValue(31337),
      getBlock: vi.fn().mockResolvedValue({ number: current.blockNumber, hash: current.blockHash, timestamp: BigInt(current.blockTimestamp) }),
      multicall: vi.fn().mockResolvedValue([
        RECOVERY_AUCTION, YETH_RECOVERY_VAULT, RECOVERY_WETH,
        YETH_RECOVERY_VAULT, RECOVERY_WRAPPER, RECOVERY_WETH, 18,
        current.shares, current.allowance, current.wethBalance, current.maxRedeem,
        current.vaultPps, current.recoveryRate,
        [BigInt(current.auction!.kickedAt), 1n, current.auction!.initialWeth],
        current.auction!.remainingWeth, current.auctionPrice, current.auction!.startingPrice,
        current.auction!.minimumPrice, BigInt(current.auction!.stepDuration),
        BigInt(current.auction!.stepDecayBps), BigInt(current.auction!.length),
      ]),
      readContract,
    } as unknown as PublicClient;
    const position = await readRecoveryAccount(client, account, 31337);
    const quote = createRecoveryActionQuote(position);
    expect(validateRecoveryTake({ ...position, allowance: quote.maxShares }, quote).needed).toBe(quote.maxShares);
    expect(position.shares).toBe(current.shares);
  });
  it("requires successful receipts and actual token transfers", () => {
    const receipt = { status: "success", logs: [
      transfer(RECOVERY_WETH, RECOVERY_AUCTION, account, 20n),
      transfer(YETH_RECOVERY_VAULT, account, RECOVERY_WRAPPER, 10n),
    ] } as unknown as TransactionReceipt;
    expect(parseRecoveryReceipt(receipt, account, "take", 10n, 20n)).toEqual({ wethReceived: 20n, sharesSpent: 10n });
    expect(() => parseRecoveryReceipt({ ...receipt, status: "reverted" }, account, "take", 10n, 20n)).toThrow("reverted");
    expect(() => parseRecoveryReceipt({ ...receipt, logs: [] }, account, "take", 10n, 20n)).toThrow("receipt");
    expect(() => parseRecoveryReceipt(receipt, account, "take", 9n, 20n)).toThrow("receipt");
    expect(() => parseRecoveryReceipt({ ...receipt, logs: receipt.logs.map(log => ({ ...log, removed: true })) }, account, "take", 10n, 20n)).toThrow("receipt");
  });
  it("does not count another wallet's payout or shares, even in a successful batched wallet transaction", () => {
    const receipt = { status: "success", logs: [
      transfer(RECOVERY_WETH, RECOVERY_AUCTION, zeroAddress, 20n),
      transfer(YETH_RECOVERY_VAULT, zeroAddress, RECOVERY_WRAPPER, 10n),
    ] } as unknown as TransactionReceipt;
    expect(() => parseRecoveryReceipt(receipt, account, "take", 10n, 20n)).toThrow("receipt");
  });
  it("recognizes an inner vault redemption and requires the complete requested share burn", () => {
    const receipt = { status: "success", logs: [
      transfer(RECOVERY_WETH, YETH_RECOVERY_VAULT, account, 20n),
      transfer(YETH_RECOVERY_VAULT, account, zeroAddress, 10n),
    ] } as unknown as TransactionReceipt;
    expect(parseRecoveryReceipt(receipt, account, "redeem", 10n)).toEqual({ wethReceived: 20n, sharesSpent: 10n });
    expect(() => parseRecoveryReceipt(receipt, account, "redeem", 11n)).toThrow("receipt");
  });
});

describe("recovery approval receipt evidence", () => {
  const approval = (value: bigint, owner: Address = account, spender: Address = RECOVERY_AUCTION, token: Address = YETH_RECOVERY_VAULT) => ({
    address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner, spender } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  });
  const mined = (logs: unknown[], status = "success") => ({ status, logs }) as TransactionReceipt;

  it.each([0n, 10n])("confirms an approval of %s only from the expected share token, owner and spender", amount => {
    expect(() => parseRecoveryApprovalReceipt(mined([approval(amount)]), account, amount)).not.toThrow();
  });
  it("rejects an unrelated successful receipt even if the current allowance already matches", () => {
    expect(() => parseRecoveryApprovalReceipt(mined([]), account, 10n)).toThrow("receipt");
  });
  it.each(["owner", "spender", "token", "amount", "removed", "reverted"] as const)("rejects mismatched %s approval evidence", mismatch => {
    const event = approval(
      mismatch === "amount" ? 11n : 10n,
      mismatch === "owner" ? zeroAddress : account,
      mismatch === "spender" ? RECOVERY_WRAPPER : RECOVERY_AUCTION,
      mismatch === "token" ? RECOVERY_WETH : YETH_RECOVERY_VAULT,
    );
    const receipt = mined([{ ...event, removed: mismatch === "removed" }], mismatch === "reverted" ? "reverted" : "success");
    expect(() => parseRecoveryApprovalReceipt(receipt, account, 10n)).toThrow();
  });
  it("uses the final matching approval within a smart-wallet batch", () => {
    expect(() => parseRecoveryApprovalReceipt(mined([approval(10n), approval(0n)]), account, 10n)).toThrow("receipt");
    expect(() => parseRecoveryApprovalReceipt(mined([approval(0n), approval(10n)]), account, 10n)).not.toThrow();
  });
});
describe("isolated recovery fork", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("defaults to mainnet without a fork URL", () => {
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "");
    expect(getRecoveryEnvironment().chainId).toBe(1);
  });
  it("allows only explicit development loopback RPC with a separate chain ID", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_E2E", "false");
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "http://127.0.0.1:18546");
    expect(getRecoveryEnvironment()).toMatchObject({ fork: true, chainId: 31337 });
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getRecoveryEnvironment()).toThrow("production");
  });
  it.each(["https://ethereum-rpc.publicnode.com", "http://192.168.1.10:8545", "file:///tmp/node", "http://user:pass@localhost:8545"])("rejects unsafe fork URL %s", (rpc) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", rpc);
    expect(() => getRecoveryEnvironment()).toThrow();
  });
});
