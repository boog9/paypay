import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletPresence, resolveWalletPresence } from "./get-wallet-presence";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

vi.mock("../../../../../../lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

const { bffFetch } = await import("../../../../../../lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("resolveWalletPresence", () => {
  it("returns true when config.derivationScheme is a non-empty string", () => {
    expect(
      resolveWalletPresence({
        config: { derivationScheme: "  xpub123  " },
      })
    ).toBe(true);
  });

  it("returns true when hasWallet is explicitly true", () => {
    expect(
      resolveWalletPresence({
        hasWallet: true,
      })
    ).toBe(true);
  });

  it("returns true when legacy top-level derivationScheme is available", () => {
    expect(
      resolveWalletPresence({
        derivationScheme: "wpkh([abcd]/0/*)",
      })
    ).toBe(true);
  });

  it("returns true when enabled is true as last resort", () => {
    expect(
      resolveWalletPresence({
        enabled: true,
      })
    ).toBe(true);
  });

  it("returns false when presence cannot be determined", () => {
    expect(
      resolveWalletPresence({
        config: { derivationScheme: "" },
        hasWallet: false,
        derivationScheme: " ",
        enabled: false,
      })
    ).toBe(false);
  });
});

describe("getWalletPresence", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches presence endpoint and resolves payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ config: { derivationScheme: "xpub" } }),
    } as unknown as Response);

    await expect(getWalletPresence("store-1")).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      walletPresencePath("store-1"),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("returns false when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
    } as unknown as Response);

    await expect(getWalletPresence("store-2")).resolves.toBe(false);
  });
});
