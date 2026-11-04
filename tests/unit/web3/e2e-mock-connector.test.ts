import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnect, getConnections, reconnect } from "wagmi/actions";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { getAddress } from "viem";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { createE2EMockConnector } from "@/web3/e2e-mock-connector";

describe("E2E mock connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers eth_accounts locally and delegates every other provider request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          result: "0xabc",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = createConfig({
      chains: [mainnet],
      connectors: [
        createE2EMockConnector({
          accounts: [E2E_MOCK_ADDRESS],
          features: {
            defaultConnected: true,
            reconnect: true,
          },
        }),
      ],
      transports: {
        [mainnet.id]: http("http://127.0.0.1:8546"),
      },
    });
    const connector = config.connectors[0];
    const provider = await connector.getProvider();

    await expect(
      provider.request({ method: "eth_accounts" })
    ).resolves.toEqual([E2E_MOCK_ADDRESS]);
    await expect(connector.getAccounts()).resolves.toEqual([
      getAddress(E2E_MOCK_ADDRESS),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();

    const request = provider.request as unknown as (request: {
      method: string;
    }) => Promise<unknown>;
    await expect(
      request({ method: "eth_blockNumber" })
    ).resolves.toBe("0xabc");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reconnects deterministically without RPC and respects explicit disconnect", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config = createConfig({
      chains: [mainnet],
      connectors: [
        createE2EMockConnector({
          accounts: [E2E_MOCK_ADDRESS],
          features: {
            defaultConnected: true,
            reconnect: true,
          },
        }),
      ],
      transports: {
        [mainnet.id]: http("http://127.0.0.1:8546"),
      },
    });

    await expect(reconnect(config)).resolves.toHaveLength(1);
    expect(config.state.status).toBe("connected");
    expect(getConnections(config)[0]?.accounts).toEqual([
      getAddress(E2E_MOCK_ADDRESS),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();

    await disconnect(config);
    expect(config.state.status).toBe("disconnected");
    await expect(reconnect(config)).resolves.toEqual([]);
    expect(config.state.status).toBe("disconnected");
    expect(getConnections(config)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
