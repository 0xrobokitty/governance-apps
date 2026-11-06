import type { RenderedAlertMessage } from "../../catalogue";
import type { RpcBlock } from "../../rpc";

export const WAD = 10n ** 18n;
export const YETH_APP = "https://yeth.yearn.fi/";
export const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const amount = (n: bigint) => {
  const negative = n < 0n;
  const v = negative ? -n : n;
  if (v > 0n && v < 10n ** 14n) return `${negative ? "−" : ""}<0.0001`;
  const decimals = v > 0n && v < WAD / 100n ? 4 : 2;
  const scale = 10n ** BigInt(18 - decimals);
  const rounded = (v + scale / 2n) / scale;
  return `${negative ? "−" : ""}${rounded / 10n ** BigInt(decimals)}.${(rounded % 10n ** BigInt(decimals)).toString().padStart(decimals, "0")}`;
};
/** HTML-safe numeric percentage, including the comparison signs in tiny values. */
export const percentage = (rate: bigint) =>
  rate > 0n && rate < 10n ** 14n
    ? "&lt;0.01%"
    : rate < WAD && rate > WAD - 10n ** 14n
      ? "&gt;99.99%"
      : `${amount(rate * 100n)}%`;
export const date = (seconds: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(new Date(seconds * 1000)) + " UTC";
export const accountLink = (
  address: string,
  names: Readonly<Record<string, string>> = {},
) => {
  if (!/^0x[0-9a-f]{40}$/i.test(address))
    throw new Error("yeth_message_address_invalid");
  const name = names[address.toLowerCase()];
  // Bound escaped labels so unusually long ENS names cannot block a payout batch.
  const label =
    name && escape(name).length <= 64
      ? name
      : `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `<a href="https://etherscan.io/address/${address.toLowerCase()}">${escape(label)}</a>`;
};

/** Same absolute scale as DAO votes; a filled bar never implies a rounded-up 100%. */
export function recoveryBar(rate: bigint, opening?: bigint): string {
  const count = Math.max(
    0,
    Math.min(rate < WAD ? 19 : 20, Number((rate * 20n + WAD / 2n) / WAD)),
  );
  let cells = "█".repeat(count) + "░".repeat(20 - count);
  let marker = "";
  if (opening !== undefined) {
    const at = Math.max(
      0,
      Math.min(20, Number((opening * 20n + WAD / 2n) / WAD)),
    );
    cells = cells.slice(0, at) + "│" + cells.slice(at);
    marker = `\n${" ".repeat(at)}↑ start ${percentage(opening)}`;
  }
  return `<pre>0%       50%     100%\n${cells}${marker}</pre>`;
}

export function message(
  id: string,
  block: RpcBlock,
  title: string,
  lines: readonly string[],
  tx?: string,
  actionable = false,
): RenderedAlertMessage {
  if (block.timestamp === null)
    throw new Error("yeth_message_timestamp_missing");
  if (tx && !/^0x[0-9a-f]{64}$/i.test(tx))
    throw new Error("yeth_message_transaction_invalid");
  const footer =
    `<a href="${YETH_APP}">${actionable ? "View auction" : "My recovery"}</a>` +
    (tx ? ` · <a href="https://etherscan.io/tx/${tx}">Tx</a>` : "") +
    ` · ${date(block.timestamp)}`;
  const html = [
    `<b>${escape(title)}</b>`,
    "",
    ...lines.filter(Boolean),
    "",
    footer,
  ].join("\n");
  if (html.length > 4000) throw new Error("yeth_message_too_long");
  return { eventId: `yeth:upgrade:${id}`, blockNumber: block.number, html };
}

export function holdingLine(
  offerPerShare: bigint,
  vaultPerShare: bigint,
  dailyGrowth: bigint | null,
): string {
  if (
    dailyGrowth === null ||
    dailyGrowth <= 0n ||
    offerPerShare <= vaultPerShare
  )
    return "";
  const years =
    Number(offerPerShare - vaultPerShare) / Number(dailyGrowth) / 365;
  if (!Number.isFinite(years) || years > 100 || years < 1 / 12) return "";
  return `≈${years < 1 ? (years * 12).toFixed(1) + " months" : years.toFixed(1) + " years"} of holding at the current pace`;
}
