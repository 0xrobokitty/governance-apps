import type { Address } from "viem";
import {
  checkDaoExecutorScript,
  parseDaoProposalContent,
  type DaoParsedProposalContent,
  type DaoProposalContent,
  type DaoProposalType,
  type DaoScriptCheck,
} from "@/lib/clients/dao";
import type { DaoAuthoringReview, DaoForumTopic } from "./mock-services";
import { daoProposeCopy } from "./messages";

export const DAO_PROPOSAL_MARKDOWN_TEMPLATE = `A concise paragraph summarizing the proposal.

## Specification

Describe the proposed decision here.
`;

export type DaoAuthoringDraft = {
  title: string;
  /** Body only. The title is assembled into the immutable document at review. */
  markdown: string;
  originalMarkdown?: string;
  proposalType: DaoProposalType;
  executableScript: string;
};

export type DaoAuthoringField =
  | "forum"
  | "title"
  | "markdown"
  | "script";

export type DaoAuthoringErrors = Partial<Record<DaoAuthoringField, string>>;

export type DaoAuthoringReviewResult =
  | { state: "valid"; review: DaoAuthoringReview }
  | {
      state: "invalid";
      errors: DaoAuthoringErrors;
      scriptCheck: DaoScriptCheck;
      contentValidation: DaoParsedProposalContent;
    };

export function createDaoAuthoringReview({
  address,
  createdAt,
  draft,
  topic,
}: {
  address: Address;
  createdAt: number;
  draft: DaoAuthoringDraft;
  topic: DaoForumTopic | null;
}): DaoAuthoringReviewResult {
  const exactScript = draft.proposalType === "signal" ? "0x" : draft.executableScript;
  const scriptCheck = checkDaoExecutorScript(exactScript, draft.proposalType);
  const errors: DaoAuthoringErrors = {};

  const content: DaoProposalContent = {
    schema: "yearn.dao.proposal.v1",
    markdown: composeDaoProposalMarkdown(draft.title, draft.markdown, draft.originalMarkdown),
    discussionUrl: topic?.normalizedUrl ?? "https://gov.yearn.fi/t/pending/0",
    proposalType: draft.proposalType,
    createdBy: address,
    createdAt: new Date(createdAt * 1_000).toISOString(),
    assets: [],
  };
  const contentValidation = parseDaoProposalContent(content);

  if (!topic) errors.forum = daoProposeCopy.discussion.required;
  const titleError = validateDaoAuthoringTitle(draft.title);
  if (titleError) errors.title = titleError;
  if (contentValidation.errors.length > 0) {
    const bodyError = contentValidation.errors.find((error) =>
      !["MISSING_H1", "TITLE_REQUIRED", "TITLE_TOO_LONG"].includes(error.code)
    );
    if (bodyError) errors.markdown = bodyError.message;
  }
  if (scriptCheck.state === "invalid") {
    errors.script = scriptCheck.error?.message ?? "Check the Executor script.";
  }

  if (Object.keys(errors).length > 0 || !topic) {
    return { state: "invalid", errors, scriptCheck, contentValidation };
  }
  content.discussionUrl = topic.normalizedUrl;

  return {
    state: "valid",
    review: { topic, content, parsedContent: contentValidation, scriptCheck },
  };
}

/** Treat the title as literal text, never as author-supplied Markdown structure. */
export function composeDaoProposalMarkdown(title: string, body: string, originalMarkdown?: string): string {
  if (originalMarkdown !== undefined) {
    const original = splitDaoProposalMarkdown(originalMarkdown);
    if (original.title === title && original.markdown === body) return originalMarkdown;
  }
  const literalTitle = title.replace(/[\\`*_{}\[\]()#+\-.!<>~|&]/gu, "\\$&");
  return `# ${literalTitle}\n\n${body}`;
}

/** Splitting is for editing only. An unchanged imported review retains its exact source bytes. */
export function splitDaoProposalMarkdown(markdown: string): { title: string; markdown: string } {
  const parsed = parseDaoProposalContent({
    schema: "yearn.dao.proposal.v1", markdown,
    discussionUrl: "https://gov.yearn.fi/t/pending/0", proposalType: "signal",
    createdBy: "0x0000000000000000000000000000000000000000", createdAt: "1970-01-01T00:00:00.000Z", assets: [],
  });
  const heading = parsed.ast.children[0];
  if (heading?.type !== "heading" || heading.depth !== 1 || !parsed.title) return { title: "", markdown };
  const bodyStart = heading.position?.end.offset ?? 0;
  return { title: parsed.title, markdown: markdown.slice(bodyStart).replace(/^(?:\r\n|\r|\n){1,2}/u, "") };
}

export function validateDaoAuthoringTitle(title: string): string | null {
  if (!title.trim()) return daoProposeCopy.content.titleRequired;
  if (/^summary[\s.:]*$/iu.test(title.trim())) return daoProposeCopy.content.titleDescriptive;
  if (/[\r\n\u2028\u2029]/u.test(title)) return daoProposeCopy.content.titleSingleLine;
  const parsed = parseDaoProposalContent({
    schema: "yearn.dao.proposal.v1", markdown: composeDaoProposalMarkdown(title, DAO_PROPOSAL_MARKDOWN_TEMPLATE),
    discussionUrl: "https://gov.yearn.fi/t/pending/0", proposalType: "signal",
    createdBy: "0x0000000000000000000000000000000000000000", createdAt: "1970-01-01T00:00:00.000Z", assets: [],
  });
  return parsed.errors[0]?.message ?? null;
}

export function findFirstFullDaoCapacityEpoch(
  epochs: readonly {
    epoch: bigint;
    currentProposalCount: number;
    proposalLimit: number;
  }[]
) {
  return (
    epochs.find(
      (epoch) => epoch.currentProposalCount >= epoch.proposalLimit
    ) ?? null
  );
}
