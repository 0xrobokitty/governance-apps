export const VOTING_NOTICE_STORAGE_KEY = "yearn.dao.voting-notice.dismissed.v1";
const CHANGE_EVENT = "yearn:dao-voting-notice-dismissed";
const MAX_PERIODS = 64;
const MAX_RAW_LENGTH = 24_000;
let unavailableStorageFallback: string | null = null;

export function parseDismissedVotingPeriods(raw: string | null): string[] {
  if (!raw || raw.length > MAX_RAW_LENGTH) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.length <= 300).slice(-MAX_PERIODS)
      : [];
  } catch { return []; }
}

export function readDismissedVotingPeriods(): string | null {
  if (unavailableStorageFallback !== null) return unavailableStorageFallback;
  try { return window.localStorage.getItem(VOTING_NOTICE_STORAGE_KEY); }
  catch { return unavailableStorageFallback; }
}

export function subscribeDismissedVotingPeriods(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === VOTING_NOTICE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function dismissVotingPeriods(periodKeys: string[]): void {
  const periods = [...new Set([...parseDismissedVotingPeriods(readDismissedVotingPeriods()), ...periodKeys])].slice(-MAX_PERIODS);
  const raw = JSON.stringify(periods);
  try {
    window.localStorage.setItem(VOTING_NOTICE_STORAGE_KEY, raw);
    unavailableStorageFallback = null;
  } catch {
    // Closing still works for this browser session when persistence is blocked.
    unavailableStorageFallback = raw;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
