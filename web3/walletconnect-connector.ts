import { createConnector } from "wagmi";
import {
  createClient, getAddress, isAddress, numberToHex,
  UserRejectedRequestError, type Address, type EIP1193Provider,
} from "viem";
import type UniversalProvider from "@walletconnect/universal-provider";
import {
  cancelWalletConnectPairing, setWalletConnectPairingCancel, updateWalletConnectPairing,
} from "./walletconnect-pairing";
import {
  getWalletSessionGrant, parseWalletChainId, type WalletSession,
} from "./walletconnect-session";

type RpcRequest = { method: string; params?: unknown[] | Record<string, unknown> | object };
type InitOptions = Parameters<typeof UniversalProvider.init>[0];
type ConnectOptions = Parameters<UniversalProvider["connect"]>[0];

/** The protocol SDK is injected in tests; no relay or real wallet is required. */
export type UniversalWalletProvider = {
  session?: WalletSession;
  client: {
    session: {
      get(topic: string): WalletSession;
      update(topic: string, changes: Partial<WalletSession>): void | Promise<void>;
    };
    on(event: "session_extend" | "session_expire" | "session_connect", listener: (event: {
      topic?: string;
      session?: WalletSession & { pairingTopic?: string };
    }) => void): unknown;
    proposal?: { getAll(): Array<{ id: number; pairingTopic?: string }> };
    core?: { expirer: { set(key: string | number, expiry: number): void } };
    disconnect?(params: { topic: string; reason: { code: number; message: string } }): Promise<void>;
  };
  rpcProviders?: { eip155?: { getDefaultChain(): string } };
  connect(options: ConnectOptions): Promise<WalletSession | undefined>;
  disconnect(): Promise<void>;
  request(args: RpcRequest, chain?: string): Promise<unknown>;
  setDefaultChain(chain: string, rpcUrl?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
};

export type WalletConnectParameters = {
  projectId: string;
  rpcMap: Record<number, string>;
  metadata?: InitOptions["metadata"];
  providerFactory?: (options: InitOptions) => Promise<UniversalWalletProvider>;
};

const walletMethods = [
  "eth_sendTransaction", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
];
const readMethods = new Set([
  "eth_blockNumber", "eth_call", "eth_chainId", "eth_estimateGas", "eth_feeHistory",
  "eth_gasPrice", "eth_getBalance", "eth_getBlockByHash", "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber",
  "eth_getCode", "eth_getLogs", "eth_getProof", "eth_getStorageAt",
  "eth_getTransactionByHash", "eth_getTransactionCount", "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas", "net_version", "web3_clientVersion",
]);
const disconnectedKey = "walletConnect.disconnected" as const;
const connectedKey = "walletConnect.connected" as const;
const pairingLifetime = 5 * 60_000;

function rpcError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}

function userError(error: unknown) {
  if (error instanceof UserRejectedRequestError) return error;
  if (error && typeof error === "object" &&
      ("code" in error && error.code === 4001 ||
       "message" in error && /user rejected|rejected by|request rejected/i.test(String(error.message))))
    return new UserRejectedRequestError(error as Error);
  return error instanceof Error ? error : new Error("Wallet connection failed. Try again.");
}

export function walletConnect(parameters: WalletConnectParameters) {
  return createConnector<EIP1193Provider>((config) => {
    let provider: UniversalWalletProvider | undefined;
    let providerPromise: Promise<UniversalWalletProvider> | undefined;
    let activeChain = config.chains[0].id;
    let selectedAccounts: Address[] | undefined;
    let connected = false;
    let locallyDisconnected = false;
    let hasConnected = false;
    let attempt = 0;
    let pairingOperation: Promise<unknown> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelledPairings = new Map<string, { expiresAt: number; drained: Promise<void> }>();
    const pruneCancelledPairings = () => {
      for (const [topic, value] of cancelledPairings)
        if (value.expiresAt <= Date.now()) cancelledPairings.delete(topic);
    };
    const providerListeners = new Map<string, Set<(...args: unknown[]) => void>>();

    const emitProvider = (event: string, ...args: unknown[]) =>
      providerListeners.get(event)?.forEach((listener) => listener(...args));
    const clearExpiry = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = undefined;
    };
    const setDisconnected = async (value: boolean) => {
      locallyDisconnected = value;
      hasConnected = !value;
      // Remove the success marker first. Storage restrictions must not block local disconnect.
      try {
        if (value) {
          await config.storage?.removeItem(connectedKey);
          await config.storage?.setItem(disconnectedKey, true);
        } else {
          await config.storage?.removeItem(disconnectedKey);
          await config.storage?.setItem(connectedKey, true);
        }
      } catch { /* Without a readable success marker, reconnect remains disabled. */ }
    };
    const grant = () => getWalletSessionGrant(provider?.session, activeChain);
    const accounts = () => {
      const current = grant();
      if (locallyDisconnected || !current.valid) return [];
      return selectedAccounts
        ? current.accounts.filter((account) => selectedAccounts!.includes(account))
        : current.accounts;
    };
    const disconnectState = (status: "idle" | "expired" | "error" = "idle", error?: string) => {
      const wasConnected = connected;
      connected = false;
      selectedAccounts = undefined;
      clearExpiry();
      void setDisconnected(true);
      updateWalletConnectPairing({ status, ...(error ? { error } : {}) });
      if (wasConnected) {
        config.emitter.emit("disconnect");
        emitProvider("disconnect", rpcError(4900, error ?? "Wallet disconnected."));
      }
    };
    const scheduleExpiry = () => {
      clearExpiry();
      if (!provider?.session) return;
      const delay = provider.session.expiry * 1000 - Date.now();
      expiryTimer = setTimeout(() => {
        // UP does not forward session_extend. Re-read the authoritative SDK store.
        if (provider?.session) {
          try { provider.session = provider.client.session.get(provider.session.topic); }
          catch { /* A deleted session is expired locally as well. */ }
          if (provider.session.expiry * 1000 > Date.now()) {
            scheduleExpiry();
            return;
          }
        }
        disconnectState("expired", "Your wallet session expired. Connect again.");
      }, Math.max(0, Math.min(delay, 2_147_483_647)));
    };
    const validateActiveSession = () => {
      if (!connected || locallyDisconnected || !grant().valid || !accounts().length)
        throw rpcError(4100, "This wallet session no longer authorizes this account and network. Connect again.");
    };
    const refreshSession = () => {
      if (!connected) return;
      if (!grant().valid) {
        disconnectState("error", "Your wallet permissions changed. Connect again.");
        return;
      }
      const approved = grant().accounts;
      selectedAccounts = selectedAccounts?.filter((account) => approved.includes(account));
      if (!selectedAccounts?.length) selectedAccounts = undefined;
      scheduleExpiry();
      config.emitter.emit("change", { accounts: accounts(), chainId: activeChain });
      emitProvider("accountsChanged", accounts());
    };
    const changeChain = (value: unknown) => {
      if (!connected) return;
      const next = parseWalletChainId(value);
      if (!next || !getWalletSessionGrant(provider?.session, next).valid) {
        disconnectState("error", "The wallet changed to an unapproved network. Connect again.");
        return;
      }
      if (next === activeChain) return;
      activeChain = next;
      selectedAccounts = undefined;
      config.emitter.emit("change", { chainId: next, accounts: accounts() });
      emitProvider("chainChanged", numberToHex(next));
      emitProvider("accountsChanged", accounts());
    };
    const changeAccounts = (value: unknown) => {
      if (!connected) return;
      if (!Array.isArray(value)) {
        disconnectState("error", "The wallet returned invalid accounts. Connect again.");
        return;
      }
      const approved = grant().accounts;
      const next = value.flatMap((item) => {
        if (typeof item !== "string") return [];
        const parts = item.split(":");
        const address = parts.length === 3 && parts[0] === "eip155" &&
          parseWalletChainId(parts[1]) === activeChain ? parts[2] : item;
        if (!isAddress(address, { strict: false })) return [];
        const normalized = getAddress(address);
        return approved.includes(normalized) ? [normalized] : [];
      });
      if (!next.length) {
        disconnectState("error", "Your wallet no longer shares an account. Connect again.");
        return;
      }
      selectedAccounts = [...new Set(next)];
      config.emitter.emit("change", { accounts: selectedAccounts });
      emitProvider("accountsChanged", selectedAccounts);
    };
    const onSessionEvent = (value: unknown) => {
      if (!connected || !value || typeof value !== "object") return;
      const event = value as {
        topic?: string;
        params?: { chainId?: string; event?: { name?: string; data?: unknown } };
      };
      if (event.topic !== provider?.session?.topic) return;
      if (event.params?.event?.name === "accountsChanged" &&
          parseWalletChainId(event.params.chainId) === activeChain)
        changeAccounts(event.params.event.data);
    };

    const disableInheritedDeepLinks = async (sdk: UniversalWalletProvider) => {
      if (!sdk.session) return;
      const topic = sdk.session.topic;
      const sessionConfig = { ...sdk.session.sessionConfig, disableDeepLink: true };
      // Sign Client otherwise reads an unscoped legacy localStorage redirect choice.
      await sdk.client.session.update(topic, { sessionConfig });
      if (!sdk.session || sdk.session.topic !== topic)
        throw rpcError(4100, "The wallet session changed during this request. Connect again.");
      sdk.session = sdk.client.session.get(topic);
    };
    const getProtocolProvider = async () => {
      // Concurrent restore and connect must wait for suppression and listener setup.
      if (providerPromise) return providerPromise;
      if (provider) return provider;
      if (!providerPromise) {
        providerPromise = (async () => {
          if (!parameters.projectId.trim())
            throw new Error("Mobile wallet connections are not configured.");
          const options: InitOptions = {
            projectId: parameters.projectId,
            metadata: parameters.metadata ?? {
              name: "Yearn Governance Apps",
              description: "Yearn governance and staking",
              url: typeof window === "undefined" ? "https://gov.yearn.fi" : window.location.origin,
              icons: typeof window === "undefined" ? [] : [new URL("/favicon.ico", window.location.origin).href],
            },
            customStoragePrefix: "yearn-wallet-v1",
            telemetryEnabled: false,
          };
          const initialized = parameters.providerFactory
            ? await parameters.providerFactory(options)
            : await (await import("@walletconnect/universal-provider")).default.init(options);
          provider = initialized;
          await disableInheritedDeepLinks(initialized);
          initialized.client.on("session_connect", ({ session }) => {
            pruneCancelledPairings();
            const cancelled = session?.pairingTopic && cancelledPairings.get(session.pairingTopic);
            if (!cancelled || !session) return;
            // Expiry can race an SDK settlement that already read its proposal.
            // Wait for the original operation, then remove only that orphan session.
            void cancelled.drained.then(async () => {
              try {
                initialized.client.session.get(session.topic);
                try {
                  await initialized.client.disconnect?.({
                    topic: session.topic,
                    reason: { code: 6000, message: "User disconnected." },
                  });
                } catch {
                  // Local expiry also removes an orphan if relay acknowledgement fails.
                  initialized.client.core?.expirer.set(session.topic, 0);
                }
              } catch { /* Already removed, or SDK storage is unavailable. */ }
            });
          });
          initialized.client.on("session_extend", ({ topic }) => {
            if (!topic || topic !== initialized.session?.topic) return;
            void (async () => {
              initialized.session = initialized.client.session.get(topic);
              await disableInheritedDeepLinks(initialized);
              refreshSession();
            })().catch(() => disconnectState("error", "Wallet session storage is unavailable. Connect again."));
          });
          initialized.client.on("session_expire", ({ topic }) => {
            if (topic && topic === initialized.session?.topic)
              disconnectState("expired", "Your wallet session expired. Connect again.");
          });
          const restoredChain = parseWalletChainId(initialized.rpcProviders?.eip155?.getDefaultChain());
          if (restoredChain) activeChain = restoredChain;
          initialized.on("chainChanged", changeChain);
          // Raw session events retain the originating chain and include empty accounts.
          initialized.on("session_event", onSessionEvent);
          initialized.on("session_update", refreshSession);
          initialized.on("session_delete", () => disconnectState());
          initialized.on("disconnect", () => disconnectState());
          return initialized;
        })().catch(async (error) => {
          if (provider?.session) await provider.disconnect().catch(() => {});
          provider = undefined;
          providerPromise = undefined;
          throw error;
        });
      }
      return providerPromise;
    };

    const request = async (args: RpcRequest): Promise<unknown> => {
      const sdk = await getProtocolProvider();
      if (walletMethods.includes(args.method)) await disableInheritedDeepLinks(sdk);
      // Session/account grants are checked after persistence and immediately before dispatch.
      validateActiveSession();
      if (args.method === "eth_accounts" || args.method === "eth_requestAccounts")
        return accounts();
      if (args.method === "eth_chainId") return numberToHex(activeChain);
      if (args.method === "net_version") return String(activeChain);
      if (!config.chains.some((chain) => chain.id === activeChain))
        throw rpcError(4902, "This network is not supported by this app.");
      if (walletMethods.includes(args.method)) {
        if (!grant().methods.has(args.method))
          throw rpcError(4200, "The wallet did not approve this request type. Connect again.");
        const values = Array.isArray(args.params) ? args.params : [];
        if (args.method === "wallet_switchEthereumChain") {
          const requested = values[0] as { chainId?: unknown } | undefined;
          const next = parseWalletChainId(requested?.chainId);
          if (!next || !config.chains.some((chain) => chain.id === next) ||
              !getWalletSessionGrant(sdk.session, next).valid)
            throw rpcError(4902, "This network is not approved. Connect again to approve it.");
          await sdk.request(args, `eip155:${activeChain}`);
          sdk.setDefaultChain(`eip155:${next}`, parameters.rpcMap[next]);
          changeChain(next);
          return null;
        }
        const sender = args.method === "eth_sendTransaction"
          ? (values[0] as { from?: unknown } | undefined)?.from
          : args.method === "personal_sign" ? values[1] : values[0];
        if (typeof sender !== "string" || !isAddress(sender, { strict: false }) ||
            !accounts().includes(getAddress(sender)))
          throw rpcError(4100, "The request account is not approved by this wallet session.");
        // An approved wallet request must never fall through to a public RPC.
        return sdk.request(args, `eip155:${activeChain}`);
      }
      if (!readMethods.has(args.method))
        throw rpcError(4200, "This wallet request type is not supported by this app.");
      const chain = config.chains.find((item) => item.id === activeChain);
      const transport = config.transports?.[activeChain];
      if (!chain || !transport) throw rpcError(4902, "No app RPC is configured for this network.");
      // Keep all configured transport fallback/retry behavior for public reads.
      return createClient({ chain, transport }).request(args as never);
    };

    const walletProvider = {
      request,
      on(event: string, listener: (...args: unknown[]) => void) {
        const listeners = providerListeners.get(event) ?? new Set();
        listeners.add(listener);
        providerListeners.set(event, listeners);
      },
      removeListener(event: string, listener: (...args: unknown[]) => void) {
        providerListeners.get(event)?.delete(listener);
      },
    } as EIP1193Provider;

    return {
      id: "walletConnect",
      name: "WalletConnect",
      type: "walletConnect",
      async connect({ chainId, isReconnecting, withCapabilities } = {}) {
        if (pairingOperation) {
          const error = Object.assign(new Error("The previous wallet request is still pending. Reject it in your wallet, then retry."), { code: "WALLET_REQUEST_PENDING" });
          updateWalletConnectPairing({ status: "error", error: error.message });
          throw error;
        }
        pruneCancelledPairings();
        const target = chainId ?? config.chains[0].id;
        if (!config.chains.some((chain) => chain.id === target))
          throw rpcError(4902, "This network is not supported by this app.");
        const id = ++attempt;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let displayUri: ((...args: unknown[]) => void) | undefined;
        let pairingTopic: string | undefined;
        let resolveDrained: () => void = () => {};
        const drained = new Promise<void>((resolve) => { resolveDrained = resolve; });
        const expireCancelledProposal = () => {
          const client = provider?.client;
          if (!pairingTopic || !client?.proposal || !client.core?.expirer || !client.disconnect) return;
          try {
            const proposals = client.proposal.getAll().filter((value) => value.pairingTopic === pairingTopic);
            // Do not expire a session, another attempt, or an ambiguous SDK record.
            if (proposals.length !== 1 || !Number.isSafeInteger(proposals[0].id) || proposals[0].id <= 0) return;
            const topic = pairingTopic;
            const record = { expiresAt: Date.now() + pairingLifetime * 2, drained };
            cancelledPairings.set(topic, record);
            setTimeout(() => {
              if (cancelledPairings.get(topic) === record) cancelledPairings.delete(topic);
            }, pairingLifetime * 2);
            // Pinned Sign Client rejects approval through its proposal_expire handler.
            // Pairing deletion alone and UP's deprecated abort API do not do this.
            client.core.expirer.set(proposals[0].id, 0);
          } catch { /* Keep the operation fenced if SDK cancellation is unavailable. */ }
        };
        let rejectCancelled: (error: Error) => void = () => {};
        const cancelledPromise = new Promise<never>((_, reject) => { rejectCancelled = reject; });
        const cancel = (expired = false) => {
          if (id !== attempt || cancelled) return;
          cancelled = true;
          expireCancelledProposal();
          void setDisconnected(true);
          updateWalletConnectPairing({
            status: expired ? "expired" : "cancelled",
            ...(expired ? { error: "The connection request expired. Try again." } : {}),
          });
          rejectCancelled(new UserRejectedRequestError(new Error(
            expired ? "Wallet connection request expired." : "Wallet connection cancelled.",
          )));
        };
        setWalletConnectPairingCancel(() => cancel());
        if (!isReconnecting) updateWalletConnectPairing({ status: "connecting" });
        // Race initialization as well as SDK approval, so closing the dialog always responds.
        const operation = (async () => {
          const sdk = await getProtocolProvider();
          const wasDisconnected = locallyDisconnected || await config.storage?.getItem(disconnectedKey);
          if (cancelled) return;
          if (sdk.session && (wasDisconnected ||
              !getWalletSessionGrant(sdk.session, target).valid)) {
            if (isReconnecting) throw rpcError(4100, "The stored wallet session is not authorized.");
            await sdk.disconnect();
          }
          if (!sdk.session) {
            if (isReconnecting) throw rpcError(4100, "No authorized wallet session was found.");
            displayUri = (...args: unknown[]) => {
              if (id !== attempt || typeof args[0] !== "string") return;
              const uri = args[0];
              const match = /^wc:([^@]+)@2\?/.exec(uri);
              if (!match) return;
              pairingTopic = match[1];
              if (cancelled) {
                expireCancelledProposal();
                return;
              }
              const expiry = Number(new URLSearchParams(uri.split("?")[1]).get("expiryTimestamp"));
              const expiresAt = Math.min(
                Number.isFinite(expiry) && expiry > 0 ? expiry * 1000 : Infinity,
                Date.now() + pairingLifetime,
              );
              updateWalletConnectPairing({ status: "pending", uri, expiresAt });
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => cancel(true), Math.max(0, expiresAt - Date.now()));
              config.emitter.emit("message", { type: "display_uri", data: uri });
            };
            sdk.on("display_uri", displayUri);
            timer = setTimeout(() => cancel(true), pairingLifetime);
            const chains = [target, ...config.chains.map((chain) => chain.id).filter((value) => value !== target)];
            await sdk.connect({
              optionalNamespaces: {
                eip155: {
                  chains: chains.map((value) => `eip155:${value}`),
                  methods: walletMethods,
                  events: ["accountsChanged", "chainChanged"],
                  rpcMap: Object.fromEntries(chains.map((value) => [String(value), parameters.rpcMap[value]])),
                  defaultChain: String(target),
                },
              },
            });
          }
          if (cancelled || id !== attempt) {
            if (sdk.session) await sdk.disconnect().catch(() => {});
            return;
          }
          if (!getWalletSessionGrant(sdk.session, target).valid) {
            await sdk.disconnect().catch(() => {});
            throw rpcError(4100, "The wallet did not approve the required account, network, and transaction permissions.");
          }
          await disableInheritedDeepLinks(sdk);
          if (!getWalletSessionGrant(sdk.session, target).valid)
            throw rpcError(4100, "Wallet permissions changed during connection. Connect again.");
          activeChain = target;
          selectedAccounts = undefined;
          sdk.setDefaultChain(`eip155:${target}`, parameters.rpcMap[target]);
          await setDisconnected(false);
          if (cancelled) {
            await setDisconnected(true);
            if (sdk.session) await sdk.disconnect().catch(() => {});
            return;
          }
          connected = true;
          scheduleExpiry();
          updateWalletConnectPairing({ status: "connected" });
          emitProvider("connect", { chainId: numberToHex(target) });
          return {
            accounts: (withCapabilities
              ? accounts().map((address) => ({ address, capabilities: {} }))
              : accounts()) as never,
            chainId: target,
          };
        })();
        pairingOperation = operation;
        // Keep a cancelled proposal fenced until targeted expiry or a wallet response settles the SDK.
        void operation.catch(() => {}).finally(() => {
          if (provider && displayUri) provider.removeListener("display_uri", displayUri);
          if (timer) clearTimeout(timer);
          if (pairingOperation === operation) pairingOperation = undefined;
          if (id === attempt) setWalletConnectPairingCancel(undefined);
          resolveDrained();
        });
        try {
          const result = await Promise.race([operation, cancelledPromise]);
          if (!result) throw new UserRejectedRequestError(new Error("Wallet connection cancelled."));
          return result;
        } catch (error) {
          if (!cancelled) {
            await setDisconnected(true);
            const normalized = userError(error);
            updateWalletConnectPairing({ status: "error", error: normalized.message });
          }
          throw userError(error);
        }
      },
      async disconnect() {
        // A disconnect is authoritative even if the relay cannot acknowledge it.
        await setDisconnected(true);
        cancelWalletConnectPairing();
        disconnectState();
        if (provider?.session) await provider.disconnect().catch(() => {});
      },
      async getAccounts() {
        await getProtocolProvider();
        return accounts();
      },
      async getChainId() {
        await getProtocolProvider();
        return activeChain;
      },
      async getProvider() {
        // Wagmi calls this while scanning connectors. Keep fresh visits relay-free.
        return walletProvider;
      },
      async isAuthorized() {
        try {
          if (locallyDisconnected || await config.storage?.getItem(disconnectedKey)) return false;
          if (!hasConnected && !await config.storage?.getItem(connectedKey)) return false;
          await getProtocolProvider();
          return config.chains.some((chain) => chain.id === activeChain) && grant().valid;
        } catch { return false; }
      },
      async switchChain({ chainId }) {
        const chain = config.chains.find((item) => item.id === chainId);
        if (!chain) throw rpcError(4902, "This network is not supported by this app.");
        if (chainId !== activeChain)
          await request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(chainId) }] });
        return chain;
      },
      onAccountsChanged: changeAccounts,
      onChainChanged: changeChain,
      onDisconnect() { disconnectState(); },
    };

  });
}
