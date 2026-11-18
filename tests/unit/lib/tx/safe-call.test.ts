import { encodeFunctionData, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { safeExecTransactionAbi, validateSafeMinedCall } from "@/lib/tx/safe-call";
const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const zero = "0x0000000000000000000000000000000000000000" as Address;
const proposalHash = `0x${"ab".repeat(32)}` as Hex;
const expected = { account: safe, chainId: 1, to: target, value: 0n, data: "0x1234" as Hex };
function transaction(overrides: Partial<{ to: Address; value: bigint; data: Hex; operation: number }> = {}) {
  const inner = { to: target, value: 0n, data: "0x1234" as Hex, operation: 0, ...overrides };
  return { to: safe, value: 0n, chainId: 1, input: encodeFunctionData({ abi: safeExecTransactionAbi, functionName: "execTransaction",
    args: [inner.to, inner.value, inner.data, inner.operation, 0n, 0n, 0n, zero, zero, "0x1234"] }) };
}
describe("exact Safe call verification", () => {
  it("accepts the reviewed direct CALL after canonical Safe proof", () => {
    expect(() => validateSafeMinedCall(transaction(), expected, { safe, proposalHash })).not.toThrow();
  });
  it.each([{ to: safe }, { value: 1n }, { data: "0xabcd" as Hex }, { operation: 1 }])("rejects changed inner fields %s", change => {
    expect(() => validateSafeMinedCall(transaction(change), expected, { safe, proposalHash })).toThrow("reviewed call");
  });
  it.each([{ to: target }, { value: 1n }, { chainId: 10 }])("rejects wrong outer context %s", change => {
    expect(() => validateSafeMinedCall({ ...transaction(), ...change }, expected, { safe, proposalHash })).toThrow("wallet and network");
  });
  it("rejects another Safe proof and noncanonical trailing calldata", () => {
    expect(() => validateSafeMinedCall(transaction(), expected, { safe: target, proposalHash })).toThrow();
    const tx = transaction();
    expect(() => validateSafeMinedCall({ ...tx, input: `${tx.input}00` }, expected, { safe, proposalHash })).toThrow("canonical");
  });
});
