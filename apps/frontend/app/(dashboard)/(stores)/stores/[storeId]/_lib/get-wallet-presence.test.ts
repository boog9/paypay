import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWalletPresence,
  resolveWalletPresence,
  parseWalletPresence,
  isWalletConnected,
  type WalletPresenceResponse,
} from "./get-wallet-presence";
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
        enabled: true,
        config: { derivationScheme: "  xpub123  " },
      })
    ).toBe(true);
  });

  it("returns false when enabled is false even with config", () => {
    expect(
      resolveWalletPresence({
        enabled: false,
        config: { derivationScheme: "xpub123" },
      })
    ).toBe(false);
  });

  it("returns false when derivation scheme is missing", () => {
    expect(
      resolveWalletPresence({
        enabled: true,
        config: { derivationScheme: "   " },
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
      status: 200,
      json: vi.fn().mockResolvedValue({
        enabled: true,
        config: { derivationScheme: "xpub" },
      }),
    } as unknown as Response);

    await expect(getWalletPresence("store-1")).resolves.toEqual({
      status: 200,
      connected: true,
      payload: {
        enabled: true,
        config: { derivationScheme: "xpub" },
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      walletPresencePath("store-1"),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("returns false when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(getWalletPresence("store-2")).resolves.toEqual({
      status: 500,
      connected: false,
      payload: null,
    });
  });
});

describe("parseWalletPresence", () => {
  it("returns normalized payload when config is missing", () => {
    const payload = parseWalletPresence({ enabled: true });
    const expected: WalletPresenceResponse = {
      enabled: true,
      config: { derivationScheme: null },
    };
    expect(payload).toEqual(expected);
  });
});

describe("isWalletConnected", () => {
  it("requires enabled flag and derivation scheme", () => {
    expect(
      isWalletConnected({ enabled: true, config: { derivationScheme: "" } })
    ).toBe(false);
    expect(
      isWalletConnected({ enabled: false, config: { derivationScheme: "xpub" } })
    ).toBe(false);
    expect(
      isWalletConnected({ enabled: true, config: { derivationScheme: "xpub" } })
    ).toBe(true);
  });
});
