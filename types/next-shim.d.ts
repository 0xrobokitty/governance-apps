type UnknownRecord = Record<string, unknown>;

declare module "next" {
  export type Metadata = UnknownRecord;
  export type Viewport = UnknownRecord;
  export type NextConfig = UnknownRecord;
  export namespace MetadataRoute {
    export type Manifest = UnknownRecord;
    export type Robots = UnknownRecord;
    export type Sitemap = UnknownRecord[];
  }
  const Next: unknown;
  export default Next;
}

declare module "next/link" {
  import type { ComponentType, MouseEventHandler, ReactNode } from "react";
  export type LinkProps = {
    href: string;
    className?: string;
    children?: ReactNode;
    prefetch?: boolean;
    replace?: boolean;
    scroll?: boolean;
    target?: string;
    rel?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  };
  const Link: ComponentType<LinkProps>;
  export default Link;
}

declare module "next/navigation" {
  export function notFound(): never;
  export function usePathname(): string | null;
  export function useSelectedLayoutSegment(
    parallelRouteKey?: string
  ): string | null;
  export function useSelectedLayoutSegments(
    parallelRouteKey?: string
  ): string[];
  export function useRouter(): unknown;
  export function useSearchParams(): URLSearchParams;
}

declare module "next/types.js" {
  export type Metadata = UnknownRecord;
  export type Viewport = UnknownRecord;
  export type ResolvingMetadata = UnknownRecord;
  export type ResolvingViewport = UnknownRecord;
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type Metadata = UnknownRecord;
  export type Viewport = UnknownRecord;
  export type ResolvingMetadata = UnknownRecord;
  export type ResolvingViewport = UnknownRecord;
}

declare module "next/dist/build/segment-config/app/app-segment-config.js" {
  export type AppSegmentConfig = UnknownRecord;
  export type InstantConfigForTypeCheckInternal = UnknownRecord;
  export type PrefetchForTypeCheckInternal = UnknownRecord;
  export type Prefetch = "auto" | "partial" | "force-disabled";
  export type EnsureStatic = "auto" | "shell" | "prefetch" | "navigation" | false;
}
