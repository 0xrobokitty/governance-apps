import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPulseMockEnabled, isPulseLiveEnabled } from "@/lib/clients/pulse/config";
import { LivePulsePage } from "./LivePulsePage";
import { PulsePageClient } from "./PulsePageClient";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pulse | Yearn", description: "Capital, activity and governance trends across Yearn.",
  robots: { index: false, follow: false },
};
export default function PulsePage() {
  if (isPulseLiveEnabled()) return <LivePulsePage />;
  if (!isPulseMockEnabled()) notFound();
  return <PulsePageClient />;
}
