import { YETH_GLOBAL_FEED_POLICY } from "@/lib/clients/global-payload";
import { createGlobalDataProxy } from "@/lib/server/global-data-proxy";

export const dynamic = "force-dynamic";
export const GET = createGlobalDataProxy("NEXT_PUBLIC_YETH_GLOBAL_DATA_URL", "yETH global data", YETH_GLOBAL_FEED_POLICY);
