"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useAccount,
  useChains,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { Modal } from "@/components/ui/Modal";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { IconWallet } from "@/components/icons/IconWallet";
import { IconCopy } from "@/components/icons/IconCopy";
import { IconCheck } from "@/components/icons/IconCheck";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { EthereumIcon, WalletBrandIcon } from "@/components/wallet/WalletBrandIcon";
import { WalletPairingQr } from "./WalletPairingQr";
import { formatAddress } from "@/lib/format";
import {
  cancelWalletConnectPairing,
  getWalletConnectPairing,
  subscribeWalletConnectPairing,
  walletConnectPairingServerSnapshot,
} from "./walletconnect-pairing";
import { isAppleMobileWalletBrowser, walletErrorMessage, walletLaunchUrl } from "./wallet-ui-helpers";

type Panel = "connect" | "account" | "network";
type WalletUiContextValue = {
  openConnectModal: () => void;
  openAccountModal: () => void;
  openChainModal: () => void;
};

const WalletUiContext = createContext<WalletUiContextValue | null>(null);
const noWalletUi = {
  openConnectModal: undefined,
  openAccountModal: undefined,
  openChainModal: undefined,
};

export function useConnectModal() {
  const context = useContext(WalletUiContext);
  return { openConnectModal: context?.openConnectModal ?? noWalletUi.openConnectModal };
}

export function useAccountModal() {
  const context = useContext(WalletUiContext);
  return { openAccountModal: context?.openAccountModal ?? noWalletUi.openAccountModal };
}

export function useChainModal() {
  const context = useContext(WalletUiContext);
  return { openChainModal: context?.openChainModal ?? noWalletUi.openChainModal };
}

const walletActionClass = "h-auto min-h-10 min-w-0 whitespace-normal break-words px-3 py-3 text-center";
const fullWalletActionClass = `${walletActionClass} w-full`;
const iconActionClass = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary";

const rowClass =
  "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary disabled:cursor-not-allowed disabled:opacity-50";

const walletDownloads = [
  { id: "io.metamask", name: "MetaMask", href: "https://metamask.io/download/" },
  { id: "io.rabby", name: "Rabby", href: "https://rabby.io/" },
  { id: "com.ambire.wallet", name: "Ambire", href: "https://www.ambire.com/" },
];

function shuffleWalletDownloads() {
  const choices = [...walletDownloads];
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return choices;
}

export function WalletUiProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const connectors = useConnectors();
  const chains = useChains();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const pairing = useSyncExternalStore(
    subscribeWalletConnectPairing,
    getWalletConnectPairing,
    () => walletConnectPairingServerSnapshot,
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  const [downloads, setDownloads] = useState(walletDownloads);
  const [available, setAvailable] = useState<readonly Connector[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [selected, setSelected] = useState<Connector | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const selectedRef = useRef<Connector | null>(null);
  const pendingRef = useRef(false);
  const injectedRequests = useRef(new Set<string>());

  const walletConnect = connectors.find((connector) => connector.id === "walletConnect");

  useEffect(() => {
    if (panel !== "connect") return;
    let cancelled = false;
    const discover = async () => {
      setDiscovering(true);
      const results = await Promise.all(connectors.map(async (connector) => {
        if (connector.id === "walletConnect") return null;
        if (connector.type === "safe" && window.parent === window) return null;
        try {
          return await connector.getProvider() ? connector : null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const found = results.filter((connector): connector is Connector => connector !== null);
      const announced = found.some((connector) => connector.type === "injected" && connector.id !== "injected");
      setAvailable(found.filter((connector) => !(announced && connector.id === "injected")));
      setDiscovering(false);
    };
    void discover();
    return () => { cancelled = true; };
  }, [connectors, panel]);

  const clearAttempt = useCallback(() => {
    attemptRef.current += 1;
    if (selectedRef.current?.id === "walletConnect" && pendingRef.current) {
      cancelWalletConnectPairing();
    }
    selectedRef.current = null;
    pendingRef.current = false;
    setSelected(null);
    setPending(false);
  }, []);

  const close = useCallback(() => {
    clearAttempt();
    setPanel(null);
    setError(null);
    setCopied(null);
  }, [clearAttempt]);

  useEffect(() => () => {
    attemptRef.current += 1;
    if (selectedRef.current?.id === "walletConnect" && pendingRef.current) {
      cancelWalletConnectPairing();
    }
  }, []);

  const open = useCallback((next: Panel) => {
    if (next === "connect" && panel !== "connect") setDownloads(shuffleWalletDownloads());
    clearAttempt();
    setError(null);
    setCopied(null);
    setPanel(next);
  }, [clearAttempt, panel]);

  const value = useMemo(() => ({
    openConnectModal: () => open("connect"),
    openAccountModal: () => open(account.isConnected ? "account" : "connect"),
    openChainModal: () => open(account.isConnected ? "network" : "connect"),
  }), [account.isConnected, open]);

  const choose = async (connector: Connector) => {
    if (pendingRef.current) return;
    if (injectedRequests.current.has(connector.uid)) {
      setSelected(connector);
      setError("Request already open. Continue in your wallet.");
      return;
    }
    if (connector.id !== "walletConnect") injectedRequests.current.add(connector.uid);
    const attempt = ++attemptRef.current;
    selectedRef.current = connector;
    pendingRef.current = true;
    setSelected(connector);
    setPending(true);
    setError(null);
    setCopied(null);
    try {
      await connect.mutateAsync({ connector });
      if (attempt !== attemptRef.current) {
        // Injected-wallet prompts cannot be dismissed by a website. Do not retain
        // a connection approved after the user cancelled this app's request.
        if (connector.id !== "walletConnect") {
          await disconnect.mutateAsync({ connector });
        }
        return;
      }
      pendingRef.current = false;
      close();
    } catch (cause) {
      if (attempt !== attemptRef.current) return;
      setError(walletErrorMessage(cause, "connect"));
      pendingRef.current = false;
      setPending(false);
    } finally {
      injectedRequests.current.delete(connector.uid);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("Copy unavailable. Expand Connection link to copy it.");
    }
  };

  const doDisconnect = async () => {
    const attempt = ++attemptRef.current;
    setError(null);
    try {
      await disconnect.mutateAsync();
      if (attempt === attemptRef.current) close();
    } catch (cause) {
      if (attempt === attemptRef.current) setError(walletErrorMessage(cause, "disconnect"));
    }
  };

  const changeNetwork = async (chainId: number) => {
    const attempt = ++attemptRef.current;
    setError(null);
    try {
      await switchChain.mutateAsync({ chainId });
      if (attempt === attemptRef.current) close();
    } catch (cause) {
      if (attempt === attemptRef.current) setError(walletErrorMessage(cause, "switch"));
    }
  };

  const selectedWalletConnect = selected?.id === "walletConnect";
  const pairingStopped = ["cancelled", "expired", "error"].includes(pairing.status);
  const connectionPending = pending && !(selectedWalletConnect && pairingStopped);
  const title = panel === "account" ? "Your wallet" : panel === "network" ? "Switch network" : selectedWalletConnect ? "WalletConnect" : "Connect wallet";

  return (
    <WalletUiContext.Provider value={value}>
      {children}
      <Modal
        isOpen={panel !== null}
        onClose={close}
        title={title}
        fitVisualViewport
        overlayClassName="h-dvh w-screen p-[16px]"
        className="max-h-[calc(var(--modal-viewport-height,100dvh)-32px)] w-[calc(var(--modal-viewport-width,100vw)-32px)] min-w-0 max-w-md overflow-y-auto overscroll-contain p-[20px] sm:p-6 [&_h2]:pr-12 [&_h2]:[overflow-wrap:anywhere]"
      >
        <div className="space-y-4 text-sm text-text-secondary">
          {panel === "connect" && !selected && (
            <>
              <div className="space-y-2" aria-label="Available wallets">
                {available.map((connector) => (
                  <button key={connector.uid} type="button" className={rowClass} onClick={() => void choose(connector)}>
                    <WalletBrandIcon id={connector.id} name={connector.name} icon={connector.icon} className="size-9 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{connector.name === "Injected" ? "Browser wallet" : connector.name}</span>
                      <span className="block text-xs text-text-tertiary">{connector.type === "safe" ? "Safe app" : "Detected"}</span>
                    </span>
                  </button>
                ))}
                {discovering && <p role="status" className="py-2">Finding wallets…</p>}
                {!discovering && available.length === 0 && <p className="rounded-xl bg-surface-secondary p-3">No browser wallet detected.</p>}
                <button
                  type="button"
                  className={rowClass}
                  disabled={!walletConnect}
                  onClick={() => walletConnect && void choose(walletConnect)}
                  aria-describedby={!walletConnect ? "walletconnect-unavailable" : undefined}
                >
                  <WalletBrandIcon id="walletConnect" className="size-9 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1 break-words">
                    <span className="block font-medium">WalletConnect</span>
                    <span className="block text-xs text-text-tertiary">QR code · Mobile wallets</span>
                  </span>
                </button>
                {!walletConnect && <p id="walletconnect-unavailable" className="text-xs">Mobile pairing is unavailable. Use a browser wallet.</p>}
              </div>
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer py-1 text-text-primary">Need a wallet?</summary>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {downloads.map((wallet) => (
                    <a key={wallet.id} href={wallet.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded py-2 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary">
                      <WalletBrandIcon id={wallet.id} className="size-5 shrink-0" />
                      {wallet.name}
                    </a>
                  ))}
                </div>
              </details>
            </>
          )}

          {panel === "connect" && selected && (
            <>
              {selectedWalletConnect ? (
                <PairingPanel
                  uri={pairing.status === "pending" ? pairing.uri : undefined}
                  status={pairing.status}
                  onCopy={(uri) => void copy(uri, "Connection link copied")}
                />
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-surface-secondary p-4">
                  <WalletBrandIcon id={selected.id} name={selected.name} icon={selected.icon} className="size-10 shrink-0 rounded-lg" />
                  <p className="min-w-0 break-words font-medium text-text-primary">{connectionPending ? `Continue in ${selected.name}` : `Connect ${selected.name}`}</p>
                </div>
              )}
              {connectionPending && <p role="status" className="sr-only">Waiting for your wallet…</p>}
              {selectedWalletConnect && pairing.status === "expired" && <p role="alert">Request expired.</p>}
              {selectedWalletConnect && pairing.status === "cancelled" && <p role="status">Connection cancelled.</p>}
              {selectedWalletConnect && pairing.status === "error" && !error && <p role="alert">Could not connect. Try again.</p>}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!connectionPending && (
                  <Button variant="secondary" size="sm" className={walletActionClass} onClick={() => { pendingRef.current = false; void choose(selected); }}>
                    Try again
                  </Button>
                )}
                <Button variant="ghost" size="sm" className={walletActionClass} onClick={() => { clearAttempt(); setError(null); setCopied(null); }}>
                  {connectionPending ? "Cancel" : "Choose another wallet"}
                </Button>
              </div>
            </>
          )}

          {panel === "account" && account.address && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                <WalletBrandIcon id={account.connector?.id} name={account.connector?.name} icon={account.connector?.icon} className="size-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="break-words text-sm font-medium text-text-primary">{account.connector?.name ?? "Connected wallet"}</p>
                  <div data-testid="wallet-account-address">
                    <AddressLink
                      address={account.address}
                      variant="compact"
                      showCopyOnCoarsePointer
                      className="[&>a]:text-base [&>a]:font-semibold [&>a]:text-text-primary"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-secondary px-3 py-2">
                <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
                  {account.chainId === 1
                    ? <EthereumIcon className="size-6 shrink-0" />
                    : <IconWallet className="size-6 shrink-0 text-text-tertiary" aria-hidden />}
                  <span className="min-w-0 break-words text-sm text-text-primary">
                    {account.chainId === 1 ? "Ethereum Mainnet" : chains.find(chain => chain.id === account.chainId)?.name ?? `Unsupported network (${account.chainId ?? "unknown"})`}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className={`${walletActionClass} py-2 text-xs`} aria-label="Switch network" onClick={() => open("network")}>Switch</Button>
              </div>
              <div className="flex justify-end border-t border-border pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${walletActionClass} text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950/50 dark:hover:text-red-200`}
                  isLoading={disconnect.isPending}
                  onClick={() => void doDisconnect()}
                >
                  Disconnect
                </Button>
              </div>
            </>
          )}

          {panel === "account" && !account.address && (
            <>
              <p>Your wallet disconnected.</p>
              <Button className={fullWalletActionClass} onClick={() => open("connect")}>Connect wallet</Button>
            </>
          )}

          {panel === "network" && (
            <>
              {chains.map((chain) => (
                <Button
                  key={chain.id}
                  variant="secondary"
                  className={`${fullWalletActionClass} justify-start gap-3 text-left`}
                  isLoading={switchChain.isPending}
                  disabled={account.chainId === chain.id}
                  onClick={() => void changeNetwork(chain.id)}
                >
                  {chain.id === 1 && <EthereumIcon className="size-7 shrink-0" />}
                  <span className="min-w-0 flex-1 break-words">{chain.id === 1 ? "Ethereum Mainnet" : chain.name}</span>
                  {account.chainId === chain.id && <><IconCheck className="size-5 shrink-0" aria-hidden /><span className="sr-only">Connected</span></>}
                </Button>
              ))}
              {account.connector?.type === "safe" && <p className="text-xs">To change networks, open the matching Safe account.</p>}
            </>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          {copied && <p role="status">{copied}</p>}
        </div>
      </Modal>
    </WalletUiContext.Provider>
  );
}

const walletLaunchOptions = [
  { id: "metamask", name: "MetaMask", icon: "io.metamask" },
  { id: "rabby", name: "Rabby", icon: "io.rabby" },
  { id: "oath", name: "Oath", icon: "oath" },
] as const;

function subscribeBrowserPlatform() {
  return () => {};
}

function getAppleMobileSnapshot() {
  return typeof navigator !== "undefined" && isAppleMobileWalletBrowser(navigator);
}

function getServerAppleMobileSnapshot() {
  return false;
}

function PairingPanel({
  uri,
  status,
  onCopy,
}: {
  uri?: string;
  status: string;
  onCopy: (uri: string) => void;
}) {
  const appleMobile = useSyncExternalStore(
    subscribeBrowserPlatform,
    getAppleMobileSnapshot,
    getServerAppleMobileSnapshot,
  );
  if (!uri) {
    return status === "connecting" || status === "idle" ? <p>Preparing connection…</p> : null;
  }

  return (
    <div className="space-y-3">
      <WalletPairingQr uri={uri} />
      <p className="text-center text-xs">Scan with your wallet</p>
      <div className="flex flex-wrap gap-2">
        {walletLaunchOptions.filter((wallet) => wallet.id !== "oath" || appleMobile).map((wallet) => {
          const href = walletLaunchUrl(wallet.id, uri);
          return href ? (
            <a
              key={wallet.id}
              href={href}
              aria-label={`Open ${wallet.name}`}
              className={getButtonClassName({ variant: "secondary", size: "sm", className: `${walletActionClass} flex-1 basis-32 gap-2` })}
            >
              <WalletBrandIcon id={wallet.icon} className="size-5 shrink-0" />
              <span className="min-w-0 break-words">{wallet.name}</span>
            </a>
          ) : null;
        })}
      </div>
      <div className="flex items-start gap-2">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer rounded py-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary">Connection link</summary>
          <p className="mt-1 break-all rounded-lg bg-surface-secondary p-3 font-mono text-xs select-all">{uri}</p>
        </details>
        <button type="button" className={iconActionClass} aria-label="Copy connection link" title="Copy link" onClick={() => onCopy(uri)}>
          <IconCopy className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The landing page needs a wallet control that also remains visible on phones. */
export function ConnectButton() {
  const account = useAccount();
  const chains = useChains();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();
  const wrongNetwork = account.isConnected && !chains.some(chain => chain.id === account.chainId);
  return (
    <Button variant="secondary" size="sm" onClick={account.isConnected ? wrongNetwork ? openChainModal : openAccountModal : openConnectModal}>
      {wrongNetwork ? "Wrong Network" : account.isConnected && account.address ? formatAddress(account.address) : "Connect wallet"}
    </Button>
  );
}
