import { GLOBAL_FEED_POLICY } from "@/lib/clients/global-payload";
import { createGlobalDataProxy } from "@/lib/server/global-data-proxy";

export const dynamic = "force-dynamic";
export const GET = createGlobalDataProxy("NEXT_PUBLIC_GLOBAL_DATA_URL", "Global data", GLOBAL_FEED_POLICY);
