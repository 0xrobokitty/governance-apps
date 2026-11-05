import { describe, expect, it } from "vitest";
import { formatRecoveryPercent } from "@/lib/clients/yeth/recovery/format";
describe("recovery percentage precision", () => {
  it("does not describe an incomplete recovery as 100%", () => {
    expect(formatRecoveryPercent(.99986396)).toBe("<100%");
    expect(formatRecoveryPercent(.999999999, 2)).toBe("<100%");
    expect(formatRecoveryPercent(1)).toBe("100.0%");
    expect(formatRecoveryPercent(.69)).toBe("69.0%");
    expect(formatRecoveryPercent(Number.NaN)).toBe("—");
  });
});
