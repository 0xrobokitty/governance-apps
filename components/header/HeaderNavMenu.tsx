"use client";

import { useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { IconChevron } from "@/components/icons/IconChevron";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { DropdownPanel } from "./DropdownPanel";
import { cn } from "@/lib/cn";
import { resolveGovernanceHref } from "@/lib/governance-links";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  COMMUNITY,
  INFO_ITEMS,
  PRODUCTS,
  TOOLS,
  isExternalHref,
  type NavItem,
} from "@/lib/nav-data";

type TMenuKey = "products" | "resources";

function NavTile({
  item,
  hostname,
}: {
  item: NavItem;
  hostname?: string;
}): ReactElement {
  const hasIcon = Boolean(item.icon);
  const isExternal = isExternalHref(item.href);
  const href = resolveGovernanceHref(item.href, hostname);
  const iconWrapperClass =
    item.iconWrapperClass ??
    "bg-white text-neutral-700 dark:bg-[#0a0a0a] dark:text-neutral-200";

  return (
    <Link
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      <div
        className={cn(
          "group/nav-item flex items-center rounded-lg p-2 transition-colors",
          hasIcon ? "gap-3" : "gap-0",
          "hover:bg-surface-secondary",
        )}
      >
        {hasIcon && (
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              iconWrapperClass,
            )}
          >
            {item.icon}
          </div>
        )}
        <div className={cn("flex-1", hasIcon ? "" : "pl-1")}>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">
              {item.name}
            </span>
            {isExternal && (
              <IconLinkOut className="size-3 opacity-0 transition-opacity group-hover/nav-item:opacity-100 text-text-tertiary" />
            )}
          </div>
          {item.description && (
            <p className="text-xs text-text-secondary">{item.description}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

type HeaderNavMenuProps = {
  governanceLink?: {
    href: string;
    label: string;
  };
};

export function HeaderNavMenu({
  governanceLink,
}: HeaderNavMenuProps): ReactElement {
  const [activeMenu, setActiveMenu] = useState<TMenuKey | null>(null);
  const [pinnedMenu, setPinnedMenu] = useState<TMenuKey | null>(null);
  const hostname = useHostname();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navTriggerClass(isActive: boolean): string {
    return cn(
      "cursor-pointer inline-flex items-center gap-1 transition-colors relative",
      isActive
        ? "text-text-primary"
        : "text-text-secondary hover:text-text-primary",
    );
  }

  const openMenu = (menuKey: TMenuKey): void => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveMenu(menuKey);
  };

  const scheduleClose = (): void => {
    if (pinnedMenu) return;
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  };

  const toggleMenu = (menuKey: TMenuKey): void => {
    if (pinnedMenu === menuKey) {
      setPinnedMenu(null);
      setActiveMenu(null);
      return;
    }
    setPinnedMenu(menuKey);
    setActiveMenu(menuKey);
  };

  const closeMenu = (): void => {
    setActiveMenu(null);
    setPinnedMenu(null);
  };

  const handleHoverMenu = (menuKey: TMenuKey): void => {
    if (pinnedMenu && pinnedMenu !== menuKey) {
      setPinnedMenu(null);
    }
    openMenu(menuKey);
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative"
        onMouseEnter={() => handleHoverMenu("products")}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={() => toggleMenu("products")}
          className={cn("group", navTriggerClass(activeMenu === "products"))}
          aria-expanded={activeMenu === "products"}
        >
          <span>Ecosystem</span>
          <IconChevron
            className={cn(
              "size-3 transition-transform group-hover:rotate-180",
              activeMenu === "products" ? "rotate-180" : "",
            )}
          />
        </button>
        <DropdownPanel
          isOpen={activeMenu === "products"}
          onClose={closeMenu}
          anchor="left"
          className="w-[520px] max-w-[calc(100vw-2rem)]"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-[2] flex-col gap-3">
              <p className="text-xs pl-2 font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                Products
              </p>
              <div className="flex flex-col gap-0">
                {PRODUCTS.map((item) => (
                  <div key={item.href} onClick={closeMenu}>
                    <NavTile item={item} hostname={hostname} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 flex-1">
              <p className="text-xs pl-2 font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                Tools
              </p>
              <div className="flex flex-col gap-0">
                {TOOLS.map((item) => (
                  <div key={item.href} onClick={closeMenu}>
                    <NavTile item={item} hostname={hostname} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DropdownPanel>
      </div>

      <div
        className="relative"
        onMouseEnter={() => handleHoverMenu("resources")}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={() => toggleMenu("resources")}
          className={cn("group", navTriggerClass(activeMenu === "resources"))}
          aria-expanded={activeMenu === "resources"}
        >
          <span>Resources</span>
          <IconChevron
            className={cn(
              "size-3 transition-transform group-hover:rotate-180",
              activeMenu === "resources" ? "rotate-180" : "",
            )}
          />
        </button>
        <DropdownPanel
          isOpen={activeMenu === "resources"}
          onClose={closeMenu}
          anchor="left"
          className="w-[520px] max-w-[calc(100vw-2rem)]"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="text-xs pl-2 font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                Information
              </p>
              <div className="flex flex-col gap-0">
                {INFO_ITEMS.map((item) => (
                  <div key={item.href} onClick={closeMenu}>
                    <NavTile item={item} hostname={hostname} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-xs pl-2 font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                Community
              </p>
              <div className="flex flex-col gap-1">
                {COMMUNITY.map((item) => (
                  <div key={item.href} onClick={closeMenu}>
                    <NavTile item={item} hostname={hostname} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DropdownPanel>
      </div>

      {governanceLink ? (
        <Link
          href={governanceLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("group min-h-10", navTriggerClass(false))}
          aria-label={`${governanceLink.label} (opens in a new tab)`}
        >
          <span>{governanceLink.label}</span>
          <IconLinkOut
            className="size-3 text-text-tertiary transition-colors group-hover:text-text-primary"
            aria-hidden
          />
        </Link>
      ) : null}
    </div>
  );
}
