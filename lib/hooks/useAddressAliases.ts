"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import {
  clearAddressAliases,
  loadAddressAliases,
  normalizeAddressAlias,
  saveAddressAliases,
  ADDRESS_ALIASES_STORAGE_KEY,
  type AddressAliases,
} from "@/lib/identity/aliases";
import { ADDRESS_ALIASES_CHANGED, getRemoteAddressAliases, requestAddressLabelBridge, usesAddressLabelBridge } from "@/lib/identity/bridge";

export type AddressAliasMutationResult =
  | "saved"
  | "invalid"
  | "storage-error";
export type AddressAliasMutation = AddressAliasMutationResult | Promise<AddressAliasMutationResult>;

export function useAddressAliases() {
  const [aliases, setAliases] = useState<AddressAliases>({});
  const aliasesRef = useRef<AddressAliases>({});

  useEffect(() => {
    const storage = getLocalStorage();
    const syncAliases = () => {
      const nextAliases = usesAddressLabelBridge() ? getRemoteAddressAliases() : loadAddressAliases(storage);
      aliasesRef.current = nextAliases;
      setAliases(nextAliases);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea === storage &&
        (event.key === ADDRESS_ALIASES_STORAGE_KEY || event.key === null)
      ) {
        syncAliases();
      }
    };

    syncAliases();
    if (usesAddressLabelBridge()) void requestAddressLabelBridge({ operation: "read" });
    window.addEventListener("storage", handleStorage);
    window.addEventListener(ADDRESS_ALIASES_CHANGED, syncAliases);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(ADDRESS_ALIASES_CHANGED, syncAliases);
    };
  }, []);

  const setAlias = useCallback(
    (address: string, value: string): AddressAliasMutation => {
      const normalizedAlias = normalizeAddressAlias(value);
      if (!isAddress(address) || !normalizedAlias) return "invalid";
      if (usesAddressLabelBridge()) return requestAddressLabelBridge({ operation: "set", address, alias: normalizedAlias });

      const nextAliases = {
        ...loadAddressAliases(getLocalStorage()),
        [address.toLowerCase()]: normalizedAlias,
      };
      if (!saveAddressAliases(getLocalStorage(), nextAliases)) {
        return "storage-error";
      }

      aliasesRef.current = nextAliases;
      setAliases(nextAliases);
      window.dispatchEvent(new Event(ADDRESS_ALIASES_CHANGED));
      return "saved";
    },
    []
  );

  const resetAlias = useCallback(
    (address: string): AddressAliasMutation => {
      if (!isAddress(address)) return "invalid";
      if (usesAddressLabelBridge()) return requestAddressLabelBridge({ operation: "reset", address });

      const nextAliases = { ...loadAddressAliases(getLocalStorage()) };
      delete nextAliases[address.toLowerCase()];
      if (!saveAddressAliases(getLocalStorage(), nextAliases)) {
        return "storage-error";
      }

      aliasesRef.current = nextAliases;
      setAliases(nextAliases);
      window.dispatchEvent(new Event(ADDRESS_ALIASES_CHANGED));
      return "saved";
    },
    []
  );

  const clearAliases = useCallback((): AddressAliasMutation => {
    if (usesAddressLabelBridge()) return requestAddressLabelBridge({ operation: "clear" });
    if (!clearAddressAliases(getLocalStorage())) {
      return "storage-error";
    }

    aliasesRef.current = {};
    setAliases({});
    window.dispatchEvent(new Event(ADDRESS_ALIASES_CHANGED));
    return "saved";
  }, []);

  return {
    aliases,
    clearAliases,
    resetAlias,
    setAlias,
  };
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
