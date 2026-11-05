import { fetchRecoveryEnvelope, recoverySourceUrl } from "@/lib/clients/yeth/recovery/feed-server";
import { isProductionRuntime } from "@/lib/runtime/features";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    const source = recoverySourceUrl(process.env.YETH_RECOVERY_DATA_URL, isProductionRuntime());
    return Response.json(await fetchRecoveryEnvelope(source), { headers });
  } catch {
    return Response.json({ error: "Recovery data is unavailable. Try again shortly." }, { status: 502, headers });
  }
}
