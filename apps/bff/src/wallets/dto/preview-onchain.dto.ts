import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf
} from 'class-validator';
import { Transform } from 'class-transformer';
import { wordlists } from 'bip39';

export const INVALID_DERIVATION_MESSAGE =
  "Unsupported format. Enter xpub/ypub/zpub/tpub/upub/vpub or descriptor like wpkh([FPR/84'/1'/0']tpub.../0/*)[#checksum].";
export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";
export const ACCOUNT_KEY_PATH_MESSAGE = "Account key path must match your wallet's derivation path (e.g. m/84'/0'/0').";

const EXTENDED_KEY_BODY_RE = '[1-9A-HJ-NP-Za-km-z]{79,111}';
const EXTENDED_KEY_RE = new RegExp(`^([xyYzZtuUvV]pub${EXTENDED_KEY_BODY_RE})$`);
const DESCRIPTOR_KEY_RE = new RegExp(`([xtyuZvV]pub${EXTENDED_KEY_BODY_RE})`, 'i');
const DESCRIPTOR_WILDCARD_RE = /(\/(?:0|1)\/\*|\/\*\*)/;
const DESCRIPTOR_CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const DESCRIPTOR_SUFFIX_RE = new RegExp(`\\)+(?:#[${DESCRIPTOR_CHECKSUM_CHARSET}]{8})?$`, 'i');
const SUPPORTED_DESCRIPTOR_PREFIXES = ['wpkh(', 'pkh(', 'tr(', 'wsh(', 'sh(wpkh(', 'sh(wsh('];

function resolveEnglishWordlist(): string[] {
  const candidate = wordlists.english;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter((word): word is string => typeof word === 'string');
}

const BIP39_WORD_SET = new Set<string>(resolveEnglishWordlist().map((word) => word.toLowerCase()));

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function hasSupportedDescriptorPrefix(value: string): boolean {
  const lower = value.toLowerCase();
  return SUPPORTED_DESCRIPTOR_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isExtendedPublicKey(value: string): boolean {
  return EXTENDED_KEY_RE.test(value.trim());
}

function isSupportedDescriptor(value: string): boolean {
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

@ValidatorConstraint({ name: 'supportedDerivation', async: false })
class SupportedDerivationConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return isExtendedPublicKey(value) || isSupportedDescriptor(value);
  }

  defaultMessage(): string {
    return INVALID_DERIVATION_MESSAGE;
  }
}

export function SupportedDerivation(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'supportedDerivation',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: SupportedDerivationConstraint
    });
  };
}

@ValidatorConstraint({ name: 'noSensitiveSecrets', async: false })
class NoSensitiveSecretsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return true;
    }
    const lowered = value.toLowerCase();
    const forbidden = ['seed', 'mnemonic', 'bip39', 'xprv', 'yprv', 'zprv', 'privatekey'];
    if (forbidden.some((token) => lowered.includes(token))) {
      return false;
    }

    const words = lowered.split(/[^a-z]/).filter((segment) => segment.length > 0);
    let matches = 0;
    for (const word of words) {
      if (BIP39_WORD_SET.has(word)) {
        matches += 1;
        if (matches >= 3) {
          return false;
        }
      }
    }

    return true;
  }

  defaultMessage(): string {
    return SENSITIVE_ERROR_MESSAGE;
  }
}

export function NoSensitiveSecrets(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noSensitiveSecrets',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: NoSensitiveSecretsConstraint
    });
  };
}

export class PreviewOnchainDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @Length(8, 512, { message: INVALID_DERIVATION_MESSAGE })
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @SupportedDerivation({ message: INVALID_DERIVATION_MESSAGE })
  derivationScheme!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @MaxLength(200, { message: INVALID_DERIVATION_MESSAGE })
  @Matches(/^(?:m|[0-9a-fA-F]{8})(\/\d+'?){2,8}$/i, { message: ACCOUNT_KEY_PATH_MESSAGE })
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  accountKeyPath?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @Matches(/^[0-9a-fA-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  masterFingerprint?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @Matches(/^[0-9a-fA-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  rootFingerprint?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @IsInt({ message: INVALID_DERIVATION_MESSAGE })
  @Min(1, { message: INVALID_DERIVATION_MESSAGE })
  @Max(100, { message: INVALID_DERIVATION_MESSAGE })
  amount?: number;
}

export class UpdateOnchainDto extends PreviewOnchainDto {
  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @MaxLength(120, { message: 'Label cannot exceed 120 characters.' })
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
