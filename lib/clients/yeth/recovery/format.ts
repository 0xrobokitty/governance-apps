/** Never round an incomplete recovery up to the full-recovery threshold. */
export function formatRecoveryPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const factor = 10 ** digits;
  if (value < 1 && Math.round(value * 100 * factor) >= 100 * factor) return "<100%";
  return (Math.round(value * 100 * factor) / factor).toFixed(digits) + "%";
}
