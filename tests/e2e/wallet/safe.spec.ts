import { expect, test } from "@playwright/test";

const pendingProxyRequests = new Set<Promise<void>>();

test.afterEach(async ({ page }) => {
  // Drain before removing handlers: Playwright can disable interception when
  // the first handler finishes, while another proxy response is still pending.
  while (pendingProxyRequests.size > 0) {
    await Promise.all(pendingProxyRequests);
  }
  await page.unrouteAll({ behavior: "wait" });
});

// This parent simulates the Safe Apps message protocol. No real Safe or transaction is used.
test("connects the Safe account in a trusted iframe and preserves an explicit disconnect", async ({ page, baseURL }) => {
  const address = "0x4444444444444444444444444444444444444444";
  // Serve the local artifact under a synthetic HTTPS origin. A secure parent
  // cannot embed a raw loopback HTTP URL under modern browser network policy.
  const child = "https://app.dao-ops.com/styfi";
  await page.route("https://app.dao-ops.com/**", async (route) => {
    const proxyRequest = (async () => {
      const requestUrl = new URL(route.request().url());
      const localUrl = new URL(requestUrl.pathname + requestUrl.search, baseURL);
      const response = await route.fetch({ url: localUrl.href });
      await route.fulfill({ response });
    })();
    pendingProxyRequests.add(proxyRequest);
    try {
      await proxyRequest;
    } finally {
      pendingProxyRequests.delete(proxyRequest);
    }
  });
  const html = `<!doctype html><html><body><script>
    window.safeRequests = [];
    window.addEventListener("message", function(event) {
      if (event.origin !== ${JSON.stringify(new URL(child).origin)}) return;
      var message = event.data;
      if (!message || typeof message.id !== "string") return;
      window.safeRequests.push(message.method);
      var data;
      if (message.method === "getSafeInfo") {
        data = { safeAddress: "${address}", chainId: 1, owners: [], threshold: 1, isReadOnly: false };
      } else if (message.method === "getEnvironmentInfo") {
        data = { origin: "https://app.safe.global" };
      } else if (message.method === "rpcCall") {
        data = message.params && message.params.call === "eth_chainId" ? "0x1" : null;
      } else return;
      event.source.postMessage({ id: message.id, success: true, data: data, version: "9.1.0" }, event.origin);
    });
  </script><iframe title="Yearn Safe app" src="${child}" style="width:100%;height:950px;border:0"></iframe></body></html>`;
  await page.route("https://app.safe.global/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://app.safe.global/");
  const app = page.frameLocator('iframe[title="Yearn Safe app"]');
  const accountButton = app.getByRole("button", { name: /0x4444/i }).first();
  await expect(accountButton).toBeVisible({ timeout: 20_000 });
  await accountButton.click();
  await expect(app.getByTestId("wallet-account-address").getByRole("link", { name: `View Ethereum address ${address} on Etherscan` })).toHaveAttribute("href", `https://etherscan.io/address/${address}`);
  await expect(app.getByRole("dialog").getByText("Safe", { exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.reload();
  await expect(app.getByRole("button", { name: /^Connect wallet$/i }).first()).toBeVisible();
});
