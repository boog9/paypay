import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletPresence, type WalletPresenceDTO } from "./get-wallet-presence";

vi.mock("../../../../../../lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("../../../../../../lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("getWalletPresence", () => {

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns true when hasWallet is true", async () => {
    const payload: WalletPresenceDTO = {
      hasWallet: true,
      enabled: false,
      derivationScheme: null,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    } as unknown as Response);

    await expect(getWalletPresence("store-1")).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stores/store-1/wallets/btc/presence",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("returns true when derivationScheme is provided", async () => {
    const payload: WalletPresenceDTO = {
      hasWallet: false,
      enabled: true,
      derivationScheme: "wpkh([abcd1234/84'/0'/0']xpub/0/*)",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    } as unknown as Response);

    await expect(getWalletPresence("store-2")).resolves.toBe(true);
  });

  it("returns false when wallet data is missing", async () => {
    const payload: WalletPresenceDTO = {
      hasWallet: false,
      enabled: false,
      derivationScheme: null,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    } as unknown as Response);

    await expect(getWalletPresence("store-3")).resolves.toBe(false);
  });
});
