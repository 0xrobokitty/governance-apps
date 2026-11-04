"use client";

import { useMemo } from "react";
import encodeQR from "qr";
import { LogoYearnMark } from "@/components/icons/LogoYearnMark";

/** Add a small local Yearn mark while preserving the existing QR encoding. */
export function WalletPairingQr({ uri }: { uri: string }) {
  const image = useMemo(() => {
    try {
      const src = encodeQR(uri, "data-url", { scale: 5, border: 4, ecc: "medium" });
      const modules = encodeQR(uri, "raw", { border: 4, ecc: "medium" }).length;
      // Keep untested smaller or denser symbols unobstructed.
      const markSize = modules >= 61 && modules <= 97 ? (7 / modules) * 100 : null;
      return { src, markSize };
    } catch {
      return null;
    }
  }, [uri]);

  if (!image)
    return <p role="alert">Could not draw the QR code. Copy the connection link instead.</p>;

  return (
    <div className="mx-auto max-w-full" style={{ width: 256 }}>
      <div
        data-testid="wallet-pairing-qr"
        style={{ position: "relative", background: "#fff" }}
      >
        {/* Encoded locally. No pairing URI or image is sent to an image service. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          width={256}
          height={256}
          alt="WalletConnect pairing QR code"
          className="block h-auto w-full"
        />
        {image.markSize && (
          <span
            aria-hidden="true"
            data-testid="wallet-pairing-qr-mark"
            style={{
              position: "absolute",
              left: `${(100 - image.markSize) / 2}%`,
              top: `${(100 - image.markSize) / 2}%`,
              width: `${image.markSize}%`,
              height: `${image.markSize}%`,
              background: "#fff",
              borderRadius: "50%",
              color: "#000",
              pointerEvents: "none",
            }}
          >
            <LogoYearnMark
              style={{
                position: "absolute",
                inset: `${100 / 7}%`,
                width: `${(5 / 7) * 100}%`,
                height: `${(5 / 7) * 100}%`,
              }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
