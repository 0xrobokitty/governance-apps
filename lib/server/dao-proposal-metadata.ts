import { readBoundedJson, withFeedRequest } from "@/lib/feed-transport";
import { DAO_FEED_TRANSPORT_POLICY } from "@/lib/clients/dao/feed";
import { assertDaoDeployments, getDaoDeployments } from "@/lib/clients/dao/deployment";
import { parseDaoProposalContent } from "@/lib/clients/dao/content";
import { getDaoProposalSummary } from "@/lib/clients/dao/content-summary";
import { readDaoContentBytes } from "@/lib/clients/dao/content-bytes";
import { getDaoDisplayTitle } from "@/lib/clients/dao/title-overrides";
import { isDaoEnabled, isDaoMockRuntimeEnabled } from "@/lib/runtime/features";
import { parseDaoFeed } from "@/lib/schemas/dao-feed";
import type { Hex } from "viem";

export type DaoProposalMetadataInput = {
  id: string;
  chain?: string | string[];
  voting?: string | string[];
};

export type DaoProposalShareDetails = {
  title: string;
  description: string;
  path: string;
};

// Sharing must not hold up the proposal page for the full feed timeout.
export const DAO_METADATA_TIMEOUT_MS = 2_000;
const metadataTransport = {
  ...DAO_FEED_TRANSPORT_POLICY,
  requestTimeoutMs: DAO_METADATA_TIMEOUT_MS,
};

function proposalIdIsValid(id: string): boolean {
  return id.length <= 78 && /^(0|[1-9]\d*)$/.test(id) && BigInt(id) < 2n ** 256n;
}

function summaryExcerpt(summary: string): string {
  const text = summary.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= 200) return text;
  const excerpt = characters.slice(0, 197).join("");
  const boundary = excerpt.lastIndexOf(" ");
  return `${(boundary > 150 ? excerpt.slice(0, boundary) : excerpt).trimEnd()}…`;
}

export function daoProposalSharePath(input: DaoProposalMetadataInput): string {
  const search = new URLSearchParams();
  if (typeof input.chain === "string") search.set("chain", input.chain);
  if (typeof input.voting === "string") search.set("voting", input.voting);
  const query = search.toString();
  return `/proposals/${encodeURIComponent(input.id)}${query ? `?${query}` : ""}`;
}

/** Uses the same feed/content trust boundary as the UI, without wallet or RPC reads. */
export async function readDaoProposalShareDetails(
  input: DaoProposalMetadataInput
): Promise<DaoProposalShareDetails | null> {
  if (!isDaoEnabled() || isDaoMockRuntimeEnabled() || !proposalIdIsValid(input.id)) return null;
  if (Array.isArray(input.chain) || Array.isArray(input.voting)) return null;
  const { chain, voting } = input;
  const url = process.env.DAO_DATA_URL;
  if (!url) return null;
  try {
    const deployments = getDaoDeployments();
    if (!deployments.length) return null;
    // Resolve the identity before fetching. A bare ID is only unambiguous when
    // exactly one Voting deployment is configured, matching the client route.
    const selected = chain || voting
      ? deployments.find((deployment) => String(deployment.chainId) === chain &&
          deployment.votingAddress.toLowerCase() === voting?.toLowerCase())
      : deployments.length === 1 ? deployments[0] : null;
    if (!selected) return null;
    const feed = await withFeedRequest(url, metadataTransport, async (response, context) => {
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("DAO metadata feed is unavailable.");
      }
      return parseDaoFeed(await readBoundedJson(response, context, metadataTransport));
    });
    assertDaoDeployments(feed, deployments);
    if (feed.observedAt > Math.floor(Date.now() / 1000) + 60) return null;
    const proposal = feed.proposals.find((entry) => entry.id === input.id &&
      entry.votingAddress === selected.votingAddress);
    if (!proposal) return null;
    const content = readDaoContentBytes(proposal.contentBytes, proposal.contentDigest as Hex);
    const parsed = content.state === "available" && content.value
      ? parseDaoProposalContent(content.value) : null;
    const summary = parsed ? getDaoProposalSummary(parsed) : null;
    const title = getDaoDisplayTitle({
      chainId: feed.chainId,
      votingAddress: selected.votingAddress,
      proposalId: BigInt(input.id),
    }, proposal.contentDigest, parsed?.title);
    return {
      title: title ? `${title} | Yearn DAO` : `Proposal #${input.id} | Yearn DAO`,
      description: summary ? summaryExcerpt(summary)
        : `Read proposal #${input.id} and take part in Yearn DAO governance.`,
      path: daoProposalSharePath({ id: input.id, chain: String(feed.chainId), voting: selected.votingAddress }),
    };
  } catch {
    // Feed, configuration and content errors must not break the route or emit
    // unverified proposal text. The page uses the generic DAO preview instead.
    return null;
  }
}
