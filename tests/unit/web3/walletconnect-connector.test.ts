import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfig, createStorage, http } from "wagmi";
import { mainnet, optimism } from "wagmi/chains";
import { getAddress } from "viem";
import {
  walletConnect, type UniversalWalletProvider,
} from "@/web3/walletconnect-connector";
import {
  cancelWalletConnectPairing, getWalletConnectPairing,
} from "@/web3/walletconnect-pairing";
import {
  getWalletSessionGrant, parseWalletChainId, type WalletSession,
} from "@/web3/walletconnect-session";

const A = "0x000000000000000000000000000000000000000a";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";
const methods = ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4", "wallet_switchEthereumChain"];
function session(overrides: Partial<WalletSession> = {}): WalletSession {
  return {
    topic: "wallet-test-topic",
    expiry: Math.floor(Date.now() / 1000) + 3600,
    namespaces: {
      eip155: {
        accounts: [`eip155:1:${A}`, `eip155:10:${B}`],
        methods,
        events: ["accountsChanged", "chainChanged"],
      },
    },
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class FakeProvider implements UniversalWalletProvider {
  session: WalletSession | undefined;
  storedSession: WalletSession | undefined;
  orphanSessions = new Map<string, WalletSession>();
  proposals: Array<{ id: number; pairingTopic?: string }> = [];
  uri = "wc:test-topic@2?relay-protocol=irn&symKey=test-key";
  client = {
    session: {
      get: (topic: string) => {
        if (this.storedSession?.topic === topic) return this.storedSession;
        const orphan = this.orphanSessions.get(topic);
        if (orphan) return orphan;
        throw new Error("No session");
      },
      update: async (topic: string, changes: Partial<WalletSession>) => {
        this.storedSession = { ...this.client.session.get(topic), ...changes };
      },
    },
    proposal: { getAll: () => this.proposals },
    core: { expirer: { set: vi.fn((key: string | number, expiry: number) => { void key; void expiry; }) } },
    disconnect: vi.fn(async ({ topic }: { topic: string; reason: { code: number; message: string } }) => {
      this.orphanSessions.delete(topic);
    }),
    on: (event: "session_extend" | "session_expire" | "session_connect", listener: (event: {
      topic?: string; session?: WalletSession & { pairingTopic?: string };
    }) => void) => {
      this.on(`client_${event}`, listener as (...args: unknown[]) => void);
    },
  };
  chain = "1";
  rpcProviders = { eip155: { getDefaultChain: () => this.chain } };
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  nextSession = session();
  approval: ReturnType<typeof deferred<WalletSession>> | undefined;
  connect = vi.fn(async () => {
    this.emit("display_uri", this.uri);
    this.session = this.approval ? await this.approval.promise : this.nextSession;
    this.storedSession = this.session;
    this.emit("connect", this.session);
    return this.session;
  });
  disconnect = vi.fn(async () => {
    this.session = undefined;
    this.storedSession = undefined;
    this.emit("session_delete", { topic: "wallet-test-topic" });
    this.emit("disconnect", { code: 6000 });
  });
  request = vi.fn(async (args: { method: string; params?: object }, chain?: string): Promise<unknown> => { void args; void chain; return "0xtx"; });
  setDefaultChain(chain: string) {
    this.chain = chain.slice(7);
    this.emit("chainChanged", this.chain);
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}
const runtimes: Array<ReturnType<typeof setup>> = [];
function setup(sdk = new FakeProvider()) {
  const factory = vi.fn(async () => sdk);
  const data = new Map<string, string>();
  const storage = createStorage<Record<string, unknown>>({ key: "wallet-test", storage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  } });
  if (sdk.session) {
    sdk.storedSession = sdk.session;
    storage.setItem("walletConnect.connected", true);
  }
  const config = createConfig({
    chains: [mainnet, optimism],
    connectors: [walletConnect({
      projectId: "test-project",
      rpcMap: { 1: "https://rpc.example/ethereum", 10: "https://rpc.example/optimism" },
      providerFactory: factory,
    })],
    transports: {
      1: http("https://rpc.example/ethereum", { retryCount: 0 }),
      10: http("https://rpc.example/optimism", { retryCount: 0 }),
    },
    storage,
  });
  return { sdk, factory, storage, connector: config.connectors[0] };
}
function runtime(sdk = new FakeProvider()) {
  const result = setup(sdk);
  runtimes.push(result);
  return result;
}
async function untilPairing() {
  await vi.waitFor(() => expect(getWalletConnectPairing().status).toBe("pending"));
}

afterEach(async () => {
  for (const item of runtimes.splice(0)) {
    item.sdk.approval?.reject(new Error("test cleanup"));
    await item.connector.disconnect();
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WalletConnect approved sessions", () => {
  it("does not load the SDK during fresh Wagmi connector scanning", async () => {
    const { connector, factory } = runtime();
    await connector.getProvider();
    expect(await connector.isAuthorized()).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it("shares pending initialization between reconnect scanning and a user connection", async () => {
    const sdk = new FakeProvider();
    sdk.session = session();
    const { connector, factory } = runtime(sdk);
    const persisted = deferred<void>();
    const update = vi.spyOn(sdk.client.session, "update").mockImplementationOnce((topic, changes) => {
      sdk.storedSession = { ...sdk.client.session.get(topic), ...changes };
      return persisted.promise;
    });
    const setChain = vi.spyOn(sdk, "setDefaultChain");
    const restoring = connector.isAuthorized();
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    let connected = false;
    const connecting = connector.connect().then((result) => { connected = true; return result; });
    for (let step = 0; step < 30; step++) await Promise.resolve();
    expect(connected).toBe(false);
    expect(setChain).not.toHaveBeenCalled();
    expect(sdk.listeners.get("session_event")?.size ?? 0).toBe(0);
    persisted.resolve();
    expect(await restoring).toBe(true);
    expect((await connecting).accounts).toEqual([getAddress(A)]);
    expect(factory).toHaveBeenCalledOnce();
    expect(sdk.listeners.get("session_event")?.size).toBe(1);
  });

  it("recovers after a failed SDK initialization without leaving a partial provider", async () => {
    const sdk = new FakeProvider();
    sdk.session = session();
    const update = vi.spyOn(sdk.client.session, "update").mockRejectedValueOnce(new Error("Storage unavailable"));
    const { connector, factory } = runtime(sdk);
    await expect(connector.connect()).rejects.toThrow("Storage unavailable");
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    expect(sdk.listeners.get("session_event")?.size ?? 0).toBe(0);
    expect((await connector.connect()).accounts).toEqual([getAddress(A)]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalled();
    expect(sdk.listeners.get("session_event")?.size).toBe(1);
  });

  it("fails a wallet request safely when redirect suppression cannot be persisted", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    vi.spyOn(sdk.client.session, "update").mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] })).rejects.toThrow("Storage unavailable");
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("revalidates the sender after asynchronous session persistence", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    const persisted = deferred<void>();
    vi.spyOn(sdk.client.session, "update").mockImplementationOnce(() => persisted.promise);
    const sending = provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] });
    await Promise.resolve();
    sdk.emit("chainChanged", "0xa");
    persisted.resolve();
    await expect(sending).rejects.toMatchObject({ code: 4100 });
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("does not recreate a session deleted during asynchronous persistence", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    const persisted = deferred<void>();
    vi.spyOn(sdk.client.session, "update").mockImplementationOnce(() => persisted.promise);
    const sending = provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] });
    await Promise.resolve();
    await sdk.disconnect();
    persisted.resolve();
    await expect(sending).rejects.toMatchObject({ code: 4100 });
    expect(sdk.session).toBeUndefined();
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("does not allow requests through a restored provider before connector acceptance", async () => {
    const sdk = new FakeProvider();
    sdk.session = session();
    const { connector } = runtime(sdk);
    const provider = await connector.getProvider();
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] })).rejects.toMatchObject({ code: 4100 });
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("disables inherited legacy SDK deep links for restored and new sessions", async () => {
    const sdk = new FakeProvider();
    sdk.session = session();
    const { connector } = runtime(sdk);
    expect(await connector.isAuthorized()).toBe(true);
    expect(sdk.client.session.get(sdk.session.topic).sessionConfig?.disableDeepLink).toBe(true);
    await connector.connect({ isReconnecting: true });
    const provider = await connector.getProvider();
    sdk.session.sessionConfig = undefined;
    sdk.storedSession = { ...sdk.session, sessionConfig: undefined };
    await provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] });
    expect(sdk.client.session.get(sdk.session.topic).sessionConfig?.disableDeepLink).toBe(true);
  });

  it("parses chain identifiers without accepting partial, zero, or unsafe values", () => {
    for (const value of [1, "1", "0x1", "eip155:1"]) expect(parseWalletChainId(value)).toBe(1);
    for (const value of ["1junk", "eip155:1:0xabc", "0", 0, -1, "1e3", "1.5", Number.MAX_SAFE_INTEGER + 1])
      expect(parseWalletChainId(value)).toBeUndefined();
  });

  it("scopes accounts and methods to the approved chain, including inline namespace keys", () => {
    const current = session({
      namespaces: {
        "eip155:1": { accounts: [`eip155:1:${A}`], methods, events: ["accountsChanged", "chainChanged"] },
        "eip155:10": { accounts: [`eip155:10:${B}`], methods: ["personal_sign"], events: [] },
      },
    });
    expect(getWalletSessionGrant(current, 1).accounts).toEqual([getAddress(A)]);
    expect(getWalletSessionGrant(current, 1).valid).toBe(true);
    expect(getWalletSessionGrant(current, 10).valid).toBe(false);
  });

  it("rejects expired, unapproved-method, wrong-chain and empty-account restorations", async () => {
    const variants = [
      session({ expiry: Math.floor(Date.now() / 1000) - 1 }),
      session({ namespaces: { eip155: { accounts: [`eip155:1:${A}`], methods: ["personal_sign"], events: ["accountsChanged", "chainChanged"] } } }),
      session({ namespaces: { eip155: { accounts: [`eip155:10:${B}`], methods, events: ["accountsChanged", "chainChanged"] } } }),
      session({ namespaces: { eip155: { accounts: [], methods, events: ["accountsChanged", "chainChanged"] } } }),
    ];
    for (const current of variants) {
      const sdk = new FakeProvider();
      sdk.session = current;
      const { connector } = runtime(sdk);
      expect(await connector.isAuthorized()).toBe(false);
      expect(sdk.connect).not.toHaveBeenCalled();
    }
  });

  it("restores only an approved session and uses a separate storage prefix", async () => {
    const sdk = new FakeProvider();
    sdk.session = session();
    const { connector, factory } = runtime(sdk);
    expect(await connector.isAuthorized()).toBe(true);
    expect((await connector.connect({ isReconnecting: true })).accounts).toEqual([getAddress(A)]);
    expect(sdk.connect).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({
      customStoragePrefix: "yearn-wallet-v1",
      telemetryEnabled: false,
    }));
  });

  it("rejects an insufficient new approval instead of claiming a connection", async () => {
    const { connector, sdk } = runtime();
    sdk.nextSession = session({ namespaces: { eip155: {
      accounts: [`eip155:1:${A}`], methods: [], events: ["accountsChanged", "chainChanged"],
    } } });
    await expect(connector.connect()).rejects.toThrow("did not approve");
    expect(await connector.isAuthorized()).toBe(false);
    expect(sdk.disconnect).toHaveBeenCalledOnce();
  });
});

describe("WalletConnect cancellation and lifetime", () => {
  it("expires only this proposal and permits retry as soon as its SDK approval drains", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    sdk.proposals = [{ id: 11, pairingTopic: "test-topic" }, { id: 12, pairingTopic: "other-topic" }];
    sdk.client.core.expirer.set.mockImplementation((key) => {
      sdk.proposals = sdk.proposals.filter((proposal) => proposal.id !== key);
      sdk.approval!.reject(new Error("Proposal expired"));
    });
    const rejected = expect(connector.connect()).rejects.toThrow("rejected");
    await untilPairing();
    cancelWalletConnectPairing();
    await rejected;
    await vi.waitFor(() => expect(sdk.listeners.get("display_uri")?.size).toBe(0));
    expect(sdk.client.core.expirer.set).toHaveBeenCalledExactlyOnceWith(11, 0);
    expect(sdk.proposals).toEqual([{ id: 12, pairingTopic: "other-topic" }]);
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(sdk.client.disconnect).not.toHaveBeenCalled();
    sdk.approval = undefined;
    sdk.uri = "wc:next-topic@2?relay-protocol=irn&symKey=next-key";
    expect((await connector.connect()).accounts).toEqual([getAddress(A)]);
    expect(sdk.connect).toHaveBeenCalledTimes(2);
  });

  it.each(["missing", "other", "ambiguous", "throws", "unavailable"] as const)(
    "keeps cancellation fenced when proposal expiry is %s",
    async (mode) => {
      const { connector, sdk } = runtime();
      sdk.approval = deferred<WalletSession>();
      sdk.proposals = mode === "other" ? [{ id: 12, pairingTopic: "other-topic" }]
        : mode === "ambiguous" ? [{ id: 11, pairingTopic: "test-topic" }, { id: 12, pairingTopic: "test-topic" }]
        : mode === "throws" ? [{ id: 11, pairingTopic: "test-topic" }] : [];
      if (mode === "throws") sdk.client.core.expirer.set.mockImplementation(() => { throw new Error("Unavailable"); });
      if (mode === "unavailable") (sdk.client as UniversalWalletProvider["client"]).proposal = undefined;
      const rejected = expect(connector.connect()).rejects.toThrow("rejected");
      await untilPairing();
      cancelWalletConnectPairing();
      await rejected;
      await expect(connector.connect()).rejects.toMatchObject({ code: "WALLET_REQUEST_PENDING" });
      if (mode !== "throws") expect(sdk.client.core.expirer.set).not.toHaveBeenCalled();
      expect(sdk.client.disconnect).not.toHaveBeenCalled();
      sdk.approval.resolve(session());
      await vi.waitFor(() => expect(sdk.disconnect).toHaveBeenCalledOnce());
      expect(await connector.isAuthorized()).toBe(false);
    },
  );

  it("privately captures and expires the URI when cancellation precedes its display", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    const display = deferred<void>();
    sdk.connect.mockImplementationOnce(async () => {
      await display.promise;
      sdk.proposals = [{ id: 11, pairingTopic: "test-topic" }];
      sdk.emit("display_uri", sdk.uri);
      return await sdk.approval!.promise;
    });
    sdk.client.core.expirer.set.mockImplementation(() => sdk.approval!.reject(new Error("Proposal expired")));
    const rejected = expect(connector.connect()).rejects.toThrow("rejected");
    await vi.waitFor(() => expect(sdk.connect).toHaveBeenCalledOnce());
    cancelWalletConnectPairing();
    await rejected;
    expect(getWalletConnectPairing().uri).toBeUndefined();
    display.resolve();
    await vi.waitFor(() => expect(sdk.client.core.expirer.set).toHaveBeenCalledExactlyOnceWith(11, 0));
    await vi.waitFor(() => expect(sdk.listeners.get("display_uri")?.size).toBe(0));
    expect(getWalletConnectPairing().uri).toBeUndefined();
    sdk.approval = undefined;
    sdk.uri = "wc:next-topic@2?relay-protocol=irn&symKey=next-key";
    expect((await connector.connect()).accounts).toEqual([getAddress(A)]);
  });

  it("disconnects an approval that wins the targeted-expiry race before retry", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    sdk.proposals = [{ id: 11, pairingTopic: "test-topic" }];
    sdk.client.core.expirer.set.mockImplementation(() => sdk.approval!.resolve(session()));
    const rejected = expect(connector.connect()).rejects.toThrow("rejected");
    await untilPairing();
    cancelWalletConnectPairing();
    await rejected;
    await vi.waitFor(() => expect(sdk.disconnect).toHaveBeenCalledOnce());
    expect(await connector.isAuthorized()).toBe(false);
  });

  it.each([false, true])("removes only an abandoned SDK session with relay failure %s", async (relayFails) => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    sdk.proposals = [{ id: 11, pairingTopic: "test-topic" }];
    sdk.client.core.expirer.set.mockImplementation(() => sdk.approval!.reject(new Error("Proposal expired")));
    const rejected = expect(connector.connect()).rejects.toThrow("rejected");
    await untilPairing();
    cancelWalletConnectPairing();
    await rejected;
    await vi.waitFor(() => expect(sdk.listeners.get("display_uri")?.size).toBe(0));
    sdk.approval = undefined;
    sdk.uri = "wc:next-topic@2?relay-protocol=irn&symKey=next-key";
    sdk.nextSession = session({ topic: "new-session" });
    await connector.connect();
    const orphan = { ...session({ topic: "orphan-session" }), pairingTopic: "test-topic" };
    sdk.orphanSessions.set(orphan.topic, orphan);
    if (relayFails) {
      sdk.client.disconnect.mockRejectedValueOnce(new Error("Relay unavailable"));
      sdk.client.core.expirer.set.mockImplementation((key) => {
        if (typeof key === "string") sdk.orphanSessions.delete(key);
      });
    }
    sdk.emit("client_session_connect", { session: orphan });
    await vi.waitFor(() => expect(sdk.client.disconnect).toHaveBeenCalledExactlyOnceWith({
      topic: "orphan-session", reason: { code: 6000, message: "User disconnected." },
    }));
    if (relayFails) {
      await vi.waitFor(() => expect(sdk.client.core.expirer.set).toHaveBeenLastCalledWith("orphan-session", 0));
      expect(sdk.client.core.expirer.set.mock.calls).toEqual([[11, 0], ["orphan-session", 0]]);
      expect(sdk.orphanSessions.has("orphan-session")).toBe(false);
    }
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(sdk.session?.topic).toBe("new-session");
    expect(await connector.isAuthorized()).toBe(true);
    sdk.emit("client_session_connect", { session: { ...sdk.session, pairingTopic: "next-topic" } });
    expect(sdk.client.disconnect).toHaveBeenCalledOnce();
  });


  it("waits for the cancelled operation to drain before removing a raw orphan session", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    sdk.proposals = [{ id: 11, pairingTopic: "test-topic" }];
    const rejected = expect(connector.connect()).rejects.toThrow("rejected");
    await untilPairing();
    cancelWalletConnectPairing();
    await rejected;
    const orphan = { ...session({ topic: "orphan-session" }), pairingTopic: "test-topic" };
    sdk.orphanSessions.set(orphan.topic, orphan);
    sdk.emit("client_session_connect", { session: orphan });
    for (let step = 0; step < 10; step++) await Promise.resolve();
    expect(sdk.client.disconnect).not.toHaveBeenCalled();
    sdk.approval.reject(new Error("Proposal expired"));
    await vi.waitFor(() => expect(sdk.client.disconnect).toHaveBeenCalledExactlyOnceWith({
      topic: "orphan-session", reason: { code: 6000, message: "User disconnected." },
    }));
    expect(sdk.disconnect).not.toHaveBeenCalled();
  });

  it("cancels immediately, fences retry, and disconnects a late approval", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    const connecting = connector.connect();
    const rejected = expect(connecting).rejects.toThrow("rejected");
    await untilPairing();
    expect(sdk.listeners.get("display_uri")?.size).toBe(1);
    cancelWalletConnectPairing();
    await rejected;
    expect(getWalletConnectPairing().status).toBe("cancelled");
    expect(await connector.isAuthorized()).toBe(false);
    await expect(connector.connect()).rejects.toThrow("previous wallet request");
    expect(sdk.connect).toHaveBeenCalledOnce();
    sdk.approval.resolve(session());
    await vi.waitFor(() => expect(sdk.disconnect).toHaveBeenCalledOnce());
    expect(await connector.isAuthorized()).toBe(false);
    await vi.waitFor(() => expect(sdk.listeners.get("display_uri")?.size).toBe(0));
    sdk.approval = undefined;
    expect((await connector.connect()).accounts).toEqual([getAddress(A)]);
    expect(sdk.listeners.get("chainChanged")?.size).toBe(1);
  });

  it("cancels before provider initialization and never starts a proposal", async () => {
    const sdk = new FakeProvider();
    const ready = deferred<UniversalWalletProvider>();
    const config = createConfig({
      chains: [mainnet],
      connectors: [walletConnect({ projectId: "test", rpcMap: { 1: "https://rpc.example" }, providerFactory: () => ready.promise })],
      transports: { 1: http("https://rpc.example") },
      storage: null,
    });
    const connector = config.connectors[0];
    const connecting = connector.connect();
    const rejected = expect(connecting).rejects.toThrow("rejected");
    cancelWalletConnectPairing();
    await rejected;
    ready.resolve(sdk);
    await vi.waitFor(() => expect(sdk.listeners.get("chainChanged")?.size).toBe(1));
    expect(sdk.connect).not.toHaveBeenCalled();
    expect(await connector.isAuthorized()).toBe(false);
    await connector.disconnect();
  });

  it("allows retry after a rejected proposal without accumulating URI listeners", async () => {
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    const connecting = connector.connect();
    const rejected = expect(connecting).rejects.toThrow("rejected");
    await untilPairing();
    sdk.approval.reject(Object.assign(new Error("User rejected request"), { code: 4001 }));
    await rejected;
    sdk.approval = undefined;
    expect((await connector.connect()).accounts).toEqual([getAddress(A)]);
    expect(sdk.listeners.get("display_uri")?.size).toBe(0);
    expect(sdk.listeners.get("session_event")?.size).toBe(1);
  });

  it("expires the visible pairing and rejects a later approval", async () => {
    vi.useFakeTimers();
    const { connector, sdk } = runtime();
    sdk.approval = deferred<WalletSession>();
    const connecting = connector.connect();
    const rejected = expect(connecting).rejects.toThrow("rejected");
    await vi.advanceTimersByTimeAsync(0);
    expect(getWalletConnectPairing().status).toBe("pending");
    await vi.advanceTimersByTimeAsync(300_000);
    await rejected;
    expect(getWalletConnectPairing().status).toBe("expired");
    sdk.approval.resolve(session());
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    expect(await connector.isAuthorized()).toBe(false);
  });

  it("refreshes the authoritative expiry when the wallet extends a session", async () => {
    vi.useFakeTimers();
    const { connector, sdk } = runtime();
    sdk.nextSession = session({ expiry: Math.floor(Date.now() / 1000) + 2 });
    await connector.connect();
    sdk.storedSession = { ...sdk.storedSession!, expiry: Math.floor(Date.now() / 1000) + 10 };
    sdk.emit("client_session_extend", { topic: sdk.session!.topic });
    await vi.advanceTimersByTimeAsync(2_100);
    expect(await connector.isAuthorized()).toBe(true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await connector.isAuthorized()).toBe(false);
  });

  it("responds to authoritative session expiry without waiting for a stale timer", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    sdk.emit("client_session_expire", { topic: sdk.session!.topic });
    expect(await connector.isAuthorized()).toBe(false);
    expect(getWalletConnectPairing().status).toBe("expired");
  });

  it("expires an active session and emits only one disconnect for repeated SDK events", async () => {
    vi.useFakeTimers();
    const { connector, sdk } = runtime();
    sdk.nextSession = session({ expiry: Math.floor(Date.now() / 1000) + 2 });
    await connector.connect();
    const onDisconnect = vi.fn();
    connector.emitter.on("disconnect", onDisconnect);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(getWalletConnectPairing().status).toBe("expired");
    expect(await connector.isAuthorized()).toBe(false);
    sdk.emit("session_delete", {});
    sdk.emit("disconnect", {});
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});

describe("WalletConnect request and event boundaries", () => {
  it("normalizes local accounts/chain and sends approved writes only on the selected chain", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    await expect(provider.request({ method: "eth_chainId" })).resolves.toBe("0x1");
    await expect(provider.request({ method: "eth_accounts" })).resolves.toEqual([getAddress(A)]);
    await provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] });
    expect(sdk.request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{ from: A, to: C }] }, "eip155:1");
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: B, to: C }] })).rejects.toMatchObject({ code: 4100 });
    expect(sdk.request).toHaveBeenCalledOnce();
  });

  it("routes public reads through the configured transport and blocks unapproved wallet methods", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => { void input; return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x12" })); });
    vi.stubGlobal("fetch", fetch);
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    await expect(provider.request({ method: "eth_blockNumber" })).resolves.toBe("0x12");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("rpc.example/ethereum");
    await expect(provider.request({ method: "eth_sign", params: [A, "0x1234"] })).rejects.toMatchObject({ code: 4200 });
    sdk.session!.namespaces.eip155.methods = ["eth_sendTransaction"];
    await expect(provider.request({ method: "personal_sign", params: ["0x1234", A] })).rejects.toMatchObject({ code: 4200 });
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("preserves the connection after wallet rejection and permits another request", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    sdk.request.mockRejectedValueOnce(Object.assign(new Error("User rejected"), { code: 4001 }));
    const args = { method: "eth_sendTransaction" as const, params: [{ from: A, to: C }] as [{ from: typeof A; to: typeof C }] };
    await expect(provider.request(args)).rejects.toMatchObject({ code: 4001 });
    expect(await connector.isAuthorized()).toBe(true);
    await expect(provider.request(args)).resolves.toBe("0xtx");
  });

  it("switches only an approved/configured chain and exposes only that chain's accounts", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    await connector.switchChain!({ chainId: 10 });
    expect(await connector.getChainId()).toBe(10);
    expect(await connector.getAccounts()).toEqual([getAddress(B)]);
    expect(sdk.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain", params: [{ chainId: "0xa" }],
    }, "eip155:1");
    await expect(connector.switchChain!({ chainId: 137 })).rejects.toMatchObject({ code: 4902 });
  });

  it("does not apply another chain's account event and handles active account removal", async () => {
    const { connector, sdk } = runtime();
    sdk.nextSession.namespaces.eip155.accounts.push(`eip155:1:${C}`);
    await connector.connect();
    sdk.emit("session_event", { topic: sdk.session!.topic, params: {
      chainId: "eip155:10", event: { name: "accountsChanged", data: [B] },
    } });
    expect(await connector.getAccounts()).toEqual([getAddress(A), getAddress(C)]);
    sdk.emit("session_event", { topic: sdk.session!.topic, params: {
      chainId: "eip155:1", event: { name: "accountsChanged", data: [C] },
    } });
    expect(await connector.getAccounts()).toEqual([getAddress(C)]);
    sdk.emit("session_event", { topic: sdk.session!.topic, params: {
      chainId: "eip155:1", event: { name: "accountsChanged", data: [] },
    } });
    expect(await connector.isAuthorized()).toBe(false);
    expect(await connector.getAccounts()).toEqual([]);
  });

  it("invalidates revoked session permissions before the next write", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    const provider = await connector.getProvider();
    sdk.session!.namespaces.eip155.methods = ["personal_sign"];
    sdk.emit("session_update", { topic: sdk.session!.topic });
    expect(await connector.isAuthorized()).toBe(false);
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: A, to: C }] })).rejects.toMatchObject({ code: 4100 });
    expect(sdk.request).not.toHaveBeenCalled();
  });

  it("rejects an unsupported chain event instead of keeping stale authorization", async () => {
    const { connector, sdk } = runtime();
    await connector.connect();
    sdk.emit("chainChanged", "eip155:137");
    expect(await connector.isAuthorized()).toBe(false);
    expect(await connector.getAccounts()).toEqual([]);
  });
});
