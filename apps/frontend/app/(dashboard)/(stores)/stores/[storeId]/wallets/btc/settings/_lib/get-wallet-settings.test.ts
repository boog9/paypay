import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletSettings } from "./get-wallet-settings";

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("@/lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("getWalletSettings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized view model when BFF responds with wallet settings", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          hasOnChainPaymentMethod: true,
          enabled: true,
          accountKeyPath: "m/84'/1'/0'",
          masterFingerprint: "deadbeef",
          label: "Cold wallet",
        }),
      ),
    } as unknown as Response);

    const result = await getWalletSettings("store-1");

    expect(result).toEqual({
      status: 200,
      attemptedRefresh: false,
      error: null,
      data: {
        hasOnChainPaymentMethod: true,
        enabled: true,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: "DEADBEEF",
        label: "Cold wallet",
      },
    });
  });

  it("maps 404 responses to hasOnChainPaymentMethod=false", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    const result = await getWalletSettings("store-2");

    expect(result.data).toEqual({ hasOnChainPaymentMethod: false });
    expect(result.status).toBe(404);
  });

  it("returns error details when the BFF call fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server error",
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "Upstream failure" })),
    } as unknown as Response);

    const result = await getWalletSettings("store-3");

    expect(result).toEqual({
      status: 500,
      data: null,
      attemptedRefresh: false,
      error: "Upstream failure",
    });
  });
});
