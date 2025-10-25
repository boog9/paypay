import { z } from "zod";

export const FORMAT_ERROR_MESSAGE =
  "Enter xpub/ypub/zpub/tpub/upub/vpub or a descriptor (e.g., wpkh([FPR/84'/1'/0']tpub.../0/*)). Account key path is optional.";

export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";

const EXTENDED_KEY_RE = /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/;
const DESCRIPTOR_RE = /^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(.+\)$/;
const ACCOUNT_KEY_PATH_RE = /^m\/(44|49|84|86)'\/(0|1)'\/\d+'$/;

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
  return DESCRIPTOR_RE.test(trimmed);
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

export const walletWizardFormSchema = z.object({
  derivationScheme: z
    .string({ required_error: FORMAT_ERROR_MESSAGE })
    .trim()
    .min(1, FORMAT_ERROR_MESSAGE)
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
    .refine((value) => isExtendedPublicKey(value) || isSupportedDescriptor(value), { message: FORMAT_ERROR_MESSAGE }),
  accountKeyPath: z
    .string()
    .optional()
    .transform((value) => (value ? value.trim() : ""))
    .transform((value) => (value.length === 0 ? undefined : value))
    .refine((value) => (value ? ACCOUNT_KEY_PATH_RE.test(value) : true), {
      message: "Invalid BIP32 account key path (e.g., m/84'/1'/0')."
    })
    .refine((value) => (value ? !SENSITIVE_PATTERN.test(value) : true), {
      message: SENSITIVE_ERROR_MESSAGE
    })
});
