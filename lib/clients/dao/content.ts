import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { hexToBytes, sha256, type Hex } from "viem";
import type {
  DaoProposalAsset,
  DaoProposalContent,
  DaoVerifiedSource,
} from "./types";

export const DAO_PROPOSAL_MARKDOWN_LIMITS = {
  maxUtf8Bytes: 32_768,
  maxTitleGraphemes: 140,
  maxSummaryGraphemes: 500,
  maxNodes: 4_096,
  maxDepth: 32,
  maxTableCells: 1_024,
} as const;

export const DAO_PROPOSAL_ASSET_LIMITS = {
  maxAssets: 16,
  maxPathUtf8Bytes: 512,
  maxMediaTypeUtf8Bytes: 127,
  maxAssetBytes: 2_097_152,
  maxAggregateAssetBytes: 33_554_432,
  maxImageWidth: 8_192,
  maxImageHeight: 8_192,
  maxImagePixels: 33_554_432,
} as const;

export type DaoProposalContentErrorCode =
  | "INVALID_UNICODE"
  | "INVALID_SOURCE_CHARACTER"
  | "SOURCE_TOO_LARGE"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_TOO_DEEP"
  | "TOO_MANY_TABLE_CELLS"
  | "MISSING_H1"
  | "DUPLICATE_H1"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "MISSING_SUMMARY"
  | "SUMMARY_TOO_LONG"
  | "EMPTY_BODY"
  | "HEADING_DEPTH"
  | "RAW_HTML"
  | "UNSUPPORTED_NODE"
  | "UNSAFE_LINK"
  | "UNSAFE_IMAGE"
  | "EMPTY_ATTACHMENT_ALT"
  | "INVALID_ASSET_CID"
  | "INVALID_ASSET_PATH"
  | "ASSET_TRAVERSAL"
  | "MISSING_ASSET"
  | "TOO_MANY_ASSETS"
  | "DUPLICATE_ASSET_PATH"
  | "DUPLICATE_ASSET_DIGEST"
  | "ASSET_PATH_TOO_LONG"
  | "ASSET_MEDIA_TYPE_INVALID"
  | "ASSET_MEDIA_TYPE_TOO_LONG"
  | "ASSET_BYTE_LENGTH_INVALID"
  | "ASSET_TOO_LARGE"
  | "ASSET_AGGREGATE_TOO_LARGE"
  | "INVALID_ASSET_DIGEST"
  | "ASSET_DIMENSIONS_INVALID";

export type DaoProposalContentError = {
  code: DaoProposalContentErrorCode;
  message: string;
  offset: number | null;
  line: number | null;
  column: number | null;
  manifestIndex: number | null;
};

export type DaoMarkdownPoint = {
  line: number;
  column: number;
  offset?: number;
};

export type DaoMarkdownNode = {
  type: string;
  children?: DaoMarkdownNode[];
  value?: string;
  depth?: number;
  headingId?: string;
  url?: string;
  alt?: string | null;
  ordered?: boolean;
  start?: number | null;
  lang?: string | null;
  align?: Array<"left" | "right" | "center" | null>;
  position?: {
    start: DaoMarkdownPoint;
    end: DaoMarkdownPoint;
  };
};

export type DaoMarkdownRoot = DaoMarkdownNode & {
  type: "root";
  children: DaoMarkdownNode[];
};

export type DaoResolvedProposalAttachment = {
  state: "valid";
  target: string;
  cid: string;
  gatewayUrl: string;
  asset: DaoProposalAsset;
};

export type DaoProposalAttachmentResolution =
  | DaoResolvedProposalAttachment
  | {
      state: "invalid";
      code:
        | "UNSAFE_IMAGE"
        | "INVALID_ASSET_CID"
        | "INVALID_ASSET_PATH"
        | "ASSET_TRAVERSAL"
        | "MISSING_ASSET"
        | "DUPLICATE_ASSET_PATH"
        | "DUPLICATE_ASSET_DIGEST";
      message: string;
    };

export type DaoParsedProposalContent = {
  source: string;
  byteLength: number;
  ast: DaoMarkdownRoot;
  title: string | null;
  summary: string | null;
  attachments: DaoResolvedProposalAttachment[];
  errors: DaoProposalContentError[];
};

const SUPPORTED_NODE_TYPES = new Set([
  "root",
  "heading",
  "paragraph",
  "text",
  "emphasis",
  "strong",
  "list",
  "listItem",
  "blockquote",
  "link",
  "inlineCode",
  "code",
  "table",
  "tableRow",
  "tableCell",
  "break",
  "image",
]);

const SHA_256_MULTIHASH_CODE = 0x12;
const SHA_256_DIGEST_BYTES = 32;
const IPFS_GATEWAY_ORIGIN = "https://ipfs.io";
const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

type MarkdownVisit = {
  node: DaoMarkdownNode;
  depth: number;
  parent: DaoMarkdownNode | null;
  childIndex: number;
  rootChildIndex: number | null;
};

const MANIFEST_ERROR_PRIORITY: Partial<
  Record<DaoProposalContentErrorCode, number>
> = {
  INVALID_ASSET_PATH: 0,
  ASSET_TRAVERSAL: 1,
  ASSET_PATH_TOO_LONG: 2,
  DUPLICATE_ASSET_PATH: 3,
  ASSET_MEDIA_TYPE_INVALID: 4,
  ASSET_MEDIA_TYPE_TOO_LONG: 5,
  ASSET_BYTE_LENGTH_INVALID: 6,
  ASSET_TOO_LARGE: 7,
  INVALID_ASSET_DIGEST: 8,
  DUPLICATE_ASSET_DIGEST: 9,
  ASSET_DIMENSIONS_INVALID: 10,
  TOO_MANY_ASSETS: 11,
  ASSET_AGGREGATE_TOO_LARGE: 12,
};

export function getDaoProposalUtf8ByteLength(value: string): number {
  assertRoundTrippingUnicode(value);
  return new TextEncoder().encode(value).byteLength;
}

export function countDaoProposalGraphemes(value: string): number {
  return Array.from(graphemeSegmenter.segment(value)).length;
}

export function canonicalizeDaoProposalContent(
  content: DaoProposalContent
): Uint8Array {
  const canonical = {
    schema: content.schema,
    markdown: content.markdown,
    discussionUrl: content.discussionUrl,
    proposalType: content.proposalType,
    createdBy: content.createdBy,
    createdAt: content.createdAt,
    assets: content.assets.map((asset) => ({
      path: asset.path,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      digest: asset.digest,
      width: asset.width,
      height: asset.height,
    })),
  };
  return encodeUtf8Exact(`${JSON.stringify(canonical)}\n`);
}

export function deriveDaoProposalContentIdentity(content: DaoProposalContent): {
  digest: Hex;
  cid: string;
  bytes: Uint8Array;
} {
  const bytes = canonicalizeDaoProposalContent(content);
  const digest = sha256(bytes);
  return { bytes, digest, cid: createDaoRawSha256Cid(digest) };
}

export function createDaoRawSha256Cid(digest: Hex): string {
  const digestBytes = hexToBytes(digest);
  if (digestBytes.byteLength !== SHA_256_DIGEST_BYTES) {
    throw new Error("A raw SHA-256 CID requires an exact 32-byte digest.");
  }
  return CID.createV1(
    raw.code,
    createMultihashDigest(SHA_256_MULTIHASH_CODE, digestBytes)
  ).toString();
}

export function parseDaoProposalContent(
  content: DaoProposalContent
): DaoParsedProposalContent {
  const sourceErrors = validateSourcePreflight(content.markdown);
  if (sourceErrors.length > 0) {
    return invalidParsedContent(content, 0, sourceErrors);
  }

  const byteLength = new TextEncoder().encode(content.markdown).byteLength;
  if (byteLength > DAO_PROPOSAL_MARKDOWN_LIMITS.maxUtf8Bytes) {
    return invalidParsedContent(content, byteLength, [
      sourceError(
        "SOURCE_TOO_LARGE",
        `Markdown must be at most ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxUtf8Bytes.toLocaleString("en-US")} UTF-8 bytes.`,
        content.markdown,
        0
      ),
    ]);
  }

  const ast = parseMarkdownAst(content.markdown);
  const workErrors = validateMarkdownWorkBounds(ast);
  if (workErrors.length > 0) {
    return invalidParsedContent(content, byteLength, workErrors);
  }
  const summaryIndex = getDaoSummaryNodeIndex(ast);
  const summaryHeading = summaryIndex === 2 ? ast.children[1] : null;

  const manifestErrors = validateManifest(content.assets);
  const documentErrors: DaoProposalContentError[] = [];
  const attachments: DaoResolvedProposalAttachment[] = [];
  const validAttachmentOffsets = new Set<number>();
  const headings: MarkdownVisit[] = [];
  const headingIds = new Set<string>();

  walkMarkdown(ast, (visit) => {
    const { node } = visit;
    if (node.type === "html") {
      documentErrors.push(
        errorAt("RAW_HTML", "Raw HTML is not allowed in proposal Markdown.", node)
      );
      return;
    }
    if (!SUPPORTED_NODE_TYPES.has(node.type)) {
      documentErrors.push(
        errorAt(
          "UNSUPPORTED_NODE",
          `Markdown node “${node.type}” is not supported.`,
          node
        )
      );
      return;
    }
    if (node.type === "link" && !isSafeDaoMarkdownLink(node.url ?? "")) {
      documentErrors.push(
        errorAt(
          "UNSAFE_LINK",
          "Links must use HTTPS, a validated IPFS URL, one root-relative app path, or a section fragment such as #references.",
          node
        )
      );
    }
    if (node.type === "heading") {
      const slug = inlineText(node)
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, "")
        .trim()
        .replace(/\s+/gu, "-") || "section";
      let id = slug;
      let suffix = 0;
      while (headingIds.has(id)) id = `${slug}-${++suffix}`;
      node.headingId = id;
      headingIds.add(id);
      headings.push(visit);
    }
    if (node.type === "image") {
      if (!(node.alt ?? "").trim()) {
        documentErrors.push(
          errorAt(
            "EMPTY_ATTACHMENT_ALT",
            "Attachments need descriptive alternative text.",
            node
          )
        );
        return;
      }
      if (!isStandaloneAttachmentContext(visit, ast, summaryIndex + 1)) {
        documentErrors.push(
          errorAt(
            "UNSAFE_IMAGE",
            "Attachments must be the only content in a top-level body paragraph after the summary.",
            node
          )
        );
        return;
      }
      if (manifestErrors.length > 0) return;
      const resolution = resolveDaoProposalAttachment(
        node.url ?? "",
        content.assets
      );
      if (resolution.state === "invalid") {
        documentErrors.push(errorAt(resolution.code, resolution.message, node));
      } else {
        attachments.push(resolution);
        if (node.position?.start.offset !== undefined) {
          validAttachmentOffsets.add(node.position.start.offset);
        }
      }
    }
  });

  const titleNode = ast.children[0];
  let title: string | null = null;
  if (titleNode?.type !== "heading" || titleNode.depth !== 1) {
    documentErrors.push(
      errorAt(
        "MISSING_H1",
        "The first content node must be one level-one proposal title.",
        titleNode ?? ast
      )
    );
  } else {
    title = inlineText(titleNode).trim();
    if (!title) {
      documentErrors.push(
        errorAt("TITLE_REQUIRED", "The proposal title cannot be empty.", titleNode)
      );
    } else if (
      countDaoProposalGraphemes(title) >
      DAO_PROPOSAL_MARKDOWN_LIMITS.maxTitleGraphemes
    ) {
      documentErrors.push(
        errorAt(
          "TITLE_TOO_LONG",
          `The proposal title may contain at most ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxTitleGraphemes} visible graphemes.`,
          titleNode
        )
      );
    }
  }

  for (const heading of headings) {
    if (heading.node.depth !== 1 || heading.node === titleNode) continue;
    documentErrors.push(
      errorAt(
        "DUPLICATE_H1",
        "A proposal document must contain exactly one level-one title.",
        heading.node
      )
    );
  }

  const summaryNode = ast.children[summaryIndex];
  let summary: string | null = null;
  if (summaryNode?.type !== "paragraph") {
    documentErrors.push(
      errorAt(
        "MISSING_SUMMARY",
        "Start the proposal body with a summary paragraph, optionally under a ## Summary heading.",
        summaryNode ?? titleNode ?? ast
      )
    );
  } else {
    summary = inlineText(summaryNode).trim();
    if (!summary) {
      documentErrors.push(
        errorAt(
          "MISSING_SUMMARY",
          "The summary paragraph must contain visible text.",
          summaryNode
        )
      );
    } else if (
      countDaoProposalGraphemes(summary) >
      DAO_PROPOSAL_MARKDOWN_LIMITS.maxSummaryGraphemes
    ) {
      documentErrors.push(
        errorAt(
          "SUMMARY_TOO_LONG",
          `The proposal summary may contain at most ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxSummaryGraphemes} visible graphemes.`,
          summaryNode
        )
      );
    }
  }

  const body = ast.children.slice(summaryIndex + 1);
  if (body.length > 0 && !body.some((node) => isMeaningfulBodyNode(node, validAttachmentOffsets))) {
    documentErrors.push(
      errorAt(
        "EMPTY_BODY",
        "Add meaningful proposal content after the summary.",
        body[0] ?? summaryNode ?? titleNode ?? ast
      )
    );
  }

  const laterHeadings = headings.filter((heading) => heading.node !== titleNode);
  if (laterHeadings[0] && laterHeadings[0].node.depth !== 2) {
    documentErrors.push(
      errorAt(
        "HEADING_DEPTH",
        "The first heading after the summary must be level two.",
        laterHeadings[0].node
      )
    );
  }
  for (const heading of headings) {
    if (heading.node === titleNode || heading.node === summaryHeading) continue;
    if (
      heading.rootChildIndex === null ||
      heading.rootChildIndex < summaryIndex + 1 ||
      (heading.node.depth ?? 0) < 2 ||
      (heading.node.depth ?? 0) > 4
    ) {
      documentErrors.push(
        errorAt(
          "HEADING_DEPTH",
          "Headings after the title must occur in the body and use levels two through four.",
          heading.node
        )
      );
    }
  }

  documentErrors.sort(compareLocatedErrors);
  return {
    source: content.markdown,
    byteLength,
    ast,
    title,
    summary,
    attachments,
    errors: [...dedupeErrors(documentErrors), ...manifestErrors],
  };
}

/** An optional level-two Summary heading belongs to the introductory summary. */
export function getDaoSummaryNodeIndex(ast: DaoMarkdownRoot): number {
  const heading = ast.children[1];
  return heading?.type === "heading" && heading.depth === 2 && /^summary$/iu.test(inlineText(heading).trim()) ? 2 : 1;
}

export function resolveDaoProposalAttachment(
  target: string,
  assets: readonly DaoProposalAsset[]
): DaoProposalAttachmentResolution {
  if (target.startsWith("ipfs://")) {
    const cid = target.slice("ipfs://".length);
    if (!cid || /[/?#]/u.test(cid) || !isCanonicalRawSha256Cid(cid)) {
      return {
        state: "invalid",
        code: "INVALID_ASSET_CID",
        message:
          "A direct attachment must contain one canonical raw SHA-256 CID without a suffix.",
      };
    }
    const matches = assets.filter(
      (asset) => isExactSha256Digest(asset.digest) && createDaoRawSha256Cid(asset.digest) === cid
    );
    if (matches.length === 0) {
      return {
        state: "invalid",
        code: "MISSING_ASSET",
        message: "The direct attachment CID is not authenticated by the manifest.",
      };
    }
    if (matches.length !== 1) {
      return {
        state: "invalid",
        code: "DUPLICATE_ASSET_DIGEST",
        message: "The attachment digest must identify exactly one manifest entry.",
      };
    }
    return validAttachment(target, cid, matches[0]);
  }

  if (!target.startsWith("./assets/")) {
    return {
      state: "invalid",
      code: "UNSAFE_IMAGE",
      message:
        "Attachments must use one authenticated IPFS CID or a relative manifest path.",
    };
  }
  const pathCheck = validateManifestPath(target);
  if (pathCheck) return pathCheck;
  const matches = assets.filter((asset) => asset.path === target);
  if (matches.length === 0) {
    return {
      state: "invalid",
      code: "MISSING_ASSET",
      message: "The relative attachment path is missing from the manifest.",
    };
  }
  if (matches.length > 1) {
    return {
      state: "invalid",
      code: "DUPLICATE_ASSET_PATH",
      message: "The relative attachment path must identify one manifest entry.",
    };
  }
  if (!isExactSha256Digest(matches[0].digest)) {
    return {
      state: "invalid",
      code: "MISSING_ASSET",
      message: "The relative attachment has no valid authenticated digest.",
    };
  }
  return validAttachment(target, createDaoRawSha256Cid(matches[0].digest), matches[0]);
}

export function validateDaoVerifiedSource(
  source: DaoVerifiedSource
): DaoVerifiedSource {
  if (!source.label.trim()) throw new Error("A verified source needs a label.");
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error("A verified source must provide a complete HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("A verified source must provide a complete HTTPS URL.");
  }
  if (url.username || url.password) {
    throw new Error("A verified source URL must not contain credentials.");
  }
  if (containsUnsafeControl(source.url)) {
    throw new Error("A verified source URL must not contain control characters.");
  }
  return source;
}

function parseMarkdownAst(markdown: string): DaoMarkdownRoot {
  return fromMarkdown(markdown, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  }) as unknown as DaoMarkdownRoot;
}

function emptyMarkdownAst(): DaoMarkdownRoot {
  return { type: "root", children: [] };
}

function invalidParsedContent(
  content: DaoProposalContent,
  byteLength: number,
  errors: DaoProposalContentError[]
): DaoParsedProposalContent {
  const documentErrors = dedupeErrors([...errors].sort(compareLocatedErrors));
  return {
    source: content.markdown,
    byteLength,
    ast: emptyMarkdownAst(),
    title: null,
    summary: null,
    attachments: [],
    errors: [...documentErrors, ...validateManifest(content.assets)],
  };
}

function validateMarkdownWorkBounds(
  ast: DaoMarkdownRoot
): DaoProposalContentError[] {
  const stack: MarkdownVisit[] = [
    {
      node: ast,
      depth: 0,
      parent: null,
      childIndex: 0,
      rootChildIndex: null,
    },
  ];
  let nodeCount = 0;
  let tableCellCount = 0;

  while (stack.length > 0) {
    const visit = stack.pop() as MarkdownVisit;
    nodeCount += 1;
    if (nodeCount > DAO_PROPOSAL_MARKDOWN_LIMITS.maxNodes) {
      return [
        errorAt(
          "DOCUMENT_TOO_LARGE",
          `Markdown may contain at most ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxNodes.toLocaleString("en-US")} parsed nodes.`,
          visit.node
        ),
      ];
    }
    if (visit.depth > DAO_PROPOSAL_MARKDOWN_LIMITS.maxDepth) {
      return [
        errorAt(
          "DOCUMENT_TOO_DEEP",
          `Markdown nesting may not exceed ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxDepth} levels.`,
          visit.node
        ),
      ];
    }
    if (visit.node.type === "tableCell") {
      tableCellCount += 1;
      if (tableCellCount > DAO_PROPOSAL_MARKDOWN_LIMITS.maxTableCells) {
        return [
          errorAt(
            "TOO_MANY_TABLE_CELLS",
            `Tables may contain at most ${DAO_PROPOSAL_MARKDOWN_LIMITS.maxTableCells.toLocaleString("en-US")} cells.`,
            visit.node
          ),
        ];
      }
    }

    const children = visit.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: children[index],
        depth: visit.depth + 1,
        parent: visit.node,
        childIndex: index,
        rootChildIndex:
          visit.node.type === "root" ? index : visit.rootChildIndex,
      });
    }
  }
  return [];
}

function validateSourcePreflight(source: string): DaoProposalContentError[] {
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return [sourceError("INVALID_UNICODE", "Markdown contains an unpaired high surrogate.", source, index)];
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      return [sourceError("INVALID_UNICODE", "Markdown contains an unpaired low surrogate.", source, index)];
    }
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
        (code >= 0x7f && code <= 0x9f)) {
      return [sourceError("INVALID_SOURCE_CHARACTER", "Markdown contains a disallowed control character.", source, index)];
    }
  }
  return [];
}

function assertRoundTrippingUnicode(source: string): void {
  const error = validateSourcePreflight(source)[0];
  if (error?.code === "INVALID_UNICODE") throw new Error(error.message);
}

function encodeUtf8Exact(source: string): Uint8Array {
  assertRoundTrippingUnicode(source);
  return new TextEncoder().encode(source);
}

function validateManifest(assets: readonly DaoProposalAsset[]): DaoProposalContentError[] {
  const errors: DaoProposalContentError[] = [];
  if (assets.length > DAO_PROPOSAL_ASSET_LIMITS.maxAssets) {
    errors.push(manifestError("TOO_MANY_ASSETS", `A proposal may declare at most ${DAO_PROPOSAL_ASSET_LIMITS.maxAssets} assets.`, DAO_PROPOSAL_ASSET_LIMITS.maxAssets));
  }
  let aggregateBytes = 0;
  const paths = new Map<string, number>();
  const digests = new Map<string, number>();
  const boundedAssets = assets.slice(0, DAO_PROPOSAL_ASSET_LIMITS.maxAssets);

  boundedAssets.forEach((asset, index) => {
    const pathCheck = validateManifestPath(asset.path);
    if (pathCheck) {
      errors.push(manifestError(pathCheck.code, pathCheck.message, index));
    } else if (getDaoProposalUtf8ByteLength(asset.path) > DAO_PROPOSAL_ASSET_LIMITS.maxPathUtf8Bytes) {
      errors.push(manifestError("ASSET_PATH_TOO_LONG", `Asset paths may contain at most ${DAO_PROPOSAL_ASSET_LIMITS.maxPathUtf8Bytes} UTF-8 bytes.`, index));
    }
    const previousPath = paths.get(asset.path);
    if (previousPath !== undefined) {
      errors.push(manifestError("DUPLICATE_ASSET_PATH", `Asset path duplicates manifest entry ${previousPath + 1}.`, index));
    } else paths.set(asset.path, index);

    if (!isValidMediaType(asset.mediaType)) {
      errors.push(manifestError("ASSET_MEDIA_TYPE_INVALID", "Asset media types must use a safe type/subtype token.", index));
    } else if (getDaoProposalUtf8ByteLength(asset.mediaType) > DAO_PROPOSAL_ASSET_LIMITS.maxMediaTypeUtf8Bytes) {
      errors.push(manifestError("ASSET_MEDIA_TYPE_TOO_LONG", `Asset media types may contain at most ${DAO_PROPOSAL_ASSET_LIMITS.maxMediaTypeUtf8Bytes} UTF-8 bytes.`, index));
    }

    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength <= 0) {
      errors.push(manifestError("ASSET_BYTE_LENGTH_INVALID", "Asset byte length must be a positive safe integer.", index));
    } else {
      aggregateBytes += asset.byteLength;
      if (asset.byteLength > DAO_PROPOSAL_ASSET_LIMITS.maxAssetBytes) {
        errors.push(manifestError("ASSET_TOO_LARGE", `Each asset may contain at most ${DAO_PROPOSAL_ASSET_LIMITS.maxAssetBytes.toLocaleString("en-US")} bytes.`, index));
      }
    }

    if (!isExactSha256Digest(asset.digest)) {
      errors.push(manifestError("INVALID_ASSET_DIGEST", "Asset digests must be exact 32-byte lowercase hex SHA-256 values.", index));
    } else {
      const digestKey = asset.digest.toLowerCase();
      const previousDigest = digests.get(digestKey);
      if (previousDigest !== undefined) {
        errors.push(manifestError("DUPLICATE_ASSET_DIGEST", `Asset digest duplicates manifest entry ${previousDigest + 1}.`, index));
      } else digests.set(digestKey, index);
    }

    if (!hasValidDimensions(asset)) {
      errors.push(manifestError("ASSET_DIMENSIONS_INVALID", "Image dimensions must be bounded positive integers; non-images must omit dimensions.", index));
    }
  });

  if (aggregateBytes > DAO_PROPOSAL_ASSET_LIMITS.maxAggregateAssetBytes) {
    errors.push(manifestError("ASSET_AGGREGATE_TOO_LARGE", `Declared assets may contain at most ${DAO_PROPOSAL_ASSET_LIMITS.maxAggregateAssetBytes.toLocaleString("en-US")} bytes in total.`, Math.max(boundedAssets.length - 1, 0)));
  }
  return errors.sort(compareManifestErrors);
}

function hasValidDimensions(asset: DaoProposalAsset): boolean {
  const image = asset.mediaType.startsWith("image/");
  if (!image) return asset.width === null && asset.height === null;
  if (!Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height)) return false;
  const width = asset.width as number;
  const height = asset.height as number;
  return width > 0 &&
    height > 0 &&
    width <= DAO_PROPOSAL_ASSET_LIMITS.maxImageWidth &&
    height <= DAO_PROPOSAL_ASSET_LIMITS.maxImageHeight &&
    width * height <= DAO_PROPOSAL_ASSET_LIMITS.maxImagePixels;
}

function isValidMediaType(value: string): boolean {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(value) && !containsUnsafeControl(value);
}

function isExactSha256Digest(value: string): value is Hex {
  return /^0x[0-9a-f]{64}$/u.test(value);
}

function isCanonicalRawSha256Cid(value: string): boolean {
  try {
    const cid = CID.parse(value);
    return cid.version === 1 &&
      cid.code === raw.code &&
      cid.multihash.code === SHA_256_MULTIHASH_CODE &&
      cid.multihash.size === SHA_256_DIGEST_BYTES &&
      cid.toString() === value;
  } catch {
    return false;
  }
}

export function getDaoMarkdownFragmentId(value: string): string | null {
  if (!value.startsWith("#")) return null;
  try {
    const fragment = decodeURIComponent(value.slice(1)).normalize("NFC").toLowerCase();
    return /^[\p{L}\p{M}\p{N}_-]+$/u.test(fragment) ? fragment : null;
  } catch {
    return null;
  }
}

function isSafeDaoMarkdownLink(value: string): boolean {
  if (!value || containsUnsafeControl(value) || value.includes("\\")) return false;
  if (value.startsWith("#")) return getDaoMarkdownFragmentId(value) !== null;
  if (value.startsWith("/")) {
    return !value.startsWith("//") && !value.startsWith("/dao//");
  }
  if (value.startsWith("ipfs://")) return isSafeIpfsLink(value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password;
}

function isSafeIpfsLink(value: string): boolean {
  const remainder = value.slice("ipfs://".length);
  if (!remainder || /[?#]/u.test(remainder)) return false;
  const [cid, ...segments] = remainder.split("/");
  if (!isCanonicalCid(cid)) return false;
  return segments.every((segment) => segment && !hasTraversalAtAnyDecodeDepth(segment));
}

function isCanonicalCid(value: string): boolean {
  try {
    const cid = CID.parse(value);
    return cid.version === 1 && cid.toString() === value;
  } catch {
    return false;
  }
}

function validateManifestPath(path: string): Extract<DaoProposalAttachmentResolution, { state: "invalid" }> | null {
  if (!hasRoundTrippingUnicode(path) || containsUnsafeControl(path) || path.includes("\\") || /[?#]/u.test(path)) {
    return { state: "invalid", code: "INVALID_ASSET_PATH", message: "Asset paths may not contain controls, backslashes, queries, or fragments." };
  }
  let decoded = path;
  for (let depth = 0; depth < 8; depth += 1) {
    const segments = decoded.split("/");
    if (segments.some((segment) => segment === "." || segment === "..") && decoded !== path.slice(0, 1)) {
      const allowedLeadingDot = segments[0] === "." && segments.slice(1).every((segment) => segment !== "." && segment !== "..");
      if (!allowedLeadingDot) {
        return { state: "invalid", code: "ASSET_TRAVERSAL", message: "Asset paths may not contain dot-segment traversal." };
      }
    }
    if (/%2f|%5c/iu.test(decoded)) {
      return { state: "invalid", code: "ASSET_TRAVERSAL", message: "Asset paths may not contain encoded separators." };
    }
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return { state: "invalid", code: "INVALID_ASSET_PATH", message: "Asset paths must use valid canonical characters." };
    }
    if (next === decoded) break;
    decoded = next;
  }
  const decodedSegments = decoded.split("/");
  if (decodedSegments.some((segment, index) => (segment === "." && index !== 0) || segment === "..")) {
    return { state: "invalid", code: "ASSET_TRAVERSAL", message: "Asset paths may not contain encoded traversal." };
  }
  if (decoded !== path) {
    return { state: "invalid", code: "INVALID_ASSET_PATH", message: "Asset paths must not use percent-encoded aliases." };
  }
  if (!path.startsWith("./assets/") || path === "./assets/" || path.split("/").some((segment, index) => index > 0 && !segment)) {
    return { state: "invalid", code: "INVALID_ASSET_PATH", message: "Asset paths must be canonical ./assets/... manifest paths." };
  }
  return null;
}

function hasTraversalAtAnyDecodeDepth(value: string): boolean {
  let decoded = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (decoded === "." || decoded === ".." || /%2f|%5c/iu.test(decoded)) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return true;
    }
  }
  return true;
}

function validAttachment(target: string, cid: string, asset: DaoProposalAsset): DaoResolvedProposalAttachment {
  return {
    state: "valid",
    target,
    cid,
    gatewayUrl: `${IPFS_GATEWAY_ORIGIN}/ipfs/${cid}`,
    asset,
  };
}

function walkMarkdown(
  root: DaoMarkdownRoot,
  visitNode: (visit: MarkdownVisit) => void
): void {
  const stack: MarkdownVisit[] = [
    {
      node: root,
      depth: 0,
      parent: null,
      childIndex: 0,
      rootChildIndex: null,
    },
  ];
  while (stack.length > 0) {
    const visit = stack.pop() as MarkdownVisit;
    visitNode(visit);
    const children = visit.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: children[index],
        depth: visit.depth + 1,
        parent: visit.node,
        childIndex: index,
        rootChildIndex:
          visit.node.type === "root" ? index : visit.rootChildIndex,
      });
    }
  }
}

function inlineText(node: DaoMarkdownNode): string {
  const text: string[] = [];
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop() as DaoMarkdownNode;
    if (current.type === "text" || current.type === "inlineCode") {
      text.push(current.value ?? "");
      continue;
    }
    if (current.type === "break") {
      text.push(" ");
      continue;
    }
    if (current.type === "image") {
      text.push(current.alt ?? "");
      continue;
    }
    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return text.join("");
}

function isMeaningfulBodyNode(node: DaoMarkdownNode, validAttachmentOffsets: Set<number>): boolean {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop() as DaoMarkdownNode;
    if (current.type === "heading") continue;
    if (
      current.type === "image" &&
      current.position?.start.offset !== undefined &&
      validAttachmentOffsets.has(current.position.start.offset)
    ) {
      return true;
    }
    if (
      (current.type === "code" ||
        current.type === "text" ||
        current.type === "inlineCode") &&
      Boolean(current.value?.trim())
    ) {
      return true;
    }
    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return false;
}

function isStandaloneAttachmentContext(
  visit: MarkdownVisit,
  ast: DaoMarkdownRoot,
  bodyStartIndex: number
): boolean {
  const { node, parent, rootChildIndex } = visit;
  return (
    parent?.type === "paragraph" &&
    rootChildIndex !== null &&
    rootChildIndex >= bodyStartIndex &&
    ast.children[rootChildIndex] === parent &&
    parent.children?.length === 1 &&
    parent.children[0] === node
  );
}

function errorAt(code: DaoProposalContentErrorCode, message: string, node: DaoMarkdownNode): DaoProposalContentError {
  return {
    code,
    message,
    offset: node.position?.start.offset ?? 0,
    line: node.position?.start.line ?? 1,
    column: node.position?.start.column ?? 1,
    manifestIndex: null,
  };
}

function sourceError(code: DaoProposalContentErrorCode, message: string, source: string, offset: number): DaoProposalContentError {
  const before = source.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/u);
  return { code, message, offset, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1, manifestIndex: null };
}

function manifestError(code: DaoProposalContentErrorCode, message: string, manifestIndex: number): DaoProposalContentError {
  return { code, message, offset: null, line: null, column: null, manifestIndex };
}

function compareLocatedErrors(left: DaoProposalContentError, right: DaoProposalContentError): number {
  return (left.offset ?? Number.MAX_SAFE_INTEGER) - (right.offset ?? Number.MAX_SAFE_INTEGER);
}

function compareManifestErrors(
  left: DaoProposalContentError,
  right: DaoProposalContentError
): number {
  const byIndex =
    (left.manifestIndex ?? Number.MAX_SAFE_INTEGER) -
    (right.manifestIndex ?? Number.MAX_SAFE_INTEGER);
  if (byIndex !== 0) return byIndex;
  const byPriority =
    (MANIFEST_ERROR_PRIORITY[left.code] ?? Number.MAX_SAFE_INTEGER) -
    (MANIFEST_ERROR_PRIORITY[right.code] ?? Number.MAX_SAFE_INTEGER);
  if (byPriority !== 0) return byPriority;
  return left.code.localeCompare(right.code);
}

function dedupeErrors(errors: DaoProposalContentError[]): DaoProposalContentError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}:${error.offset ?? "none"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function containsUnsafeControl(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function hasRoundTrippingUnicode(value: string): boolean {
  return validateSourcePreflight(value).every(
    (error) => error.code !== "INVALID_UNICODE"
  );
}
