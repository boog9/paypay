import { describe, expect, it } from "vitest";

import {
  FORMAT_ERROR_MESSAGE,
  detectNetworkFromInput,
  isExtendedPublicKey,
  isSupportedDescriptor,
  resolveInstanceNetwork,
  walletWizardFormSchema
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

describe("walletWizardFormSchema", () => {
  it("accepts supported extended public keys", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_TPUB });
    expect(result.success).toBe(true);
  });

  it("accepts supported descriptor expressions", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_DESCRIPTOR });
    expect(result.success).toBe(true);
  });

  it("accepts descriptors with checksums", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_DESCRIPTOR_WITH_CHECKSUM });
    expect(result.success).toBe(true);
  });

  it("accepts multisig descriptors with checksums", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_SORTEDMULTI_DESCRIPTOR });
    expect(result.success).toBe(true);
  });

  it("accepts taproot descriptors", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_TR_DESCRIPTOR });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported derivation formats", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: "invalid-key" });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.flatten().fieldErrors.derivationScheme?.[0]).toBe(FORMAT_ERROR_MESSAGE);
  });

  it("requires wildcards in descriptor paths", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: INVALID_DESCRIPTOR });
    expect(result.success).toBe(false);
  });

  it("marks account key path as optional", () => {
    const result = walletWizardFormSchema.safeParse({ derivationScheme: SAMPLE_XPUB, accountKeyPath: "" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.accountKeyPath).toBeUndefined();
  });

  it("validates provided account key paths", () => {
    const result = walletWizardFormSchema.safeParse({
      derivationScheme: SAMPLE_XPUB,
      accountKeyPath: "m/84'/1'/0'",
    });
    expect(result.success).toBe(true);
  });

  it("accepts mainnet account key paths", () => {
    const result = walletWizardFormSchema.safeParse({
      derivationScheme: SAMPLE_XPUB,
      accountKeyPath: "m/84'/0'/0'",
    });
    expect(result.success).toBe(true);
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
