import { expect, test, type Page } from "@playwright/test";

const addresses = {
  metamask: "0x1111111111111111111111111111111111111111",
  rabby: "0x2222222222222222222222222222222222222222",
  changed: "0x3333333333333333333333333333333333333333",
};
declare global {
  interface Window {
    walletQA: {
      calls: Record<string, string[]>;
      reject: string | null;
      hold: boolean;
      resolve: (() => void) | null;
      emit: (wallet: string, event: string, value: unknown) => void;
    };
  }
}

async function installWallets(page: Page) {
  await page.addInitScript((addresses) => {
    const providers = new Map<string, { emit: (event: string, value: unknown) => void }>();
    const qa = {
      calls: {} as Record<string, string[]>,
      reject: null as string | null,
      hold: false,
      resolve: null as (() => void) | null,
      emit(wallet: string, event: string, value: unknown) { providers.get(wallet)?.emit(event, value); },
    };
    window.walletQA = qa;
    for (const name of ["metamask", "rabby"] as const) {
      const listeners = new Map<string, Set<(value: unknown) => void>>();
      let account = addresses[name];
      let chainId = "0x1";
      let connected = localStorage.getItem("wallet-qa." + name) === "true";
      qa.calls[name] = [];
      const provider = {
        on(event: string, fn: (value: unknown) => void) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(fn);
        },
        removeListener(event: string, fn: (value: unknown) => void) { listeners.get(event)?.delete(fn); },
        emit(event: string, value: unknown) {
          if (event === "chainChanged") chainId = String(value);
          if (event === "accountsChanged" && Array.isArray(value) && value[0]) account = String(value[0]);
          listeners.get(event)?.forEach(fn => fn(value));
        },
        async request({ method, params }: { method: string; params?: unknown[] }) {
          qa.calls[name].push(method);
          if (qa.reject === method) {
            qa.reject = null;
            throw Object.assign(new Error("User rejected request"), { code: 4001 });
          }
          if (method === "eth_accounts") return connected ? [account] : [];
          if (method === "eth_chainId") return chainId;
          if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") {
            if (qa.hold) {
              qa.hold = false;
              await new Promise<void>(resolve => { qa.resolve = resolve; });
            }
            connected = true;
            localStorage.setItem("wallet-qa." + name, "true");
            return method === "eth_requestAccounts" ? [account] : [{ parentCapability: "eth_accounts" }];
          }
          if (method === "wallet_switchEthereumChain") {
            const request = params?.[0] as { chainId: string };
            provider.emit("chainChanged", request.chainId);
            return null;
          }
          if (method === "wallet_revokePermissions") {
            connected = false;
            localStorage.removeItem("wallet-qa." + name);
            return null;
          }
          if (method === "wallet_getCapabilities") return {};
          throw Object.assign(new Error("Synthetic wallet refuses " + method), { code: 4200 });
        },
      };
      providers.set(name, provider);
      const detail = {
        info: {
          uuid: name === "metamask" ? "350670db-19fa-4704-a166-e52e178b59d2" : "350670db-19fa-4704-a166-e52e178b59d3",
          name: name === "metamask" ? "MetaMask" : "Rabby",
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
          rdns: name === "metamask" ? "io.metamask" : "io.rabby",
        },
        provider,
      };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    }
  }, addresses);
}
async function openConnect(page: Page) {
  await page.getByRole("button", { name: /^Connect wallet$/i }).first().click();
  await expect(page.getByRole("dialog", { name: "Connect wallet", exact: true })).toBeVisible();
}
async function connectRabby(page: Page) {
  await openConnect(page);
  await page.getByRole("button", { name: /Rabby.*Detected/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /0x2222/i }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => { await installWallets(page); });

test("discovers two extensions and only requests the selected wallet", async ({ page }) => {
  await page.goto("/");
  await openConnect(page);
  await expect(page.getByRole("button", { name: /MetaMask.*Detected/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rabby.*Detected/ })).toBeVisible();
  await page.getByRole("button", { name: /Rabby.*Detected/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const calls = await page.evaluate(() => window.walletQA.calls);
  expect(calls.rabby).toContain("eth_requestAccounts");
  expect(calls.metamask).not.toContain("eth_requestAccounts");
});

test("restores the selected wallet, follows account events, and respects disconnect", async ({ page }) => {
  await page.goto("/");
  await connectRabby(page);
  await page.reload();
  await expect(page.getByRole("button", { name: /0x2222/i }).first()).toBeVisible();
  expect(await page.evaluate(() => window.walletQA.calls.rabby)).not.toContain("eth_requestAccounts");
  await page.evaluate(address => window.walletQA.emit("rabby", "accountsChanged", [address]), addresses.changed);
  await page.getByRole("button", { name: /0x3333/i }).first().click();
  await expect(page.getByTestId("wallet-account-address").getByRole("link", { name: `View Ethereum address ${addresses.changed} on Etherscan` })).toHaveAttribute("href", `https://etherscan.io/address/${addresses.changed}`);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Connect wallet$/i }).first()).toBeVisible();
});

test("shows rejected connections and can retry", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.walletQA.reject = "eth_requestAccounts"; });
  await openConnect(page);
  await page.getByRole("button", { name: /Rabby.*Detected/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("declined");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /0x2222/i }).first()).toBeVisible();
});

test("recovers a rejected network switch without dropping the connection", async ({ page }) => {
  await page.goto("/");
  await connectRabby(page);
  await page.evaluate(() => {
    window.walletQA.emit("rabby", "chainChanged", "0xa");
    window.walletQA.reject = "wallet_switchEthereumChain";
  });
  await page.getByRole("button", { name: "Wrong Network", exact: true }).first().click();
  await page.getByRole("button", { name: "Ethereum Mainnet", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("declined");
  await page.getByRole("button", { name: "Ethereum Mainnet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /0x2222/i }).first()).toBeVisible();
});

test("does not retain an injected approval after cancellation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.walletQA.hold = true; });
  await openConnect(page);
  await page.getByRole("button", { name: /Rabby.*Detected/ }).click();
  await expect(page.getByText("Continue in Rabby", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(() => window.walletQA.resolve?.());
  await expect.poll(() => page.evaluate(() => window.walletQA.calls.rabby.includes("wallet_revokePermissions"))).toBe(true);
  await expect(page.getByRole("button", { name: /^Connect wallet$/i }).first()).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test("keeps the connect dialog reachable at " + viewport.width + "px and 200% text", async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
      document.documentElement.classList.add("dark");
      document.documentElement.dataset.theme = "soft-dark";
    });
    await openConnect(page);
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("button", { name: "Close dialog" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Connect wallet$/i }).first()).toBeFocused();
  });
}

test("hands off the mobile navigation to the wallet dialog without leaving two dialogs open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styfi");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation menu" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Connect wallet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeFocused();
});

for (const width of [320, 390]) {
  test.describe("mobile layout viewport at " + width + "px", () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });

    test("keeps enlarged wallet controls inside the visible screen on a domain page", async ({ page }) => {
      await page.goto("/styfi");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "32px";
        document.documentElement.classList.add("dark");
        document.documentElement.dataset.theme = "soft-dark";
      });
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Connect wallet", exact: true });
      await expect(dialog).toBeVisible();
      const viewport = await page.evaluate(() => ({
        width: window.visualViewport?.width ?? document.documentElement.clientWidth,
        height: window.visualViewport?.height ?? document.documentElement.clientHeight,
      }));
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByText("Need a wallet?", { exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();

      await page.evaluate(() => { window.walletQA.hold = true; });
      await dialog.getByRole("button", { name: /Rabby.*Detected/ }).click();
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      await cancel.scrollIntoViewIfNeeded();
      const textFits = await cancel.evaluate((button) => {
        const control = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        return text.top >= control.top - 1 && text.bottom <= control.bottom + 1
          && text.left >= control.left - 1 && text.right <= control.right + 1;
      });
      expect(textFits).toBe(true);
      await cancel.click();
      await expect(dialog.getByRole("button", { name: /Rabby.*Detected/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.walletQA.resolve?.());
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeFocused();
    });
  });
}
