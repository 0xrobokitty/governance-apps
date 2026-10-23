import { z } from "zod";
import deployedOverrides from "@/public/dao-title-overrides.json";
import type { DaoProposalRef } from "./types";

export const DAO_TITLE_OVERRIDES_URL = "/dao-title-overrides.json";
const unsafeTitleCharacters = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Noncharacter_Code_Point}\u2800\u3000\ufff9-\ufffb]/u;

const overrideSchema = z.object({
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  votingAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  proposalId: z.string().max(78).regex(/^(0|[1-9]\d*)$/)
    .refine((value) => /^(0|[1-9]\d*)$/.test(value) && value.length <= 78 && BigInt(value) < 2n ** 256n),
  contentDigest: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  title: z.string().min(1).max(200).refine((value) =>
    value === value.trim() && !unsafeTitleCharacters.test(value)),
}).strict();

export const daoTitleOverridesSchema = z.object({
  version: z.literal(1),
  overrides: z.array(overrideSchema).max(1_000),
}).strict().superRefine((value, context) => {
  const identities = new Set<string>();
  value.overrides.forEach((entry, index) => {
    const identity = `${entry.chainId}:${entry.votingAddress.toLowerCase()}:${entry.proposalId}`;
    if (identities.has(identity)) {
      context.addIssue({ code: "custom", message: "Duplicate proposal title override.", path: ["overrides", index] });
    }
    identities.add(identity);
  });
});

export type DaoTitleOverride = z.infer<typeof overrideSchema>;

// Configuration changes take effect on deployment. The public JSON is the same
// file bundled here; a remote response cannot change the displayed proposal.
const deployed = daoTitleOverridesSchema.safeParse(deployedOverrides);

export function findDaoTitleOverride(
  ref: DaoProposalRef,
  contentDigest: string,
  configuration?: unknown
): DaoTitleOverride | null {
  const parsed = configuration === undefined
    ? deployed
    : daoTitleOverridesSchema.safeParse(configuration);
  if (!parsed.success) return null;
  return parsed.data.overrides.find((entry) =>
    entry.chainId === ref.chainId &&
    entry.votingAddress.toLowerCase() === ref.votingAddress.toLowerCase() &&
    entry.proposalId === ref.proposalId.toString() &&
    entry.contentDigest.toLowerCase() === contentDigest.toLowerCase()
  ) ?? null;
}

/** A display-only title; never replace or reserialize the published content. */
export function getDaoDisplayTitle(
  ref: DaoProposalRef,
  contentDigest: string,
  originalTitle: string | null | undefined
): string | null {
  return findDaoTitleOverride(ref, contentDigest)?.title ?? originalTitle ?? null;
}
