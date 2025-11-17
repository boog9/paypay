import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadStoreSettings, type StoreSettingsResult } from "./page";

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const { bffFetch } = await import("@/lib/bff-fetch");
const { redirect } = await import("next/navigation");
const mockFetch = vi.mocked(bffFetch);
const mockRedirect = vi.mocked(redirect);

describe("loadStoreSettings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRedirect.mockReset();
  });

  it("returns a rate-limited result on HTTP 429 without redirecting", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 } as unknown as Response);

    const result = await loadStoreSettings("store-1");

    const expected: StoreSettingsResult = { kind: "rate-limited" };
    expect(result).toEqual(expected);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
