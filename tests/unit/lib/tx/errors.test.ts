import { describe, it, expect } from "vitest";
import { isExplicitWalletRejection, normalizeTxError } from "@/lib/tx/errors";

describe("normalizeTxError", () => {
  it("maps user rejection", () => {
    const err = normalizeTxError({ name: "UserRejectedRequestError" });
    expect(err.code).toBe("user_rejected");
  });

  it("maps cap exceeded errors from raw strings", () => {
    const err = normalizeTxError("Limit exceeded");
    expect(err.code).toBe("cap_exceeded");
  });

  it("maps cooldown errors", () => {
    const err = normalizeTxError(new Error("Cooldown not complete"));
    expect(err.code).toBe("cooldown_not_ready");
  });

  it("maps insufficient balance errors", () => {
    const err = normalizeTxError(new Error("Insufficient balance"));
    expect(err.code).toBe("insufficient_balance");
  });

  it("maps yETH empty-claim failures to insufficient balance", () => {
    const err = normalizeTxError(new Error("Nothing claimable"));
    expect(err.code).toBe("insufficient_balance");
    expect(err.message).toContain("yETH recovery");
  });

  it("maps yETH empty-share redeem failures to insufficient balance", () => {
    const err = normalizeTxError(new Error("No recovery vault shares to redeem"));
    expect(err.code).toBe("insufficient_balance");
    expect(err.message).toContain("Recovery Vault shares");
  });

  it("maps yETH vault-liquidity failures to revert", () => {
    const err = normalizeTxError(new Error("Insufficient vault liquidity"));
    expect(err.code).toBe("revert");
    expect(err.message).toContain("vault liquidity");
  });

  it("maps transport failures to network errors", () => {
    const err = normalizeTxError(new Error("HTTP request failed"));
    expect(err.code).toBe("network");
    expect(err.message).toContain("Network issue");
  });
});

describe("definite wallet rejection", () => {
  it("requires an explicit numeric 4001 code in a bounded cause chain", () => {
    expect(isExplicitWalletRejection({ cause: { cause: { code: 4001 } } })).toBe(true);
    expect(isExplicitWalletRejection({ name: "UserRejectedRequestError", message: "RPC rejected after submission" })).toBe(false);
    expect(isExplicitWalletRejection({ code: "4001" })).toBe(false);
    const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
    expect(isExplicitWalletRejection(cycle)).toBe(false);
    let nested: unknown = { code: 4001 };
    for (let depth = 0; depth < 11; depth++) nested = { cause: nested };
    expect(isExplicitWalletRejection(nested)).toBe(false);
  });
});
