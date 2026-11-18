import { decodeFunctionData, encodeFunctionData, parseAbi, type Address, type Hash, type Hex, type Transaction } from "viem";

export const safeExecTransactionAbi = parseAbi([
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool success)",
]);
export type SafeCallExpectation = { account: Address; chainId: number; to: Address; data: Hex; value: bigint };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Use only with the canonical receipt and Safe execution proof from resolveWalletReceipt.
 * A matching Safe event binds the proposal; canonical outer calldata proves its exact inner call.
 * Nested wrappers and delegatecalls require a separate proof and are not accepted here. */
export function validateSafeMinedCall(
  transaction: Pick<Transaction, "to" | "input" | "value" | "chainId">,
  expected: SafeCallExpectation,
  proof: { safe: Address; proposalHash: Hash },
): void {
  if (!same(proof.safe, expected.account) || !transaction.to || !same(transaction.to, expected.account) ||
      transaction.chainId !== expected.chainId || transaction.value !== 0n) {
    throw new Error("The mined Safe transaction does not match this wallet and network.");
  }
  const decoded = decodeFunctionData({ abi: safeExecTransactionAbi, data: transaction.input });
  if (decoded.functionName !== "execTransaction" ||
      !same(encodeFunctionData({ abi: safeExecTransactionAbi, functionName: decoded.functionName, args: decoded.args }), transaction.input)) {
    throw new Error("The Safe execution calldata is not canonical.");
  }
  const [to, value, data, operation] = decoded.args;
  if (operation !== 0 || !same(to, expected.to) || value !== expected.value || !same(data, expected.data)) {
    throw new Error("The mined Safe execution differs from the reviewed call.");
  }
}
