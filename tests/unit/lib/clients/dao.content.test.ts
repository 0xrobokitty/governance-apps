import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  DAO_PROPOSAL_ASSET_LIMITS,
  DAO_PROPOSAL_MARKDOWN_LIMITS,
  canonicalizeDaoProposalContent,
  createDaoRawSha256Cid,
  deriveDaoProposalContentIdentity,
  getDaoProposalUtf8ByteLength,
  parseDaoProposalContent,
  resolveDaoProposalAttachment,
  validateDaoVerifiedSource,
} from "@/lib/clients/dao/content";
import type {
  DaoProposalAsset,
  DaoProposalContent,
  DaoVerifiedSource,
} from "@/lib/clients/dao";

const CREATOR = "0x4444444444444444444444444444444444444444" as Address;
const ASSET_DIGEST = `0x${"11".repeat(32)}` as Hex;
const ASSET_CID = createDaoRawSha256Cid(ASSET_DIGEST);

function asset(overrides: Partial<DaoProposalAsset> = {}): DaoProposalAsset {
  return {
    path: "./assets/architecture.svg",
    mediaType: "image/svg+xml",
    byteLength: 1_024,
    digest: ASSET_DIGEST,
    width: 1_280,
    height: 720,
    ...overrides,
  };
}

function content(overrides: Partial<DaoProposalContent> = {}): DaoProposalContent {
  return {
    schema: "yearn.dao.proposal.v1",
    markdown:
      "# Adopt the contributor budget\n\nApprove the **budget** for the next epoch.\n\n## Specification\n\nFund research and publish [results](https://gov.yearn.fi/t/research).\n",
    discussionUrl: "https://gov.yearn.fi/t/dao-proposal/1",
    proposalType: "signal",
    createdBy: CREATOR,
    createdAt: "2026-08-18T12:00:00.000Z",
    assets: [],
    ...overrides,
  };
}

describe("DAO proposal content", () => {
  it.each(["A complete short proposal.", "## Summary\n\nA complete short proposal."])("accepts a summary-only proposal body: %s", body => {
    const parsed = parseDaoProposalContent(content({ markdown: `# Decision\n\n${body}` }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.summary).toBe("A complete short proposal.");
  });

  it("still requires visible summary text below an optional Summary heading", () => {
    expect(parseDaoProposalContent(content({ markdown: "# Decision\n\n## Summary\n\n## Specification\n\nBody." })).errors.map(error => error.code)).toContain("MISSING_SUMMARY");
  });

  it("does not accept an attachment as a summary below its optional heading", () => {
    const parsed = parseDaoProposalContent(content({ markdown: "# Decision\n\n## Summary\n\n![Diagram](./assets/architecture.svg)\n\nBody.", assets: [asset()] }));
    expect(parsed.errors.map(error => error.code)).toContain("UNSAFE_IMAGE");
  });

  it("parses the shared safe grammar and preserves exact source bytes", () => {
    const source = content().markdown;
    const parsed = parseDaoProposalContent(content());

    expect(parsed.errors).toEqual([]);
    expect(parsed.source).toBe(source);
    expect(parsed.byteLength).toBe(getDaoProposalUtf8ByteLength(source));
    expect(parsed.title).toBe("Adopt the contributor budget");
    expect(parsed.summary).toBe("Approve the budget for the next epoch.");
    expect(parsed.ast.children[0]).toMatchObject({ type: "heading", depth: 1 });
    expect(parsed.ast.children[1]).toMatchObject({ type: "paragraph" });
  });

  it("enables only the GFM table extension", () => {
    const parsed = parseDaoProposalContent(
      content({
        markdown:
          "# Table proposal\n\nA concise summary.\n\n## Specification\n\n| Item | Value |\n| --- | ---: |\n| Limit | 16 |\n",
      })
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.ast.children.some((node) => node.type === "table")).toBe(true);
  });

  it.each([
    ["MISSING_H1", "A summary first.\n\nBody text."],
    ["DUPLICATE_H1", "# One\n\nSummary.\n\n# Two\n\nBody."],
    ["MISSING_SUMMARY", "# One\n\n## Body\n\nBody."],
    ["EMPTY_BODY", "# One\n\nSummary.\n\n## Heading only\n"],
    ["HEADING_DEPTH", "# One\n\nSummary.\n\n### Skipped\n\nBody."],
    ["HEADING_DEPTH", "# One\n\nSummary.\n\n## Body\n\n##### Too deep\n"],
    ["RAW_HTML", "# One\n\nSummary.\n\n<div>unsafe</div>"],
    ["UNSUPPORTED_NODE", "# One\n\nSummary.\n\n---\n"],
    ["UNSAFE_LINK", "# One\n\nSummary.\n\n[bad](javascript:alert(1))"],
    ["UNSAFE_LINK", "# One\n\nSummary.\n\n[bad](//evil.example/path)"],
    ["UNSAFE_LINK", "# One\n\nSummary.\n\n[bad](/dao//evil.example/path)"],
  ])("returns stable %s errors", (code, markdown) => {
    const parsed = parseDaoProposalContent(content({ markdown }));
    expect(parsed.errors.map((error) => error.code)).toContain(code);
    expect(parsed.errors[0]).toMatchObject({
      offset: expect.any(Number),
      line: expect.any(Number),
      column: expect.any(Number),
    });
  });

  it("orders located document errors before manifest errors", () => {
    const parsed = parseDaoProposalContent(
      content({ markdown: "Summary only.", assets: [asset({ path: "../bad" })] })
    );
    expect(parsed.errors[0]?.code).toBe("MISSING_H1");
    expect(parsed.errors.at(-1)?.code).toBe("ASSET_TRAVERSAL");
  });

  it("counts Unicode graphemes instead of UTF-16 code units", () => {
    const joined = "👩🏽‍💻";
    const combining = "e\u0301";
    const title = `${joined}${combining}`.repeat(70);
    const valid = parseDaoProposalContent(
      content({ markdown: `# ${title}\n\nSummary.\n\nBody.` })
    );
    expect(valid.errors.some((error) => error.code === "TITLE_TOO_LONG")).toBe(
      false
    );

    const invalid = parseDaoProposalContent(
      content({ markdown: `# ${title}${joined}\n\nSummary.\n\nBody.` })
    );
    expect(invalid.errors.map((error) => error.code)).toContain("TITLE_TOO_LONG");
  });

  it("counts visible link and inline-code text, not delimiters or destinations", () => {
    const parsed = parseDaoProposalContent(
      content({
        markdown:
          "# [Visible](https://example.com/a/very/long/destination) `code`\n\nA **short** summary.\n\nBody.",
      })
    );
    expect(parsed.title).toBe("Visible code");
    expect(parsed.summary).toBe("A short summary.");
  });

  it("rejects invalid source code units and the exact UTF-8 overflow boundary", () => {
    expect(
      parseDaoProposalContent(content({ markdown: "# Bad\u0000\n\nSummary.\n\nBody." }))
        .errors[0]?.code
    ).toBe("INVALID_SOURCE_CHARACTER");
    expect(
      parseDaoProposalContent(content({ markdown: "# Bad\ud800\n\nSummary.\n\nBody." }))
        .errors[0]?.code
    ).toBe("INVALID_UNICODE");

    const prefix = "# Exact\n\nSummary.\n\n";
    const exact = `${prefix}${"a".repeat(
      DAO_PROPOSAL_MARKDOWN_LIMITS.maxUtf8Bytes - getDaoProposalUtf8ByteLength(prefix)
    )}`;
    expect(parseDaoProposalContent(content({ markdown: exact })).byteLength).toBe(
      32_768
    );
    expect(
      parseDaoProposalContent(content({ markdown: `${exact}a` })).errors[0]?.code
    ).toBe("SOURCE_TOO_LARGE");

    const oversizedNesting = `${"> ".repeat(20_000)}body`;
    const oversized = parseDaoProposalContent(
      content({ markdown: oversizedNesting })
    );
    expect(oversized.errors[0]?.code).toBe("SOURCE_TOO_LARGE");
    expect(oversized.ast.children).toEqual([]);
  });

  it("enforces parser work bounds", () => {
    const deep = `${"> ".repeat(DAO_PROPOSAL_MARKDOWN_LIMITS.maxDepth + 1)}body`;
    expect(
      parseDaoProposalContent(
        content({ markdown: `# Deep\n\nSummary.\n\n${deep}` })
      ).errors.map((error) => error.code)
    ).toContain("DOCUMENT_TOO_DEEP");

    const rows = Array.from({ length: 513 }, (_, index) => `| ${index} | ${index} |`);
    expect(
      parseDaoProposalContent(
        content({
          markdown: `# Table\n\nSummary.\n\n| A | B |\n| --- | --- |\n${rows.join("\n")}`,
        })
      ).errors.map((error) => error.code)
    ).toContain("TOO_MANY_TABLE_CELLS");
  });

  it("rejects adversarial blockquote depth without overflowing the stack", () => {
    const nested = `${"> ".repeat(8_192)}body`;

    expect(() =>
      parseDaoProposalContent(
        content({ markdown: `# Deep\n\nSummary.\n\n${nested}` })
      )
    ).not.toThrow();
    const parsed = parseDaoProposalContent(
      content({ markdown: `# Deep\n\nSummary.\n\n${nested}` })
    );
    expect(parsed.errors.map((error) => error.code)).toContain(
      "DOCUMENT_TOO_DEEP"
    );
    expect(parsed.ast.children).toEqual([]);
  });

  it.each([
    ["a nested level-one heading", "> # Nested title", ["DUPLICATE_H1", "HEADING_DEPTH"]],
    ["a nested first level-three heading", "> ### Nested section", ["HEADING_DEPTH"]],
    ["a nested level-five heading", "> ##### Nested section", ["HEADING_DEPTH"]],
  ])("rejects %s across the whole tree", (_label, body, codes) => {
    const parsed = parseDaoProposalContent(
      content({ markdown: `# Title\n\nSummary.\n\n${body}\n\nBody.` })
    );

    for (const code of codes) {
      expect(parsed.errors.map((error) => error.code)).toContain(code);
    }
  });

  it("accepts supported H2 through H4 headings nested in body containers", () => {
    const parsed = parseDaoProposalContent(
      content({
        markdown:
          "# Title\n\nSummary.\n\n> ## Quoted section\n>\n> ### Detail\n>\n> #### Note\n>\n> Body.",
      })
    );

    expect(parsed.errors).toEqual([]);
  });

  it("accepts safe external, IPFS, and root-relative links", () => {
    const parsed = parseDaoProposalContent(
      content({
        markdown: `# Links\n\nSummary.\n\n[Web](https://example.com/path) [IPFS](ipfs://${ASSET_CID}) [DAO](/dao/proposals/1)`,
      })
    );
    expect(parsed.errors).toEqual([]);
  });

  it("accepts section links and assigns unique heading IDs without changing the source", () => {
    const markdown = "# Links\n\nSummary.\n\n## References\n\n[Read references](#references) and [Unicode](#r%C3%A9f%C3%A9rences).\n\n## References\n\n## References-1\n\n## Références\n\n## **Code** `API` & notes!\n\n## !!!\n";
    const parsed = parseDaoProposalContent(content({ markdown }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.source).toBe(markdown);
    expect(parsed.ast.children.filter((node) => node.type === "heading").map((node) => node.headingId)).toEqual([
      "links", "references", "references-1", "references-1-1", "références", "code-api-notes", "section",
    ]);
  });

  it.each(["#", "#%", "#%00", "#%0aevil", "#%5cevil", "#//evil.example", "#javascript:alert(1)", "javascript:alert(1)", "data:text/html,evil", "//evil.example", "http://example.com", "https://user:password@example.com"])("rejects unsafe or malformed link %s", (target) => {
    const parsed = parseDaoProposalContent(content({ markdown: `# Links\n\nSummary.\n\n[Link](<${target}>)` }));
    expect(parsed.errors.map((error) => error.code)).toContain("UNSAFE_LINK");
  });

  it("resolves both attachment forms to the same authenticated raw block", () => {
    const manifest = [asset()];
    const relative = resolveDaoProposalAttachment(
      "./assets/architecture.svg",
      manifest
    );
    const direct = resolveDaoProposalAttachment(`ipfs://${ASSET_CID}`, manifest);

    expect(relative).toMatchObject({
      cid: direct.state === "valid" ? direct.cid : null,
      gatewayUrl: direct.state === "valid" ? direct.gatewayUrl : null,
      asset: direct.state === "valid" ? direct.asset : null,
    });
    expect(relative).toMatchObject({
      state: "valid",
      cid: ASSET_CID,
      gatewayUrl: `https://ipfs.io/ipfs/${ASSET_CID}`,
    });

    const parsed = parseDaoProposalContent(
      content({
        markdown:
          "# Attachment\n\nSummary.\n\n![Architecture diagram](./assets/architecture.svg)",
        assets: manifest,
      })
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.attachments).toHaveLength(1);
  });

  it.each([
    ["the title", "# ![Diagram](./assets/architecture.svg)\n\nSummary.\n\nBody."],
    ["the summary", "# Title\n\n![Diagram](./assets/architecture.svg)\n\nBody."],
    ["a link", "# Title\n\nSummary.\n\n[![Diagram](./assets/architecture.svg)](https://example.com)"],
    ["a heading", "# Title\n\nSummary.\n\n## ![Diagram](./assets/architecture.svg)\n\nBody."],
    ["mixed paragraph content", "# Title\n\nSummary.\n\nBefore ![Diagram](./assets/architecture.svg)"],
    ["emphasis", "# Title\n\nSummary.\n\n*![Diagram](./assets/architecture.svg)*"],
    ["a blockquote", "# Title\n\nSummary.\n\n> ![Diagram](./assets/architecture.svg)\n>\n> Body."],
  ])("rejects an attachment in %s", (_label, markdown) => {
    const parsed = parseDaoProposalContent(
      content({ markdown, assets: [asset()] })
    );

    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSAFE_IMAGE",
          offset: expect.any(Number),
          line: expect.any(Number),
          column: expect.any(Number),
        }),
      ])
    );
    expect(parsed.attachments).toEqual([]);
  });

  it.each([
    ["https://example.com/image.png", "UNSAFE_IMAGE"],
    ["./assets/../secret.svg", "ASSET_TRAVERSAL"],
    ["./assets/%252e%252e/secret.svg", "ASSET_TRAVERSAL"],
    ["./assets/path%2fsecret.svg", "ASSET_TRAVERSAL"],
    [`ipfs://${ASSET_CID}/child`, "INVALID_ASSET_CID"],
    [`ipfs://${ASSET_CID}?download=1`, "INVALID_ASSET_CID"],
  ])("rejects unsafe attachment target %s", (target, code) => {
    const parsed = parseDaoProposalContent(
      content({
        markdown: `# Attachment\n\nSummary.\n\n![Diagram](${target})`,
        assets: [asset()],
      })
    );
    expect(parsed.errors.map((error) => error.code)).toContain(code);
  });

  it("rejects empty alt text, missing assets, duplicate paths, and duplicate digests", () => {
    expect(
      parseDaoProposalContent(
        content({
          markdown: "# Attachment\n\nSummary.\n\n![](./assets/architecture.svg)",
          assets: [asset()],
        })
      ).errors.map((error) => error.code)
    ).toContain("EMPTY_ATTACHMENT_ALT");
    expect(
      parseDaoProposalContent(
        content({
          markdown:
            "# Attachment\n\nSummary.\n\n![Diagram](./assets/missing.svg)",
          assets: [asset()],
        })
      ).errors.map((error) => error.code)
    ).toContain("MISSING_ASSET");
    expect(
      parseDaoProposalContent(
        content({ assets: [asset(), asset({ digest: `0x${"22".repeat(32)}` })] })
      ).errors.map((error) => error.code)
    ).toContain("DUPLICATE_ASSET_PATH");
    expect(
      parseDaoProposalContent(
        content({
          assets: [asset(), asset({ path: "./assets/copy.svg" })],
        })
      ).errors.map((error) => error.code)
    ).toContain("DUPLICATE_ASSET_DIGEST");
  });

  it("reports duplicate attachment paths as paths and preserves digest errors", () => {
    const duplicatePath = [
      asset(),
      asset({ digest: `0x${"22".repeat(32)}` as Hex }),
    ];
    expect(
      resolveDaoProposalAttachment("./assets/architecture.svg", duplicatePath)
    ).toMatchObject({ state: "invalid", code: "DUPLICATE_ASSET_PATH" });

    const duplicateDigest = [
      asset(),
      asset({ path: "./assets/copy.svg" }),
    ];
    expect(
      resolveDaoProposalAttachment(`ipfs://${ASSET_CID}`, duplicateDigest)
    ).toMatchObject({ state: "invalid", code: "DUPLICATE_ASSET_DIGEST" });

    const parsed = parseDaoProposalContent(
      content({
        markdown:
          "# Attachment\n\nSummary.\n\n![Diagram](./assets/architecture.svg)",
        assets: duplicatePath,
      })
    );
    expect(parsed.attachments).toEqual([]);
    expect(
      parsed.errors.some(
        (error) =>
          error.code === "DUPLICATE_ASSET_PATH" && error.offset !== null
      )
    ).toBe(false);
  });

  it("orders manifest errors by index and a fixed per-entry priority", () => {
    const tooMany = Array.from({ length: 17 }, (_, index) =>
      asset({
        path: index === 0 ? "../bad" : `./assets/${index}.svg`,
        digest: `0x${index.toString(16).padStart(2, "0").repeat(32)}` as Hex,
      })
    );
    const overflow = parseDaoProposalContent(content({ assets: tooMany }));
    expect(overflow.errors[0]).toMatchObject({
      code: "ASSET_TRAVERSAL",
      manifestIndex: 0,
    });
    expect(
      overflow.errors.findIndex((error) => error.code === "TOO_MANY_ASSETS")
    ).toBeGreaterThan(0);

    const duplicate = parseDaoProposalContent(
      content({ assets: [asset(), asset()] })
    );
    expect(
      duplicate.errors
        .filter((error) => error.manifestIndex === 1)
        .map((error) => error.code)
    ).toEqual(["DUPLICATE_ASSET_PATH", "DUPLICATE_ASSET_DIGEST"]);
  });

  it("enforces every frozen manifest bound", () => {
    expect(DAO_PROPOSAL_ASSET_LIMITS).toEqual({
      maxAssets: 16,
      maxPathUtf8Bytes: 512,
      maxMediaTypeUtf8Bytes: 127,
      maxAssetBytes: 2_097_152,
      maxAggregateAssetBytes: 33_554_432,
      maxImageWidth: 8_192,
      maxImageHeight: 8_192,
      maxImagePixels: 33_554_432,
    });

    const vectors: Array<[Partial<DaoProposalAsset>, string]> = [
      [{ path: `./assets/${"a".repeat(504)}` }, "ASSET_PATH_TOO_LONG"],
      [{ mediaType: `${"a".repeat(122)}/plain` }, "ASSET_MEDIA_TYPE_TOO_LONG"],
      [{ byteLength: 2_097_153 }, "ASSET_TOO_LARGE"],
      [{ width: 8_193 }, "ASSET_DIMENSIONS_INVALID"],
      [{ width: 8_192, height: 8_192 }, "ASSET_DIMENSIONS_INVALID"],
      [{ digest: "0x1234" as Hex }, "INVALID_ASSET_DIGEST"],
      [{ path: "./assets/\ud800.svg" }, "INVALID_ASSET_PATH"],
    ];
    for (const [overrides, code] of vectors) {
      expect(
        parseDaoProposalContent(content({ assets: [asset(overrides)] })).errors.map(
          (error) => error.code
        )
      ).toContain(code);
    }
  });

  it("encodes one canonical content object and changes identity on one source byte", () => {
    const original = content();
    const changed = content({ markdown: `${original.markdown} ` });
    const bytes = canonicalizeDaoProposalContent(original);
    const identity = deriveDaoProposalContentIdentity(original);

    expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toBe(
      JSON.stringify({
        schema: original.schema,
        markdown: original.markdown,
        discussionUrl: original.discussionUrl,
        proposalType: original.proposalType,
        createdBy: original.createdBy,
        createdAt: original.createdAt,
        assets: original.assets,
      }) + "\n"
    );
    expect(identity.cid).toBe(createDaoRawSha256Cid(identity.digest));
    expect(deriveDaoProposalContentIdentity(changed)).not.toEqual(identity);
  });
});

describe("DAO verified source", () => {
  const source: DaoVerifiedSource = {
    kind: "github",
    label: "Voting.vy at pinned stYFI revision",
    url: "https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy",
    revision: "9395d5e6fffdfe21fda32af94d32fca1a4f7840b",
  };

  it("accepts complete HTTPS provenance and rejects unsafe URLs", () => {
    expect(validateDaoVerifiedSource(source)).toEqual(source);
    expect(() =>
      validateDaoVerifiedSource({ ...source, url: "javascript:alert(1)" })
    ).toThrow(/HTTPS/);
    expect(() =>
      validateDaoVerifiedSource({
        ...source,
        url: "https://user:pass@example.com/source",
      })
    ).toThrow(/credentials/);
  });
});
