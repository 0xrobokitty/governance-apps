import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  DAO_EXECUTOR_VALID_SCRIPT_VECTORS,
  DAO_EMPTY_SCRIPT_HASH,
  readDaoCreatedProposals,
  resetDaoMockStore,
  type DaoMockTransactionOutcome,
} from "@/lib/clients/dao";
import {
  createDaoAuthoringReview,
  composeDaoProposalMarkdown,
  DAO_PROPOSAL_MARKDOWN_TEMPLATE,
  findFirstFullDaoCapacityEpoch,
  splitDaoProposalMarkdown,
} from "@/app/dao/propose/authoring";
import {
  confirmMockDaoProposalReceipt,
  publishMockDaoProposalContent,
  registerMockDaoProposalAwaitingIndex,
  submitMockDaoProposal,
  validateMockDaoForumTopic,
} from "@/app/dao/propose/mock-services";

const ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
const CREATED_AT = 1_723_420_800;
const TRANSACTION_HASH = `0x${"a5".repeat(32)}` as Hex;

afterEach(() => {
  vi.useRealTimers();
});

describe("DAO proposal authoring vectors", () => {
  it.each(["Approve research funding.", "## Summary\n\nApprove research funding."])("accepts the short body %s with a separate title", async markdown => {
    const result = createDaoAuthoringReview({ address: ADDRESS, createdAt: CREATED_AT, topic: await validTopic(1001),
      draft: { title: "Research funding", markdown, proposalType: "signal", executableScript: "0x" } });
    expect(result.state).toBe("valid");
    if (result.state !== "valid") return;
    expect(result.review.parsedContent.title).toBe("Research funding");
    expect(result.review.parsedContent.summary).toBe("Approve research funding.");
    expect(result.review.content.markdown).toBe(`# Research funding\n\n${markdown}`);
  });

  it.each(["", "Summary", " summary: ", "A title\n\n# Injected heading", "a".repeat(141), "Bad\u0000title"])("rejects an unclear or invalid title %j", async title => {
    const result = createDaoAuthoringReview({ address: ADDRESS, createdAt: CREATED_AT, topic: await validTopic(1001),
      draft: { title, markdown: "Approve research funding.", proposalType: "signal", executableScript: "0x" } });
    expect(result).toMatchObject({ state: "invalid", errors: { title: expect.any(String) } });
  });

  it("treats title Markdown and HTML punctuation as literal text", async () => {
    const title = "[Research](https://example.com) <script> &amp; **budget**";
    const result = createDaoAuthoringReview({ address: ADDRESS, createdAt: CREATED_AT, topic: await validTopic(1001),
      draft: { title, markdown: "Approve research funding.", proposalType: "signal", executableScript: "0x" } });
    expect(result.state).toBe("valid");
    if (result.state !== "valid") return;
    expect(result.review.parsedContent.title).toBe(title);
    expect(result.review.parsedContent.ast.children[0].children?.map(node => node.type)).toEqual(["text"]);
  });

  it.each([
    "#   Original **decision**  \r\n\r\nSummary.\r\n\r\nBody.\r\n",
    "Original decision\n=================\n\n## Summary\n\nSummary.\n",
    "\n# Original decision\n\n\n\nSummary.\n",
  ])("preserves an unchanged recovered Markdown document byte-for-byte", original => {
    const draft = splitDaoProposalMarkdown(original);
    expect(draft.title).toBe("Original decision");
    expect(composeDaoProposalMarkdown(draft.title, draft.markdown, original)).toBe(original);
    expect(composeDaoProposalMarkdown("Changed title", draft.markdown, original)).toBe(`# Changed title\n\n${draft.markdown}`);
  });

  it("normalizes a supported forum topic using its stable category ID", async () => {
    const result = await validateMockDaoForumTopic(
      "https://gov.yearn.fi/t/OLD-SLUG/1001/?utm_source=test#reply",
      0
    );

    expect(result).toMatchObject({
      state: "valid",
      topic: expect.objectContaining({
        topicId: 1001,
        normalizedUrl:
          "https://gov.yearn.fi/t/fund-protocol-research/1001",
        categoryId: 5,
        category: "Proposals",
      }),
    });
  });

  it.each([
    ["http://gov.yearn.fi/t/topic/1001", "INVALID_TOPIC_URL"],
    ["https://example.com/t/topic/1001", "INVALID_TOPIC_URL"],
    ["https://gov.yearn.fi/t/topic/404", "TOPIC_NOT_FOUND"],
    ["https://gov.yearn.fi/t/topic/2002", "WRONG_CATEGORY"],
    ["https://gov.yearn.fi/t/topic/503", "FORUM_UNAVAILABLE"],
  ])("returns %s as %s", async (url, expectedCode) => {
    const result = await validateMockDaoForumTopic(url, 0);
    expect(result).toMatchObject({
      state: "invalid",
      error: expect.objectContaining({ code: expectedCode }),
    });
  });

  it("builds an exact immutable Signal review with the empty script", async () => {
    const forum = await validTopic(1001);
    const result = createDaoAuthoringReview({
      address: ADDRESS,
      createdAt: CREATED_AT,
      topic: forum,
      draft: {
        title: "  Exact   title  ",
        markdown:
          "Exact summary with a second line.\n\n## Specification\n\n1. Keep exact whitespace.\n2. Publish these bytes.\n",
        proposalType: "signal",
        executableScript: DAO_EXECUTOR_VALID_SCRIPT_VECTORS.oneCall.script,
      },
    });

    expect(result.state).toBe("valid");
    if (result.state !== "valid") return;
    expect(result.review.content.markdown).toBe(
      "#   Exact   title  \n\nExact summary with a second line.\n\n## Specification\n\n1. Keep exact whitespace.\n2. Publish these bytes.\n"
    );
    expect(result.review.parsedContent.title).toBe("Exact   title");
    expect(result.review.content.discussionUrl).toBe(forum.normalizedUrl);
    expect(result.review.content.createdBy).toBe(ADDRESS);
    expect(result.review.content.createdAt).toBe(
      new Date(CREATED_AT * 1_000).toISOString()
    );
    expect(result.review.scriptCheck).toMatchObject({
      state: "empty",
      script: "0x",
      scriptHash: DAO_EMPTY_SCRIPT_HASH,
      frames: [],
    });
  });

  it("keeps parser codes and byte offsets in executable form failures", async () => {
    const forum = await validTopic(1001);
    const result = createDaoAuthoringReview({
      address: ADDRESS,
      createdAt: CREATED_AT,
      topic: forum,
      draft: {
        title: "Proposal decision",
        markdown: DAO_PROPOSAL_MARKDOWN_TEMPLATE,
        proposalType: "executable",
        executableScript: `0x${"00".repeat(31)}`,
      },
    });

    expect(result).toMatchObject({
      state: "invalid",
      errors: expect.objectContaining({
        script: "The first Executor header is incomplete.",
      }),
      scriptCheck: expect.objectContaining({
        state: "invalid",
        error: expect.objectContaining({
          code: "TRUNCATED_HEADER",
          offset: 0,
        }),
      }),
    });
  });

  it("rejects invalid document structure and an empty executable script", async () => {
    const result = createDaoAuthoringReview({
      address: ADDRESS,
      createdAt: CREATED_AT,
      topic: null,
      draft: {
        title: "",
        markdown: "## Specification only",
        proposalType: "executable",
        executableScript: "0x",
      },
    });

    expect(result.state).toBe("invalid");
    if (result.state !== "invalid") return;
    expect(result.errors).toEqual(
      expect.objectContaining({
        forum: expect.any(String),
        title: expect.any(String),
        markdown: expect.any(String),
        script: "Executable proposals require at least one call.",
      })
    );
    expect(result.scriptCheck.error).toMatchObject({
      code: "EMPTY_EXECUTABLE_SCRIPT",
      offset: 0,
    });
    expect(result.contentValidation.errors[0]).toMatchObject({
      code: "TITLE_REQUIRED",
      offset: 0,
      line: 1,
      column: 1,
    });
  });

  it("finds the first full epoch in the shared rolling capacity window", () => {
    const epochs = Array.from({ length: 6 }, (_, index) => ({
      epoch: 201n + BigInt(index),
      currentProposalCount: index === 2 || index === 4 ? 64 : 12 + index,
      proposalLimit: 64,
    }));

    expect(findFirstFullDaoCapacityEpoch(epochs)?.epoch).toBe(203n);
  });
});

describe("DAO proposal authoring mock services", () => {
  it("keeps publication failure separate from the wallet service", async () => {
    const review = await validReview(1002);
    const publication = await publishMockDaoProposalContent(
      review,
      CREATED_AT,
      0
    );

    expect(publication).toEqual({
      state: "failed",
      error: expect.objectContaining({ code: "PUBLICATION_FAILED" }),
    });
  });

  it.each([
    ["user-rejected", "WALLET_REJECTED"],
    ["revert", "PROPOSAL_REVERTED"],
    ["network-error", "NETWORK_ERROR"],
  ] as const)("returns %s as %s without a transaction hash", async (outcome, expectedCode) => {
    const review = await validReview(1001);
    const publication = await publishMockDaoProposalContent(
      review,
      CREATED_AT,
      0
    );
    expect(publication.state).toBe("published");
    if (publication.state !== "published") return;

    const submission = await submitMockDaoProposal({
      review,
      publication: publication.publication,
      outcome,
      latencyMs: 0,
    });
    expect(submission).toEqual({
      state: "failed",
      error: expect.objectContaining({ code: expectedCode }),
    });
    expect(submission).not.toHaveProperty("transactionHash");
  });

  it.each([1003, 1004])(
    "keeps topic %s ordinary when the typed outcome succeeds",
    async (topicId) => {
      const review = await validReview(topicId);
      const publication = await publishMockDaoProposalContent(
        review,
        CREATED_AT,
        0
      );
      expect(publication.state).toBe("published");
      if (publication.state !== "published") return;

      const submission = await submitMockDaoProposal({
        review,
        publication: publication.publication,
        outcome: "success",
        latencyMs: 0,
      });
      expect(submission).toMatchObject({ state: "submitted" });
    }
  );

  it("submits a deterministic proposal after publication", async () => {
    const review = await validReview(1001);
    const publication = await publishMockDaoProposalContent(
      review,
      CREATED_AT,
      0
    );
    expect(publication.state).toBe("published");
    if (publication.state !== "published") return;

    const submission = await submitMockDaoProposal({
      review,
      publication: publication.publication,
      outcome: "success" satisfies DaoMockTransactionOutcome,
      latencyMs: 0,
    });
    expect(submission).toEqual({
      state: "submitted",
      transactionHash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
  });

  it("applies registration latency before mutating created-proposal state", async () => {
    const review = await validReview(1001);
    const publication = await publishMockDaoProposalContent(
      review,
      CREATED_AT,
      0
    );
    expect(publication.state).toBe("published");
    if (publication.state !== "published") return;
    const receipt = await confirmMockDaoProposalReceipt(
      review,
      publication.publication,
      TRANSACTION_HASH,
      201n,
      0
    );
    expect(receipt.decoded.state).toBe("decoded");
    if (receipt.decoded.state !== "decoded") return;

    resetDaoMockStore();
    vi.useFakeTimers();
    const registration = registerMockDaoProposalAwaitingIndex(
      review,
      publication.publication,
      receipt.decoded.identity,
      1_000
    );

    expect(readDaoCreatedProposals()).toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(readDaoCreatedProposals()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await registration;
    expect(readDaoCreatedProposals()).toHaveLength(1);
  });
});

async function validTopic(topicId: number) {
  const result = await validateMockDaoForumTopic(
    `https://gov.yearn.fi/t/topic/${topicId}`,
    0
  );
  if (result.state !== "valid") {
    throw new Error(`Expected topic ${topicId} to be valid.`);
  }
  return result.topic;
}

async function validReview(topicId: number) {
  const topic = await validTopic(topicId);
  const result = createDaoAuthoringReview({
    address: ADDRESS,
    createdAt: CREATED_AT,
    topic,
    draft: {
      title: "Proposal decision",
        markdown: DAO_PROPOSAL_MARKDOWN_TEMPLATE,
      proposalType: "executable",
      executableScript: DAO_EXECUTOR_VALID_SCRIPT_VECTORS.oneCall.script,
    },
  });
  if (result.state !== "valid") {
    throw new Error("Expected authoring review to be valid.");
  }
  return result.review;
}
