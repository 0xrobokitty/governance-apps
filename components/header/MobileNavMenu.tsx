"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  useAccountModal,
  useChainModal,
  useConnectModal,
} from "@/web3/wallet-ui";
import { useAccount } from "wagmi";
import { usePathname } from "next/navigation";
import { IconChevron } from "@/components/icons/IconChevron";
import { IconClose } from "@/components/icons/IconClose";
import { IconDiscord } from "@/components/icons/IconDiscord";
import { IconMoon } from "@/components/icons/IconMoon";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { IconSun } from "@/components/icons/IconSun";
import { IconTwitter } from "@/components/icons/IconTwitter";
import { IconWallet } from "@/components/icons/IconWallet";
import { LogoGithub } from "@/components/icons/LogoGithub";
import { TypeMarkYearn } from "@/components/icons/TypeMarkYearn";
import { cn } from "@/lib/cn";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { formatAddress } from "@/lib/format";
import { resolveHeaderPrimaryNav } from "@/lib/header-nav";
import { useHostname } from "@/lib/hooks/useHostname";
import { useTheme } from "@/lib/hooks/useTheme";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import {
  APP_LINKS,
  COMMUNITY,
  INFO_ITEMS,
  PRODUCTS,
  TOOLS,
  type NavItem,
} from "@/lib/nav-data";
import { MobileNavTile } from "./MobileNavTile";
import {
  getE2EWalletLabel,
  type E2EWalletPresentation,
} from "@/components/WalletButton";

type MobileNavMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  e2eWalletPresentation?: E2EWalletPresentation;
  governanceLink?: {
    href: string;
    label: string;
  };
};

type TSectionId = "products" | "information" | "community" | "tools";

type TAccordionSection = {
  id: TSectionId;
  title: string;
  items: NavItem[];
};

function getInitialExpandedState(): Record<TSectionId, boolean> {
  return {
    products: false,
    information: false,
    community: false,
    tools: false,
  };
}

const LIST_BUTTON_CLASS =
  "relative flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 text-left text-lg font-medium text-text-primary transition-colors hover:bg-surface-tertiary motion-reduce:transition-none";

export function MobileNavMenu({
  e2eWalletPresentation,
  isOpen,
  onClose,
  returnFocusRef,
  governanceLink,
}: MobileNavMenuProps): ReactElement | null {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [expandedSections, setExpandedSections] = useState(
    getInitialExpandedState,
  );
  const hostname = useHostname();
  const isDark = theme === "soft-dark";
  const currentAppNav = resolveHeaderPrimaryNav(pathname, null, hostname);
  const currentAppLabel = currentAppNav.label;
  const hasCurrentAppLabel = currentAppLabel.length > 0;
  const currentApp = APP_LINKS.find((app) => app.name === currentAppLabel);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const handleClose = useCallback(() => {
    setExpandedSections(getInitialExpandedState());
    onClose();
  }, [onClose]);

  const accordionSections = useMemo<TAccordionSection[]>(
    () => [
      {
        id: "products",
        title: "Products",
        items: PRODUCTS,
      },
      {
        id: "information",
        title: "Information",
        items: INFO_ITEMS,
      },
      {
        id: "community",
        title: "Community",
        items: COMMUNITY,
      },
      {
        id: "tools",
        title: "Tools",
        items: TOOLS,
      },
    ],
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== dialog &&
        !element.contains(dialog)
    );
    const previousBackgroundState = background.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    }));
    for (const element of background) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      for (const previous of previousBackgroundState) {
        previous.element.inert = previous.inert;
        if (previous.ariaHidden === null) {
          previous.element.removeAttribute("aria-hidden");
        } else {
          previous.element.setAttribute("aria-hidden", previous.ariaHidden);
        }
      }
      returnFocus?.focus({ preventScroll: true });
    };
  }, [isOpen, returnFocusRef]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(event.currentTarget);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-testid="mobile-navigation-dialog"
      className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-app text-text-primary animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none motion-reduce:transition-none md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onKeyDown={handleDialogKeyDown}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <TypeMarkYearn
          className="h-8 w-auto text-yearn-blue dark:text-text-primary"
          color="currentColor"
        />
        <button
          ref={closeButtonRef}
          type="button"
          onClick={handleClose}
          className="inline-flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary motion-reduce:transition-none"
          aria-label="Close navigation menu"
        >
          <IconClose className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-5">
          <div className="space-y-1">
            {hasCurrentAppLabel ? (
              <Link
                href={currentAppNav.path}
                onClick={handleClose}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-primary/10 bg-text-primary/10 px-4 py-2.5 text-text-primary transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface-tertiary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {currentApp?.icon ? (
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center",
                      currentApp.iconWrapperClass,
                    )}
                  >
                    {currentApp.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 break-words text-pretty text-lg font-medium whitespace-normal">
                  {currentAppLabel}
                </span>
              </Link>
            ) : null}
            <MobileWalletButton
              e2ePresentation={e2eWalletPresentation}
              onSelect={handleClose}
            />
            <button
              type="button"
              onClick={toggleTheme}
              className={LIST_BUTTON_CLASS}
            >
              {isDark ? (
                <IconSun className="size-5 shrink-0" />
              ) : (
                <IconMoon className="size-5 shrink-0" />
              )}
              <span className="truncate">{isDark ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>

          <div className="space-y-1">
            {accordionSections.map((section) => {
              const isExpanded = expandedSections[section.id];
              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSections((previous) => ({
                        ...previous,
                        [section.id]: !previous[section.id],
                      }))
                    }
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-4 text-left text-lg font-medium text-text-primary transition-colors hover:bg-surface-tertiary motion-reduce:transition-none"
                    aria-expanded={isExpanded}
                  >
                    <span className="truncate">{section.title}</span>
                    <IconChevron
                      className={cn(
                        "size-5 shrink-0 text-text-secondary transition-transform duration-200 motion-reduce:duration-0 motion-reduce:transition-none",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </button>

                  <div
                    aria-hidden={!isExpanded}
                    data-testid={`mobile-navigation-section-${section.id}`}
                    inert={isExpanded ? undefined : true}
                    className={cn(
                      "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:duration-0 motion-reduce:transition-none",
                      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-0.5 px-2 pb-3 pt-1">
                        {section.items.map((item) => (
                          <MobileNavTile
                            key={item.href}
                            item={item}
                            onSelect={handleClose}
                            hostname={hostname}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {governanceLink ? (
              <div onClick={handleClose}>
                <Link
                  href={governanceLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LIST_BUTTON_CLASS}
                  aria-label={`${governanceLink.label} (opens in a new tab)`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {governanceLink.label}
                  </span>
                  <IconLinkOut
                    className="size-4 shrink-0 text-text-tertiary"
                    aria-hidden
                  />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
        <div className="flex items-center justify-center gap-3">
          <SocialLink href="https://x.com/yearnfi" label="Yearn on X">
            <IconTwitter className="size-5" />
          </SocialLink>
          <SocialLink href="https://github.com/yearn" label="Yearn on Github">
            <LogoGithub className="size-5" />
          </SocialLink>
          <SocialLink href="https://discord.gg/yearn" label="Yearn on Discord">
            <IconDiscord className="size-5" />
          </SocialLink>
        </div>
      </footer>
    </div>,
    document.body
  );
}

function MobileWalletButton({
  e2ePresentation,
  onSelect,
}: {
  e2ePresentation?: E2EWalletPresentation;
  onSelect: () => void;
}): ReactElement {
  const { address, chainId, isConnected } = useAccount();
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();
  const { openConnectModal } = useConnectModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const usesE2EFallback =
    process.env.NEXT_PUBLIC_E2E === "true" && address === undefined;
  const effectiveAddress =
    address ?? (usesE2EFallback ? E2E_MOCK_ADDRESS : undefined);
  const hasConnectedAccount = isConnected || usesE2EFallback;

  if (!mounted) {
    return <div className="h-[44px] w-full animate-pulse rounded-lg bg-surface-secondary" />;
  }

  if (process.env.NEXT_PUBLIC_E2E === "true" && e2ePresentation) {
    const label = getE2EWalletLabel(e2ePresentation);
    return (
      <div
        role="status"
        aria-label={`Read-only test wallet: ${label}`}
        data-testid="dao-mobile-wallet-presentation"
        className={cn(
          LIST_BUTTON_CLASS,
          "cursor-default",
          !e2ePresentation.connected
            ? "text-text-secondary"
            : !e2ePresentation.correctChain
              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200"
              : "text-text-secondary"
        )}
      >
        <IconWallet className="size-5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  if (usesE2EFallback && effectiveAddress) {
    const label = formatAddress(effectiveAddress);
    return (
      <div
        role="status"
        aria-label={`Read-only test wallet: ${label}`}
        className={cn(LIST_BUTTON_CLASS, "cursor-default text-text-secondary")}
      >
        <IconWallet className="size-5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  if (!hasConnectedAccount || !effectiveAddress) {
    return (
      <button
        type="button"
        onClick={() => {
          onSelect();
          openConnectModal?.();
        }}
        className={LIST_BUTTON_CLASS}
      >
        <IconWallet className="size-5 shrink-0" />
        <span className="truncate">Connect Wallet</span>
      </button>
    );
  }

  const isWrongNetwork =
    !usesE2EFallback && !!chainId && chainId !== MAINNET_CHAIN_ID;

  if (isWrongNetwork) {
    return (
      <button
        type="button"
        onClick={() => {
          onSelect();
          (openChainModal ?? openConnectModal)?.();
        }}
        className="relative flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 text-left text-lg font-medium text-red-500 transition-colors hover:bg-surface-tertiary"
      >
        <IconWallet className="size-5 shrink-0 text-red-500" />
        <span className="truncate">Wrong Network</span>
      </button>
    );
  }

  const identityLabel = formatAddress(effectiveAddress);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        openAccountModal?.();
      }}
      className={LIST_BUTTON_CLASS}
    >
      <IconWallet className="size-5 shrink-0" />
      <span className="truncate">{identityLabel}</span>
    </button>
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => {
    const style = getComputedStyle(element);
    return (
      !element.closest("[inert]") &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  });
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactElement;
}): ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary motion-reduce:transition-none"
    >
      {children}
    </a>
  );
}
