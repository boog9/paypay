import { z } from "zod";

export const FORMAT_ERROR_MESSAGE =
  "Unsupported format. Enter xpub/ypub/zpub/tpub/upub/vpub or descriptor like wpkh([FPR/84'/1'/0']tpub.../0/*)[#checksum].";

export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";

const EXTENDED_KEY_BODY_RE = "[1-9A-HJ-NP-Za-km-z]{79,111}";
export const EXTENDED_KEY_RE = new RegExp(
  `^([xyYzZtuUvV]pub${EXTENDED_KEY_BODY_RE})$`
);

const DESCRIPTOR_KEY_RE = new RegExp(`([xtyuZvV]pub${EXTENDED_KEY_BODY_RE})`, "i");

const SUPPORTED_DESCRIPTOR_PREFIXES = [
  "wpkh(",
  "pkh(",
  "tr(",
  "wsh(",
  "sh(wpkh(",
  "sh(wsh("
];

const DESCRIPTOR_WILDCARD_RE = /(\/(?:0|1)\/\*|\/\*\*)/;
const DESCRIPTOR_CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const DESCRIPTOR_SUFFIX_RE = new RegExp(
  `\\)+(?:#[${DESCRIPTOR_CHECKSUM_CHARSET}]{8})?$`,
  "i"
);

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
  return SUPPORTED_DESCRIPTOR_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function isExtendedPublicKey(value: string): boolean {
  return EXTENDED_KEY_RE.test(value.trim());
}

export function isSupportedDescriptor(value: string): boolean {
  const trimmed = value.trim();
  if (!hasSupportedDescriptorPrefix(trimmed)) {
    return false;
  }
  if (!DESCRIPTOR_KEY_RE.test(trimmed)) {
    return false;
  }
  if (!DESCRIPTOR_WILDCARD_RE.test(trimmed)) {
    return false;
  }
  if (!DESCRIPTOR_SUFFIX_RE.test(trimmed)) {
    return false;
  }
  return true;
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
    .min(8, FORMAT_ERROR_MESSAGE)
    .max(512, FORMAT_ERROR_MESSAGE)
    .refine((value) => !SENSITIVE_PATTERN.test(value), { message: SENSITIVE_ERROR_MESSAGE })
    .refine((value) => isExtendedPublicKey(value) || isSupportedDescriptor(value), {
      message: FORMAT_ERROR_MESSAGE
    }),
  accountKeyPath: z
    .string()
    .optional()
    .transform((value) => (value ? value.trim() : ""))
    .transform((value) => (value.length === 0 ? undefined : value))
    .refine((value) => (value ? /^(?:m|[0-9a-fA-F]{8})(\/\d+'?){2,8}$/i.test(value) : true), {
      message: "Account key path must match your wallet's derivation path (e.g. m/84'/0'/0')."
    })
    .refine((value) => (value ? !SENSITIVE_PATTERN.test(value) : true), {
      message: SENSITIVE_ERROR_MESSAGE
    })
});
