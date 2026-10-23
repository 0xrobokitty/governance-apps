import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/address-labels/route";
import { createAddressLabelBridgeScript } from "@/lib/identity/bridge-script";
import { ADDRESS_LABEL_BRIDGE_KIND, getAddressLabelBridgeOrigin, parseAddressLabelBridgeResponse } from "@/lib/identity/bridge-protocol";
import { ADDRESS_ALIASES_STORAGE_KEY } from "@/lib/identity/aliases";

const dao = "https://dao.yearn.fi", ybc = "https://ybc.yearn.fi";
const address = "0x1111111111111111111111111111111111111111";
const id = "11111111-1111-4111-8111-111111111111";
const request = { kind: ADDRESS_LABEL_BRIDGE_KIND, id, operation: "set", address, alias: "Alice" };

function harness() {
  const values = new Map<string, string>();
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const parent = { postMessage: vi.fn() };
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  runInNewContext(createAddressLabelBridgeScript(dao, ybc), {
    parent, window: {}, location: { origin: ybc }, localStorage,
    addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => handlers.set(name, handler),
  });
  return { values, parent, localStorage, send: (data: unknown, origin = dao, source: unknown = parent) => handlers.get("message")!({ data, origin, source }) };
}

describe("shared address label bridge", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("pairs exact environment origins only", () => {
    expect(getAddressLabelBridgeOrigin(dao)).toBe(ybc);
    for (const origin of ["https://dao.yearn.fi.evil.test", "http://dao.yearn.fi", "https://dao.yearn.fi:444", "null", "https://teams.yearn.fi"]) expect(getAddressLabelBridgeOrigin(origin)).toBeNull();
  });
  it("rejects wrong origins, wrong windows, null and malformed requests", () => {
    const h = harness();
    h.send(request, "https://evil.test"); h.send(request, dao, {}); h.send(null); h.send({ ...request, key: "wallet-secret" }); h.send({ ...request, id: "bad" });
    expect(h.parent.postMessage).not.toHaveBeenCalled();
    expect(h.values.size).toBe(0);
  });
  it("updates only the alias key and preserves earlier YBC labels", () => {
    const h = harness();
    const previous = "0x2222222222222222222222222222222222222222";
    h.values.set(ADDRESS_ALIASES_STORAGE_KEY, JSON.stringify({ version: 1, aliases: { [previous]: "Bob" } }));
    h.send(request);
    expect(JSON.parse(h.values.get(ADDRESS_ALIASES_STORAGE_KEY)!)).toEqual({ version: 1, aliases: { [previous]: "Bob", [address]: "Alice" } });
    expect(h.parent.postMessage).toHaveBeenLastCalledWith({ kind: ADDRESS_LABEL_BRIDGE_KIND, id, status: "saved", aliases: { [previous]: "Bob", [address]: "Alice" } }, dao);
    h.send({ ...request, operation: "reset" });
    expect(JSON.parse(h.values.get(ADDRESS_ALIASES_STORAGE_KEY)!).aliases).toEqual({ [previous]: "Bob" });
  });
  it("rejects unsafe names and reports blocked storage", () => {
    const h = harness(); h.send({ ...request, alias: "bad\u202ename" });
    expect(h.parent.postMessage.mock.lastCall?.[0].status).toBe("invalid");
    h.localStorage.setItem = () => { throw new Error("Denied"); };
    h.send(request);
    expect(h.parent.postMessage.mock.lastCall?.[0].status).toBe("storage-error");
  });
  it("validates bounded responses before displaying labels", () => {
    const value = { kind: ADDRESS_LABEL_BRIDGE_KIND, id, status: "saved", aliases: { [address]: "Alice" } };
    expect(parseAddressLabelBridgeResponse(value)?.aliases).toEqual(value.aliases);
    expect(parseAddressLabelBridgeResponse({ ...value, aliases: { [address]: "bad\u200bname" } })).toBeNull();
    expect(parseAddressLabelBridgeResponse({ ...value, aliases: JSON.parse('{"__proto__":"Bad"}') })).toBeNull();
    expect(parseAddressLabelBridgeResponse(null)).toBeNull();
  });
  it("serves a non-cacheable exact-parent CSP using forwarded host routing", async () => {
    const response = GET(new Request("http://localhost:3000/api/address-labels", { headers: { host: "ybc.yearn.fi" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(`frame-ancestors ${dao}`);
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(await response.text()).toContain(`location.origin !== "${ybc}"`);
    expect(GET(new Request("https://untrusted.test/api/address-labels")).status).toBe(404);
  });
  it("closes the adapter when either production app is disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "false");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_YBC", "true");
    expect(GET(new Request(`${ybc}/api/address-labels`)).status).toBe(404);
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_YBC", "false");
    expect(GET(new Request(`${ybc}/api/address-labels`)).status).toBe(404);
  });
});
