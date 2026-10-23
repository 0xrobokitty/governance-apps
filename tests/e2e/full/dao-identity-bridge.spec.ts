import { expect, test, type Page } from "@playwright/test";
import { GET } from "@/app/api/address-labels/route";
import { ADDRESS_LABEL_BRIDGE_KIND } from "@/lib/identity/bridge-protocol";
import { ADDRESS_ALIASES_STORAGE_KEY } from "@/lib/identity/aliases";

const dao = "https://dao.yearn.fi";
const ybc = "https://ybc.yearn.fi";
const address = "0x1111111111111111111111111111111111111111";

test("shares browser storage through the exact DAO/YBC origin bridge and rejects sibling senders", async ({ context }) => {
  // Interception keeps this regression local while exercising actual cross-origin browser storage and WindowProxy sources.
  await context.route(`${ybc}/api/address-labels`, async (route) => {
    const response = GET(new Request(`${ybc}/api/address-labels`));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() });
  });
  await context.route(`${dao}/`, (route) => route.fulfill({ contentType: "text/html", body: `<iframe title="Names" src="${ybc}/api/address-labels"></iframe><iframe src="${dao}/sibling"></iframe><iframe src="https://attacker.example.test/"></iframe>` }));
  await context.route(`${dao}/sibling`, (route) => route.fulfill({ contentType: "text/html", body: "Sibling" }));
  await context.route("https://attacker.example.test/", (route) => route.fulfill({ contentType: "text/html", body: "Foreign origin" }));
  await context.route(`${ybc}/`, (route) => route.fulfill({ contentType: "text/html", body: "YBC origin" }));
  const page = await context.newPage();
  await page.goto(dao);
  await expect(page.locator('iframe[title="Names"]')).toBeVisible();
  expect(await operation(page, "set", "Shared name")).toMatchObject({ status: "saved", aliases: { [address]: "Shared name" } });

  const ybcPage = await context.newPage();
  await ybcPage.goto(ybc);
  expect(await ybcPage.evaluate((key) => JSON.parse(localStorage.getItem(key)!).aliases, ADDRESS_ALIASES_STORAGE_KEY)).toEqual({ [address]: "Shared name" });
  await ybcPage.evaluate(({ key, address }) => localStorage.setItem(key, JSON.stringify({ version: 1, aliases: { [address]: "Edited in YBC" } })), { key: ADDRESS_ALIASES_STORAGE_KEY, address });
  expect(await operation(page, "read")).toMatchObject({ status: "saved", aliases: { [address]: "Edited in YBC" } });

  const spoof = { kind: ADDRESS_LABEL_BRIDGE_KIND, id: "22222222-2222-4222-8222-222222222222", operation: "set", address, alias: "Spoofed" };
  for (const frameUrl of [`${dao}/sibling`, "https://attacker.example.test/"]) {
    const sibling = page.frames().find((frame) => frame.url() === frameUrl)!;
    await sibling.evaluate(({ request, origin }) => parent.frames[0].postMessage(request, origin), { request: spoof, origin: ybc });
  }
  expect(await operation(page, "read")).toMatchObject({ status: "saved", aliases: { [address]: "Edited in YBC" } });
  expect(await operation(page, "reset")).toMatchObject({ status: "saved", aliases: {} });
  expect(await ybcPage.evaluate((key) => JSON.parse(localStorage.getItem(key)!).aliases, ADDRESS_ALIASES_STORAGE_KEY)).toEqual({});
  await page.close();
  await ybcPage.close();
});

async function operation(page: Page, operation: "set" | "read" | "reset", alias?: string) {
  return page.evaluate(({ kind, operation, alias, address, origin }) => new Promise((resolve, reject) => {
    const frame = document.querySelector("iframe")!;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener("message", receive); reject(new Error("Bridge timed out")); }, 3_000);
    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.origin !== origin || event.data.id !== id) return;
      clearTimeout(timer); window.removeEventListener("message", receive); resolve(event.data);
    }
    window.addEventListener("message", receive);
    frame.contentWindow!.postMessage({ kind, id, operation, address, ...(alias ? { alias } : {}) }, origin);
  }), { kind: ADDRESS_LABEL_BRIDGE_KIND, operation, alias, address, origin: ybc });
}
