"use client";
import { useMemo } from "react";
import { getMetricsMock } from "@/lib/clients/metrics/client";
import type { AssetGroup, MetricsPeriod, MetricsScenario } from "@/lib/clients/metrics/types";

export function useMetrics(period: MetricsPeriod, asset: AssetGroup, scenario: MetricsScenario) {
  return useMemo(() => getMetricsMock(period, asset, scenario), [period, asset, scenario]);
}
