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
      hasWallet: true,
      payload: { hasWallet: true },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      walletPresencePath("store-1"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns false when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(getWalletPresence("store-2")).resolves.toEqual({
      status: 500,
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
