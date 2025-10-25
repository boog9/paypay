import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
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
  "Enter xpub/ypub/zpub/tpub/upub/vpub or a descriptor (e.g., wpkh([FPR/84'/1'/0']tpub.../0/*)). Account key path is optional.";
export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";
export const ACCOUNT_KEY_PATH_MESSAGE = "Invalid BIP32 account key path (e.g., m/84'/1'/0').";

const EXTENDED_KEY_RE = /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/;
const DESCRIPTOR_RE = /^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(.+\)$/;
const DERIVATION_RE = new RegExp(`${EXTENDED_KEY_RE.source}|${DESCRIPTOR_RE.source}`);
const ACCOUNT_KEY_PATH_RE = /^m\/(44|49|84|86)'\/(0|1)'\/\d+'$/;

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
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value).trim();
  })
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @Matches(DERIVATION_RE, {
    message: INVALID_DERIVATION_MESSAGE
  })
  derivationScheme!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @Matches(ACCOUNT_KEY_PATH_RE, { message: ACCOUNT_KEY_PATH_MESSAGE })
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
