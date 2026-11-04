import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EthereumIcon, getWalletIconSource, WalletBrandIcon } from "@/components/wallet/WalletBrandIcon";

describe("wallet brand images", () => {
  it("uses local assets for known connector identifiers without trusting a name alone", () => {
    for (const [id, asset] of [["io.metamask", "metamask"], ["io.rabby", "rabby"], ["com.ambire.wallet", "ambire"], ["safe", "safe"], ["walletConnect", "walletconnect"]]) {
      expect(getWalletIconSource({ id, icon: "https://tracking.example/icon.png" })).toBe("/wallets/" + asset + ".svg");
    }
    expect(getWalletIconSource({ id: "unknown", name: "MetaMask" })).toBeUndefined();
    expect(getWalletIconSource({ id: "__proto__" })).toBeUndefined();
    expect(getWalletIconSource({ id: "io.metamask", rdns: "unknown.wallet", name: "MetaMask" })).toBeUndefined();
  });

  it("accepts bounded inert data images and rejects tracking or active document URLs", () => {
    for (const icon of ["data:image/png;base64,aGVsbG8=", "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E"]) {
      expect(getWalletIconSource({ id: "unknown", icon })).toBe(icon);
    }
    for (const icon of ["https://tracking.example/icon.svg", "//tracking.example/icon.png", "javascript:alert(1)", "data:text/html,<svg/>", "blob:https://example.test/icon", "data:image/svg+xml,", "data:image/png;base64," + "a".repeat(131_072)]) {
      expect(getWalletIconSource({ id: "unknown", icon })).toBeUndefined();
    }
  });

  it("keeps provider SVG inert and decorative, then falls back on image failure", () => {
    const icon = "data:image/svg+xml,%3Csvg%20onload='alert(1)'/%3E";
    const view = render(<WalletBrandIcon id="unknown" icon={icon} />);
    const image = view.container.querySelector("img")!;
    expect(image).toHaveAttribute("src", icon);
    expect(image).toHaveAttribute("alt", "");
    expect(image.closest("[aria-hidden='true']")).not.toBeNull();
    expect(view.container.querySelector("svg")).toBeNull();
    fireEvent.error(image);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("svg")).not.toBeNull();
    view.rerender(<WalletBrandIcon id="io.rabby" />);
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/wallets/rabby.svg");
  });

  it("provides a local decorative Ethereum image", () => {
    const view = render(<EthereumIcon />);
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/wallets/ethereum.svg");
    expect(view.container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
