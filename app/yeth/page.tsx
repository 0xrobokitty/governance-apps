import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { YethPageClient } from "./YethPageClient";
import { createGovernanceAppMetadata } from "@/lib/runtime/discoverability";
import { isYethEnabled } from "@/lib/runtime/features";

// Per-request CSP nonces require fresh HTML, including on dedicated app hosts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#000000",
};

const YETH_OG_IMAGE_URL = "/og-yETH.png?v=20260303";

const enabledMetadata: Metadata = createGovernanceAppMetadata("yeth", {
  title: "yETH Recovery | Yearn Finance",
  description:
    "Recovery interface for yETH. Claim recovered ETH now, or stay in the Recovery Vault with ongoing risk.",
  applicationName: "yETH Recovery",
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
    title: "yETH Recovery | Yearn Finance",
    description:
      "Recovery interface for yETH. Claim ETH now, or stay in the Recovery Vault with ongoing risk.",
    url: "https://yeth.yearn.fi",
    siteName: "Yearn Finance",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: YETH_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Yearn Finance",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "yETH Recovery | Yearn Finance",
    description:
      "Recovery interface for yETH. Claim ETH now, or stay in the Recovery Vault with ongoing risk.",
    images: [YETH_OG_IMAGE_URL],
  },
});

export function generateMetadata(): Metadata {
  if (!isYethEnabled()) {
    return {
      title: "Not Found",
      robots: { index: false, follow: false },
    };
  }
  return enabledMetadata;
}

export default function YethPage() {
  if (!isYethEnabled()) {
    notFound();
  }
  return <YethPageClient />;
}
