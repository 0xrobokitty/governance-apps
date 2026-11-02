export function number(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}
export function usd(value: number, signed = false) {
  const abs = Math.abs(value);
  const suffix = abs >= 1000000 ? "m" : abs >= 1000 ? "k" : "";
  const divisor = suffix === "m" ? 1000000 : suffix === "k" ? 1000 : 1;
  return (value < 0 ? "−" : signed && value > 0 ? "+" : "") + "$" + number(abs / divisor, abs >= 1000 ? 2 : 0) + suffix;
}
export function rate(value: number) {
  return (value > 0 ? "+" : value < 0 ? "−" : "") + number(Math.abs(value), 2) + "%";
}
