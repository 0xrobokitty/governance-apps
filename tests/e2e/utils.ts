import type { Page } from "@playwright/test";
import type { Address } from "viem";
import type { TestBridge, TokenSymbol } from "@/lib/test-bridge";

type ScenarioName = Parameters<TestBridge["setScenario"]>[0];
type YethPreset = Parameters<TestBridge["setYethPreset"]>[1];
type TeamsViewerRole = NonNullable<TestBridge["setTeamsViewerRole"]> extends (
  role: infer TRole
) => Promise<void>
  ? TRole
  : never;
type YbcPerspective = Parameters<NonNullable<TestBridge["setYbcPerspective"]>>[0];

export const E2E_ADDRESS =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;

export async function waitForTestBridge(page: Page) {
  await page.waitForFunction(() => !!window.__TEST__);
}

/** Replay only idempotent fixture setup when a dev reload destroys its document. */
export async function prepareTestBridge(page: Page, setup: () => Promise<void>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForTestBridge(page);
    try {
      await setup();
      return;
    } catch (error) {
      if (
        attempt !== 0 ||
        !(error instanceof Error) ||
        !error.message.includes("Execution context was destroyed")
      ) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded");
    }
  }
}

export async function resetBridge(page: Page) {
  await page.evaluate(async () => {
    await window.__TEST__?.reset();
  });
}

export async function setBalance(
  page: Page,
  symbol: TokenSymbol,
  amount: string,
  address: Address = E2E_ADDRESS
) {
  await page.evaluate(
    async ({ addr, sym, amt }) => {
      await window.__TEST__?.setBalance(addr, sym, amt);
    },
    { addr: address, sym: symbol, amt: amount }
  );
}

export async function setAllowance(
  page: Page,
  symbol: TokenSymbol,
  spender: Address,
  amount: string,
  address: Address = E2E_ADDRESS
) {
  await page.evaluate(
    async ({ addr, sym, sp, amt }) => {
      await window.__TEST__?.setAllowance(addr, sym, sp, amt);
    },
    { addr: address, sym: symbol, sp: spender, amt: amount }
  );
}

export async function setScenario(page: Page, name: ScenarioName) {
  await page.evaluate(async (scenario) => {
    await window.__TEST__?.setScenario(scenario);
  }, name);
}

export async function seedExternalPortfolio(
  page: Page,
  address: Address = E2E_ADDRESS
) {
  await page.evaluate(async (addr) => {
    await window.__TEST__?.seedExternalPortfolio(addr);
  }, address);
}

export async function setYethPreset(
  page: Page,
  preset: YethPreset,
  address: Address = E2E_ADDRESS
) {
  await page.evaluate(
    async ({ addr, selectedPreset }) => {
      await window.__TEST__?.setYethPreset(addr, selectedPreset);
    },
    { addr: address, selectedPreset: preset }
  );
}

export async function setNow(page: Page, timestamp: number) {
  await page.evaluate(async (ts) => {
    await window.__TEST__?.setNow(ts);
  }, timestamp);
}

export async function setTeamsViewerRole(page: Page, role: TeamsViewerRole) {
  await page.evaluate(async (nextRole) => {
    await window.__TEST__?.setTeamsViewerRole?.(nextRole);
  }, role);
}

export async function setTeamsSelectedTeam(page: Page, teamId: string | null) {
  await page.evaluate(async (nextTeamId) => {
    await window.__TEST__?.setTeamsSelectedTeam?.(nextTeamId);
  }, teamId);
}

export async function setTeamsLoading(page: Page, value: boolean) {
  await page.evaluate(async (nextValue) => {
    await window.__TEST__?.setTeamsLoading?.(nextValue);
  }, value);
}

export async function setTeamsEmpty(page: Page, value: boolean) {
  await page.evaluate(async (nextValue) => {
    await window.__TEST__?.setTeamsEmpty?.(nextValue);
  }, value);
}

export async function patchTeamsAdmin(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(async (nextPatch) => {
    await window.__TEST__?.patchTeamsAdmin?.(nextPatch);
  }, patch);
}

export async function patchTeamsTeam(
  page: Page,
  teamId: string,
  patch: Record<string, unknown>
) {
  await page.evaluate(
    async ({ id, nextPatch }) => {
      await window.__TEST__?.patchTeamsTeam?.(id, nextPatch);
    },
    { id: teamId, nextPatch: patch }
  );
}

export async function setYbcPerspective(page: Page, perspective: YbcPerspective) {
  await page.evaluate(async (value) => {
    await window.__TEST__?.setYbcPerspective?.(value);
  }, perspective);
}

export async function setYbcEmptyBoard(page: Page, value: boolean) {
  await page.evaluate(async (nextValue) => {
    await window.__TEST__?.setYbcEmptyBoard?.(nextValue);
  }, value);
}

export async function getState(page: Page, address: Address = E2E_ADDRESS) {
  return page.evaluate(async (addr) => {
    return window.__TEST__?.getState(addr);
  }, address);
}
