import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isMetricsMockEnabled } from "@/lib/clients/metrics/config";
import { MetricsPageClient } from "./MetricsPageClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Metrics | Yearn Finance",
  description: "A design preview of daily Yearn capital, activity and staking metrics.",
  robots: { index: false, follow: false },
};
export default function MetricsPage() {
  if (!isMetricsMockEnabled()) notFound();
  return <MetricsPageClient />;
}
