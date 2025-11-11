import { describe, expect, it } from "vitest";

import {
  DESCRIPTOR_FORMAT_ERROR,
  SENSITIVE_ERROR_MESSAGE,
  descriptorPreviewSchema,
  detectNetworkFromInput,
  importWalletSchema,
  isExtendedPublicKey,
  isSupportedDescriptor,
  resolveInstanceNetwork,
} from "./validation";

const SAMPLE_TPUB =
  "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";
const SAMPLE_XPUB =
  "xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx";
const SAMPLE_DESCRIPTOR =
  "wpkh([5d8a5157/84'/1'/0']tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq/0/*)";
const SAMPLE_DESCRIPTOR_WITH_CHECKSUM =
  "wpkh([5d8a5157/84'/1'/0']tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq/0/*)#tt46wf3w";
const SAMPLE_SORTEDMULTI_DESCRIPTOR =
  "wsh(sortedmulti(2,[5d8a5157/48'/0'/0'/2']xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx/0/*,[6b7c8d9e/48'/0'/0'/2']xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx/0/*))#qpzry9x8";
const SAMPLE_TR_DESCRIPTOR =
  "tr([5d8a5157/86'/0'/0']xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx/0/*)";

const INVALID_DESCRIPTOR =
  "wpkh([5d8a5157/84'/1'/0']tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq/0)";

describe("descriptorPreviewSchema", () => {
  it("accepts supported descriptor expressions", () => {
    const result = descriptorPreviewSchema.safeParse({
      derivationScheme: SAMPLE_DESCRIPTOR,
      accountKeyPath: "m/84'/1'/0'",
    });
    expect(result.success).toBe(true);
  });

  it("requires account paths with an m/ prefix", () => {
    const result = descriptorPreviewSchema.safeParse({
      derivationScheme: SAMPLE_DESCRIPTOR,
      accountKeyPath: "84'/1'/0'",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.accountKeyPath?.[0]).toBe(
        "Descriptor preview requires a path starting with m/."
      );
    }
  });

  it("rejects descriptors without wildcards", () => {
    const result = descriptorPreviewSchema.safeParse({
      derivationScheme: INVALID_DESCRIPTOR,
      accountKeyPath: "m/84'/1'/0'",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.derivationScheme?.[0]).toBe(DESCRIPTOR_FORMAT_ERROR);
    }
  });
});

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

  it("detects networks inside descriptors", () => {
    expect(detectNetworkFromInput(SAMPLE_DESCRIPTOR)).toBe("testnet");
    expect(detectNetworkFromInput(SAMPLE_SORTEDMULTI_DESCRIPTOR)).toBe("mainnet");
    expect(detectNetworkFromInput(SAMPLE_TR_DESCRIPTOR)).toBe("mainnet");
  });

  it("normalizes instance network configuration", () => {
    expect(resolveInstanceNetwork("mainnet")).toBe("mainnet");
    expect(resolveInstanceNetwork("TESTNET")).toBe("testnet");
    expect(resolveInstanceNetwork("signet")).toBeUndefined();
    expect(resolveInstanceNetwork(undefined)).toBeUndefined();
  });

  it("identifies supported derivation types", () => {
    expect(isExtendedPublicKey(SAMPLE_XPUB)).toBe(true);
    expect(isExtendedPublicKey("not-a-key")).toBe(false);
    expect(isSupportedDescriptor(SAMPLE_DESCRIPTOR)).toBe(true);
    expect(isSupportedDescriptor(SAMPLE_DESCRIPTOR_WITH_CHECKSUM)).toBe(true);
    expect(isSupportedDescriptor(SAMPLE_SORTEDMULTI_DESCRIPTOR)).toBe(true);
    expect(isSupportedDescriptor(SAMPLE_TR_DESCRIPTOR)).toBe(true);
    expect(isSupportedDescriptor(INVALID_DESCRIPTOR)).toBe(false);
  });
});
