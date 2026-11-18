const percentFormatter = (digits: number) => new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
  useGrouping: false,
});
const defaultPercentFormatter = percentFormatter(1);

/** Never round an incomplete recovery up to the full-recovery threshold. */
export function formatRecoveryPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const formatter = digits === 1 ? defaultPercentFormatter : percentFormatter(digits);
  // Percent formatting avoids binary multiplication errors at decimal ties such as 48.45%.
  const percent = formatter.format(value);
  return value < 1 && percent === formatter.format(1) ? "<100%" : percent;
}
