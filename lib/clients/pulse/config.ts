import { isProductionMode } from "@/lib/runtime/runtime-mode";
export function isPulseMockEnabled(env: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_RUNTIME_MODE: process.env.NEXT_PUBLIC_RUNTIME_MODE,
  NEXT_PUBLIC_ENABLE_PULSE_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_PULSE_PREVIEW,
  NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS,
}) {
  return !isProductionMode(env) && env.NEXT_PUBLIC_ENABLE_PULSE_PREVIEW === "true" && env.NEXT_PUBLIC_USE_MOCKS === "true";
}
