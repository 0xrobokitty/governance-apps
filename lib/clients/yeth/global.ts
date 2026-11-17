import { readBoundedJson, withFeedRequest } from "@/lib/feed-transport";
import { YETH_GLOBAL_FEED_POLICY } from "@/lib/clients/global-payload";
import {
  YethGlobalDataSchema,
  type YethGlobalData,
} from "@/lib/schemas/yeth-global";

const YETH_GLOBAL_DATA_URL = process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL;
const YETH_GLOBAL_DATA_PROXY_URL = "/api/yeth-global-data";
let lastValidYethGlobalData: YethGlobalData | null = null;

function isBrowserRuntime() {
  return typeof window !== "undefined";
}

async function fetchAndValidate(url: string, label: string) {
  try {
    return await withFeedRequest(url, YETH_GLOBAL_FEED_POLICY, async (response, context) => {
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        console.warn(`yETH global data fetch failed (${label}):`, response.status);
        return null;
      }

      const json = await readBoundedJson(response, context, YETH_GLOBAL_FEED_POLICY);
      const parsed = YethGlobalDataSchema.safeParse(json);
      if (!parsed.success) {
        console.warn(
          `yETH global data schema validation failed (${label})`,
          parsed.error
        );
        return null;
      }

      return parsed.data;
    });
  } catch (error) {
    console.warn(`yETH global data fetch failed (${label})`, error);
    return null;
  }
}

export async function fetchYethGlobalData(): Promise<YethGlobalData | null> {
  const url = isBrowserRuntime()
    ? YETH_GLOBAL_DATA_PROXY_URL
    : YETH_GLOBAL_DATA_URL;
  if (!url) return null;

  const data = await fetchAndValidate(
    url,
    isBrowserRuntime() ? "same-origin proxy" : "direct"
  );
  if (data) {
    lastValidYethGlobalData = data;
    return data;
  }
  return lastValidYethGlobalData;
}
