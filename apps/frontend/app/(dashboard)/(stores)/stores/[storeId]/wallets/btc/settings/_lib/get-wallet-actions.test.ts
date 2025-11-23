import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletActions } from "./get-wallet-actions";

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("@/lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("getWalletActions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized actions without rescan entries", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({ actions: ["prune-history", "rescan", "clear-history", "remove"] })
      ),
    } as unknown as Response);

    const result = await getWalletActions("store-123");

    expect(result).toEqual({
      status: 200,
      data: ["prune-history", "clear-history", "remove"],
      error: null,
      attemptedRefresh: false,
    });
  });

  it("returns an empty array when payload has no valid actions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(JSON.stringify({ actions: [] })),
    } as unknown as Response);

    const result = await getWalletActions("store-empty");

    expect(result).toEqual({ status: 200, data: [], error: null, attemptedRefresh: false });
  });

  it("attempts session refresh on 401 and retries", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, statusText: "No Content", text: vi.fn().mockResolvedValue("") } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue(JSON.stringify({ actions: ["replace", "remove"] })),
      } as unknown as Response);

    const result = await getWalletActions("store-refresh");

    expect(result).toEqual({
      status: 200,
      data: ["replace", "remove"],
      error: null,
      attemptedRefresh: true,
    });
  });

  it("returns error details when the call fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server error",
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "Upstream failure" })),
    } as unknown as Response);

    const result = await getWalletActions("store-error");

    expect(result).toEqual({
      status: 500,
      data: null,
      error: "Upstream failure",
      attemptedRefresh: false,
    });
  });
});
