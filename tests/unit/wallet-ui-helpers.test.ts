import { describe, expect, it } from "vitest";
import { isAppleMobileWalletBrowser, walletErrorMessage, walletLaunchUrl } from "@/web3/wallet-ui-helpers";

describe("wallet error copy", () => {
  it("finds provider rejection codes in nested causes", () => {
    expect(walletErrorMessage({ cause: { code: 4001 } }, "connect")).toContain("declined");
  });

  it("explains the previous pairing fence without exposing SDK details", () => {
    expect(walletErrorMessage({ cause: { code: "WALLET_REQUEST_PENDING", message: "sensitive" } }, "connect"))
      .toBe("Request still pending. Reject it in your wallet or wait for expiry.");
  });

  it("explains an existing wallet prompt", () => {
    expect(walletErrorMessage({ code: -32002 }, "connect")).toContain("already open");
  });

  it("never reflects raw provider messages or pairing secrets", () => {
    const error = { message: "wc:secret?long-connection-token", cause: {} };
    expect(walletErrorMessage(error, "connect")).not.toContain("secret");
    expect(walletErrorMessage(error, "switch")).toContain("Select Ethereum Mainnet");
    expect(walletErrorMessage(error, "disconnect")).toBe("Could not disconnect. Try again.");
  });

  it("bounds traversal of cyclic provider errors", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(walletErrorMessage(error, "connect")).toContain("Could not connect");
  });
});

describe("wallet launch links", () => {
  it("encodes a v2 pairing URI once for each supported wallet route", () => {
    const uri = `wc:${"a".repeat(64)}@2?relay-protocol=irn&symKey=secret`;
    expect(walletLaunchUrl("metamask", uri)).toBe(`metamask://wc?uri=${encodeURIComponent(uri)}`);
    expect(walletLaunchUrl("rabby", uri)).toBe(`rabby://walletconnect?uri=${encodeURIComponent(uri)}`);
    expect(walletLaunchUrl("oath", uri)).toBe(`oathwallet://wc?uri=${encodeURIComponent(uri)}`);
  });

  it("preserves reserved characters through exactly one Oath query decoding", () => {
    const uri = `wc:${"b".repeat(64)}@2?relay-protocol=irn&symKey=a%2Fb+c&extra=?#&value=é`;
    const href = walletLaunchUrl("oath", uri);
    expect(href).toBe(`oathwallet://wc?uri=${encodeURIComponent(uri)}`);
    expect(new URL(href!).searchParams.get("uri")).toBe(uri);
  });

  it.each(["metamask", "rabby", "oath"] as const)("rejects invalid or oversized payloads for %s", (wallet) => {
    for (const uri of [
      "javascript:alert(1)",
      "https://wallet.example/",
      "wc:broken@2?key=value",
      `wc:${"a".repeat(64)}@1?key=value`,
      `wc:${"a".repeat(64)}@2?key=${"a".repeat(4096)}`,
    ]) {
      expect(walletLaunchUrl(wallet, uri)).toBeUndefined();
    }
  });
});

describe("Apple mobile wallet browser detection", () => {
  it.each([
    ["iPhone", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }, true],
    ["iPad", { userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", platform: "iPad", maxTouchPoints: 5 }, true],
    ["desktop-mode iPadOS", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", platform: "MacIntel", maxTouchPoints: 5 }, true],
    ["Mac", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", platform: "MacIntel", maxTouchPoints: 0 }, false],
    ["single-touch Mac", { platform: "MacIntel", maxTouchPoints: 1 }, false],
    ["Android", { userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5 }, false],
    ["Windows touch", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 10 }, false],
    ["iPod", { userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)", platform: "iPod", maxTouchPoints: 5 }, false],
    ["unknown browser", {}, false],
    ["server", undefined, false],
  ] as const)("identifies %s conservatively", (_name, browser, expected) => {
    expect(isAppleMobileWalletBrowser(browser)).toBe(expected);
  });
});
