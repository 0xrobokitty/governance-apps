import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connector } from "wagmi";
import {
  WalletUiProvider,
  useAccountModal,
  useChainModal,
  useConnectModal,
} from "@/web3/wallet-ui";

const state = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, isConnected: false, chainId: undefined as number | undefined, connector: undefined as { name: string; type: string } | undefined },
  connectors: [] as Connector[],
  connect: vi.fn(),
  disconnect: vi.fn(),
  switchChain: vi.fn(),
  pairing: { status: "idle" } as { status: string; uri?: string },
  serverPairing: { status: "idle" },
  subscribers: new Set<() => void>(),
  cancel: vi.fn(),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...await importOriginal<typeof import("wagmi")>(),
  useAccount: () => state.account,
  useConnectors: () => state.connectors,
  useChains: () => [{ id: 1, name: "Ethereum" }],
  useConnect: () => ({ mutateAsync: state.connect, isPending: false }),
  useDisconnect: () => ({ mutateAsync: state.disconnect, isPending: false }),
  useSwitchChain: () => ({ mutateAsync: state.switchChain, isPending: false }),
}));

vi.mock("@/web3/walletconnect-pairing", () => ({
  getWalletConnectPairing: () => state.pairing,
  walletConnectPairingServerSnapshot: state.serverPairing,
  subscribeWalletConnectPairing: (listener: () => void) => {
    state.subscribers.add(listener);
    return () => state.subscribers.delete(listener);
  },
  cancelWalletConnectPairing: state.cancel,
}));

const address = "0x1234567890123456789012345678901234567890";
const uri = "wc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@2?relay-protocol=irn&symKey=1234567890123456789012345678901234567890123456789012345678901234";

function makeConnector(id: string, name: string, type = "injected", present = true) {
  return {
    id, name, type, uid: id,
    getProvider: vi.fn().mockResolvedValue(present ? { request: vi.fn() } : undefined),
  } as unknown as Connector;
}

function Controls() {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();
  return <>
    <button onClick={openConnectModal}>Connect test wallet</button>
    <button onClick={openAccountModal}>Open account</button>
    <button onClick={openChainModal}>Open networks</button>
  </>;
}

function renderWallet() {
  return render(<WalletUiProvider><Controls /></WalletUiProvider>);
}

function setPairing(pairing: typeof state.pairing) {
  act(() => {
    state.pairing = pairing;
    state.subscribers.forEach((listener) => listener());
  });
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  state.account = { address: undefined, isConnected: false, chainId: undefined, connector: undefined };
  state.connectors = [makeConnector("io.metamask", "MetaMask"), makeConnector("walletConnect", "WalletConnect", "walletConnect")];
  state.connect.mockReset();
  state.disconnect.mockReset().mockResolvedValue(undefined);
  state.switchChain.mockReset().mockResolvedValue(undefined);
  state.cancel.mockReset();
  state.pairing = { status: "idle" };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app-owned wallet controls", () => {
  it("lists multiple injected wallets without a duplicate generic entry or initializing WalletConnect", async () => {
    const user = userEvent.setup();
    const wc = makeConnector("walletConnect", "WalletConnect", "walletConnect");
    const safe = makeConnector("safe", "Safe", "safe");
    state.connectors = [
      makeConnector("injected", "Injected"),
      makeConnector("io.metamask", "MetaMask"),
      makeConnector("io.rabby", "Rabby"),
      safe,
      wc,
    ];
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    expect(await screen.findByRole("button", { name: /MetaMask/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Rabby/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Browser wallet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Safe app/ })).not.toBeInTheDocument();
    expect(wc.getProvider).not.toHaveBeenCalled();
    expect(safe.getProvider).not.toHaveBeenCalled();
  });

  it("offers three official wallet downloads with stable order and focus during one opening", async () => {
    const user = userEvent.setup();
    const view = renderWallet();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByText("Need a wallet?"));
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Rabby", "Ambire", "MetaMask"]);
    expect(screen.getByRole("link", { name: "Ambire" })).toHaveAttribute("href", "https://www.ambire.com/");
    expect(screen.getByRole("link", { name: "MetaMask" })).toHaveAttribute("href", "https://metamask.io/download/");
    expect(screen.getByRole("link", { name: "Rabby" })).toHaveAttribute("href", "https://rabby.io/");
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.querySelector("img")).toHaveAttribute("alt", "");
    }

    const ambire = screen.getByRole("link", { name: "Ambire" });
    ambire.focus();
    random.mockReturnValue(0.999);
    view.rerender(<WalletUiProvider><Controls /></WalletUiProvider>);
    expect(screen.getAllByRole("link")).toEqual(links);
    expect(ambire).toHaveFocus();
    await user.click(screen.getByText("Need a wallet?"));
    await user.click(screen.getByText("Need a wallet?"));
    expect(screen.getAllByRole("link")).toEqual(links);
    await user.keyboard("{Escape}");
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByText("Need a wallet?"));
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["MetaMask", "Rabby", "Ambire"]);
    expect(screen.queryByText(/Install a wallet, then reload/)).not.toBeInTheDocument();
  });

  it("can select each of the six wallet download orders without favoring a position", async () => {
    const user = userEvent.setup();
    renderWallet();
    const random = vi.spyOn(Math, "random");
    const orders = new Set<string>();
    for (const first of [0, 0.34, 0.67]) {
      for (const second of [0, 0.5]) {
        random.mockReturnValueOnce(first).mockReturnValueOnce(second);
        await user.click(screen.getByText("Connect test wallet"));
        await user.click(screen.getByText("Need a wallet?"));
        orders.add(screen.getAllByRole("link").map((link) => link.textContent).join(","));
        await user.keyboard("{Escape}");
      }
    }
    expect(orders.size).toBe(6);
  });

  it("keeps missing mobile pairing disabled and explains the alternative", async () => {
    const user = userEvent.setup();
    state.connectors = [makeConnector("injected", "Injected", "injected", false)];
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    expect(await screen.findByText(/No browser wallet detected/)).toBeVisible();
    expect(screen.getByRole("button", { name: /WalletConnect/ })).toBeDisabled();
    expect(screen.getByText(/Mobile pairing is unavailable/)).toBeVisible();
  });

  it("reports a rejected connection and lets the user try again", async () => {
    const user = userEvent.setup();
    state.connect.mockRejectedValueOnce({ code: 4001 }).mockResolvedValueOnce({});
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(await screen.findByRole("button", { name: /MetaMask/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request declined");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state.connect).toHaveBeenCalledTimes(2);
  });

  it("disconnects an injected wallet approved after the dialog is dismissed", async () => {
    const user = userEvent.setup();
    const request = deferred();
    state.connect.mockReturnValue(request.promise);
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(await screen.findByRole("button", { name: /MetaMask/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your wallet…");
    expect(screen.queryByText(/If you cancel, dismiss/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await act(async () => request.resolve({}));
    expect(state.disconnect).toHaveBeenCalledWith({ connector: state.connectors[0] });
  });

  it("does not open a second injected request before a cancelled prompt finishes", async () => {
    const user = userEvent.setup();
    const request = deferred();
    state.connect.mockReturnValueOnce(request.promise).mockResolvedValueOnce({});
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(await screen.findByRole("button", { name: /MetaMask/ }));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(await screen.findByRole("button", { name: /MetaMask/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Request already open");
    expect(state.connect).toHaveBeenCalledOnce();
    await act(async () => request.resolve({}));
    expect(state.disconnect).toHaveBeenCalledWith({ connector: state.connectors[0] });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.connect).toHaveBeenCalledTimes(2);
    expect(state.disconnect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders a QR only for the current pending request and cancels when closed", async () => {
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    setPairing({ status: "pending", uri });
    expect(screen.getByRole("img", { name: "WalletConnect pairing QR code" })).toHaveAttribute("src", expect.stringContaining("data:image/"));
    expect(screen.getByRole("link", { name: "Open MetaMask" })).toHaveAttribute("href", `metamask://wc?uri=${encodeURIComponent(uri)}`);
    expect(screen.getByRole("link", { name: "Open Rabby" })).toHaveAttribute("href", `rabby://walletconnect?uri=${encodeURIComponent(uri)}`);
    expect(screen.queryByText(/return to this tab/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your wallet…");
    await user.click(screen.getByRole("button", { name: "Copy connection link" }));
    expect(await navigator.clipboard.readText()).toBe(uri);
    await user.click(screen.getByText("Connection link", { exact: true }));
    expect(screen.getByText(uri, { exact: true })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["iPhone", "iPad"])("offers Oath on %s using the existing pending request", async (device) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(`Mozilla/5.0 (${device}; CPU OS 17_0 like Mac OS X)`);
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    expect(screen.queryByRole("link", { name: "Open Oath" })).not.toBeInTheDocument();
    setPairing({ status: "pending", uri });
    const oath = screen.getByRole("link", { name: "Open Oath" });
    expect(oath).toHaveAttribute("href", `oathwallet://wc?uri=${encodeURIComponent(uri)}`);
    expect(screen.getByRole("link", { name: "Open MetaMask" })).toHaveAttribute("href", `metamask://wc?uri=${encodeURIComponent(uri)}`);
    expect(screen.getByRole("link", { name: "Open Rabby" })).toHaveAttribute("href", `rabby://walletconnect?uri=${encodeURIComponent(uri)}`);
    // Avoid operating-system navigation; the action must not start another connector.
    oath.addEventListener("click", (event) => event.preventDefault());
    await user.click(oath);
    expect(state.connect).toHaveBeenCalledExactlyOnceWith({ connector: state.connectors[1] });
    expect(state.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your wallet…");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Open Oath" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Need a wallet?"));
    expect(screen.getAllByRole("link").map((link) => link.textContent).sort()).toEqual(["Ambire", "MetaMask", "Rabby"]);
  });

  it.each([
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    "Mozilla/5.0 (Linux; Android 14)",
  ])("keeps Oath out of an unsupported browser", async (userAgent) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    setPairing({ status: "pending", uri });
    expect(screen.getByRole("img", { name: "WalletConnect pairing QR code" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open Oath" })).not.toBeInTheDocument();
  });

  it.each(["cancelled", "expired", "error"])("removes stale Oath links after pairing becomes %s", async (status) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    setPairing({ status: "pending", uri });
    expect(screen.getByRole("link", { name: "Open Oath" })).toBeVisible();
    // The provider can retain a stale field; status still removes every launch action.
    setPairing({ status, uri });
    expect(screen.queryByRole("link", { name: "Open Oath" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "WalletConnect pairing QR code" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    const nextUri = uri.replace("a".repeat(64), "b".repeat(64));
    setPairing({ status: "pending", uri: nextUri });
    expect(screen.getByRole("link", { name: "Open Oath" })).toHaveAttribute("href", `oathwallet://wc?uri=${encodeURIComponent(nextUri)}`);
    expect(state.connect).toHaveBeenCalledTimes(2);
  });

  it("removes expired QR codes and provides a fresh retry action", async () => {
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    setPairing({ status: "pending", uri });
    setPairing({ status: "expired" });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
    expect(screen.queryByText(/fresh QR code/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.connect).toHaveBeenCalledTimes(2);
  });

  it("cancels pairing before showing the wallet list again", async () => {
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    setPairing({ status: "pending", uri });
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: /MetaMask/ })).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("cancels an active pairing when the provider unmounts", async () => {
    const user = userEvent.setup();
    state.connect.mockReturnValue(new Promise(() => {}));
    const view = renderWallet();
    await user.click(screen.getByText("Connect test wallet"));
    await user.click(screen.getByRole("button", { name: /WalletConnect/ }));
    view.unmount();
    expect(state.cancel).toHaveBeenCalledOnce();
  });

  it("contains focus in the dialog and returns it to the trigger", async () => {
    const user = userEvent.setup();
    renderWallet();
    const trigger = screen.getByText("Connect test wallet");
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Connect wallet" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(within(dialog).getByText("Need a wallet?")).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("shows the account, supports copying, and disconnects explicitly", async () => {
    const user = userEvent.setup();
    state.account = { address, isConnected: true, chainId: 1, connector: { name: "Rabby", type: "injected" } };
    renderWallet();
    await user.click(screen.getByText("Open account"));
    const identity = await screen.findByTestId("wallet-account-address");
    expect(within(identity).getByRole("link", { name: `View Ethereum address ${address} on Etherscan` })).toHaveAttribute("href", `https://etherscan.io/address/${address}`);
    expect(screen.getByText("Rabby", { exact: true })).toBeVisible();
    expect(screen.queryByText(/revoke token approvals/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(await screen.findByRole("status")).toHaveTextContent("address copied");
    expect(await navigator.clipboard.readText()).toBe(address);
    await user.click(screen.getByRole("button", { name: /^Disconnect$/ }));
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a rejected network switch recoverable", async () => {
    const user = userEvent.setup();
    state.account = { address, isConnected: true, chainId: 10, connector: { name: "MetaMask", type: "injected" } };
    state.switchChain.mockRejectedValueOnce({ code: 4001 }).mockResolvedValueOnce({});
    renderWallet();
    await user.click(screen.getByText("Open networks"));
    await user.click(await screen.findByRole("button", { name: "Ethereum Mainnet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request declined");
    await user.click(screen.getByRole("button", { name: "Ethereum Mainnet" }));
    expect(state.switchChain).toHaveBeenLastCalledWith({ chainId: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the connect dialog if the account disappeared before the action", async () => {
    const user = userEvent.setup();
    renderWallet();
    await user.click(screen.getByText("Open account"));
    expect(await screen.findByRole("dialog", { name: "Connect wallet" })).toBeVisible();
  });
});
