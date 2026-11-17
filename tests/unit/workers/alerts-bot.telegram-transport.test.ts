import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMessage, TELEGRAM_MAX_RESPONSE_BYTES, TELEGRAM_REQUEST_TIMEOUT_MS, TelegramSendError } from "@/workers/alerts-bot/src/telegram";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Telegram transport bounds", () => {
  it.each(["fetch", "body"])("times out a stalled %s and permits the next attempt", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn().mockImplementationOnce(() => phase === "fetch" ? new Promise(() => undefined)
      : Promise.resolve(new Response(new ReadableStream({ cancel }))))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const assertion = expect(sendMessage("chat", "body", "secret-token")).rejects.toMatchObject({
      name: "TelegramSendError", message: "telegram_send_failed", kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(TELEGRAM_REQUEST_TIMEOUT_MS);
    await assertion;
    if (phase === "body") expect(cancel).toHaveBeenCalled();
    await expect(sendMessage("chat", "body", "secret-token")).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["declared", "streamed"])("rejects a %s oversized reply", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => kind === "declared"
      ? new Response("{}", { headers: { "content-length": String(TELEGRAM_MAX_RESPONSE_BYTES + 1) } })
      : new Response(new ReadableStream({
          start(controller) { controller.enqueue(new Uint8Array(TELEGRAM_MAX_RESPONSE_BYTES + 1)); },
        }))));
    await expect(sendMessage("chat", "body", "secret-token")).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("does not follow redirects or retain a credential-bearing fetch error", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      expect(init.credentials).toBe("omit");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new Error("fetch failed: https://api.telegram.org/botsecret-token/sendMessage");
    });
    vi.stubGlobal("fetch", fetcher);
    const error = await sendMessage("chat", "body", "secret-token").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(TelegramSendError);
    expect(error).toMatchObject({ kind: "network_error" });
    expect(String(error)).not.toContain("secret-token");
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });
  it("rejects a redirected response and an invalid JSON response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 302, headers: { location: "https://elsewhere.test" } }))
      .mockResolvedValueOnce(new Response("{", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendMessage("chat", "body", "token")).rejects.toBeInstanceOf(TelegramSendError);
    await expect(sendMessage("chat", "body", "token")).rejects.toMatchObject({ kind: "invalid_response" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
