// Domain tests own preflight and simulation; shared wallet tracking has separate integration coverage.
vi.mock("@/lib/tx/tracked-write", () => ({ trackedContractWrite: (_request: unknown, send: () => Promise<unknown>) => send() }));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress, type Address, type PublicClient } from "viem";
import {
  getAccount,
  getPublicClient,
  simulateContract,
  writeContract,
} from "wagmi/actions";
import { OnchainStyfiClient } from "@/lib/clients/styfi/onchain";
import { OnchainTeamsClient } from "@/lib/clients/teams/onchain";
import { OnchainVeyfiClient } from "@/lib/clients/veyfi/onchain";
import { OnchainYbcClient } from "@/lib/clients/ybc/onchain";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import { LIQUID_LOCKERS, STYFI_ADDRESS } from "@/lib/constants";
import teamsFeedExample from "@/docs/apps/teams/onchain-integration-plan/examples/teams-feed.example.json";
import feedExample from "@/docs/apps/ybc/onchain-integration-plan/examples/ybc-feed.example.json";
import { TeamsFeedSchema } from "@/lib/schemas/teams-feed";
import { YbcFeedSchema } from "@/lib/schemas/ybc-feed";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import {
  createTeamsWritePublicClient,
  TEAMS_CURRENT_BLOCK,
  TEAMS_CURRENT_BLOCK_HASH,
  type TeamsCurrentReadOverrides,
} from "@/tests/helpers/teams-onchain";

vi.mock("wagmi/actions", () => ({
  getAccount: vi.fn(),
  getPublicClient: vi.fn(),
  simulateContract: vi.fn(),
  writeContract: vi.fn(),
}));

const USER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_USER =
  "0x2222222222222222222222222222222222222222" as const;
const ybcPublicClient = {
  chain: { id: MAINNET_CHAIN_ID },
  getChainId: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  readContract: vi.fn(),
};
const ATTACKER =
  "0x9999999999999999999999999999999999999999" as const;
const NEXT_BLOCK_HASH =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
const THIRD_BLOCK_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const FOURTH_BLOCK_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function createReturnableTeamsFeed() {
  const sourceApproval = teamsFeedExample.fundingApprovals[0]!;
  return TeamsFeedSchema.parse({
    ...teamsFeedExample,
    fundingApprovals: [
      {
        ...sourceApproval,
        used: "1",
        claimable: "49999999",
        claims: [
          {
            id: `${"0x"}${"b".repeat(64)}-1`,
            approvalId: sourceApproval.id,
            team: sourceApproval.team,
            period: sourceApproval.period,
            token: sourceApproval.token,
            amount: "1",
            costUsd: "0",
            vest: null,
            recipient: USER,
            txHash: `${"0x"}${"b".repeat(64)}`,
            blockNumber: teamsFeedExample.blockNumber,
            logIndex: 1,
            timestamp: teamsFeedExample.generatedAt,
          },
        ],
      },
    ],
    events: {
      ...teamsFeedExample.events,
      fundingClaimCount: 1,
    },
  });
}

describe("On-chain write safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAccount).mockReturnValue({
      address: USER,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(writeContract).mockResolvedValue(
      "0xmockhash" as Awaited<ReturnType<typeof writeContract>>
    );
    ybcPublicClient.getBlock.mockResolvedValue({
      hash: feedExample.blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    });
    ybcPublicClient.getChainId.mockResolvedValue(MAINNET_CHAIN_ID);
    ybcPublicClient.getBlockNumber.mockResolvedValue(
      BigInt(feedExample.blockNumber)
    );
    ybcPublicClient.readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        const proposal = feedExample.proposals[0]!;
        switch (functionName) {
          case "num_proposals":
            return 1n;
          case "proposals":
            return canonicalProposal(proposal);
          case "status":
            return 4n;
          default:
            return null;
        }
      }
    );
    vi.mocked(getPublicClient).mockReturnValue(
      ybcPublicClient as unknown as PublicClient
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pre-simulates stYFI stake writes on mainnet", async () => {
    const request = {
      address: STYFI_ADDRESS,
      functionName: "deposit",
      args: [42n, USER],
      chainId: MAINNET_CHAIN_ID,
      account: USER,
    };

    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainStyfiClient(null, null);
    const prepare = await client.prepareStake("stYFI", 42n);
    await prepare();

    expect(simulateContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        functionName: "deposit",
        chainId: MAINNET_CHAIN_ID,
        account: USER,
      })
    );
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it("pre-simulates veYFI staking writes on mainnet", async () => {
    const request = {
      address: LIQUID_LOCKERS[0].depositor,
      functionName: "dummy",
    };

    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainVeyfiClient(null, null);
    const prepare = await client.prepareStakeLlyfi(LIQUID_LOCKERS[0].symbol, 1n);
    await prepare();

    expect(simulateContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        functionName: "deposit",
        chainId: MAINNET_CHAIN_ID,
        account: USER,
      })
    );
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it("pre-simulates YBC proposal votes on mainnet", async () => {
    const request = {
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      functionName: "dummy",
    };

    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: undefined,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainYbcClient(
      YbcFeedSchema.parse({
        ...feedExample,
        generatedAt: Math.floor(Date.now() / 1_000),
      }),
      USER
    );
    const prepare = await client.prepareVote(0n, "yea");
    await prepare();

    expect(simulateContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        functionName: "vote_yea",
        args: [0n],
        chainId: MAINNET_CHAIN_ID,
        account: USER,
      })
    );
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it.each([
    {
      label: "proposal addition",
      expectedFunction: "propose_addition",
      expectedArgs: [OTHER_USER],
      status: 4,
      prepare: (client: OnchainYbcClient) =>
        client.preparePropose("addition", OTHER_USER),
    },
    {
      label: "proposal expulsion",
      expectedFunction: "propose_expulsion",
      expectedArgs: [OTHER_USER],
      status: 4,
      prepare: (client: OnchainYbcClient) =>
        client.preparePropose("expulsion", OTHER_USER),
    },
    {
      label: "proposal retraction",
      expectedFunction: "retract",
      expectedArgs: [0n],
      status: 1,
      prepare: (client: OnchainYbcClient) =>
        client.prepareRetract(0n),
    },
    {
      label: "nay vote",
      expectedFunction: "vote_nay",
      expectedArgs: [0n],
      status: 4,
      prepare: (client: OnchainYbcClient) =>
        client.prepareVote(0n, "nay"),
    },
    {
      label: "proposal execution",
      expectedFunction: "execute",
      expectedArgs: [0n],
      status: 8,
      prepare: (client: OnchainYbcClient) =>
        client.prepareExecute(0n),
    },
  ])("preflights and simulates $label", async ({
    expectedArgs,
    expectedFunction,
    prepare,
    status,
  }) => {
    ybcPublicClient.readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        const proposal = feedExample.proposals[0]!;
        if (functionName === "num_proposals") return 1n;
        if (functionName === "proposals") {
          return canonicalProposal(proposal);
        }
        if (functionName === "status") return status;
        return null;
      }
    );
    const request = {
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      functionName: expectedFunction,
    };
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: undefined,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepared = await prepare(createYbcClient());
    await prepared();

    expect(simulateContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        functionName: expectedFunction,
        args: expectedArgs,
        account: USER,
        chainId: MAINNET_CHAIN_ID,
      })
    );
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it("allows an old canonical YBC snapshot through live write validation", async () => {
    const generatedAt = 2_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(generatedAt * 1_000);
    ybcPublicClient.getBlock.mockResolvedValue({
      hash: feedExample.blockHash,
      timestamp: BigInt(generatedAt),
    });
    const client = new OnchainYbcClient(
      YbcFeedSchema.parse({
        ...feedExample,
        generatedAt,
      }),
      USER
    );
    const prepare = await client.prepareVote(0n, "yea");
    const request = {
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      functionName: "vote_yea",
    };
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: undefined,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    vi.setSystemTime((generatedAt + 86_400) * 1_000);

    await expect(prepare()).resolves.toBe("0xmockhash");
    expect(simulateContract).toHaveBeenCalledOnce();
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it("allows canonical verification to complete after wall-clock time advances", async () => {
    const nowSeconds = 2_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowSeconds * 1_000);
    const block =
      createDeferred<Awaited<ReturnType<PublicClient["getBlock"]>>>();
    const blockRequested = createDeferred<void>();
    ybcPublicClient.getBlock.mockImplementation(() => {
      blockRequested.resolve();
      return block.promise;
    });
    const client = new OnchainYbcClient(
      YbcFeedSchema.parse({
        ...feedExample,
        generatedAt: nowSeconds,
      }),
      USER
    );
    const prepare = await client.prepareVote(0n, "yea");
    const request = {
      address: YBC_MAINNET_DEPLOYMENT.ybcElection,
      functionName: "vote_yea",
    };
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: undefined,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);
    const submission = prepare();

    await blockRequested.promise;
    vi.setSystemTime((nowSeconds + 86_400) * 1_000);
    block.resolve({
      hash: feedExample.blockHash,
      timestamp: BigInt(nowSeconds - 86_400),
    } as Awaited<ReturnType<PublicClient["getBlock"]>>);

    await expect(submission).resolves.toBe("0xmockhash");
    expect(simulateContract).toHaveBeenCalledOnce();
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
  });

  it("rejects malicious feed authority before preparing a YBC write", () => {
    const maliciousFeed = YbcFeedSchema.parse({
      ...feedExample,
      deployment: {
        ...feedExample.deployment,
        ybcElection: "0x9999999999999999999999999999999999999999",
      },
    });

    expect(() => new OnchainYbcClient(maliciousFeed, USER)).toThrow(
      /deployment mismatch: ybcElection/i
    );
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("blocks a YBC write when the connected account changes during preflight", async () => {
    vi.mocked(getAccount)
      .mockReturnValueOnce({
        address: USER,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: OTHER_USER,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>);
    const client = createYbcClient();
    const prepare = await client.prepareVote(0n, "yea");

    await expect(prepare()).rejects.toThrow(/connected wallet changed/i);
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("blocks a YBC write when the latest proposal identity changed", async () => {
    ybcPublicClient.readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        const proposal = feedExample.proposals[0]!;
        switch (functionName) {
          case "num_proposals":
            return 1n;
          case "proposals":
            return [
              "0x9999999999999999999999999999999999999999",
              proposal.proposer,
              BigInt(proposal.epoch),
              proposal.addition,
              BigInt(proposal.thresholdBps),
              BigInt(proposal.votes),
              BigInt(proposal.yea),
              proposal.retracted,
              proposal.executed,
            ] as const;
          case "status":
            return 4n;
          default:
            return null;
        }
      }
    );
    const prepare = await createYbcClient().prepareVote(0n, "yea");

    await expect(prepare()).rejects.toThrow(/account does not match mainnet/i);
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("blocks a YBC write when the latest proposal phase changed", async () => {
    ybcPublicClient.readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        const proposal = feedExample.proposals[0]!;
        switch (functionName) {
          case "num_proposals":
            return 1n;
          case "proposals":
            return canonicalProposal(proposal);
          case "status":
            return 8n;
          default:
            return null;
        }
      }
    );
    const prepare = await createYbcClient().prepareVote(0n, "yea");

    await expect(prepare()).rejects.toThrow(/no longer ready for voting/i);
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("pre-simulates canonical Teams write targets on mainnet", async () => {
    const feed = createReturnableTeamsFeed();
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const approval = feed.fundingApprovals[0]!;
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind === "revenue"
    )!;
    const request = {
      address: team.address,
      functionName: "dummy",
    };

    vi.mocked(simulateContract)
      .mockResolvedValueOnce({
        request,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request,
        result: [0n, 0n],
      } as unknown as Awaited<ReturnType<typeof simulateContract>>);
    const publicClient = createTeamsWritePublicClient(feed);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);

    const client = new OnchainTeamsClient(feed, owner, MAINNET_CHAIN_ID);
    const preparedWrites = await Promise.all([
      client.prepareRevenueApproval(
        team.address as Address,
        revenueToken.address as Address,
        1n
      ),
      client.prepareFundingReturnApproval(
        team.address as Address,
        BigInt(approval.id),
        1n
      ),
      client.prepareRevenueDeposit(
        team.address as Address,
        revenueToken.address as Address,
        1n
      ),
      client.prepareFundingClaim(
        team.address as Address,
        BigInt(approval.id),
        1n,
        owner
      ),
      client.prepareFundingReturn(
        team.address as Address,
        BigInt(approval.id),
        1n
      ),
      client.prepareBonusClaim(team.address as Address, USER),
    ]);
    for (const prepared of preparedWrites) {
      await prepared();
    }

    expect(simulateContract).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        address: revenueToken.address,
        functionName: "approve",
        args: [team.address, 1n],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        address: approval.token,
        functionName: "approve",
        args: [team.address, 1n],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({
        address: team.address,
        functionName: "deposit_revenue",
        args: [revenueToken.address, 1n],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      4,
      expect.anything(),
      expect.objectContaining({
        address: team.address,
        functionName: "claim_funding",
        args: [BigInt(approval.id), 1n, owner],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      5,
      expect.anything(),
      expect.objectContaining({
        address: team.address,
        functionName: "return_funding",
        args: [BigInt(approval.id), 1n],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      6,
      expect.anything(),
      expect.objectContaining({
        address: feed.deployment.bonusDistributor,
        functionName: "claim",
        args: [team.address, USER],
        chainId: MAINNET_CHAIN_ID,
        account: owner,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(writeContract).toHaveBeenCalledTimes(6);
    expect(writeContract).toHaveBeenLastCalledWith(
      expect.anything(),
      request
    );
    expect(publicClient.getBlock).toHaveBeenCalledTimes(24);
    expect(publicClient.getChainId).toHaveBeenCalledTimes(24);
    for (const [readRequest] of publicClient.readContract.mock.calls) {
      expect(readRequest).toEqual(
        expect.objectContaining({
          blockNumber: TEAMS_CURRENT_BLOCK,
        })
      );
    }
  });

  it("rejects non-feed Teams approval destinations before live reads", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind === "revenue"
    )!;
    const client = new OnchainTeamsClient(feed, owner, MAINNET_CHAIN_ID);

    await expect(
      client.prepareRevenueApproval(
        ATTACKER,
        revenueToken.address as Address,
        1n
      )
    ).rejects.toThrow(
      "The selected Teams contract is not present in the current feed."
    );
    await expect(
      client.prepareRevenueApproval(
        team.address as Address,
        ATTACKER,
        1n
      )
    ).rejects.toThrow(
      "The selected revenue token is not supported by the current feed."
    );
    await expect(
      client.prepareFundingReturnApproval(
        team.address as Address,
        999n,
        1n
      )
    ).rejects.toThrow(
      "The selected Teams funding approval is not present for this team."
    );

    expect(getPublicClient).not.toHaveBeenCalled();
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("validates aggregate return capacity before a funding token approval", async () => {
    const feed = createReturnableTeamsFeed();
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const approval = feed.fundingApprovals[0]!;
    const publicClient = createTeamsWritePublicClient(feed, {
      cost: [0n, 0n],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareFundingReturnApproval(
      team.address as Address,
      BigInt(approval.id),
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "funding return exceeds the current aggregate returnable amount"
    );
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each([
    "approval team",
    "approval token",
    "approval period",
    "approval token getter",
    "registry funding root",
  ] as const)(
    "rejects a changed funding-return %s before approval simulation",
    async (changedBinding) => {
      const feed = createReturnableTeamsFeed();
      const team = feed.teams[0]!;
      const owner = team.owner as Address;
      const approval = feed.fundingApprovals[0]!;
      const currentApproval = [
        getAddress(approval.team),
        BigInt(approval.period),
        getAddress(approval.token),
        BigInt(approval.amount),
        BigInt(approval.durationSeconds),
        BigInt(approval.used),
      ] as const;
      let overrides: TeamsCurrentReadOverrides;
      if (changedBinding === "approval team") {
        overrides = {
          approval: [
            ATTACKER,
            currentApproval[1],
            currentApproval[2],
            currentApproval[3],
            currentApproval[4],
            currentApproval[5],
          ],
        };
      } else if (changedBinding === "approval token") {
        overrides = {
          approval: [
            currentApproval[0],
            currentApproval[1],
            ATTACKER,
            currentApproval[3],
            currentApproval[4],
            currentApproval[5],
          ],
        };
      } else if (changedBinding === "approval period") {
        overrides = {
          approval: [
            currentApproval[0],
            currentApproval[1] + 1n,
            currentApproval[2],
            currentApproval[3],
            currentApproval[4],
            currentApproval[5],
          ],
        };
      } else if (changedBinding === "approval token getter") {
        overrides = {
          approvalToken: ATTACKER,
        };
      } else {
        overrides = {
          registryFundingDistributor: ATTACKER,
        };
      }
      const publicClient = createTeamsWritePublicClient(feed, overrides);
      vi.mocked(getPublicClient).mockReturnValue(
        publicClient as ReturnType<typeof getPublicClient>
      );
      vi.mocked(getAccount).mockReturnValue({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>);

      const prepare = await new OnchainTeamsClient(
        feed,
        owner,
        MAINNET_CHAIN_ID
      ).prepareFundingReturnApproval(
        team.address as Address,
        BigInt(approval.id),
        1n
      );

      await expect(prepare()).rejects.toThrow(
        changedBinding === "registry funding root"
          ? "registry funding distributor"
          : `funding approval ${approval.id} ${changedBinding.replace(
              "approval ",
              ""
            )}`
      );
      expect(simulateContract).not.toHaveBeenCalled();
      expect(writeContract).not.toHaveBeenCalled();
    }
  );

  it("revalidates and resimulates an exact Teams approval at an advanced head", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind === "revenue"
    )!;
    const firstRequest = {
      address: revenueToken.address,
      functionName: "stale-approval",
      blockNumber: TEAMS_CURRENT_BLOCK,
      blockTag: "latest",
    };
    const secondRequest = {
      address: revenueToken.address,
      functionName: "fresh-approval",
      blockNumber: TEAMS_CURRENT_BLOCK + 1n,
      blockTag: "latest",
    };
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract)
      .mockResolvedValueOnce({
        request: firstRequest,
        result: true,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request: secondRequest,
        result: true,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueApproval(
      team.address as Address,
      revenueToken.address as Address,
      1_234_567n
    );
    await prepare();

    expect(simulateContract).toHaveBeenCalledTimes(2);
    expect(simulateContract).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        address: revenueToken.address,
        functionName: "approve",
        args: [team.address, 1_234_567n],
        account: owner,
        chainId: MAINNET_CHAIN_ID,
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        address: revenueToken.address,
        functionName: "approve",
        args: [team.address, 1_234_567n],
        account: owner,
        chainId: MAINNET_CHAIN_ID,
        blockNumber: TEAMS_CURRENT_BLOCK + 1n,
      })
    );
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), {
      address: revenueToken.address,
      functionName: "fresh-approval",
    });
  });

  it("rejects a same-height head replacement for a Teams approval", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind === "revenue"
    )!;
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request: {
        address: revenueToken.address,
        functionName: "stale-approval",
      },
      result: true,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueApproval(
      team.address as Address,
      revenueToken.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "changed at the same block height"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each(["account", "connected chain", "RPC chain"] as const)(
    "rejects a %s change after Teams approval simulation",
    async (changedAuthority) => {
      const feed = TeamsFeedSchema.parse(teamsFeedExample);
      const team = feed.teams[0]!;
      const owner = team.owner as Address;
      const revenueToken = Object.values(feed.tokens).find(
        (token) => token.kind === "revenue"
      )!;
      const publicClient = createTeamsWritePublicClient(feed);
      vi.mocked(getPublicClient).mockReturnValue(
        publicClient as ReturnType<typeof getPublicClient>
      );
      if (changedAuthority === "account") {
        vi.mocked(getAccount)
          .mockReturnValueOnce({
            address: owner,
            chainId: MAINNET_CHAIN_ID,
          } as unknown as ReturnType<typeof getAccount>)
          .mockReturnValueOnce({
            address: owner,
            chainId: MAINNET_CHAIN_ID,
          } as unknown as ReturnType<typeof getAccount>)
          .mockReturnValueOnce({
            address: ATTACKER,
            chainId: MAINNET_CHAIN_ID,
          } as unknown as ReturnType<typeof getAccount>);
      } else if (changedAuthority === "connected chain") {
        vi.mocked(getAccount)
          .mockReturnValueOnce({
            address: owner,
            chainId: MAINNET_CHAIN_ID,
          } as unknown as ReturnType<typeof getAccount>)
          .mockReturnValueOnce({
            address: owner,
            chainId: MAINNET_CHAIN_ID,
          } as unknown as ReturnType<typeof getAccount>)
          .mockReturnValueOnce({
            address: owner,
            chainId: 137,
          } as unknown as ReturnType<typeof getAccount>);
      } else {
        vi.mocked(getAccount).mockReturnValue({
          address: owner,
          chainId: MAINNET_CHAIN_ID,
        } as unknown as ReturnType<typeof getAccount>);
        publicClient.getChainId
          .mockResolvedValueOnce(MAINNET_CHAIN_ID)
          .mockResolvedValueOnce(MAINNET_CHAIN_ID)
          .mockResolvedValueOnce(137);
      }
      vi.mocked(simulateContract).mockResolvedValue({
        request: {
          address: revenueToken.address,
          functionName: "approval",
        },
        result: true,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>);

      const prepare = await new OnchainTeamsClient(
        feed,
        owner,
        MAINNET_CHAIN_ID
      ).prepareRevenueApproval(
        team.address as Address,
        revenueToken.address as Address,
        1n
      );

      await expect(prepare()).rejects.toThrow(
        changedAuthority === "account"
          ? "wallet changed after this action was prepared"
          : changedAuthority === "connected chain"
            ? "Wrong network. Please switch to Ethereum Mainnet."
            : "require an Ethereum Mainnet RPC"
      );
      expect(simulateContract).toHaveBeenCalledTimes(1);
      expect(writeContract).not.toHaveBeenCalled();
    }
  );

  it("does not direct-write a Teams approval when simulation fails", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind === "revenue"
    )!;
    const publicClient = createTeamsWritePublicClient(feed);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockRejectedValue(
      new Error("approval simulation failed")
    );

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueApproval(
      team.address as Address,
      revenueToken.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "approval simulation failed"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects an account change after Teams simulation before submission", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const attacker =
      "0x9999999999999999999999999999999999999999" as Address;
    const request = {
      address: team.address,
      functionName: "dummy",
    };
    const publicClient = createTeamsWritePublicClient(feed);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: attacker,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "wallet changed after this action was prepared"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects a connected-chain change after Teams simulation before submission", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const request = {
      address: team.address,
      functionName: "dummy",
    };
    const publicClient = createTeamsWritePublicClient(feed);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: owner,
        chainId: 137,
      } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "Wrong network. Please switch to Ethereum Mainnet."
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects an RPC chain change after Teams simulation before submission", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const request = {
      address: team.address,
      functionName: "dummy",
    };
    const publicClient = createTeamsWritePublicClient(feed);
    publicClient.getChainId
      .mockResolvedValueOnce(MAINNET_CHAIN_ID)
      .mockResolvedValueOnce(MAINNET_CHAIN_ID)
      .mockResolvedValueOnce(137);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "require an Ethereum Mainnet RPC"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects an account change after Teams target reads before simulation", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const attacker =
      "0x9999999999999999999999999999999999999999" as Address;
    const publicClient = createTeamsWritePublicClient(feed);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: attacker,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "wallet changed after this action was prepared"
    );
    expect(publicClient.readContract).not.toHaveBeenCalledTimes(0);
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects a Teams validation-block reorg before simulation", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const publicClient = createTeamsWritePublicClient(feed, {
      recheckBlockHash:
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "validation anchor is no longer canonical"
    );
    expect(publicClient.getBlock).toHaveBeenNthCalledWith(1, {
      blockTag: "latest",
    });
    expect(publicClient.getBlock).toHaveBeenNthCalledWith(2, {
      blockNumber: TEAMS_CURRENT_BLOCK,
    });
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
    expect(TEAMS_CURRENT_BLOCK_HASH).not.toBe(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
  });

  it("rejects a Teams validation-block reorg after simulation before submission", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const changedHash =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
    const request = {
      address: team.address,
      functionName: "dummy",
    };
    const publicClient = createTeamsWritePublicClient(feed, {
      recheckBlockHashes: [TEAMS_CURRENT_BLOCK_HASH, changedHash],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "validation anchor is no longer canonical"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("revalidates and resimulates at an advanced head before submitting only the fresh request", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const firstRequest = {
      address: team.address,
      functionName: "first",
      blockNumber: TEAMS_CURRENT_BLOCK,
      blockTag: "latest",
    };
    const secondRequest = {
      address: team.address,
      functionName: "second",
      blockNumber: TEAMS_CURRENT_BLOCK + 1n,
      blockTag: "latest",
    };
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract)
      .mockResolvedValueOnce({
        request: firstRequest,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>)
      .mockResolvedValueOnce({
        request: secondRequest,
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );
    await prepare();

    expect(simulateContract).toHaveBeenCalledTimes(2);
    expect(simulateContract).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        blockNumber: TEAMS_CURRENT_BLOCK,
      })
    );
    expect(simulateContract).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        blockNumber: TEAMS_CURRENT_BLOCK + 1n,
      })
    );
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), {
      address: team.address,
      functionName: "second",
    });
  });

  it("fails closed when a downstream root mutates at the advanced head", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const overrides = {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
      ],
      revenueAccountant: feed.deployment.teamAccountant,
    };
    const publicClient = createTeamsWritePublicClient(feed, overrides);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockImplementation(async () => {
      overrides.revenueAccountant = ATTACKER;
      return {
        request: {
          address: team.address,
          functionName: "stale",
          blockNumber: TEAMS_CURRENT_BLOCK,
        },
        result: 0n,
      } as unknown as Awaited<ReturnType<typeof simulateContract>>;
    });

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "revenue recipient accountant"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("retries a zero bonus result and rejects a positive fresh result with a changed YBC recipient", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const overrides = {
      bonusPendingPeriod: BigInt(feed.bonus.pendingPeriod + 20),
      bonusYbcRecipient: feed.deployment.ybcBonusRecipient,
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    };
    const publicClient = createTeamsWritePublicClient(feed, overrides);
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract)
      .mockImplementationOnce(async () => {
        overrides.bonusYbcRecipient = ATTACKER;
        return {
          request: {
            address: feed.deployment.bonusDistributor,
            functionName: "stale",
            blockNumber: TEAMS_CURRENT_BLOCK,
          },
          result: [0n, 0n],
        } as unknown as Awaited<ReturnType<typeof simulateContract>>;
      })
      .mockResolvedValueOnce({
        request: {
          address: feed.deployment.bonusDistributor,
          functionName: "fresh",
          blockNumber: TEAMS_CURRENT_BLOCK + 1n,
        },
        result: [1n, 1n],
      } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareBonusClaim(team.address as Address, owner);

    await expect(prepare()).rejects.toThrow(
      "bonus distributor YBC recipient"
    );
    expect(simulateContract).toHaveBeenCalledTimes(2);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("fails closed when the Teams head advances through every bounded simulation attempt", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 2n,
          hash: THIRD_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 3n,
          hash: FOURTH_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request: {
        address: team.address,
        functionName: "stale",
        blockNumber: TEAMS_CURRENT_BLOCK,
      },
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "chain head advanced too often"
    );
    expect(simulateContract).toHaveBeenCalledTimes(3);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects a same-height Teams head replacement after simulation", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request: {
        address: team.address,
        functionName: "stale",
        blockNumber: TEAMS_CURRENT_BLOCK,
      },
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "changed at the same block height"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rechecks the prepared wallet before simulating a retry at a newer head", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const publicClient = createTeamsWritePublicClient(feed, {
      latestBlocks: [
        {
          number: TEAMS_CURRENT_BLOCK,
          hash: TEAMS_CURRENT_BLOCK_HASH,
        },
        {
          number: TEAMS_CURRENT_BLOCK + 1n,
          hash: NEXT_BLOCK_HASH,
        },
      ],
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: owner,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>)
      .mockReturnValueOnce({
        address: ATTACKER,
        chainId: MAINNET_CHAIN_ID,
      } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request: {
        address: team.address,
        functionName: "stale",
        blockNumber: TEAMS_CURRENT_BLOCK,
      },
      result: 0n,
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const prepare = await new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    ).prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "wallet changed after this action was prepared"
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("submits a simulated zero-result bonus batch so its cursor can advance", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const request = {
      address: feed.deployment.bonusDistributor,
      functionName: "claim",
    };
    const publicClient = createTeamsWritePublicClient(feed, {
      bonusPendingPeriod: BigInt(feed.bonus.pendingPeriod + 20),
      bonusYbcRecipient: ATTACKER,
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);
    vi.mocked(simulateContract).mockResolvedValue({
      request,
      result: [0n, 0n],
    } as unknown as Awaited<ReturnType<typeof simulateContract>>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareBonusClaim(
      team.address as Address,
      owner
    );
    await prepare();

    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(expect.anything(), request);
    expect(publicClient.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "ybc_recipient" })
    );
  });

  it("rejects a Teams RPC whose actual chain is not mainnet", async () => {
    const feed = TeamsFeedSchema.parse(teamsFeedExample);
    const team = feed.teams[0]!;
    const owner = team.owner as Address;
    const publicClient = createTeamsWritePublicClient(feed, {
      rpcChainId: 137,
    });
    vi.mocked(getPublicClient).mockReturnValue(
      publicClient as ReturnType<typeof getPublicClient>
    );
    vi.mocked(getAccount).mockReturnValue({
      address: owner,
      chainId: MAINNET_CHAIN_ID,
    } as unknown as ReturnType<typeof getAccount>);

    const client = new OnchainTeamsClient(
      feed,
      owner,
      MAINNET_CHAIN_ID
    );
    const prepare = await client.prepareRevenueDeposit(
      team.address as Address,
      Object.values(feed.tokens)[0]!.address as Address,
      1n
    );

    await expect(prepare()).rejects.toThrow(
      "require an Ethereum Mainnet RPC"
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("blocks writes on non-mainnet accounts", async () => {
    vi.mocked(getAccount).mockReturnValue({
      address: USER,
      chainId: 137,
    } as unknown as ReturnType<typeof getAccount>);

    const client = new OnchainVeyfiClient(null, null);
    const prepare = await client.prepareMigrateVeYfi();

    await expect(prepare()).rejects.toThrow(
      "Wrong network. Please switch to Ethereum Mainnet."
    );
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });
});

function createYbcClient() {
  return new OnchainYbcClient(
    YbcFeedSchema.parse({
      ...feedExample,
      generatedAt: Math.floor(Date.now() / 1_000),
    }),
    USER
  );
}

function canonicalProposal(
  proposal: (typeof feedExample.proposals)[number]
) {
  return [
    proposal.account,
    proposal.proposer,
    BigInt(proposal.epoch),
    proposal.addition,
    BigInt(proposal.thresholdBps),
    BigInt(proposal.votes),
    BigInt(proposal.yea),
    proposal.retracted,
    proposal.executed,
  ] as const;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
