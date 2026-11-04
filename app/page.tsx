// app/page.tsx
"use client";

import { ConnectButton } from "@/web3/wallet-ui";
import Link from "next/link";
import { homeCopy as copy } from "./messages";
import {
  isDaoEnabled,
  isTeamsEnabled,
  isYbcEnabled,
  isYethEnabled,
} from "@/lib/runtime/features";

export default function Home() {
  const showTeams = isTeamsEnabled();
  const showYeth = isYethEnabled();
  const showYbc = isYbcEnabled();
  const showDao = isDaoEnabled();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-6">
      <div>
        <ConnectButton />
      </div>

      <h1 className="text-3xl font-semibold">{copy.page.title}</h1>

      <p className="text-sm text-slate-300 text-center max-w-md">
        {copy.page.description}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={copy.cta.styfi.href}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          {copy.cta.styfi.label}
        </Link>
        <Link
          href={copy.cta.veyfi.href}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          {copy.cta.veyfi.label}
        </Link>
        {showTeams && (
          <Link
            href={copy.cta.teams.href}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            {copy.cta.teams.label}
          </Link>
        )}
        {showYeth && (
          <Link
            href={copy.cta.yeth.href}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            {copy.cta.yeth.label}
          </Link>
        )}
        {showYbc && (
          <Link
            href={copy.cta.ybc.href}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            {copy.cta.ybc.label}
          </Link>
        )}
        {showDao && (
          <Link
            href={copy.cta.dao.href}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            {copy.cta.dao.label}
          </Link>
        )}
      </div>
    </main>
  );
}
