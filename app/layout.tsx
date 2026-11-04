// app/layout.tsx
import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { Web3Providers } from "@/web3/providers";
import { ProtocolProvider } from "@/state/protocol";
import { IdentityProvider } from "@/state/identity";
import { Toaster } from "@/components/ui/Toast";
import { Header } from "@/components/Header";
import { GovernanceAppFooter, GovernanceAppNotice } from "./GovernanceShell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
      </head>
      <body>
        <Web3Providers>
          <ProtocolProvider>
            <IdentityProvider>
              <div className="flex min-h-screen flex-col bg-app text-text-primary font-sans">
                <Header />
                <GovernanceAppNotice />
                <main className="flex-1">{children}</main>
                <GovernanceAppFooter />
              </div>
              <Toaster />
            </IdentityProvider>
          </ProtocolProvider>
        </Web3Providers>
      </body>
    </html>
  );
}
