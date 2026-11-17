import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "../../../lib/feed-transport";

export const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;
export const TELEGRAM_MAX_RESPONSE_BYTES = 64 * 1024;

interface TelegramSendMessageResponse {
  ok?: boolean;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

export type TelegramSendFailureKind =
  | "http_error"
  | "api_error"
  | "invalid_response"
  | "timeout"
  | "network_error";

export class TelegramRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("telegram_rate_limited");
    this.name = "TelegramRateLimitError";
  }
}

export class TelegramSendError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly telegramErrorCode: number | null,
    readonly kind: TelegramSendFailureKind,
  ) {
    super("telegram_send_failed");
    this.name = "TelegramSendError";
  }
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

export async function sendMessage(
  chatId: string,
  html: string,
  botToken: string,
): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const policy: FeedTransportPolicy = {
    maximumPayloadBytes: TELEGRAM_MAX_RESPONSE_BYTES,
    requestTimeoutMs: TELEGRAM_REQUEST_TIMEOUT_MS,
    fetchOptions: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
      }),
      redirect: "manual",
      credentials: "omit",
    },
    createTimeoutError: () => new TelegramSendError(0, null, "timeout"),
    createPayloadTooLargeError: () => new TelegramSendError(0, null, "invalid_response"),
    payloadTooLargeCancelReason: "Telegram response size limit",
    timeoutCancelReason: "Telegram request deadline",
  };

  try {
    await withFeedRequest(endpoint, policy, async (response, context) => {
      let payload: TelegramSendMessageResponse | null;
      try {
        payload = await readBoundedJson(response, context, policy) as TelegramSendMessageResponse | null;
      } catch (error) {
        if (error instanceof TelegramSendError) throw error;
        throw new TelegramSendError(response.status, null, "invalid_response");
      }
      const retryAfter = safeInteger(payload?.parameters?.retry_after);
      if (response.status === 429 && retryAfter !== null && retryAfter > 0) {
        throw new TelegramRateLimitError(retryAfter);
      }
      if (!response.ok || payload?.ok !== true) {
        throw new TelegramSendError(
          response.status,
          safeInteger(payload?.error_code),
          payload === null ? "invalid_response" : response.ok ? "api_error" : "http_error",
        );
      }
    });
  } catch (error) {
    if (error instanceof TelegramSendError || error instanceof TelegramRateLimitError) throw error;
    // Fetch errors can contain the endpoint, including the bot token.
    throw new TelegramSendError(0, null, "network_error");
  }
}
