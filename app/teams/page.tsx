import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { TeamsPageClient } from "./TeamsPageClient";
import { createGovernanceAppMetadata } from "@/lib/runtime/discoverability";
import { isTeamsEnabled } from "@/lib/runtime/features";

// Per-request CSP nonces require fresh HTML, including on dedicated app hosts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#000000",
};

const enabledMetadata: Metadata = createGovernanceAppMetadata("teams", {
  title: "Team Finances | Yearn Finance",
  description:
    "Review registered team revenue, costs, funding, bonus, and status.",
  applicationName: "Team Finances",
  icons: {
    icon: [
      { url: "/favicons/favicon.svg", type: "image/svg+xml", sizes: "any" },
      {
        url: "/favicons/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/favicons/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
      },
    ],
    apple: [
      {
        url: "/favicons/apple-icon-180x180.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  openGraph: {
    title: "Team Finances | Yearn Finance",
    description:
      "Review registered team revenue, costs, funding, bonus, and status.",
    url: "https://teams.yearn.fi",
    siteName: "Yearn Finance",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Team Finances | Yearn Finance",
    description:
      "Review registered team revenue, costs, funding, bonus, and status.",
  },
});

export function generateMetadata(): Metadata {
  if (!isTeamsEnabled()) {
    return {
      title: "Not Found",
      robots: { index: false, follow: false },
    };
  }

  return enabledMetadata;
}

export default function TeamsPage() {
  if (!isTeamsEnabled()) {
    notFound();
  }

  return <TeamsPageClient />;
}
