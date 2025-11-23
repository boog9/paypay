import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWalletPresence,
  resolveWalletPresence,
  parseWalletPresence,
  type WalletPresenceResponse,
} from "./get-wallet-presence";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

vi.mock("../../../../../../lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("../../../../../../lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("resolveWalletPresence", () => {
  it("returns true when hasWallet is true", () => {
    expect(resolveWalletPresence({ hasWallet: true })).toBe(true);
  });

  it("returns false when payload is missing or false", () => {
    expect(resolveWalletPresence(null)).toBe(false);
    expect(resolveWalletPresence({ hasWallet: false })).toBe(false);
  });
});

describe("getWalletPresence", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches presence endpoint and resolves payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        hasWallet: true,
      }),
    } as unknown as Response);

    await expect(getWalletPresence("store-1")).resolves.toEqual({
      status: 200,
      connected: true,
      hasWallet: true,
      payload: { hasWallet: true },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      walletPresencePath("store-1"),
      expect.objectContaining({ cache: "no-store", next: { revalidate: 0 } }),
    );
  });

  it("re-fetches presence instead of serving cached data", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ hasWallet: false }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ hasWallet: true }),
      } as unknown as Response);

    await expect(getWalletPresence("store-5")).resolves.toEqual({
      status: 200,
      connected: false,
      hasWallet: false,
      payload: { hasWallet: false },
    });

    await expect(getWalletPresence("store-5")).resolves.toEqual({
      status: 200,
      connected: true,
      hasWallet: true,
      payload: { hasWallet: true },
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns false when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(getWalletPresence("store-2")).resolves.toEqual({
      status: 500,
      connected: false,
      hasWallet: false,
      payload: null,
    });
  });

  it("treats 429 as a temporary success to keep wallet navigation", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    } as unknown as Response);

    await expect(getWalletPresence("store-2"))
      .resolves.toEqual({ status: 429, connected: true, hasWallet: true, payload: null });
  });

  it("uses payload hasWallet flag to compute presence", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        hasWallet: false,
      }),
    } as unknown as Response);

    await expect(getWalletPresence("store-3")).resolves.toEqual({
      status: 200,
      connected: false,
      hasWallet: false,
      payload: { hasWallet: false },
    });
  });

  it("returns hasWallet false when request fails", async () => {
    mockFetch.mockRejectedValue(new Error("network"));

    await expect(getWalletPresence("store-4")).resolves.toEqual({
      status: 0,
      connected: false,
      hasWallet: false,
      payload: null,
    });
  });
});

describe("parseWalletPresence", () => {
  it("returns normalized payload when hasWallet flag is absent", () => {
    const payload = parseWalletPresence({});
    const expected: WalletPresenceResponse = {
      hasWallet: false,
    };
    expect(payload).toEqual(expected);
  });
});
