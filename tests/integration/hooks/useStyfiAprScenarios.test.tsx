import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { createMockStyfiClient } from "@/lib/clients/styfi/mock";
import { resetStyfiMockScenario, setStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { useStyfiVotingPower } from "@/lib/hooks/useStyfiVotingPower";
import { styfiKeys } from "@/lib/hooks/useStyfi";
import { veyfiKeys } from "@/lib/hooks/useVeyfi";
import { nowSeconds, setFixedNow } from "@/lib/mocks/time";
import { renderHookWithProviders } from "@/tests/test-utils";

const FIXED_NOW = 1_800_000_000;
const STAKE = 25n * 10n ** 18n;

describe("stYFI mock scenario subscriptions", () => {
  beforeEach(() => {
    setFixedNow(FIXED_NOW);
    createMockStyfiClient({ latencyMs: 0 }).debugSetBalance(E2E_MOCK_ADDRESS, "stYFI", STAKE);
  });

  it("updates APR scenarios without a balance refresh or advancing the mock clock", async () => {
    const { result, queryClient } = renderHookWithProviders(() => useStyfiApr());
    await waitFor(() => expect(result.current.data?.account?.portfolioAprBps).toBeCloseTo(1400, 3));

    const account = queryClient.getQueryData(styfiKeys.account(E2E_MOCK_ADDRESS));
    const externalAccount = queryClient.getQueryData(veyfiKeys.account(E2E_MOCK_ADDRESS));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => setStyfiMockScenario("full"));
    expect(result.current.data?.account?.portfolioAprBps).toBeCloseTo(2000, 3);
    expect(result.current.data?.account?.participation.votes).toBe(6n);

    act(() => setStyfiMockScenario("missed"));
    expect(result.current.data?.account?.portfolioAprBps).toBeCloseTo(800, 3);
    expect(result.current.data?.account?.participation.votes).toBe(0n);

    act(() => setStyfiMockScenario("ybc"));
    expect(result.current.data?.account?.portfolioAprBps).toBeCloseTo(2500, 3);
    expect(result.current.data?.account?.ybcAprBps).toBeCloseTo(500, 3);

    act(() => resetStyfiMockScenario());
    expect(result.current.data?.account?.portfolioAprBps).toBeCloseTo(1400, 3);
    expect(result.current.data?.account?.isYbcMember).toBe(false);

    expect(result.current.data?.account?.styfiActive).toBe(STAKE);
    expect(nowSeconds()).toBe(FIXED_NOW);
    expect(invalidate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(styfiKeys.account(E2E_MOCK_ADDRESS))).toBe(account);
    expect(queryClient.getQueryData(veyfiKeys.account(E2E_MOCK_ADDRESS))).toBe(externalAccount);
  });

  it("updates YBC voting influence independently of the APR hook and account queries", async () => {
    const { result, queryClient } = renderHookWithProviders(() => useStyfiVotingPower());
    await waitFor(() => expect(result.current.data?.directPower).toBe(STAKE));
    expect(result.current.data?.isYbcMember).toBe(false);

    const account = queryClient.getQueryData(styfiKeys.account(E2E_MOCK_ADDRESS));
    const externalAccount = queryClient.getQueryData(veyfiKeys.account(E2E_MOCK_ADDRESS));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => setStyfiMockScenario("ybc"));
    expect(result.current.data?.isYbcMember).toBe(true);
    expect(result.current.data?.ybcInfluence?.totalPower).toBeGreaterThan(STAKE);

    act(() => setStyfiMockScenario("full"));
    expect(result.current.data?.isYbcMember).toBe(false);
    expect(result.current.data?.ybcInfluence?.totalPower).toBe(STAKE);

    expect(result.current.data?.directPower).toBe(STAKE);
    expect(nowSeconds()).toBe(FIXED_NOW);
    expect(invalidate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(styfiKeys.account(E2E_MOCK_ADDRESS))).toBe(account);
    expect(queryClient.getQueryData(veyfiKeys.account(E2E_MOCK_ADDRESS))).toBe(externalAccount);
  });
});
