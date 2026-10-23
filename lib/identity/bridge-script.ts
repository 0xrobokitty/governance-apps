import { ADDRESS_LABEL_BRIDGE_KIND } from "@/lib/identity/bridge-protocol";
import {
  ADDRESS_ALIASES_STORAGE_KEY, ADDRESS_ALIASES_VERSION,
  ADDRESS_ALIASES_MAX_ENTRIES, ADDRESS_ALIASES_MAX_STORAGE_LENGTH, ADDRESS_ALIAS_MAX_LENGTH,
} from "@/lib/identity/aliases";

/** An isolated, bounded storage adapter: no network, cookies, wallet or application state. */
export function createAddressLabelBridgeScript(parentOrigin: string, ownOrigin: string): string {
  return `(() => {
    "use strict";
    if (location.origin !== ${JSON.stringify(ownOrigin)}) return;
    const origin = ${JSON.stringify(parentOrigin)};
    const kind = ${JSON.stringify(ADDRESS_LABEL_BRIDGE_KIND)};
    const key = ${JSON.stringify(ADDRESS_ALIASES_STORAGE_KEY)};
    const version = ${ADDRESS_ALIASES_VERSION};
    const maxEntries = ${ADDRESS_ALIASES_MAX_ENTRIES};
    const maxStorage = ${ADDRESS_ALIASES_MAX_STORAGE_LENGTH};
    const maxName = ${ADDRESS_ALIAS_MAX_LENGTH};
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;
    const unsafeName = /[\\p{Default_Ignorable_Code_Point}\\p{Cc}\\p{Noncharacter_Code_Point}\\u2800\\u3000\\ufff9-\\ufffb]/u;
    const normalizeName = (value) => {
      if (typeof value !== "string" || value.length > maxName * 2) return null;
      const normalized = value.normalize("NFC");
      if (unsafeName.test(normalized)) return null;
      const name = normalized.trim().replace(/\\s+/gu, " ");
      return name && Array.from(name).length <= maxName ? name : null;
    };
    const load = () => {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      if (raw.length > maxStorage) throw new Error("Storage limit");
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== version || !parsed.aliases || typeof parsed.aliases !== "object" || Array.isArray(parsed.aliases)) return {};
      const entries = Object.entries(parsed.aliases);
      if (entries.length > maxEntries) throw new Error("Storage limit");
      const aliases = {};
      for (const [address, value] of entries) {
        const name = normalizeName(value);
        if (addressPattern.test(address) && name) aliases[address.toLowerCase()] = name;
      }
      return aliases;
    };
    const reply = (id, status, aliases) => parent.postMessage({ kind, id, status, aliases }, origin);
    addEventListener("message", (event) => {
      if (event.source !== parent || event.origin !== origin || parent === window) return;
      const request = event.data;
      if (!request || typeof request !== "object" || Array.isArray(request) || request.kind !== kind || typeof request.id !== "string" || !/^[a-f0-9-]{36}$/.test(request.id)) return;
      if (!Object.keys(request).every((name) => ["kind", "id", "operation", "address", "alias"].includes(name))) return;
      if (!["read", "set", "reset", "clear"].includes(request.operation)) return;
      if ((request.operation === "set" || request.operation === "reset") && (typeof request.address !== "string" || !addressPattern.test(request.address))) return reply(request.id, "invalid", {});
      const name = request.operation === "set" ? normalizeName(request.alias) : null;
      if (request.operation === "set" && !name) return reply(request.id, "invalid", {});
      try {
        let aliases = load();
        if (request.operation === "set") aliases[request.address.toLowerCase()] = name;
        if (request.operation === "reset") delete aliases[request.address.toLowerCase()];
        if (request.operation === "clear") aliases = {};
        if (Object.keys(aliases).length > maxEntries) return reply(request.id, "storage-error", {});
        if (request.operation !== "read") {
          const raw = JSON.stringify({ version, aliases });
          if (raw.length > maxStorage) return reply(request.id, "storage-error", {});
          localStorage.setItem(key, raw);
          if (localStorage.getItem(key) !== raw) return reply(request.id, "storage-error", {});
        }
        reply(request.id, "saved", aliases);
      } catch { reply(request.id, "storage-error", {}); }
    });
    addEventListener("storage", (event) => {
      try {
        if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
        reply("changed", "saved", load());
      } catch { /* Keep prior labels on unavailable storage. */ }
    });
  })();`;
}
