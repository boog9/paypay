"use client";

export const LAST_STORE_STORAGE_KEY = "paypay.portal.lastStoreId";

export function persistLastStoreId(storeId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LAST_STORE_STORAGE_KEY, storeId);
  } catch {
    // ignore storage errors
  }
}

export function readLastStoreId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(LAST_STORE_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}
