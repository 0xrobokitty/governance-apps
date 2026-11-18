import { describe, expect, it, vi } from "vitest";
import { getAccount } from "wagmi/actions";
import { assertDaoSubmissionWallet, explicitlyRejectedDaoSubmission, parseDaoWalletSubmission } from "@/lib/clients/dao/wallet-submission";
vi.mock("wagmi/actions", () => ({ getAccount: vi.fn(), getPublicClient: vi.fn() }));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
const account = "0x1111111111111111111111111111111111111111" as const;
const submission = { account, chainId: 1, kind: "safe" as const, submittedBlock: "0" };
describe("DAO wallet submission identity", () => {
  it("requires the original account and chain for neutral reconciliation", () => {
    vi.mocked(getAccount).mockReturnValue({ address: account, chainId: 1 } as unknown as ReturnType<typeof getAccount>);
    expect(() => assertDaoSubmissionWallet(submission)).not.toThrow();
    vi.mocked(getAccount).mockReturnValue({ address: account, chainId: 10 } as unknown as ReturnType<typeof getAccount>);
    expect(() => assertDaoSubmissionWallet(submission)).toThrow("original wallet");
    vi.mocked(getAccount).mockReturnValue({ address: "0x2222222222222222222222222222222222222222", chainId: 1 } as unknown as ReturnType<typeof getAccount>);
    expect(() => assertDaoSubmissionWallet(submission)).toThrow("original wallet");
  });
  it("clears only explicit wallet rejection and handles cyclic error causes", () => {
    expect(explicitlyRejectedDaoSubmission(new Error("Transport rejected response"))).toBe(false);
    expect(explicitlyRejectedDaoSubmission({ name: "UserRejectedRequestError" })).toBe(false);
    expect(explicitlyRejectedDaoSubmission({ cause: { code: 4001 } })).toBe(true);
    const first: { cause?: unknown } = {}, second = { cause: first }; first.cause = second;
    expect(explicitlyRejectedDaoSubmission(first)).toBe(false);
  });
  it("rejects malformed wallet scope while accepting legacy records without context", () => {
    expect(parseDaoWalletSubmission(undefined, account, 1)).toBeUndefined();
    expect(() => parseDaoWalletSubmission({ ...submission, chainId: 10 }, account, 1)).toThrow();
    expect(() => parseDaoWalletSubmission({ ...submission, reconciliationVerified: "true" }, account, 1)).toThrow();
    expect(() => parseDaoWalletSubmission({ ...submission, submittedBlock: "-1" }, account, 1)).toThrow();
  });
});
