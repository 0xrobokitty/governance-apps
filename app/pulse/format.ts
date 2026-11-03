export const number = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
export function money(value: number, signed = false) {
  const abs = Math.abs(value), divisor = abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  return (value < 0 ? "−" : signed && value > 0 ? "+" : "") + "$" + number(abs / divisor, divisor > 1 ? 2 : 0) + (divisor === 1e6 ? "m" : divisor === 1e3 ? "k" : "");
}
export const percent = (value: number, signed = false, digits = 2) => (value < 0 ? "−" : signed && value > 0 ? "+" : "") + number(Math.abs(value), digits) + "%";
export const points = (value: number) => (value < 0 ? "−" : "+") + number(Math.abs(value), 2) + " pp";
export function shortDate(value: string) { return new Date(value + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); }
