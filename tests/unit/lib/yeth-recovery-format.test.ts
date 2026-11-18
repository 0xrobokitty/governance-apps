import { describe, expect, it } from "vitest";
import { formatRecoveryPercent } from "@/lib/clients/yeth/recovery/format";
describe("recovery percentage precision", () => {
  it.each([
    [.4845, 1, "48.5%"],
    [.00015, 2, "0.02%"],
    [.9995, 1, "<100%"],
    [.99995, 2, "<100%"],
    [.99949, 1, "99.9%"],
  ] as const)("rounds %s to %s decimal places without crossing full recovery", (value, digits, expected) => {
    expect(formatRecoveryPercent(value, digits)).toBe(expected);
  });
  it("does not describe an incomplete recovery as 100%", () => {
    expect(formatRecoveryPercent(.99986396)).toBe("<100%");
    expect(formatRecoveryPercent(.999999999, 2)).toBe("<100%");
    expect(formatRecoveryPercent(1)).toBe("100.0%");
    expect(formatRecoveryPercent(.69)).toBe("69.0%");
    expect(formatRecoveryPercent(Number.NaN)).toBe("—");
  });
});
