import { redirect } from "next/navigation";

import { bffFetch } from "@/lib/bff-fetch";
import { storeSettingsPath } from "@/lib/storePaths";

export type StoreSettings = {
  storeId: string;
  name: string;
  website: string | null;
  defaultCurrency: string;
};

export type StoreSettingsResult =
  | { kind: "ok"; data: StoreSettings }
  | { kind: "rate-limited" };

function parseStoreSettingsPayload(value: unknown): StoreSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeId = typeof record.storeId === "string" ? record.storeId : null;
  const name = typeof record.name === "string" ? record.name : null;
  const defaultCurrency = typeof record.defaultCurrency === "string" ? record.defaultCurrency : null;
  const website =
    record.website === null || record.website === undefined
      ? null
      : typeof record.website === "string"
        ? record.website
        : null;

  if (!storeId || !name || !defaultCurrency) {
    return null;
  }

  return {
    storeId,
    name,
    website,
    defaultCurrency,
  } satisfies StoreSettings;
}

export async function loadStoreSettings(storeId: string): Promise<StoreSettingsResult> {
  let response: Response;
  try {
    response = await bffFetch(storeSettingsPath(storeId), { cache: "no-store" });
  } catch (error) {
    throw new Error(`Failed to load store settings: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (response.status === 404) {
    redirect("/stores");
  }

  if (response.status === 429) {
    return { kind: "rate-limited" };
  }

  if (!response.ok) {
    throw new Error(`Failed to load store settings (status ${response.status}).`);
  }

  const payload = parseStoreSettingsPayload(await response.json());
  if (!payload) {
    throw new Error("Unexpected store settings payload.");
  }
  return { kind: "ok", data: payload };
}
