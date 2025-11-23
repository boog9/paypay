import { describe, expect, it } from "vitest";

import { detectNetworkFromInput, importWalletSchema, resolveInstanceNetwork } from "./validation";

const SAMPLE_TPUB =
  "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";
const SAMPLE_XPUB =
  "xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx";
const SENSITIVE_ERROR_MESSAGE = "Never paste seeds or private keys. Provide an extended public key only.";

describe("importWalletSchema", () => {
  it("accepts a tpub, fingerprint, and account path", () => {
    const result = importWalletSchema.safeParse({
      tpub: SAMPLE_TPUB,
      rootFingerprint: "5D8A5157",
      accountKeyPath: "84'/1'/0'",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rootFingerprint).toBe("5D8A5157");
    }
  });

  it("rejects inputs containing the m/ prefix", () => {
    const result = importWalletSchema.safeParse({
      tpub: SAMPLE_TPUB,
      rootFingerprint: "5D8A5157",
      accountKeyPath: "m/84'/1'/0'",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.accountKeyPath?.[0]).toBe("Use a path without the m/ prefix.");
    }
  });

  it("sanitizes sensitive phrases", () => {
    const result = importWalletSchema.safeParse({
      tpub: "seed phrase", // invalid and contains a sensitive keyword
      rootFingerprint: "5D8A5157",
      accountKeyPath: "84'/1'/0'",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.tpub?.[0]).toBe(SENSITIVE_ERROR_MESSAGE);
    }
  });

  it("validates fingerprint format", () => {
    const result = importWalletSchema.safeParse({
      tpub: SAMPLE_TPUB,
      rootFingerprint: "123",
      accountKeyPath: "84'/1'/0'",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rootFingerprint?.[0]).toBe(
        "Root fingerprint must be 8 hexadecimal characters."
      );
    }
  });
});

describe("derivation helpers", () => {
  it("detects networks from extended keys", () => {
    expect(detectNetworkFromInput(SAMPLE_XPUB)).toBe("mainnet");
    expect(detectNetworkFromInput(SAMPLE_TPUB)).toBe("testnet");
  });

  it("normalizes instance network configuration", () => {
    expect(resolveInstanceNetwork("mainnet")).toBe("mainnet");
    expect(resolveInstanceNetwork("TESTNET")).toBe("testnet");
    expect(resolveInstanceNetwork("signet")).toBeUndefined();
    expect(resolveInstanceNetwork(undefined)).toBeUndefined();
  });
});
