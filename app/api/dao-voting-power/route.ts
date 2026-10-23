import { fetchDaoVotingPowerSnapshot } from "@/lib/clients/dao/voting-power-snapshot";
import { isDaoEnabled } from "@/lib/runtime/features";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  const upstreamUrl = process.env.NEXT_PUBLIC_DAO_VOTING_POWER_URL?.trim();
  if (!upstreamUrl) {
    return Response.json({ error: "Voting-power feed is not configured." }, { status: 503, headers });
  }
  try {
    // The shared reader enforces payload bounds, timeout, deployment, and sums.
    // Wallet reads subsequently verify freshness and the canonical block.
    const snapshot = await fetchDaoVotingPowerSnapshot(upstreamUrl);
    return Response.json(snapshot, { headers });
  } catch {
    return Response.json({ error: "Voting-power feed is unavailable." }, { status: 502, headers });
  }
}
