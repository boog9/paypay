import { describe, expect, it, vi } from "vitest";

import { pruneBtcWalletHistory, removeBtcWallet } from "./btc-wallet-actions";

const bffFetchMock = vi.fn();

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: (...args: unknown[]) => bffFetchMock(...args),
}));

describe("btc-wallet-actions assertOk", () => {
  it("throws the message returned by the backend", async () => {
    bffFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(pruneBtcWalletHistory("store-id")).rejects.toThrowError("Forbidden");
  });

  it("falls back to a generic error when no payload is provided", async () => {
    bffFetchMock.mockResolvedValue(
      new Response("", {
        status: 500,
        statusText: "",
      }),
    );

    await expect(removeBtcWallet("store-id")).rejects.toThrowError("Request failed");
  });
});
