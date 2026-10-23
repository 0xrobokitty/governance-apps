import {
  ADDRESS_LABEL_BRIDGE_KIND, ADDRESS_LABEL_BRIDGE_PATH,
  getAddressLabelBridgeOrigin, parseAddressLabelBridgeResponse,
  type AddressLabelBridgeResponse, type AddressLabelOperation,
} from "./bridge-protocol";
import type { AddressAliases } from "./aliases";

export const ADDRESS_ALIASES_CHANGED = "yearn:address-aliases-changed";
const TIMEOUT_MS = 3_000;
let bridge: { frame: HTMLIFrameElement; origin: string; ready: Promise<boolean>; dispose: () => void } | null = null;
let remoteAliases: AddressAliases = {};
const pending = new Map<string, (response: AddressLabelBridgeResponse | null) => void>();

export function usesAddressLabelBridge(): boolean {
  return typeof window !== "undefined" && getAddressLabelBridgeOrigin(window.location.origin) !== null;
}

export function getRemoteAddressAliases(): AddressAliases { return remoteAliases; }

function createBridge(origin: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Shared address names";
  frame.src = `${origin}${ADDRESS_LABEL_BRIDGE_PATH}`;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  const ready = new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(() => resolve(false), TIMEOUT_MS);
    frame.addEventListener("load", () => { clearTimeout(timeout); resolve(true); }, { once: true });
    frame.addEventListener("error", () => { clearTimeout(timeout); resolve(false); }, { once: true });
  });
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    const response = parseAddressLabelBridgeResponse(event.data);
    if (!response) return;
    if (response.id === "changed") {
      if (response.status !== "saved") return;
      remoteAliases = response.aliases;
      window.dispatchEvent(new Event(ADDRESS_ALIASES_CHANGED));
      return;
    }
    pending.get(response.id)?.(response);
  };
  window.addEventListener("message", handleMessage);
  document.body.appendChild(frame);
  return { frame, origin, ready, dispose: () => { window.removeEventListener("message", handleMessage); frame.remove(); } };
}

/** Only the two configured DAO origins can address their paired YBC storage. */
export async function requestAddressLabelBridge(operation: AddressLabelOperation): Promise<AddressLabelBridgeResponse["status"]> {
  const origin = getAddressLabelBridgeOrigin(window.location.origin);
  if (!origin) return "storage-error";
  bridge ??= createBridge(origin);
  const current = bridge;
  if (!await current.ready || !current.frame.contentWindow) {
    if (bridge === current) { current.dispose(); bridge = null; }
    return "storage-error";
  }
  const id = crypto.randomUUID();
  const response = await new Promise<AddressLabelBridgeResponse | null>((resolve) => {
    const timeout = window.setTimeout(() => { pending.delete(id); resolve(null); }, TIMEOUT_MS);
    pending.set(id, (value) => { clearTimeout(timeout); pending.delete(id); resolve(value); });
    current.frame.contentWindow!.postMessage({ kind: ADDRESS_LABEL_BRIDGE_KIND, id, ...operation }, current.origin);
  });
  if (!response) {
    if (bridge === current) { current.dispose(); bridge = null; }
    return "storage-error";
  }
  if (response.status === "saved") {
    remoteAliases = response.aliases;
    window.dispatchEvent(new Event(ADDRESS_ALIASES_CHANGED));
  }
  return response.status;
}
