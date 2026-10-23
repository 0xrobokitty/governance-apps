export type StyfiMockScenario = "full" | "partial" | "missed" | "ybc";

let scenario: StyfiMockScenario = "partial";
const listeners = new Set<() => void>();

export function subscribeStyfiMockScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getStyfiMockScenario(): StyfiMockScenario {
  return scenario;
}

export function setStyfiMockScenario(next: StyfiMockScenario): void {
  if (scenario === next) return;
  scenario = next;
  listeners.forEach((listener) => listener());
}

export function resetStyfiMockScenario(): void {
  setStyfiMockScenario("partial");
}
