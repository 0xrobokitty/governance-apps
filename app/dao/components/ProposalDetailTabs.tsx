"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";

type ProposalDetailTab = "proposal" | "votes" | "details";

const PANEL_IDS: Record<ProposalDetailTab, string> = {
  proposal: "dao-proposal-content",
  votes: "dao-proposal-votes",
  details: "dao-proposal-details",
};

const DETAILS_ANCHORS = new Set([
  PANEL_IDS.details,
  "dao-proposal-lifecycle",
  "dao-proposal-script",
  "dao-proposal-technical",
]);

export interface ProposalDetailTabsProps {
  proposalKey: string;
  voterCount: number;
  proposal: ReactNode;
  votes: ReactNode;
  details: ReactNode;
  sidebar?: ReactNode;
  labels: {
    navigation: string;
    proposal: string;
    votes: string;
    details: string;
  };
}

interface Navigation {
  tab: ProposalDetailTab;
  fragment: string;
  scroll: "none" | "anchor" | "tab";
}

function decodeFragment(hash: string): string {
  const fragment = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function tabForFragment(fragment: string): ProposalDetailTab {
  if (fragment === PANEL_IDS.votes || fragment === "dao-proposal-voter-list") return "votes";
  return DETAILS_ANCHORS.has(fragment) ? "details" : "proposal";
}

function tabId(tab: string): string {
  return `dao-proposal-tab-${tab}`;
}

/** A proposal change resets local panels; ordinary feed/status updates preserve them. */
export function ProposalDetailTabs(props: ProposalDetailTabsProps) {
  return <ProposalDetailTabPanels key={props.proposalKey} {...props} />;
}

function ProposalDetailTabPanels({ voterCount, proposal, votes, details, sidebar, labels }: ProposalDetailTabsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const hasSidebar = sidebar !== undefined && sidebar !== null;
  const [navigation, setNavigation] = useState<Navigation>({
    tab: "proposal",
    fragment: "",
    scroll: "none",
  });

  useEffect(() => {
    const applyHash = (hash: string) => {
      const fragment = decodeFragment(hash);
      const target = fragment ? document.getElementById(fragment) : null;
      const outsidePanels = target && !panelsRef.current?.contains(target);
      setNavigation((current) => ({
        tab: outsidePanels ? current.tab : tabForFragment(fragment),
        fragment,
        scroll: fragment ? "anchor" : "none",
      }));
    };
    const applyLocation = () => applyHash(window.location.hash);
    const followNativeAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname || destination.search !== window.location.search) return;
      if (!(anchor.getAttribute("href") ?? "").includes("#")) return;
      // Observe instead of cancelling native navigation, including same-hash clicks
      // for which browsers do not emit another hashchange event.
      applyHash(destination.hash);
    };

    applyLocation();
    window.addEventListener("hashchange", applyLocation);
    window.addEventListener("popstate", applyLocation);
    document.addEventListener("click", followNativeAnchor);
    return () => {
      window.removeEventListener("hashchange", applyLocation);
      window.removeEventListener("popstate", applyLocation);
      document.removeEventListener("click", followNativeAnchor);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const strip = stripRef.current;
    if (!root || !strip) return;
    const measure = () => {
      const height = strip.getBoundingClientRect().height;
      if (height > 0) root.style.setProperty("--dao-detail-tabs-height", `${height}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(strip);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const panels = panelsRef.current;
    if (!root || !panels || navigation.scroll === "none") return;
    let observer: MutationObserver | null = null;
    let frame: number | null = null;
    const scroll = (): boolean => {
      if (navigation.scroll === "tab") {
        const strip = stripRef.current;
        const top = strip ? Number.parseFloat(window.getComputedStyle(strip).top) || 0 : 0;
        const stripHeight = strip?.getBoundingClientRect().height ?? 0;
        // The panels' natural position remains measurable while the strip sticks.
        // Its scroll margin returns to the strip, excluding the mobile sidebar.
        if (panels.getBoundingClientRect().top - stripHeight < top) panels.scrollIntoView?.({ block: "start" });
        return true;
      }
      const target = document.getElementById(navigation.fragment);
      const panel = document.getElementById(PANEL_IDS[navigation.tab]);
      if (target && !panels.contains(target)) return true;
      if (!target || !panel?.contains(target)) return false;
      const disclosure = target instanceof HTMLDetailsElement ? target : target.querySelector(":scope > details");
      if (disclosure instanceof HTMLDetailsElement) disclosure.open = true;
      target.scrollIntoView?.({ block: "start" });
      // Native links may start in a panel this navigation hides. Move focus to
      // their revealed destination; keyboard tab changes keep focus on the tab.
      if (!target.hasAttribute("tabindex") && target.tabIndex < 0) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      return true;
    };
    const scheduleScroll = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (scroll()) observer?.disconnect();
      });
    };
    // Content can resolve after route hydration. Observe only this proposal until
    // the requested heading exists, and stop on navigation or unmount.
    observer = new MutationObserver(scheduleScroll);
    observer.observe(panels, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });
    scheduleScroll();
    return () => {
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [navigation]);

  const changeTab = (id: string) => {
    if (id !== "proposal" && id !== "votes" && id !== "details") return;
    const fragment = PANEL_IDS[id];
    const url = new URL(window.location.href);
    if (decodeFragment(url.hash) !== fragment) {
      url.hash = fragment;
      window.history.pushState(window.history.state, "", url);
    }
    setNavigation({ tab: id, fragment, scroll: "tab" });
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-x-5 [&_[id]]:scroll-mt-[var(--dao-detail-scroll-margin)]",
        hasSidebar && "lg:grid-cols-[minmax(0,1fr)_20rem]"
      )}
      style={{
        "--dao-detail-scroll-margin": "calc(var(--dao-header-height, 4rem) + var(--dao-detail-tabs-height, 3.5rem) + 1rem)",
      } as CSSProperties}
    >
      {hasSidebar ? (
        <div className="mb-5 min-w-0 lg:col-start-2 lg:row-start-2 lg:mb-0">
          {sidebar}
        </div>
      ) : null}
      <div
        ref={stripRef}
        data-testid="dao-proposal-detail-tabs"
        className="sticky top-[var(--dao-header-height,4rem)] z-30 bg-app pb-3 pt-2 lg:col-span-full lg:row-start-1"
      >
        <Tabs
          variant="line"
          activeTab={navigation.tab}
          onChange={changeTab}
          aria-label={labels.navigation}
          getPanelId={(id) => PANEL_IDS[id as ProposalDetailTab]}
          getTabId={tabId}
          tabs={[
            { id: "proposal", label: labels.proposal },
            {
              id: "votes",
              label: <><span className="sr-only">{`${labels.votes} ${voterCount}`}</span><span aria-hidden="true">{labels.votes}</span></>,
              badge: <span aria-hidden="true" className="rounded-full bg-surface-secondary px-2 py-0.5 font-number text-xs tabular-nums">{voterCount}</span>,
            },
            { id: "details", label: labels.details },
          ]}
        />
      </div>
      <div
        ref={panelsRef}
        data-testid="dao-proposal-detail-panels"
        className="min-w-0 scroll-mt-[calc(var(--dao-header-height,4rem)+var(--dao-detail-tabs-height,3.5rem))] lg:col-start-1 lg:row-start-2"
      >
        {(["proposal", "votes", "details"] as const).map((tab) => (
          <div
            key={tab}
            id={PANEL_IDS[tab]}
            role="tabpanel"
            aria-labelledby={tabId(tab)}
            tabIndex={0}
            hidden={navigation.tab !== tab}
            className="min-w-0 space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
          >
            {{ proposal, votes, details }[tab]}
          </div>
        ))}
      </div>
    </div>
  );
}
