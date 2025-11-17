import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadOverview, loadTransactions } from "./data-loaders";
import type { TransactionsQuery } from "./types";

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("@/lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

const baseQuery: TransactionsQuery = {
  skip: 0,
  take: 50,
  order: "desc",
  labels: [],
};

describe("transactions data loaders", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("marks transactions response as rate-limited when BFF returns 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "Rate limit" })),
    } as unknown as Response);

    const result = await loadTransactions("store-1", baseQuery);

    expect(result).toEqual({
      kind: "rate-limited",
      status: 429,
      data: null,
      error: "Rate limit",
      attemptedRefresh: false,
    });
  });

  it("marks overview response as rate-limited when BFF returns 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "Slow down" })),
    } as unknown as Response);

    const result = await loadOverview("store-2");

    expect(result).toEqual({
      kind: "rate-limited",
      status: 429,
      data: null,
      error: "Slow down",
      attemptedRefresh: false,
    });
  });
});
