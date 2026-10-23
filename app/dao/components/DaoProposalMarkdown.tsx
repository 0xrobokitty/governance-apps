"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconCopy } from "@/components/icons/IconCopy";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { getDaoMarkdownFragmentId, getDaoSummaryNodeIndex } from "@/lib/clients/dao/content";
import type {
  DaoMarkdownNode,
  DaoParsedProposalContent,
  DaoResolvedProposalAttachment,
} from "@/lib/clients/dao";
import {
  resolveGovernanceAppPathHref,
  resolveGovernanceHref,
} from "@/lib/governance-links";

export function DaoProposalMarkdown({
  className,
  context,
  hostname,
  omitSummary = false,
  omitTitle = false,
  parsed,
}: {
  className?: string;
  context: "detail" | "preview";
  hostname?: string;
  omitSummary?: boolean;
  omitTitle?: boolean;
  parsed: DaoParsedProposalContent;
}) {
  const summaryIndex = getDaoSummaryNodeIndex(parsed.ast);
  const nodes = parsed.ast.children.filter((_, index) => {
    if (index === 0 && omitTitle) return false;
    if (index > 0 && index <= summaryIndex && omitSummary) return false;
    return true;
  });

  return (
    <div
      className={cn(
        "min-w-0 space-y-4 break-words text-base leading-7 [overflow-wrap:anywhere]",
        className
      )}
      data-testid="dao-proposal-markdown"
      id={omitTitle && parsed.ast.children[0]?.headingId ? headingDomId(parsed.ast.children[0].headingId, context) : undefined}
      tabIndex={omitTitle ? -1 : undefined}
    >
      {nodes.map((node, index) => (
        <MarkdownNode
          key={nodeKey(node, index)}
          node={node}
          parsed={parsed}
          context={context}
          hostname={hostname}
        />
      ))}
    </div>
  );
}

export function DaoProposalMarkdownSource({
  source,
}: {
  source: string;
}) {
  return (
    <details className="group min-w-0 border-t border-border pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded py-2 text-sm font-bold transition-[color] duration-150 ease-out hover:text-yearn-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none dark:hover:text-blue-300 [&::-webkit-details-marker]:hidden">
        <span>View Markdown source</span>
        <span
          aria-hidden="true"
          className="text-lg transition-transform duration-150 ease-out group-open:rotate-45 motion-reduce:transition-none"
        >
          +
        </span>
      </summary>
      <pre
        role="region"
        aria-label="Exact Markdown source"
        tabIndex={0}
        className="max-w-full overflow-x-auto whitespace-pre rounded-box bg-neutral-900 p-4 font-number text-xs leading-5 text-neutral-0 outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
      >
        <code>{source}</code>
      </pre>
    </details>
  );
}

function MarkdownNode({
  context,
  hostname,
  node,
  parsed,
}: {
  context: "detail" | "preview";
  hostname?: string;
  node: DaoMarkdownNode;
  parsed: DaoParsedProposalContent;
}): ReactNode {
  const children = (node.children ?? []).map((child, index) => (
    <MarkdownNode
      key={nodeKey(child, index)}
      node={child}
      parsed={parsed}
      context={context}
      hostname={hostname}
    />
  ));

  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "break":
      return <br />;
    case "emphasis":
      return <em>{children}</em>;
    case "strong":
      return <strong>{children}</strong>;
    case "inlineCode":
      return (
        <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-number text-[0.9em]">
          {node.value}
        </code>
      );
    case "paragraph":
      return node.children?.some((child) => child.type === "image") ? (
        <div className="min-w-0 space-y-3">{children}</div>
      ) : (
        <p className="max-w-[75ch] text-pretty">{children}</p>
      );
    case "heading": {
      const sourceLevel = node.depth ?? 2;
      const level = Math.min(
        6,
        sourceLevel + (context === "preview" ? 2 : 1)
      );
      const props = {
        id: node.headingId ? headingDomId(node.headingId, context) : undefined,
        tabIndex: -1,
        className: headingClass(level),
      };
      if (level === 2) return <h2 {...props}>{children}</h2>;
      if (level === 3) return <h3 {...props}>{children}</h3>;
      if (level === 4) return <h4 {...props}>{children}</h4>;
      if (level === 5) return <h5 {...props}>{children}</h5>;
      return <h6 {...props}>{children}</h6>;
    }
    case "blockquote":
      return (
        <blockquote className="min-w-0 space-y-3 rounded-box bg-surface-secondary/60 px-4 py-3 text-text-secondary">
          {children}
        </blockquote>
      );
    case "list":
      return node.ordered ? (
        <ol
          start={node.start ?? undefined}
          className="min-w-0 list-decimal space-y-2 pl-6 marker:font-number marker:tabular-nums"
        >
          {children}
        </ol>
      ) : (
        <ul className="min-w-0 list-disc space-y-2 pl-6">{children}</ul>
      );
    case "listItem":
      return <li className="min-w-0 pl-1">{children}</li>;
    case "link": {
      const fragment = getDaoMarkdownFragmentId(node.url ?? "");
      const href = fragment
        ? `#${encodeURIComponent(headingDomId(fragment, context))}`
        : resolveMarkdownHref(node.url ?? "", hostname);
      const internal =
        (node.url ?? "").startsWith("/") &&
        !(node.url ?? "").startsWith("//");
      const className =
        "inline rounded font-bold text-yearn-blue underline decoration-yearn-blue/40 underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out [overflow-wrap:anywhere] hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none dark:text-blue-300 dark:hover:text-blue-200";
      return fragment ? (
        <a href={href} className={className}>
          {children}
        </a>
      ) : internal ? (
        <Link href={href} className={className}>
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {children}
        </a>
      );
    }
    case "code":
      return (
        <pre
          role="region"
          aria-label="Proposal Markdown code block"
          tabIndex={0}
          className="max-w-full overflow-x-auto rounded-box bg-neutral-900 p-4 font-number text-xs leading-5 text-neutral-0 outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
        >
          <code>{node.value ?? ""}</code>
        </pre>
      );
    case "table":
      return (
        <div
          role="region"
          aria-label="Proposal Markdown table"
          tabIndex={0}
          className="max-w-full overflow-x-auto rounded-box border border-border outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
        >
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead className="bg-surface-secondary">
              {node.children?.[0] ? (
                <MarkdownTableRow
                  context={context}
                  hostname={hostname}
                  node={node.children[0]}
                  parsed={parsed}
                  header
                  align={node.align}
                />
              ) : null}
            </thead>
            <tbody>
              {node.children?.slice(1).map((row, index) => (
                <MarkdownTableRow
                  key={nodeKey(row, index)}
                  context={context}
                  hostname={hostname}
                  node={row}
                  parsed={parsed}
                  align={node.align}
                />
              ))}
            </tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr className="border-b border-border last:border-b-0">{children}</tr>;
    case "tableCell":
      return <td className="max-w-[32rem] break-words px-3 py-2 align-top [overflow-wrap:anywhere]">{children}</td>;
    case "image": {
      const attachment = parsed.attachments.find(
        (candidate) => candidate.target === node.url
      );
      return attachment ? (
        <AttachmentCard attachment={attachment} title={(node.alt ?? "").trim()} />
      ) : null;
    }
    case "root":
      return <>{children}</>;
    default:
      return null;
  }
}

function MarkdownTableRow({
  align,
  context,
  header = false,
  hostname,
  node,
  parsed,
}: {
  align?: Array<"left" | "right" | "center" | null>;
  context: "detail" | "preview";
  header?: boolean;
  hostname?: string;
  node: DaoMarkdownNode;
  parsed: DaoParsedProposalContent;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      {node.children?.map((cell, index) => {
        const className = cn(
          "max-w-[32rem] break-words px-3 py-2 align-top [overflow-wrap:anywhere]",
          align?.[index] === "center"
            ? "text-center"
            : align?.[index] === "right"
              ? "text-right"
              : "text-left",
          header && "font-bold"
        );
        const content = cell.children?.map((child, childIndex) => (
          <MarkdownNode
            key={nodeKey(child, childIndex)}
            context={context}
            hostname={hostname}
            node={child}
            parsed={parsed}
          />
        ));
        return header ? (
          <th key={nodeKey(cell, index)} scope="col" className={className}>
            {content}
          </th>
        ) : (
          <td key={nodeKey(cell, index)} className={className}>
            {content}
          </td>
        );
      })}
    </tr>
  );
}

function AttachmentCard({
  attachment,
  title,
}: {
  attachment: DaoResolvedProposalAttachment;
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <aside
      aria-label={`Attachment: ${title}`}
      className="min-w-0 space-y-4 rounded-box border border-border bg-surface-secondary/60 p-4"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-balance font-bold">{title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-text-secondary">
          <span>{attachment.asset.mediaType}</span>
          <span aria-hidden>·</span>
          <span className="font-number tabular-nums">
            {formatByteSize(attachment.asset.byteLength)}
          </span>
          {attachment.asset.width !== null && attachment.asset.height !== null ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-number tabular-nums">
                {attachment.asset.width.toLocaleString("en-US")} × {attachment.asset.height.toLocaleString("en-US")} px
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={attachment.gatewayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-box border border-border bg-surface px-4 text-sm font-bold transition-[background-color,border-color,color,scale] duration-150 ease-out hover:bg-surface-secondary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          Open attachment
          <IconLinkOut className="size-3.5" aria-hidden />
        </a>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-box px-4 text-sm font-bold text-text-secondary transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface hover:text-text-primary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => {
            void copyTextToClipboard(attachment.gatewayUrl).then((success) => {
              setCopied(success);
            });
          }}
        >
          <IconCopy className="size-4" aria-hidden />
          {copied ? "Immutable link copied" : "Copy immutable link"}
        </button>
      </div>
    </aside>
  );
}

function resolveMarkdownHref(href: string, hostname?: string): string {
  if (/^\/dao(?:$|[/?#])/u.test(href)) {
    const remainder = href.slice("/dao".length);
    const path =
      !remainder
        ? "/"
        : remainder.startsWith("?") || remainder.startsWith("#")
          ? `/${remainder}`
          : remainder;
    return resolveGovernanceAppPathHref("dao", path as `/${string}`, hostname);
  }
  return resolveGovernanceHref(href, hostname);
}

function headingClass(level: number): string {
  return cn(
    "max-w-full scroll-mt-28 rounded text-balance break-words font-bold [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary",
    level <= 3 ? "text-xl md:text-2xl" : level === 4 ? "text-lg md:text-xl" : "text-base md:text-lg"
  );
}

function headingDomId(id: string, context: "detail" | "preview"): string {
  return `dao-${context}-heading-${id}`;
}

function nodeKey(node: DaoMarkdownNode, index: number): string {
  return `${node.type}:${node.position?.start.offset ?? index}:${index}`;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes.toLocaleString("en-US")} B`;
  if (bytes % 1_048_576 === 0) return `${(bytes / 1_048_576).toLocaleString("en-US")} MiB`;
  if (bytes % 1_024 === 0) return `${(bytes / 1_024).toLocaleString("en-US")} KiB`;
  return `${(bytes / 1_024).toLocaleString("en-US", { maximumFractionDigits: 1 })} KiB`;
}
