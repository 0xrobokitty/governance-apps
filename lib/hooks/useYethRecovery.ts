"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RecoveryFeedReader } from "@/lib/clients/yeth/recovery/feed";

import { createQueryScopedReader } from "@/lib/query/scoped-reader";
const getReader = createQueryScopedReader(() => new RecoveryFeedReader());
export function useYethRecovery(enabled = true) {
  const reader = getReader(useQueryClient());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["yeth-recovery-v3"], queryFn: () => reader.read(),
    staleTime: 20000, refetchInterval: 30000, refetchIntervalInBackground: false, retry: false, enabled,
  });
  return { data: query.data, now, loading: query.isPending, error: query.error, refetch: query.refetch };
}
