import { z } from "zod";

export const DESCRIPTOR_FORMAT_ERROR =
  "Enter a descriptor such as wpkh([FPR/84'/1'/0']tpub.../0/*) with an account path starting at m/.";
export const IMPORT_FORMAT_ERROR =
  "Enter a testnet extended public key (tpub/upub/vpub), root fingerprint, and account key path such as 84'/1'/0'.";

export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";

const EXTENDED_KEY_RE = /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/;
const DESCRIPTOR_RE = /^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(.+\)(?:#[0-9a-z]+)?$/i;
const DESCRIPTOR_ACCOUNT_PATH_RE = /^m\/(84|86)'\/(0|1)'\/\d+'$/;
const IMPORT_ACCOUNT_PATH_RE = /^(84|86)'\/(0|1)'\/\d+'$/;

export type BitcoinNetwork = "mainnet" | "testnet";

export const NETWORK_BY_PREFIX: Record<string, BitcoinNetwork> = {
  xpub: "mainnet",
  ypub: "mainnet",
  zpub: "mainnet",
  tpub: "testnet",
  upub: "testnet",
  vpub: "testnet"
};

const SENSITIVE_PATTERN = /(seed|mnemonic|xprv|yprv|zprv|privatekey)/i;

function hasSupportedDescriptorPrefix(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.startsWith("wpkh(") || lower.startsWith("sortedmulti(") || lower.startsWith("sh(") || lower.startsWith("pkh(") || lower.startsWith("wsh(") || lower.startsWith("tr(");
}

export function isExtendedPublicKey(value: string): boolean {
  return EXTENDED_KEY_RE.test(value.trim());
}

export function isSupportedDescriptor(value: string): boolean {
  const trimmed = value.trim();
  if (!hasSupportedDescriptorPrefix(trimmed)) {
    return false;
  }
  if (!DESCRIPTOR_RE.test(trimmed)) {
    return false;
  }
  return trimmed.includes('/*');
}

export function detectNetworkFromInput(value: string): BitcoinNetwork | undefined {
  const match = value.match(/(xpub|ypub|zpub|tpub|upub|vpub)/i);
  if (!match) {
    return undefined;
  }
  const prefix = match[1]?.toLowerCase();
  if (!prefix) {
    return undefined;
  }
  return NETWORK_BY_PREFIX[prefix] ?? undefined;
}

export function resolveInstanceNetwork(raw: string | undefined): BitcoinNetwork | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "mainnet" || normalized === "testnet") {
    return normalized;
  }
  return undefined;
}

export const descriptorPreviewSchema = z.object({
  derivationScheme: z
    .string({ required_error: DESCRIPTOR_FORMAT_ERROR })
    .trim()
    .min(1, DESCRIPTOR_FORMAT_ERROR)
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
    .refine((value) => isSupportedDescriptor(value), { message: DESCRIPTOR_FORMAT_ERROR }),
  accountKeyPath: z
    .string({ required_error: "Account key path is required." })
    .trim()
    .min(1, "Account key path is required.")
    .refine((value) => value.startsWith("m/"), { message: "Descriptor preview requires a path starting with m/." })
    .refine((value) => DESCRIPTOR_ACCOUNT_PATH_RE.test(value), {
      message: "Invalid BIP32 account key path (e.g., m/84'/1'/0')."
    })
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
});

export const importWalletSchema = z.object({
  tpub: z
    .string({ required_error: IMPORT_FORMAT_ERROR })
    .trim()
    .min(1, IMPORT_FORMAT_ERROR)
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
    .refine((value) => EXTENDED_KEY_RE.test(value.trim()), { message: IMPORT_FORMAT_ERROR }),
  rootFingerprint: z
    .string({ required_error: 'Root fingerprint is required.' })
    .trim()
    .min(1, 'Root fingerprint is required.')
    .refine((value) => /^[0-9a-fA-F]{8}$/.test(value), {
      message: 'Root fingerprint must be 8 hexadecimal characters.'
    })
    .transform((value) => value.toUpperCase()),
  accountKeyPath: z
    .string({ required_error: "Account key path is required." })
    .trim()
    .min(1, "Account key path is required.")
    .refine((value) => !value.startsWith('m/'), { message: "Use a path without the m/ prefix." })
    .refine((value) => IMPORT_ACCOUNT_PATH_RE.test(value), {
      message: "Account key path must start with 84'/1' or 86'/1'."
    })
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
});
