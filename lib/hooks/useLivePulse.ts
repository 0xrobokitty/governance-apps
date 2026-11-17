"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PulseFeedReader } from "@/lib/clients/pulse/feed";
import { useDocumentVisibility } from "./usePollingGate";
export function useLivePulse() {
  const reader = useMemo(() => new PulseFeedReader(), []);
  const visible = useDocumentVisibility();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update(); const timer = setInterval(update, 30000); return () => clearInterval(timer);
  }, []);
  const query = useQuery({ queryKey: ["pulse", "live"], queryFn: () => reader.read(), staleTime: 60000, refetchInterval: visible ? 300000 : false, retry: false });
  return { ...query, now, stale: Boolean(query.data && now - query.data.generatedAt > 3600) };
}
