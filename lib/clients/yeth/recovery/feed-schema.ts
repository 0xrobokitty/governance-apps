import { z } from "zod";
import { YETH_CLAIM, YETH_RECOVERY_VAULT, YETH_YIELD_VAULT } from "../deployment";
import { RECOVERY_WRAPPER, RECOVERY_AUCTION, RECOVERY_WETH } from "./onchain";

const UINT_MAX = (1n << 256n) - 1n;
export const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(v => /^(0|[1-9]\d{0,77})$/.test(v) && BigInt(v) <= UINT_MAX, "Integer exceeds uint256");
const signed = z.string().regex(/^-?(0|[1-9]\d{0,77})$/);
const seconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const blockSchema = z.object({ number: uint, hash, timestamp: seconds });
export const referenceSchema = z.object({
  url: z.string().regex(/^yeth-recovery-snapshots\/[a-f0-9]{64}\.json$/),
  sha256: digest, schema: z.string().regex(/^yeth-recovery-[A-Za-z-]+\/v1$/),
  count: z.number().int().min(0).max(500).optional(),
}).refine(r => r.url === "yeth-recovery-snapshots/" + r.sha256 + ".json", "Reference filename does not match digest");
const collection = z.object({ kind: z.literal("pages"), pages: z.array(referenceSchema).max(32) });
const rate = z.object({ value: z.number().finite().nullable(), kind: z.literal("apy"), basis: z.enum(["estimated", "historical"]), windowDays: z.number().int().nullable(), observedAt: seconds.nullable() });
const programmePrincipal = z.object({
  allocatedWei: uint, totalSettledWei: uint, activeHolderWei: uint, unsettledCustodyWei: uint,
  unclaimedEligibilityWei: uint, unattributedAdministrativeDebitsWei: uint, claimBookResidualWei: signed,
});
export const recoveryHeadSchema = z.object({
  schema: z.literal("yeth-recovery/v3"), mode: z.literal("live"), chainId: z.literal(1),
  generatedAt: seconds, observedAt: seconds, block: blockSchema, indexedThrough: blockSchema.nullable(),
  producer: z.object({ name: z.literal("gov-apps-yeth"), version: z.string().max(40), revision: z.string().regex(/^[a-f0-9]{40}$/) }),
  contracts: z.object({ claim: address, recoveryVault: address, yieldVault: address, auctionWrapper: address, underlyingAuction: address, underlyingAsset: address, assetDecimals: z.literal(18), shareDecimals: z.literal(18) }),
  claim: z.object({ recoveryRateWad: uint.refine(value => value !== "0", "Recovery rate must be positive") }),
  recoveryVault: z.object({ assetsWei: uint, sharesWei: uint, assetsPerShareWad: uint, targetAssetsPerShareWad: uint, normalizedRecoveryWad: uint }),
  yieldVault: z.object({ assetsWei: uint }),
  capital: z.object({ complete: z.boolean(), block: blockSchema.optional() }),
  accounting: z.object({ complete: z.boolean(), historyComplete: z.boolean() }),
  programme: z.object({
    block: blockSchema.nullable().optional(), complete: z.boolean(), current: z.boolean(),
    source: z.object({ observedAt: seconds, maxAgeSeconds: seconds.max(900) }).nullable().optional(),
    principal: programmePrincipal.optional(),
  }),
  quality: z.object({ snapshotMaxAgeSeconds: seconds.min(1).max(300), historyMaxAgeSeconds: seconds.min(1).max(1800), historyStatus: z.string().max(40), finalizedHead: blockSchema.nullable(), unindexedFinalizedBlocks: z.number().int().nonnegative().nullable() }),
  baseline: z.object({ block: blockSchema, normalizedRecoveryWad: uint }).nullable(),
  history: referenceSchema, holders: referenceSchema.nullable(), auctionHistory: referenceSchema.nullable(),
  funding: z.object({
    indexedThrough: blockSchema, basis: z.literal("all-time-first-allocation/v1"), current: z.boolean(), complete: z.boolean(),
    vault: z.object({ yieldWei: uint, donationsWei: uint }), auctions: z.object({ yieldWei: uint, donationsWei: uint }),
    totalKickedRounds: z.number().int().nonnegative(), unknownWei: uint, pendingAllocationWei: uint,
  }).nullable(),
  kong: z.object({
    status: z.string().max(40), observedAt: seconds.nullable().optional(), rates: z.array(rate).max(20).optional(),
    strategies: z.array(z.object({ address, name: z.string().max(160), asset: address, allocatedAssetsWei: uint, parentAssetsWei: uint, rates: z.array(rate).max(20) })).max(100).optional(),
  }),
  auction: z.object({ kickedAt: seconds, initialAvailableWei: uint, availableWei: uint, startingPriceWad: uint, minimumPriceWad: uint, stepDurationSeconds: seconds.min(1), stepDecayRateBps: z.number().int().min(0).max(10000), auctionLengthSeconds: seconds }),
  forecast: z.object({
    method: z.literal("current-capital-net-recovery-income/v2"), forecastFrom: seconds,
    basis: z.object({ windowDays: z.number().int().positive(), historySha256: digest }),
    dailyAssetsPerShareGrowthWad: signed.nullable(), fullRecoveryWad: uint,
    targets: z.array(z.object({ targetBps: z.number().int(), status: z.enum(["estimated","reached","unavailable","beyond_horizon"]), days: z.number().int().nonnegative().optional() })).max(10),
  }),
  performance: z.object({
    basis: z.literal("observed-pps/v1"), notAForecast: z.literal(true),
    windows: z.array(z.object({ windowDays: z.number().int().positive(), status: z.string().max(40), periodReturnWad: signed.optional(), annualizedReturn: z.number().finite().nullable().optional(), closingBlock: blockSchema.optional() })).max(10),
  }),
});
export const daySchema = z.object({
  dayIndex: z.number().int().nonnegative(), closingBlock: blockSchema,
  closing: z.object({ assetsPerShareWad: uint }), recoveryRateWad: uint, complete: z.boolean(),
});
const historySchema = z.object({ schema: z.literal("yeth-recovery-history/v1"), chainId: z.literal(1), indexedThrough: blockSchema.nullable(), days: collection });
const holderSchema = z.object({ address, sharesWei: uint, representedClaimWei: uint, classification: z.string().max(40) });
const holdersSchema = z.object({
  schema: z.literal("yeth-recovery-holders/v1"), block: blockSchema, complete: z.boolean(), current: z.boolean(),
  holderAccountCount: z.number().int().nonnegative(), totalSupplyWei: uint, holderSharesWei: uint, representedClaimWei: uint,
  protocolCustodySharesWei: uint, reconciliationResidualWei: signed, positions: collection,
});
const fillSchema = z.object({
  id: z.string().max(200), roundId: z.string().max(200), block: blockSchema,
  transactionHash: hash, sharePayer: address, sharesSpentWei: uint, wethReceivedWei: uint,
  normalizedRecoveryWad: uint, originalClaimRecoveryWad: uint.nullable(), attribution: z.literal("verified"),
});
const roundSchema = z.object({ roundId: z.string().max(200), kickBlock: blockSchema, openingInventoryWei: uint });
const auctionsSchema = z.object({ schema: z.literal("yeth-recovery-auctions/v1"), indexedThrough: blockSchema, complete: z.boolean(), fills: collection, rounds: collection });
export type RecoveryHead = z.infer<typeof recoveryHeadSchema>;
export type RecoveryFeedEnvelope = { head: unknown; documents: Record<string, unknown> };
export type RecoveryFeedData = {
  head: RecoveryHead; history: z.infer<typeof historySchema>; days: z.infer<typeof daySchema>[];
  holders: z.infer<typeof holdersSchema> | null; positions: z.infer<typeof holderSchema>[];
  auctions: z.infer<typeof auctionsSchema> | null; fills: z.infer<typeof fillSchema>[]; rounds: z.infer<typeof roundSchema>[];
};
export type RecoveryReference = z.infer<typeof referenceSchema>;
export function findRecoveryReferences(value: unknown): RecoveryReference[] {
  const refs: RecoveryReference[] = [];
  let nodes = 0;
  const visit = (item: unknown, depth: number) => {
    if (++nodes > 150000 || depth > 30) throw new Error("Recovery document structure exceeds limits");
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) { item.forEach(v => visit(v, depth + 1)); return; }
    const record = item as Record<string, unknown>;
    if ("sha256" in record && "url" in record) { refs.push(referenceSchema.parse(record)); return; }
    Object.values(record).forEach(v => visit(v, depth + 1));
  };
  visit(value, 0);
  return refs;
}
const sameBlock = (a: z.infer<typeof blockSchema> | null | undefined, b: z.infer<typeof blockSchema> | null | undefined) => a?.number === b?.number && a?.hash === b?.hash && a?.timestamp === b?.timestamp;
export function parseRecoveryFeed(input: unknown, now = Math.floor(Date.now() / 1000)): RecoveryFeedData {
  const envelope = z.object({ head: z.unknown(), documents: z.record(z.string(), z.unknown()) }).parse(input);
  const head = recoveryHeadSchema.parse(envelope.head);
  const contracts = { claim: YETH_CLAIM, recoveryVault: YETH_RECOVERY_VAULT, yieldVault: YETH_YIELD_VAULT, auctionWrapper: RECOVERY_WRAPPER, underlyingAuction: RECOVERY_AUCTION, underlyingAsset: RECOVERY_WETH };
  for (const [name, expected] of Object.entries(contracts)) if (hContract(head.contracts, name) !== expected.toLowerCase()) throw new Error("Recovery contract identity changed");
  if (Object.keys(envelope.documents).length > 64) throw new Error("Too many recovery documents");
  if (head.generatedAt > now + 60 || head.observedAt > now + 60 || head.observedAt !== head.block.timestamp || head.generatedAt < head.observedAt ||
      (head.indexedThrough && BigInt(head.indexedThrough.number) > BigInt(head.block.number))) throw new Error("Invalid recovery observation time");
  if (head.forecast.basis.historySha256 !== head.history.sha256 || head.forecast.forecastFrom !== head.observedAt) throw new Error("Forecast does not describe this observation");
  if (head.accounting.complete && (!head.accounting.historyComplete || !head.capital.complete || !head.funding?.complete || head.quality.historyStatus !== "current" || !head.programme.complete || !head.programme.current || !head.programme.principal)) throw new Error("Inconsistent complete accounting");
  if ((head.capital.block && !sameBlock(head.capital.block, head.block)) ||
      (head.quality.historyStatus === "current" && (!head.indexedThrough || !sameBlock(head.indexedThrough, head.quality.finalizedHead))) ||
      (head.baseline && head.baseline.block.timestamp > head.observedAt) ||
      (head.indexedThrough && head.indexedThrough.timestamp > head.observedAt)) throw new Error("Inconsistent recovery block identity");
  const document = (ref: RecoveryReference): unknown => {
    const value = envelope.documents[ref.url];
    if (!value || typeof value !== "object" || (value as Record<string, unknown>).schema !== ref.schema) throw new Error("Missing or mismatched recovery document");
    if (ref.count !== undefined && (!Array.isArray((value as Record<string, unknown>).values) || ((value as Record<string, unknown>).values as unknown[]).length !== ref.count)) throw new Error("Recovery page count mismatch");
    return value;
  };
  // Check every referenced page, including programme evidence, rather than silently dropping a broken edge.
  for (const source of [envelope.head, ...Object.values(envelope.documents)]) for (const ref of findRecoveryReferences(source)) document(ref);
  const rows = <T>(pages: z.infer<typeof collection>, schema: z.ZodType<T>): T[] => pages.pages.flatMap(ref => z.object({ values: z.array(schema).max(500) }).parse(document(ref)).values);
  const history = historySchema.parse(document(head.history));
  const holders = head.holders ? holdersSchema.parse(document(head.holders)) : null;
  const auctions = head.auctionHistory ? auctionsSchema.parse(document(head.auctionHistory)) : null;
  if (!sameBlock(history.indexedThrough, head.indexedThrough) || (holders && !sameBlock(holders.block, head.indexedThrough)) || (auctions && !sameBlock(auctions.indexedThrough, head.indexedThrough)) ||
      (head.programme.block && !sameBlock(head.programme.block, head.indexedThrough)) || (head.funding && !sameBlock(head.funding.indexedThrough, head.indexedThrough))) throw new Error("Recovery documents are from different observations");
  const days = rows(history.days, daySchema);
  for (let i = 0; i < days.length; i++) {
    if (days[i].closingBlock.timestamp > head.observedAt || (i > 0 && days[i].dayIndex <= days[i - 1].dayIndex)) throw new Error("Invalid recovery history order");
    if (head.accounting.historyComplete && (!days[i].complete || (i > 0 && days[i].dayIndex !== days[i - 1].dayIndex + 1))) throw new Error("Incomplete recovery history");
  }
  const positions = holders ? rows(holders.positions, holderSchema) : [];
  if (new Set(positions.map(p => p.address.toLowerCase())).size !== positions.length) throw new Error("Duplicate recovery holder");
  if (holders?.complete) {
    const accounts = positions.filter(p => p.classification === "holder");
    if (holders.reconciliationResidualWei !== "0" || accounts.length !== holders.holderAccountCount ||
      positions.reduce((n,p) => n + BigInt(p.sharesWei),0n) !== BigInt(holders.totalSupplyWei) ||
      accounts.reduce((n,p) => n + BigInt(p.sharesWei),0n) !== BigInt(holders.holderSharesWei) ||
      accounts.reduce((n,p) => n + BigInt(p.representedClaimWei),0n) !== BigInt(holders.representedClaimWei) ||
      BigInt(holders.holderSharesWei) + BigInt(holders.protocolCustodySharesWei) !== BigInt(holders.totalSupplyWei)) throw new Error("Recovery holder reconciliation failed");
  }
  const principal = head.programme.principal;
  if (head.programme.complete && principal) {
    if (principal.claimBookResidualWei !== "0" || principal.unattributedAdministrativeDebitsWei !== "0" || BigInt(principal.totalSettledWei) + BigInt(principal.activeHolderWei) + BigInt(principal.unsettledCustodyWei) + BigInt(principal.unclaimedEligibilityWei) + BigInt(principal.unattributedAdministrativeDebitsWei) !== BigInt(principal.allocatedWei)) throw new Error("Programme principal reconciliation failed");
    if (holders?.complete && holders.representedClaimWei !== principal.activeHolderWei) throw new Error("Programme and holder principal differ");
  }
  return { head, history, days, holders, positions, auctions, fills: auctions ? rows(auctions.fills, fillSchema) : [], rounds: auctions ? rows(auctions.rounds, roundSchema) : [] };
}

function hContract(contracts: RecoveryHead["contracts"], name: string): string { return String(contracts[name as keyof typeof contracts]).toLowerCase(); }
