import { describe, expect, it } from "vitest";
import deployedOverrides from "@/public/dao-title-overrides.json";
import { daoTitleOverridesSchema, findDaoTitleOverride, getDaoDisplayTitle } from "@/lib/clients/dao/title-overrides";
import type { DaoProposalRef } from "@/lib/clients/dao/types";

const ref: DaoProposalRef = {
  chainId: 1,
  votingAddress: "0x1234567890abcdef1234567890abcdef12345678",
  proposalId: 7n,
};
const digest = `0x${"ab".repeat(32)}`;
const entry = { ...ref, proposalId: "7", contentDigest: digest, title: "Fund the next DAO-ops term" };
const configuration = { version: 1, overrides: [entry] };

describe("DAO display title overrides", () => {
  it("validates the deployed configuration", () => {
    expect(daoTitleOverridesSchema.safeParse(deployedOverrides).success).toBe(true);
  });

  it("matches the complete identity and digest, case insensitively for hex", () => {
    const upper = { ...entry, votingAddress: entry.votingAddress.toUpperCase().replace("0X", "0x"), contentDigest: digest.toUpperCase().replace("0X", "0x") };
    expect(findDaoTitleOverride(ref, digest, { version: 1, overrides: [upper] })?.title).toBe(entry.title);
    expect(findDaoTitleOverride({ ...ref, chainId: 10 }, digest, configuration)).toBeNull();
    expect(findDaoTitleOverride({ ...ref, proposalId: 8n }, digest, configuration)).toBeNull();
    expect(findDaoTitleOverride({ ...ref, votingAddress: "0x9999999999999999999999999999999999999999" }, digest, configuration)).toBeNull();
    expect(findDaoTitleOverride(ref, `0x${"cd".repeat(32)}`, configuration)).toBeNull();
  });

  it.each([
    { ...entry, body: "Rewritten body" },
    { ...entry, markdown: "# Rewritten content" },
    { ...entry, title: " " },
    { ...entry, title: " Title " },
    { ...entry, title: "A\nsecond line" },
    { ...entry, title: "Misleading\u202etitle" },
    { ...entry, title: "x".repeat(201) },
    { ...entry, proposalId: "07" },
    { ...entry, proposalId: "not-a-number" },
    { ...entry, proposalId: (2n ** 256n).toString() },
    { ...entry, chainId: 1.5 },
    { ...entry, contentDigest: "0x1234" },
  ])("rejects malformed or non-title changes: %j", (invalid) => {
    expect(findDaoTitleOverride(ref, digest, { version: 1, overrides: [invalid] })).toBeNull();
  });

  it("rejects duplicates and unsupported configuration fields", () => {
    expect(findDaoTitleOverride(ref, digest, { version: 1, overrides: [entry, { ...entry, title: "Another title" }] })).toBeNull();
    expect(findDaoTitleOverride(ref, digest, { ...configuration, body: "Replacement" })).toBeNull();
    expect(findDaoTitleOverride(ref, digest, { ...configuration, version: 2 })).toBeNull();
  });

  it("leaves original titles unchanged without an override", () => {
    expect(getDaoDisplayTitle(ref, digest, "Summary")).toBe("Summary");
    expect(getDaoDisplayTitle(ref, digest, null)).toBeNull();
    expect(configuration.overrides[0]).toEqual(entry);
  });
});
