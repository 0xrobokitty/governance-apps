"use client";
import { useMemo } from "react";
import { getPulse } from "@/lib/clients/pulse/client";
import type { Asset, Period, Scenario } from "@/lib/clients/pulse/types";
export function usePulse(period: Period, asset: Asset, scenario: Scenario) {
  return useMemo(() => getPulse(period, asset, scenario), [period, asset, scenario]);
}
