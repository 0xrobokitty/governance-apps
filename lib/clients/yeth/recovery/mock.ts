import { parseEther, keccak256, stringToHex } from "viem";
import type { PreparedTransaction, TransactionHash } from "@/lib/tx/types";
import { isSnapshotFresh, quoteTake, WAD } from "./model";
import type { AuctionScenario, RecoveryPreviewClient, RecoverySnapshot } from "./types";

const eth = parseEther;
const exampleAddress = (i: number) => ("0x" + keccak256(stringToHex("yeth-design-holder-" + i)).slice(-40)) as `0x${string}`;
/** Isolated illustrative data. Never constructed by an onchain client. */
export class MockRecoveryPreviewClient implements RecoveryPreviewClient {
  private snapshot: RecoverySnapshot;
  private scenario: AuctionScenario = "active";
  private counter = 0;
  private offset = 0;
  private redemptionFailure = false;
  constructor(private clock = () => Math.floor(Date.now() / 1000)) {
    this.snapshot = this.fixture();
  }
  private fixture(): RecoverySnapshot {
    const now = this.clock();
    return {
      asOf: now, now, connected: true, shares: eth("4.25"), allowance: 0n, walletWeth: 0n, originalClaimEth: eth("10"),
      recoveryStart: { at: now - 180 * 86400, recovery: 0.36 },
      progressHistory: [{ day: -180, recovery: .36 }, { day: -120, recovery: .45 }, { day: -60, recovery: .465 }, { day: -30, recovery: .4785 }, { day: 0, recovery: .4845 }],
      holders: { asOf: now, positions: Array.from({ length: 48 }, (_, i) => ({
        id: i === 24 ? "example-account" : "holder-" + i,
        address: exampleAddress(i),
        kind: "holder" as const,
        shares: i < 24 ? eth(".25") : i === 24 ? eth("4.25") : i < 36 ? eth("2") : i < 44 ? eth("10") : i < 47 ? eth("50") : eth("162.75"),
      })) },
      auctionHistory: [
        { id: "fill-3", round: 3, at: now - 8 * 86400, taker: exampleAddress(8), recovery: .681, weth: eth("1.85"), transactionHash: null },
        { id: "fill-2", round: 3, at: now - 9 * 86400, taker: exampleAddress(17), recovery: .664, weth: eth(".62"), transactionHash: null },
        { id: "fill-1", round: 2, at: now - 24 * 86400, taker: exampleAddress(32), recovery: .637, weth: eth("3.40"), transactionHash: null },
      ],
      recoveryRate: eth("0.425"), vaultPps: eth("1.14"), vaultAssetsEth: eth("484.5"),
      totalShares: eth("425"), yieldAssetsEth: eth("5000"), yieldApy: 0.048, yieldApyBasis: "estimated",
      claimedPrincipalEth: eth("1250"), exitedPrincipalEth: eth("250"),
      funding: [
        { id: "vault-yield", at: now - 86400, source: "yield", destination: "vault", weth: eth("6"), round: null },
        { id: "round-2-yield", at: now - 25 * 86400, source: "yield", destination: "auction", weth: eth("4"), round: 2 },
        { id: "round-3-yield", at: now - 10 * 86400, source: "yield", destination: "auction", weth: eth("3"), round: 3 },
        { id: "round-4-yield", at: now - 884 * 225 - 70, source: "yield", destination: "auction", weth: eth("10"), round: 4 },
        { id: "round-4-donation", at: now - 884 * 225 - 70, source: "donation", destination: "auction", weth: eth("4"), round: 4 },
      ],
      history: [ { day: -30, recovery: 0.4785 }, { day: -24, recovery: 0.4797 },
        { day: -18, recovery: 0.4806 }, { day: -12, recovery: 0.4820 },
        { day: -6, recovery: 0.4831 }, { day: 0, recovery: 0.4845 } ],
      strategies: [
        { id: "lending", name: "WETH lending", asset: "WETH", description: "WETH supplied to lending strategies.", assetsEth: eth("3000"), historicalApy: 0.042, allocationBps: 6000 },
        { id: "staking", name: "ETH staking", asset: "ETH derivatives", description: "ETH staking strategies with protocol and depeg exposure.", assetsEth: eth("1750"), historicalApy: 0.0651, allocationBps: 3500 },
        { id: "idle", name: "Idle liquidity", asset: "WETH", description: "Unallocated balance, available for withdrawals and strategy allocation.", assetsEth: eth("250"), historicalApy: 0, allocationBps: 500 },
      ],
      auction: { kickedAt: now - 884 * 225 - 70, initialWeth: eth("14"), remainingWeth: eth("8.4"),
        startingPrice: (eth("14") * WAD + eth("1.14") - 1n) / eth("1.14"),
        minimumPrice: eth("0.425"), stepDuration: 225, stepDecayBps: 4, length: 7 * 86400 },
    };
  }
  getSnapshot(): RecoverySnapshot {
    if (this.scenario === "error") throw new Error("Preview data is unavailable. Try another preview state.");
    const now = this.clock() + this.offset;
    return { ...this.snapshot, holders: this.snapshot.holders ? { ...this.snapshot.holders, asOf: this.scenario === "stale" ? now - 120 : now } : null, now, asOf: this.scenario === "stale" ? now - 120 : now };
  }
  setScenario(scenario: AuctionScenario) {
    this.scenario = scenario;
    this.offset = 0;
    this.redemptionFailure = scenario === "redeem-error";
    this.snapshot = this.fixture();
    if (scenario === "limited" || scenario === "redeem-error") this.snapshot.auction.remainingWeth = eth("0.75");
    if (scenario === "flat") {
      this.snapshot.history = [{ day: -30, recovery: 0.4845 }, { day: 0, recovery: 0.4845 }];
      this.snapshot.progressHistory = [...this.snapshot.progressHistory.filter(p => p.day < -30), ...this.snapshot.history];
      this.snapshot.funding = this.snapshot.funding.filter(flow => flow.destination !== "vault");
    }
    if (scenario === "waiting") { this.snapshot.auction.kickedAt = 0; this.snapshot.auctionHistory = []; this.snapshot.funding = this.snapshot.funding.filter(flow => flow.destination === "vault"); }
    if (scenario === "empty") this.snapshot.auction.remainingWeth = 0n;
    if (scenario === "ended") this.snapshot.auction.kickedAt -= 8 * 86400;
    if (scenario === "disconnected") this.snapshot.connected = false;
    if (scenario === "no-position") {
      this.snapshot.shares = 0n; this.snapshot.originalClaimEth = 0n;
      if (this.snapshot.holders) this.snapshot.holders.positions = this.snapshot.holders.positions.map(p =>
        p.id === "example-account" ? { ...p, id: "holder-24" } : p);
    }
  }
  consumeLiquidity(weth: bigint) {
    const remaining = this.snapshot.auction.remainingWeth;
    this.snapshot.auction = { ...this.snapshot.auction, remainingWeth: weth >= remaining ? 0n : remaining - weth };
  }
  advanceStep() { this.offset += this.snapshot.auction.stepDuration; }
  private transaction(apply: () => void): PreparedTransaction {
    return async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
      const snapshot = this.getSnapshot();
      if (!snapshot.connected || !isSnapshotFresh(snapshot)) throw new Error("Refresh the preview and connect an account.");
      apply();
      this.counter += 1;
      return ("0x" + this.counter.toString(16).padStart(64, "0")) as TransactionHash;
    };
  }
  prepareApprove(shares: bigint) {
    return this.transaction(() => {
      if (shares <= 0n || shares > this.snapshot.shares) throw new Error("Invalid approval amount.");
      this.snapshot.allowance = shares;
    });
  }
  prepareTake(weth: bigint, maxShares: bigint, kickedAt: number) {
    return this.transaction(() => {
      const snapshot = this.getSnapshot();
      if (snapshot.auction.kickedAt !== kickedAt) throw new Error("The auction changed. Review a new quote.");
      // The contract can partially fill when another taker consumes liquidity.
      const filled = weth < snapshot.auction.remainingWeth ? weth : snapshot.auction.remainingWeth;
      const quote = quoteTake(snapshot, filled);
      if (!quote || quote.shares > maxShares || quote.shares > snapshot.allowance) throw new Error("The offer changed. Review and approve a new quote.");
      const positions = snapshot.holders?.positions.map(p => p.id === "example-account" ? { ...p, shares: p.shares - quote.shares } : { ...p }) ?? [];
      const wrapper = positions.find(p => p.id === "wrapper");
      if (wrapper) wrapper.shares += quote.shares;
      else positions.push({ id: "wrapper", address: "0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE", kind: "system", shares: quote.shares });
      this.snapshot = { ...this.snapshot, holders: { asOf: snapshot.now, positions },
        auctionHistory: [{ id: "preview-fill-" + this.counter, round: 4, at: snapshot.now, taker: exampleAddress(24), recovery: quote.recovery, weth: filled, transactionHash: null }, ...snapshot.auctionHistory],
        shares: snapshot.shares - quote.shares, exitedPrincipalEth: snapshot.exitedPrincipalEth + quote.fullClaimEth,
        allowance: snapshot.allowance - quote.shares, walletWeth: snapshot.walletWeth + filled,
        auction: { ...snapshot.auction, remainingWeth: snapshot.auction.remainingWeth - filled } };
    });
  }
  prepareRedeem() {
    return this.transaction(() => {
      const snapshot = this.getSnapshot();
      if (this.redemptionFailure) { this.redemptionFailure = false; throw new Error("Simulated redemption failure. Your auction payout is safe. Retry the remaining redemption."); }
      if (snapshot.shares <= 0n) throw new Error("No recovery shares to redeem.");
      const assets = snapshot.shares * snapshot.vaultPps / WAD;
      this.snapshot = { ...this.snapshot, holders: snapshot.holders ? { ...snapshot.holders, positions: snapshot.holders.positions.map(p => p.id === "example-account" ? { ...p, shares: 0n } : p) } : null, shares: 0n, walletWeth: snapshot.walletWeth + assets,
        exitedPrincipalEth: snapshot.exitedPrincipalEth + snapshot.shares * WAD / snapshot.recoveryRate,
        totalShares: snapshot.totalShares - snapshot.shares, vaultAssetsEth: snapshot.vaultAssetsEth - assets };
    });
  }
}
